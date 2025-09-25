import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const { termId, allowLogin } = await request.json();

    if (!termId || typeof allowLogin !== 'boolean') {
      return NextResponse.json(
        { error: '期IDとログイン許可フラグが必要です' },
        { status: 400 }
      );
    }

    console.log('🔐 期のログイン許可設定開始:', { termId, allowLogin });

    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: '認証が無効です' },
        { status: 401 }
      );
    }

    // 管理者権限チェック
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 403 }
      );
    }

    // 該当期の全受講生のlogin_permissionを一括更新
    const { data: updatedProfiles, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ login_permission: allowLogin })
      .eq('term_id', termId)
      .eq('role', 'student')
      .select('id, full_name, email');

    if (updateError) {
      console.error('❌ ログイン許可設定エラー:', updateError);
      return NextResponse.json(
        { error: `ログイン許可設定に失敗しました: ${updateError.message}` },
        { status: 500 }
      );
    }

    const updatedCount = updatedProfiles?.length || 0;
    
    console.log('✅ ログイン許可設定完了:', {
      termId,
      allowLogin,
      updatedCount,
      updatedUsers: updatedProfiles?.map(p => p.full_name)
    });

    return NextResponse.json({
      success: true,
      updatedCount,
      allowLogin,
      message: `${updatedCount}名の受講生のログイン許可を${allowLogin ? '有効' : '無効'}にしました`
    });

  } catch (error) {
    console.error('❌ ログイン許可設定例外:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}