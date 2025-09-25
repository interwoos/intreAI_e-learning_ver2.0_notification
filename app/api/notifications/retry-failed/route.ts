// 失敗メール再送API
import { NextResponse } from 'next/server';
import { retryFailedEmails } from '@/lib/notifications/idempotency';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const { ids, templateKey, olderThanHours = 1 } = await request.json();

    console.log('🔄 失敗メール再送開始:', { ids, templateKey, olderThanHours });

    // 認証チェック（管理者のみ）
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

    // 再送処理実行
    const result = await retryFailedEmails(ids, templateKey);

    if (result.success) {
      console.log('✅ 失敗メール再送準備完了:', result.retryCount, '件');
      return NextResponse.json({
        success: true,
        retryCount: result.retryCount,
        message: `${result.retryCount}件のメールを再送キューに追加しました`
      });
    } else {
      return NextResponse.json({
        success: false,
        error: '再送準備に失敗しました'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ 失敗メール再送例外:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}

// GET版：再送可能な失敗メール一覧を取得
export async function GET(request: Request) {
  try {
    // 認証チェック（管理者のみ）
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

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

    // 失敗メール一覧を取得
    const { data: failedEmails, error } = await supabaseAdmin
      .from('email_queue')
      .select('id, to_email, subject, template_key, error_message, failed_at, created_at')
      .eq('status', 'failed')
      .order('failed_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({
        error: `失敗メール取得に失敗しました: ${error.message}`
      }, { status: 500 });
    }

    // エラー原因別の集計
    const errorGroups = new Map<string, { count: number; emails: any[] }>();
    
    failedEmails?.forEach(email => {
      const errorKey = email.error_message?.substring(0, 100) || 'Unknown error';
      if (!errorGroups.has(errorKey)) {
        errorGroups.set(errorKey, { count: 0, emails: [] });
      }
      const group = errorGroups.get(errorKey)!;
      group.count++;
      group.emails.push(email);
    });

    const topErrors = Array.from(errorGroups.entries())
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 5)
      .map(([error, data]) => ({
        error,
        count: data.count,
        latestFailedAt: data.emails[0]?.failed_at,
        sampleEmails: data.emails.slice(0, 3).map(e => ({
          id: e.id,
          to: e.to_email,
          subject: e.subject
        }))
      }));

    return NextResponse.json({
      success: true,
      totalFailed: failedEmails?.length || 0,
      topErrors,
      recentFailed: failedEmails?.slice(0, 10).map(email => ({
        id: email.id,
        to: email.to_email,
        subject: email.subject,
        template: email.template_key,
        error: email.error_message,
        failedAt: email.failed_at
      })) || []
    });

  } catch (error) {
    console.error('❌ 失敗メール一覧取得例外:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}