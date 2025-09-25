import { NextResponse } from "next/server";
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const resend = new Resend(process.env.RESEND_API_KEY);

export const dynamic = "force-dynamic"; // リクエスト文脈を強制

const CRON_KEY = process.env.CRON_KEY || "dev-cron";

async function processEmailQueue() {
  console.log('📧 メール送信処理開始:', new Date().toISOString());
  
  // 送信待ちメールを取得（最大10件）
  const { data: pendingEmails, error: fetchError } = await supabaseAdmin
    .from('email_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10);

  if (fetchError) {
    console.error('❌ 送信待ちメール取得エラー:', fetchError);
    return { success: false, error: fetchError.message };
  }

  if (!pendingEmails || pendingEmails.length === 0) {
    console.log('📭 送信待ちメールなし');
    return { success: true, sent: 0, failed: 0, skipped: 0 };
  }

  console.log('📧 送信対象メール数:', pendingEmails.length);

  let sent = 0;
  let failed = 0;

  // 各メールを順次送信
  for (const email of pendingEmails) {
    try {
      console.log('📤 メール送信開始:', { id: email.id, to: email.to_email });

      // 処理中ステータスに更新
      await supabaseAdmin
        .from('email_queue')
        .update({ status: 'processing', picked_at: new Date().toISOString() })
        .eq('id', email.id);

      // 検証モード対応
      let actualToEmail = email.to_email;
      const testMode = process.env.EMAIL_TEST_MODE === 'true';
      const testEmails = process.env.EMAIL_TEST_ADDRESSES;
      
      if (testMode && testEmails) {
        const testEmailList = testEmails.split(',').map(e => e.trim()).filter(Boolean);
        if (testEmailList.length > 0) {
          actualToEmail = testEmailList[0]; // 最初の検証用メールに送信
          console.log('📧 検証モード:', email.to_email, '→', actualToEmail);
        }
      }

      // Resend APIでメール送信
      const { data: resendData, error: resendError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@intreai.interwoos.com',
        to: [actualToEmail],
        subject: email.subject,
        html: email.body.replace(/\n/g, '<br>'),
        text: email.body
      });

      if (resendError) {
        console.error('❌ Resend送信エラー:', resendError);
        
        // 失敗ステータスに更新
        await supabaseAdmin
          .from('email_queue')
          .update({
            status: 'failed',
            failed_at: new Date().toISOString(),
            error_message: resendError.message || 'Resend送信エラー'
          })
          .eq('id', email.id);

        failed++;
        continue;
      }

      console.log('✅ メール送信成功:', { id: email.id, resendId: resendData?.id });

      // 成功ステータスに更新
      await supabaseAdmin
        .from('email_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          error_message: null
        })
        .eq('id', email.id);

      sent++;

      // レート制限対策（500ms待機）
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (emailError) {
      console.error('❌ メール送信例外:', emailError);
      
      // 失敗ステータスに更新
      await supabaseAdmin
        .from('email_queue')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_message: emailError instanceof Error ? emailError.message : '不明なエラー'
        })
        .eq('id', email.id);

      failed++;
    }
  }

  console.log('📧 メール送信処理完了:', { sent, failed });
  return { success: true, sent, failed, skipped: 0 };
}

export async function GET(req: Request) {
  try {
    // 認証チェック
    const key = new URL(req.url).searchParams.get("key") || "";
    
    if (key !== CRON_KEY) {
      console.error('❌ CRON_KEY認証失敗');
      return NextResponse.json(
        { ok: false, where: "auth", error: "CRON_KEY mismatch" },
        { status: 403 }
      );
    }

    console.log('🤖 Vercel Cronメール送信ワーカー開始');

    // 環境変数チェック
    const envDiag = {
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    
    if (!envDiag.RESEND_API_KEY || !envDiag.NEXT_PUBLIC_SUPABASE_URL || !envDiag.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, where: "env", error: "Required env not set", env: envDiag },
        { status: 500 }
      );
    }

    // メール送信処理実行
    const result = await processEmailQueue();

    console.log('✅ Vercel Cronメール送信ワーカー完了:', result);

    return NextResponse.json({
      ok: result.success,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      env: envDiag,
    });
  } catch (e: any) {
    console.error('❌ メール送信ワーカーエラー:', e);
    return NextResponse.json(
      { ok: false, where: "handler", error: e?.message || "unknown error" },
      { status: 500 }
    );
  }
}

// POST版も同じ処理（手動実行用）
export async function POST(req: Request) {
  return GET(req);
}
