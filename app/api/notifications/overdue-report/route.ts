import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    console.log('📋 未提出一覧送信開始');

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

    // SQL関数を呼び出し
    const { data: sentCount, error } = await supabaseAdmin
      .rpc('send_overdue_report');

    if (error) {
      console.error('❌ 未提出一覧送信エラー:', error);
      return NextResponse.json({ 
        error: `未提出一覧送信に失敗しました: ${error.message}` 
      }, { status: 500 });
    }

    console.log('✅ 未提出一覧送信完了:', sentCount, '件');

    return NextResponse.json({
      success: true,
      sent: sentCount,
      message: `${sentCount}件の未提出一覧を送信しました`
    });

  } catch (error) {
    console.error('❌ 未提出一覧送信例外:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}