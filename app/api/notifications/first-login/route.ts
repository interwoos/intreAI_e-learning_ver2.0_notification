import { NextResponse } from 'next/server';
import { notifyFirstLogin } from '@/lib/notifications/enhanced-triggers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'ユーザーIDが必要です' },
        { status: 400 }
      );
    }

    console.log('🔑 初回ログイン通知API呼び出し:', userId);

    // 認証チェック（システムまたは管理者）
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      
      if (authError || !user) {
        return NextResponse.json({ error: '認証が無効です' }, { status: 401 });
      }
    }

    // 初回ログイン記録と通知
    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ first_login_at: new Date().toISOString() })
      .eq('id', userId)
      .is('first_login_at', null) // 初回のみ更新
      .select('full_name, company, term_id, first_login_at')
      .single();

    if (updateError) {
      console.error('❌ 初回ログイン記録エラー:', updateError);
      return NextResponse.json({
        success: false,
        error: '初回ログイン記録に失敗しました'
      }, { status: 500 });
    }

    // 初回ログインでない場合はスキップ
    if (!updatedProfile) {
      console.log('⚠️ 初回ログインではないためスキップ:', userId);
      return NextResponse.json({
        success: true,
        sent: 0,
        skipped: 1,
        message: '初回ログインではないためスキップしました'
      });
    }

    // 期情報取得
    const { data: term } = await supabaseAdmin
      .from('terms')
      .select('name')
      .eq('id', updatedProfile.term_id)
      .single();

    // 通知送信
    const result = await notifyFirstLogin({
      id: userId,
      full_name: updatedProfile.full_name || '受講生',
      company: updatedProfile.company || '会社名未設定',
      term_id: updatedProfile.term_id || '',
      first_login_at: updatedProfile.first_login_at
    });

    if (result.success) {
      console.log('✅ 初回ログイン通知送信完了:', result);
      return NextResponse.json({
        success: true,
        sent: result.sent,
        skipped: result.skipped,
        message: `${result.sent}件送信、${result.skipped}件スキップ`
      });
    } else {
      return NextResponse.json({
        success: false,
        error: '初回ログイン通知の送信に失敗しました'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ 初回ログイン通知API例外:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}