import { NextResponse } from 'next/server';
import { notifyTaskSubmitted } from '@/lib/notifications/enhanced-triggers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const { userId, taskId, completedAt, sheetLink } = await request.json();

    if (!userId || !taskId || !completedAt) {
      return NextResponse.json(
        { error: '必要なパラメータが不足しています' },
        { status: 400 }
      );
    }

    console.log('📝 課題提出通知API呼び出し:', { userId, taskId });

    // 認証チェック（システムまたは管理者）
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      
      if (authError || !user) {
        return NextResponse.json({ error: '認証が無効です' }, { status: 401 });
      }
    }

    // 通知送信
    const result = await notifyTaskSubmitted({
      user_id: userId,
      task_id: taskId,
      completed_at: completedAt,
      sheet_link: sheetLink || '#'
    });

    if (result.success) {
      console.log('✅ 課題提出通知送信完了:', result);
      return NextResponse.json({
        success: true,
        sent: result.sent,
        skipped: result.skipped,
        message: `${result.sent}件送信、${result.skipped}件スキップ`
      });
    } else {
      return NextResponse.json({
        success: false,
        error: '課題提出通知の送信に失敗しました'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ 課題提出通知API例外:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}