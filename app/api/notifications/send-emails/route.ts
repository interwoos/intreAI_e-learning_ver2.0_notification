import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    console.log('📧 メール送信ワーカー開始');

    // 認証チェック（管理者またはシステム）
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      
      if (authError || !user) {
        return NextResponse.json({ error: '認証が無効です' }, { status: 401 });
      }

      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
      }
    }

    // 送信待ちメールを取得（最大10件）
    const { data: pendingEmails, error: fetchError } = await supabaseAdmin
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error('❌ 送信待ちメール取得エラー:', fetchError);
      return NextResponse.json({ error: 'メール取得に失敗しました' }, { status: 500 });
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      console.log('📭 送信待ちメールなし');
      return NextResponse.json({ 
        success: true, 
        sent: 0, 
        message: '送信待ちメールはありません' 
      });
    }

    console.log('📧 送信対象メール数:', pendingEmails.length);

    let sentCount = 0;
    let failedCount = 0;

    // 各メールを順次送信
    for (const email of pendingEmails) {
      try {
        console.log('📤 メール送信開始:', { id: email.id, to: email.to_email });

        // RESEND APIでメール送信
        const { data: resendData, error: resendError } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'noreply@yourapp.com',
          to: [email.to_email],
          subject: email.subject,
          html: email.body.replace(/\n/g, '<br>'), // 改行をHTMLに変換
          text: email.body
        });

        if (resendError) {
          console.error('❌ RESEND送信エラー:', resendError);
          
          // 失敗ステータスに更新
          await supabaseAdmin
            .from('email_queue')
            .update({
              status: 'failed',
              error_message: resendError.message || 'RESEND送信エラー'
            })
            .eq('id', email.id);

          failedCount++;
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

        sentCount++;

        // レート制限対策（100ms待機）
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (emailError) {
        console.error('❌ メール送信例外:', emailError);
        
        // 失敗ステータスに更新
        await supabaseAdmin
          .from('email_queue')
          .update({
            status: 'failed',
            error_message: emailError instanceof Error ? emailError.message : '不明なエラー'
          })
          .eq('id', email.id);

        failedCount++;
      }
    }

    console.log('📧 メール送信ワーカー完了:', { sent: sentCount, failed: failedCount });

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      message: `${sentCount}件送信、${failedCount}件失敗`
    });

  } catch (error) {
    console.error('❌ メール送信ワーカー例外:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}