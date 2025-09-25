import { NextResponse } from 'next/server';
import { notifyAnnouncement } from '@/lib/notifications/enhanced-triggers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const { announcementId } = await request.json();

    if (!announcementId) {
      return NextResponse.json(
        { error: 'アナウンスIDが必要です' },
        { status: 400 }
      );
    }

    console.log('📢 アナウンス通知API呼び出し:', announcementId);

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

    // アナウンス情報を取得
    const { data: announcement, error: announcementError } = await supabaseAdmin
      .from('announcements')
      .select('*')
      .eq('id', announcementId)
      .single();

    if (announcementError || !announcement) {
      return NextResponse.json({ 
        error: 'アナウンスが見つかりません' 
      }, { status: 404 });
    }

    // 通知送信
    const result = await notifyAnnouncement(announcement);

    if (result.success) {
      console.log('✅ アナウンス通知送信完了:', result);
      return NextResponse.json({
        success: true,
        sent: result.sent,
        skipped: result.skipped,
        message: `${result.sent}件送信、${result.skipped}件スキップ`
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'アナウンス通知の送信に失敗しました'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ アナウンス通知API例外:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}