// 強化されたメール送信ワーカー
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import pLimit from 'p-limit';

const resend = new Resend(process.env.RESEND_API_KEY);

// 設定
const BATCH_SIZE = 1; // 1件ずつ処理（レート制限完全回避）
const CONCURRENT_LIMIT = 1; // 同時送信数を1に制限
const RATE_LIMIT = 1; // 1秒あたり1件に制限（Resend: 2req/sec）
const SEND_INTERVAL = 3000; // 送信間隔を3秒に延長（完全安全マージン）
const MAX_RETRIES = 3;

// シーケンシャル送信制御用
let lastSendTime = 0;

/**
 * 確実なレート制御（1.2秒間隔）
 */
async function ensureRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastSend = now - lastSendTime;
  
  if (timeSinceLastSend < SEND_INTERVAL) {
    const sleepTime = SEND_INTERVAL - timeSinceLastSend;
    console.log(`⏳ レート制限: ${sleepTime}ms待機`);
    await new Promise(resolve => setTimeout(resolve, sleepTime));
  }
  
  lastSendTime = Date.now();
}

/**
 * 送信前の保険冪等チェック
 */
async function preCheckIdempotency(job: any): Promise<boolean> {
  try {
    // 冪等性チェックの時間範囲を短縮（5分 → 1分）
    const { data: duplicate, error } = await supabaseAdmin
      .from('email_queue')
      .select('id')
      .eq('template_key', job.template_key)
      .eq('to_email', job.to_email)
      .eq('status', 'sent')
      .gte('sent_at', new Date(Date.now() - 1 * 60 * 1000).toISOString()) // 直近1分
      .limit(1);

    if (error) {
      console.error('❌ 保険冪等チェックエラー:', error);
      return false;
    }

    const isDupe = !!(duplicate && duplicate.length > 0);
    if (isDupe) {
      console.log('🔄 冪等性チェック: 重複検出', {
        template: job.template_key,
        to: job.to_email?.substring(0, 20) + '...',
        recentSentCount: duplicate?.length || 0
      });
    }

    return isDupe;
  } catch (error) {
    console.error('❌ 保険冪等チェック例外:', error);
    return false;
  }
}

/**
 * 単一メール送信処理
 */
async function sendSingleEmail(job: any): Promise<{
  success: boolean;
  jobId: string;
  error?: string;
  skipped?: boolean;
  details?: any;
}> {
  const jobId = job.id;
  
  try {
    console.log('📤 メール送信開始:', {
      jobId,
      to: job.to_email?.substring(0, 20) + '...',
      template: job.template_key,
      subject: job.subject?.substring(0, 50) + '...'
    });

    // 検証モードでの宛先変換を確認
    const testMode = process.env.EMAIL_TEST_MODE === 'true';
    const testEmails = process.env.EMAIL_TEST_ADDRESSES;
    
    console.log('📧 送信前検証モード確認:', {
      testMode,
      testEmails,
      originalTo: job.to_email,
      willOverride: testMode && testEmails
    });

    // 保険冪等チェック
    const isDuplicate = await preCheckIdempotency(job);
    if (isDuplicate) {
      console.log('🔄 重複検出によりスキップ:', {
        jobId,
        template: job.template_key,
        to: job.to_email?.substring(0, 20) + '...',
        reason: '直近1分以内に同じメールを送信済み'
      });
      // 重複として処理済みにマーク
      await supabaseAdmin
        .from('email_queue')
        .update({ 
          status: 'sent',
          sent_at: new Date().toISOString(),
          error_message: 'Skipped: duplicate detected (1min window)'
        })
        .eq('id', jobId);

      return { 
        success: true, 
        jobId, 
        skipped: true,
        details: { 
          reason: 'duplicate_detected',
          window: '1min',
          template: job.template_key
        }
      };
    }

    // 確実なレート制御（前回送信から1.2秒待機）
    await ensureRateLimit();

    // 実際の送信先を決定（検証モード対応）
    let actualToEmail = job.to_email;
    if (testMode && testEmails) {
      const testEmailList = testEmails.split(',').map(email => email.trim()).filter(Boolean);
      if (testEmailList.length > 0) {
        // 元のメールアドレスのハッシュ値で検証用メールを決定
        const hash = job.to_email.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0);
        const index = Math.abs(hash) % testEmailList.length;
        actualToEmail = testEmailList[index];
        
        console.log('📧 検証モード宛先変換:', {
          original: job.to_email,
          actual: actualToEmail,
          hash,
          index
        });
      }
    }
    console.log('📧 Resend API呼び出し開始:', {
      jobId,
      from: process.env.RESEND_FROM_EMAIL,
      to: actualToEmail,
      subjectLength: job.subject?.length || 0,
      bodyLength: job.body?.length || 0
    });

    // Resend APIでメール送信
    const { data: resendData, error: resendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@yourapp.com',
      to: [actualToEmail],
      subject: job.subject,
      html: job.body.replace(/\n/g, '<br>'),
      text: job.body
    });

    if (resendError) {
      console.error('❌ Resend APIエラー詳細:', {
        jobId,
        error: resendError,
        errorMessage: resendError.message,
        errorName: resendError.name,
        originalTo: job.to_email,
        actualTo: actualToEmail
      });
      throw new Error(`Resend API error: ${resendError.message}`);
    }

    console.log('✅ Resend API成功:', {
      jobId,
      resendId: resendData?.id,
      originalTo: job.to_email?.substring(0, 20) + '...',
      actualTo: actualToEmail?.substring(0, 20) + '...'
    });

    // 成功ステータスに更新
    await supabaseAdmin
      .from('email_queue')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        error_message: null
      })
      .eq('id', jobId);

    console.log('✅ メール送信成功:', {
      jobId,
      originalEmail: job.to_email.substring(0, 10) + '...',
      actualEmail: actualToEmail.substring(0, 10) + '...',
      resendId: resendData?.id
    });

    return { 
      success: true, 
      jobId,
      details: { 
        resendId: resendData?.id,
        sentAt: new Date().toISOString(),
        originalEmail: job.to_email,
        actualEmail: actualToEmail
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '不明なエラー';
    
    console.error('❌ メール送信失敗詳細:', {
      jobId,
      originalTo: job.to_email?.substring(0, 20) + '...',
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
      isRateLimitError: errorMessage.includes('Too many requests'),
      isResendError: errorMessage.includes('Resend API error')
    });

    // 失敗ステータスに更新
    await supabaseAdmin
      .from('email_queue')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        error_message: errorMessage
      })
      .eq('id', jobId);

    console.error('❌ メール送信失敗:', {
      jobId,
      originalEmail: job.to_email.substring(0, 10) + '...',
      error: errorMessage
    });

    return { 
      success: false, 
      jobId, 
      error: errorMessage,
      details: {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        timestamp: new Date().toISOString(),
        originalEmail: job.to_email,
        isRateLimitError: errorMessage.includes('Too many requests')
      }
    };
  }
}

