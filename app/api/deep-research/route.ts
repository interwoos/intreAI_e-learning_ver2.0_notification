// /app/api/deep-research/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Node16互換: OpenAI SDKの代わりにfetch直叩き
async function openaiCreate(payload: any) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  
  const text = await res.text();
  if (!res.ok) {
    console.error(`❌ OpenAI API Error ${res.status}:`, text.slice(0, 800));
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 800)}`);
  }
  
  return JSON.parse(text);
}

// レート制限対応のリトライ関数
function retryDelay(retryAfterHeader: string | null, errorBody: string): number {
  if (retryAfterHeader) {
    return Math.max(100, Math.ceil(parseFloat(retryAfterHeader) * 1000));
  }
  const match = /try again in ([0-9.]+)s/i.exec(errorBody || "");
  return match ? Math.ceil(parseFloat(match[1]) * 1000) : 1200;
}

// リトライ付きOpenAI呼び出し
async function openaiCreateWithRetry(payload: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await openaiCreate(payload);
    } catch (error: any) {
      if (error.message?.includes('429') && attempt < maxRetries) {
        const delay = retryDelay(null, error.message);
        console.warn(`⏳ Rate limit hit, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
function parseOutput(resp: any) {
  const out = Array.isArray(resp?.output) ? resp.output : [];
  const last = out[out.length - 1];
  const content0 = Array.isArray(last?.content) ? last.content[0] : null;
  const text = content0?.text ?? "";
  const citations = Array.isArray(content0?.annotations) ? content0.annotations : [];
  
  // 引用情報の品質向上（一次ソース優先）
  const sortedCitations = citations.sort((a: any, b: any) => {
    const aPrimary = isPrimarySource(a.url || '');
    const bPrimary = isPrimarySource(b.url || '');
    if (aPrimary && !bPrimary) return -1;
    if (!aPrimary && bPrimary) return 1;
    return 0;
  });
  
  const steps = out.filter(
    (x: any) =>
      x &&
      ["reasoning", "web_search_call", "code_interpreter_call", "mcp_call"].includes(x.type)
  );
  return { text, citations: sortedCitations, steps };
}

// 一次ソース判定関数
function isPrimarySource(url: string): boolean {
  const primaryDomains = [
    'gov', 'edu', 'org',
    'press', 'official', 'pdf',
    'research', 'journal', 'paper'
  ];
  return primaryDomains.some(domain => url.includes(domain));
}

// クエリキャッシュ（5分間）
const queryCache = new Map<string, { result: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5分

function getCachedResult(query: string) {
  const cached = queryCache.get(query);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.result;
  }
  return null;
}

function setCachedResult(query: string, result: any) {
  queryCache.set(query, { result, timestamp: Date.now() });
  
  // キャッシュサイズ制限（100件まで）
  if (queryCache.size > 100) {
    const oldestKey = Array.from(queryCache.keys())[0];
    queryCache.delete(oldestKey);
  }
}
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const useBackground = searchParams.get("background") === "1";

    const { query, system, useRewriter = true } = await req.json();
    if (!query) {
      return NextResponse.json({ ok: false, error: "Missing query" }, {
        status: 400,
      });
    }

    console.log('🔍 DeepResearch API呼び出し:', {
      query: query.substring(0, 100) + '...',
      useBackground,
      useRewriter,
      timestamp: new Date().toISOString()
    });

    // キャッシュチェック
    const cacheKey = `${query}-${system || defaultSystem}`;
    const cachedResult = getCachedResult(cacheKey);
    if (cachedResult) {
      console.log('📦 キャッシュヒット:', cacheKey.substring(0, 50));
      return NextResponse.json({
        ...cachedResult,
        cached: true
      });
    }

    // 事前リライト（曖昧入力の安定化）※失敗時はフォールバック
    let rewritten = String(query);
    if (useRewriter) {
      try {
        // Node16互換: fetch直叩きでリライト
        const rewritePayload = {
          model: "gpt-4o-mini",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `Rewrite the user's request into detailed research instructions (scope, metrics, comparisons, geographies, timeframe, preferred sources, output format). Keep language same as input.
User input:
${query}`,
                },
              ],
            },
          ],
        };
        
        const rewriteResult = await openaiCreateWithRetry(rewritePayload);
        rewritten = rewriteResult.output?.[0]?.content?.[0]?.text?.trim() || String(query);
        console.log('✏️ クエリリライト完了:', rewritten.substring(0, 100) + '...');
      } catch {
        console.warn('⚠️ クエリリライト失敗、元のクエリを使用');
      }
    }

    // Deep Research 呼び出し（最小・安全パラメータ）
    const payload = {
      model: "o1-preview", // 実際に利用可能なモデル名に変更
      input: [
        { role: "developer", content: [{ type: "input_text", text: system || defaultSystem }] },
        { role: "user", content: [{ type: "input_text", text: rewritten }] },
      ],
      reasoning: { summary: "auto" }, // effort等は付けない
      tools: [{ type: "web_search_preview", search_context_size: "medium" }], // 固定: medium
    };

    if (useBackground) {
      const backgroundPayload = { ...payload, background: true };
      const kicked = await openaiCreateWithRetry(backgroundPayload);
      return NextResponse.json({ 
        id: kicked.id, 
        status: kicked.status || "queued", 
        tag: "DR" 
      });
    }

    console.log('🚀 DeepResearch実行開始:', {
      model: payload.model,
      hasTools: !!payload.tools?.length,
      timestamp: new Date().toISOString()
    });

    const resp = await openaiCreateWithRetry(payload);
    const { text, citations, steps } = parseOutput(resp);
    
    const result = {
      ok: true,
      text,
      citations,
      steps,
      modelUsed: resp.model || payload.model,
      tag: "DR",
    };
    
    // 結果をキャッシュ
    setCachedResult(cacheKey, result);
    
    console.log('✅ DeepResearch完了:', {
      textLength: text.length,
      citationsCount: citations.length,
      stepsCount: steps.length,
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[DR ERROR]", e?.status || "", e?.message || e);
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: e?.status || 500 }
    );
  }
}

const defaultSystem = `You are a professional research analyst. Return a structured, citation-rich report.
- Prefer authoritative & up-to-date sources.
- Use headings and bullet points for readability.
- Include inline citations; key claims must be traceable.
- If the user language is Japanese, respond in Japanese.`;
