// app/api/chat/route.ts
export const runtime = 'nodejs';
export const preferredRegion = ['hnd1', 'iad1']; // 任意: 安定化用

import { parsePDF } from '@/lib/pdf-parser';
import OpenAI from 'openai';
import { sealSummary, unsealSummary, isValidTaskId } from '@/lib/summary-seal';
import { createClient } from '@supabase/supabase-js';

/** ログ: ターミナルに即出力 */
function logLine(...args: any[]) {
  const line = args.map((v) => {
    if (typeof v === 'string') return v;
    try { 
      return JSON.stringify(v, (key, value) => {
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack
          };
        }
        return value;
      }); 
    } catch { 
      return String(v); 
    }
  }).join(' ');
  console.log(line);
  try { process.stdout.write(line + '\n'); } catch {}
}

/** 超概算トークンカウント */
function roughTokenCount(str: string): number {
  return Math.ceil(str.length / 3);
}

const openai = new OpenAI();

/** 429時の自動リトライ + 上流中断対応(signal) */
async function chatWithRetry(
  req: OpenAI.Chat.ChatCompletionCreateParams,
  maxRetry = 3,
  signal?: AbortSignal,
) {
  for (let i = 0; i < maxRetry; i++) {
    try {
      // v4 SDK は第2引数で fetchOptions を渡せる
      // @ts-expect-error （型宣言が無くても実行時は通る）
      return await openai.chat.completions.create(req, { signal });
    } catch (e: any) {
      if ((e?.name === 'AbortError') || (e?.code === 'AbortError')) throw e;
      if (e?.code === 'rate_limit_exceeded' && i < maxRetry - 1) {
        const delay = 1000 * (i + 1);
        logLine(`⏳ 429: retry in ${delay}ms`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw e;
      }
    }
  }
  throw new Error('chatWithRetry: unexpected fallthrough');
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  // 認証ヘッダーでサーバー側 Supabase クライアントを生成
  const supabaseServer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: request.headers.get('Authorization') ?? '',
        },
      },
    }
  );

  // クライアント離脱/切断時に上流(API)を中断するための AbortController
  const upstreamAbort = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      let assistantFull = '';
      let closed = false;
      let formData: FormData | null = null;

      try {
        // 0) 認証
        const { data: { user }, error: authError } = await supabaseServer.auth.getUser();
        if (authError || !user) {
          logLine('❌ チャットAPI: 認証エラー:', authError);
          controller.enqueue(encoder.encode('認証エラーが発生しました。再ログインしてください。'));
          closed = true;
          controller.close();
          return;
        }
        logLine('✅ チャットAPI: ユーザー認証成功:', user.id);

        // 1) 入力（一度だけ読み取り）
        try {
          formData = await request.formData();
        } catch (formError) {
          logLine('❌ FormData解析エラー:', formError);
          controller.enqueue(encoder.encode('リクエストの解析に失敗しました。'));
          closed = true;
          controller.close();
          return;
        }
        
        const form = formData;
        const taskId  = form.get('taskId')  as string;
        const message = form.get('message') as string;
        const selectedModel = (form.get('model') as string) || 'gpt-4o-search-preview';
        
        let history: { role: 'user' | 'assistant'; content: string; }[] = [];
        try {
          const historyString = form.get('history') as string;
          if (historyString) {
            history = JSON.parse(historyString);
          }
        } catch (historyError) {
          logLine('❌ 履歴JSON解析エラー:', historyError);
          // 履歴解析失敗は続行可能
          history = [];
        }
        
        // 要約トークンを取得（ヘッダー優先、なければbody）
        const summaryToken = request.headers.get('X-Summary-Token') || 
                           (form.get('summaryToken') as string) || '';
        
        // 環境変数チェック
        const SUMMARY_SECRET = process.env.SUMMARY_SECRET;
        if (!SUMMARY_SECRET) {
          logLine('❌ SUMMARY_SECRET not configured');
          controller.enqueue(encoder.encode('サーバー設定エラーが発生しました。'));
          closed = true;
          controller.close();
          return;
        }
        
        // デバッグ: トークン詳細情報を出力
        if (summaryToken) {
          try {
            const parts = summaryToken.split('.');
            logLine('🔍 トークン基本情報:', {
              hasToken: true,
              tokenLength: summaryToken.length,
              tokenPrefix: summaryToken.slice(0, 20) + '...',
              partsCount: parts.length,
              hasSecret: !!SUMMARY_SECRET,
              secretLength: SUMMARY_SECRET?.length || 0
            });
            
            // 詳細デバッグ
            const unsealed = unsealSummary(SUMMARY_SECRET, summaryToken);
            if (!unsealed) {
              logLine('⚠️ token invalid: SIG_OR_FORMAT', { 
                tokenLength: summaryToken.length,
                tokenPrefix: summaryToken.slice(0, 10) + '...',
                hasSecret: !!SUMMARY_SECRET,
                secretLength: SUMMARY_SECRET?.length || 0,
                partsCount: parts.length,
                expectedParts: 3
              });
            } else if (unsealed.uid !== user.id) {
              logLine('⚠️ token invalid: UID_MISMATCH', { 
                reqUid: user.id.slice(0, 8) + '...', 
                tokUid: unsealed.uid.slice(0, 8) + '...' 
              });
            } else if (unsealed.taskId !== taskId) {
              logLine('⚠️ token invalid: TASK_MISMATCH', { 
                reqTask: taskId, 
                tokTask: unsealed.taskId 
              });
            } else {
              logLine('✅ 要約トークン検証成功:', { 
                taskId, 
                summaryLength: unsealed.summary.length,
                timestamp: new Date(unsealed.ts).toISOString()
              });
            }
          } catch (debugError) {
            logLine('❌ トークンデバッグエラー:', debugError);
          }
        }

        // taskId検証
        if (!isValidTaskId(taskId)) {
          logLine('❌ 無効なtaskId形式:', taskId);
          controller.enqueue(encoder.encode('無効なタスクIDです。'));
          closed = true;
          controller.close();
          return;
        }

        logLine('🤖 選択モデル:', { selectedModel, taskId, userId: user.id });

        // 2) 要約トークン検証・復号
        let currentSummary = '';
        if (summaryToken) {
          const unsealed = unsealSummary(SUMMARY_SECRET, summaryToken);
          if (unsealed && unsealed.uid === user.id && unsealed.taskId === taskId) {
            currentSummary = unsealed.summary;
          }
        }

        // 3) system プロンプト
        let systemPrompt = '丁寧かつ適切に回答してください。';
        try {
          if (taskId === 'general-support') {
            systemPrompt = `あなたは学習サポート専門のAIアシスタントです。
【役割】新規事業/学習支援　【スタイル】親しみやすく具体例多め・段階的・実行可能`;
          } else {
            const { data: profile } = await supabaseServer
              .from('profiles')
              .select('term_id')
              .eq('id', user.id)
              .single();
            if (profile?.term_id) {
              const { data: preAssignment } = await supabaseServer
                .from('pre_assignments')
                .select('system_instruction, ai_name, ai_description')
                .eq('term_id', profile.term_id)
                .eq('assignment_id', taskId)
                .single();
              if (preAssignment?.system_instruction?.trim()) {
                systemPrompt = preAssignment.system_instruction;
              }
              
              // AI情報をレスポンスヘッダーに追加
              if (preAssignment) {
                // AI情報をストリームの最初に送信
                const aiInfo = `__AI_INFO__:${JSON.stringify({
                  ai_name: preAssignment.ai_name || '',
                  ai_description: preAssignment.ai_description || ''
                })}`;
                controller.enqueue(encoder.encode(aiInfo + '\n'));
              }
            }
          }
        } catch (e) {
          logLine('⚠️ systemプロンプト取得失敗、デフォルト継続:', (e as any)?.message);
        }

        // 4) 添付ファイル（PDF/画像）
        let context = '';
        const upload = (form.get('pdf') as File | null) || (form.get('file') as File | null);
        let imageContentPart: { type: 'image_url'; image_url: { url: string } } | null = null;
        if (upload) {
          const buf = Buffer.from(await upload.arrayBuffer());
          const mime = upload.type || '';
          if (mime === 'application/pdf') {
            try {
              const extracted = await parsePDF(buf);
              context = `添付ファイル(PDF)の内容:\n${extracted}\n\n`;
            } catch (e) {
              logLine('⚠️ PDF解析失敗:', (e as any)?.message);
              context = `添付ファイル(PDF)を受け取りましたが、解析に失敗しました。\n\n`;
            }
          } else if (mime.startsWith('image/')) {
            const b64 = buf.toString('base64');
            const dataUrl = `data:${mime};base64,${b64}`;
            imageContentPart = { type: 'image_url', image_url: { url: dataUrl } };
          } else {
            logLine('⚠️ 未対応MIME:', mime);
            context = `未対応の添付ファイル(${mime})を受け取りました。\n\n`;
          }
        }

        // 5) 履歴構築（要約を先頭に配置）
        const sanitizedHistory = history.filter(m =>
          !(m.role === 'assistant'
            && typeof m.content === 'string'
            && m.content.startsWith('【これまでの要約】'))
        );

        const userText = `${context}${message}`;
        const userMessageContent: any =
          imageContentPart
            ? [{ type: 'text', text: userText }, imageContentPart]
            : userText;

        // 6) messages 初期化（要約を直接配置）
        let messages: any[] = [
          { role: 'system', content: systemPrompt },
          // 要約がある場合は先頭に配置
          ...(currentSummary ? [{ role: 'assistant', content: `【これまでの要約】\n${currentSummary}` }] : []),
          // 直近の履歴（最大4件）
          ...sanitizedHistory.slice(-4),
          { role: 'user', content: userMessageContent },
        ];

        // 7) ユーザー長文の前処理（トークン制限対策）
        const approxBefore = roughTokenCount(JSON.stringify(messages));
        if (approxBefore > 5000) {
          const shorten = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: '次のユーザー発言を要点を保って500字以内に短縮。固有名詞/人数/金額/日付は残す。' },
              { role: 'user', content: message },
            ],
            max_tokens: 900,
          });
          const shortenedText = shorten.choices[0]?.message?.content ?? message;
          messages[messages.length - 1] = {
            role: 'user',
            content: imageContentPart
              ? [{ type: 'text', text: `${context}${shortenedText}` }, imageContentPart]
              : `${context}${shortenedText}`,
          };
        }

        // 8) モデル呼び出し（中断と premature close をハンドリング）
        const maxTokens = 600;
        logLine('🚀 OpenAI呼び出し開始:', { model: selectedModel, taskId });

        if (selectedModel === 'deepresearch') {
          try {
            const authz = request.headers.get('Authorization') ?? '';
            const drRes = await fetch(new URL('/api/deep-research', request.url), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: authz },
              body: JSON.stringify({ query: message, system: systemPrompt, useRewriter: true }),
              signal: upstreamAbort.signal,
            });

            let drJson: any;
            try {
              drJson = await drRes.json();
            } catch (inner) {
              if ((inner as any)?.name === 'AbortError') {
                logLine('⚠️ DeepResearch aborted (client canceled)');
              } else {
                logLine('⚠️ DeepResearch premature close');
              }
              drJson = null;
            }

            if (drJson?.ok) {
              const paragraphs = (drJson.text || '').split(/\n{2,}/).filter((p: string) => p.trim());
              for (const p of paragraphs) {
                controller.enqueue(encoder.encode(p + '\n\n'));
                await new Promise(r => setTimeout(r, 60));
              }
              if (drJson.citations?.length > 0) {
                const cites = "\n\n**📚 参考文献:**\n" +
                  drJson.citations.map((c: any) => `- [${c.title || 'リンク'}](${c.url})`).join('\n');
                controller.enqueue(encoder.encode(cites));
              }
              assistantFull = drJson.text + (drJson.citations?.length ? '\n\n[引用情報付き]' : '');
            } else {
              throw new Error(drJson?.error || 'DeepResearch APIエラー');
            }
          } catch (err: any) {
            if (err?.name === 'AbortError') {
              logLine('⚠️ DR aborted by client cancel');
            } else {
              logLine('❌ DR失敗、GPT-4oへフォールバック:', err);
              controller.enqueue(encoder.encode('⚠️ DeepResearch不可のため、GPT-4o（検索機能付き）で回答します。\n\n'));
              const response = await chatWithRetry(
                { model: 'gpt-4o-search-preview', stream: true, messages, max_tokens: maxTokens },
                3,
                upstreamAbort.signal,
              );
              try {
                for await (const chunk of response) {
                  const delta = chunk.choices[0]?.delta?.content;
                  if (delta) {
                    assistantFull += delta;
                    controller.enqueue(encoder.encode(delta));
                  }
                }
              } catch (innerErr: any) {
                if (innerErr?.name === 'AbortError' || innerErr?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                  logLine('⚠️ upstream aborted/premature in fallback');
                } else {
                  throw innerErr;
                }
              }
            }
          }
        } else {
          // 通常の OpenAI 呼び出し
          try {
            const response = await chatWithRetry(
              { model: selectedModel, stream: true, messages, max_tokens: maxTokens },
              3,
              upstreamAbort.signal,
            );
            try {
              for await (const chunk of response) {
                const delta = chunk.choices[0]?.delta?.content;
                if (delta) {
                  assistantFull += delta;
                  controller.enqueue(encoder.encode(delta));
                }
              }
            } catch (innerErr: any) {
              if (innerErr?.name === 'AbortError' || innerErr?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                logLine('⚠️ upstream aborted/premature');
              } else {
                throw innerErr;
              }
            }
          } catch (err: any) {
            if (err?.name === 'AbortError') {
              logLine('⚠️ OpenAI aborted by client cancel');
            } else {
              throw err;
            }
          }
        }

        // 9) 要約更新処理（ストリーム完了前に実行）
        if (assistantFull && !closed && SUMMARY_SECRET) {
          // 要約更新を同期実行（ストリーム終了前）
          try {
            // 直近の会話を構築
            const recentText = [...sanitizedHistory.slice(-4)]
              .map(m => `${m.role === 'assistant' ? 'アシスタント' : 'ユーザー'}: ${m.content}`)
              .join('\n');

            // 新しい要約を生成（上限なし、コンパクト重視）
            const sumRes = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              temperature: 0.2,
              messages: [
                {
                  role: 'system',
                  content: [
                    'あなたは会話全体をできるだけコンパクトに要約するアシスタントです。',
                    '【前回要約】と【直近の発話】と【今回の新しい発話】を統合し、重要な情報を保持しつつ簡潔にまとめてください。',
                    '直近の会話内容を優先し、固有名詞・日付・人数・金額も保持してください。',
                    '古い内容は大胆に圧縮し、新しいやり取りのニュアンスは必ず反映してください。',
                    '冗長な表現は避け、箇条書きや短文を活用して情報密度を高めてください。',
                  ].join('\n'),
                },
                {
                  role: 'user',
                  content: [
                    `【前回要約】\n${currentSummary || '（空）'}`,
                    `【直近の発話】\n${recentText || '（なし）'}`,
                    `【今回の新しい発話】\nユーザー: ${message}\nアシスタント: ${assistantFull}`,
                  ].join('\n')
                }
              ],
              max_tokens: 900,
            });

            let newSummary = sumRes.choices[0]?.message?.content?.trim() || currentSummary;

            // 極端に長い場合のみ再圧縮（10000文字以上）
            if (newSummary.length > 10000) {
              const shrink = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                temperature: 0.1,
                messages: [
                  {
                    role: 'system',
                    content: '次のテキストを3000文字以内に圧縮してください。重要な情報は保持し、冗長な部分を削除してください。'
                  },
                  { role: 'user', content: newSummary }
                ],
                max_tokens: 1200,
              });
              newSummary = shrink.choices[0]?.message?.content?.trim() || newSummary;
            }

            // 新しい署名付きトークンを生成
            const newToken = sealSummary(SUMMARY_SECRET, {
              uid: user.id,
              taskId: taskId,
              summary: newSummary
            });

            // ログは長さのみ（本文は出力しない）
            logLine(`📑 要約更新完了:`, { 
              userId: user.id.substring(0, 8) + '...', // ユーザーIDの一部のみ
              taskId, 
              summaryLength: newSummary.length,
              compressionRatio: currentSummary ? `${Math.round((newSummary.length / (currentSummary.length + assistantFull.length)) * 100)}%` : 'N/A',
              tokenGenerated: true
            });

            // トークンをストリームに送信（controller状態をチェック）
            if (!closed) {
              try {
                controller.enqueue(encoder.encode(`\n\n__SUMMARY_TOKEN__:${newToken}`));
                logLine('✅ 要約トークン送信成功');
              } catch (controllerError) {
                logLine('⚠️ Controller already closed, summary token generated but not sent via stream');
              }
            } else {
              logLine('⚠️ Stream already closed, summary token generated but not sent');
            }

          } catch (sumErr) {
            logLine('⚠️ 要約更新をスキップ:', (sumErr as any)?.message);
          }
        }

      } catch (err: any) {
        logLine('❌ route error details:', {
          name: err?.name || 'Unknown',
          message: err?.message || 'No message',
          stack: err?.stack || 'No stack',
          code: err?.code || 'No code',
          cause: err?.cause || 'No cause'
        });
        
        if (err?.code === 'unsupported_country_region_territory') {
          controller.enqueue(encoder.encode('現在の環境からはモデルに接続できません（地域制限）。サーバー経由で再試行してください。'));
          closed = true;
          controller.close();
          return;
        }
        if (err?.name === 'AbortError' || err?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
          logLine('⚠️ Premature close/Abort (soft-finish).');
        } else {
          logLine('❌ route error caught:', {
            errorType: typeof err,
            errorName: err?.name,
            errorMessage: err?.message,
            errorCode: err?.code
          });
          try { controller.enqueue(encoder.encode('エラーが発生しました。時間をおいて再試行してください。')); } catch {}
        }
      } finally {
        if (!closed) {
          try { controller.close(); } catch {}
        }
      }
    },

    // クライアントが fetch をキャンセル/遷移した場合に呼ばれる
    cancel(reason) {
      try { upstreamAbort.abort(); } catch {}
      logLine('ℹ️ client canceled stream:', reason);
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