/**
 * バッチ処理でメールキューを処理（シーケンシャル送信）
 */
export async function processEmailQueueBatch(): Promise<{
  success: boolean;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  executionTimeMs: number;
}> {
  const startTime = Date.now();
  
  try {
    console.log('📧 メールキューバッチ処理開始');

    // pending メールをピック（少量ずつ）
    const { data: pendingJobs, error: pickError } = await supabaseAdmin
      .from('email_queue')
      .update({ 
        status: 'processing',
        picked_at: new Date().toISOString()
      })
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1) // 1件ずつ処理（レート制限完全回避）
      .select('id, to_email, subject, body, template_key, metadata');

    if (pickError) {
      console.error('❌ メールジョブピックエラー:', pickError);
      return {
        success: false,
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        executionTimeMs: Date.now() - startTime
      };
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      console.log('📭 処理対象のメールなし');
      return {
        success: true,
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        executionTimeMs: Date.now() - startTime
      };
    }

    console.log('📤 処理対象メール:', {
      count: pendingJobs.length,
      firstJob: {
        id: pendingJobs[0]?.id,
        to: pendingJobs[0]?.to_email?.substring(0, 20) + '...',
        template: pendingJobs[0]?.template_key
      }
    });

    // シーケンシャル送信処理（1件ずつ順番に）
    const results: Array<{
      success: boolean;
      jobId: string;
      error?: string;
      skipped?: boolean;
      details?: any;
    }> = [];
    
    let rateLimitErrors = 0;

    for (let i = 0; i < pendingJobs.length; i++) {
      const job = pendingJobs[i];
      console.log(`📤 [${i + 1}/${pendingJobs.length}] メール送信開始:`, {
        jobId: job.id,
        to: job.to_email?.substring(0, 20) + '...',
        template: job.template_key
      });
      
      try {
        const result = await sendSingleEmail(job);
        results.push(result);
        
        // レート制限エラーをカウント
        if (result.error && result.error.includes('Too many requests')) {
          rateLimitErrors++;
        }
        
        console.log(`✅ [${i + 1}/${pendingJobs.length}] 送信完了:`, {
          success: result.success,
          skipped: result.skipped,
          jobId: result.jobId,
          error: result.error?.substring(0, 50) + (result.error?.length > 50 ? '...' : '')
        });
      } catch (error) {
        console.error(`❌ [${i + 1}/${pendingJobs.length}] 送信例外:`, error);
        results.push({
          success: false,
          jobId: job.id,
          error: error instanceof Error ? error.message : '不明なエラー'
        });
      }
      
      // 最後の送信でない場合は追加待機
      if (i < pendingJobs.length - 1) {
        console.log(`⏳ [${i + 1}/${pendingJobs.length}] 次の送信まで${SEND_INTERVAL}ms待機...`);
        await new Promise(resolve => setTimeout(resolve, SEND_INTERVAL));
      }
    }
    
    // 結果集計
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    results.forEach((result) => {
      if (result.skipped) {
        skipped++;
      } else if (result.success) {
        sent++;
      } else {
        failed++;
      }
    });

    const executionTimeMs = Date.now() - startTime;

    console.log('📧 メールキューバッチ処理完了:', {
      processed: pendingJobs.length,
      sent,
      failed,
      skipped,
      executionTimeMs,
      rateLimitErrors
    });

    return {
      success: true,
      processed: pendingJobs.length,
      sent,
      failed,
      skipped,
      executionTimeMs,
      rateLimitErrors
    };

  } catch (error) {
    console.error('❌ メールキューバッチ処理例外:', error);
    return {
      success: false,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      executionTimeMs: Date.now() - startTime
    };
  }
}

/**
 * スタックした処理中ジョブをリセット
 */
export async function resetStuckJobs(timeoutMinutes: number = 10): Promise<number> {
  try {
    const { data: resetJobs, error } = await supabaseAdmin
      .from('email_queue')
      .update({
        status: 'pending',
        picked_at: null
      })
      .eq('status', 'processing')
      .lt('picked_at', new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString())
      .select('id');

    if (error) {
      console.error('❌ スタックジョブリセットエラー:', error);
      return 0;
    }

    const resetCount = resetJobs?.length || 0;
    if (resetCount > 0) {
      console.log('🔄 スタックジョブリセット完了:', resetCount, '件');
    }

    return resetCount;
  } catch (error) {
    console.error('❌ スタックジョブリセット例外:', error);
    return 0;
  }
}