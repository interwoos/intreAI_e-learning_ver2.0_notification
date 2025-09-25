import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// メールテンプレート管理API
export async function GET(request: Request) {
  try {
    // 認証チェック
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

    // テンプレート一覧取得
    const { data: templates, error } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .order('template_key');

    if (error) {
      return NextResponse.json({ 
        error: `テンプレート取得に失敗しました: ${error.message}` 
      }, { status: 500 });
    }

    return NextResponse.json({ templates });

  } catch (error) {
    console.error('❌ テンプレート取得例外:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { template_key, subject_template, body_template } = await request.json();

    if (!template_key || !subject_template || !body_template) {
      return NextResponse.json({ 
        error: '必要なパラメータが不足しています' 
      }, { status: 400 });
    }

    // 認証チェック
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

    // テンプレート更新
    const { error } = await supabaseAdmin
      .from('email_templates')
      .update({
        subject_template,
        body_template,
        updated_at: new Date().toISOString()
      })
      .eq('template_key', template_key);

    if (error) {
      return NextResponse.json({ 
        error: `テンプレート更新に失敗しました: ${error.message}` 
      }, { status: 500 });
    }

    console.log('✅ テンプレート更新完了:', template_key);

    return NextResponse.json({
      success: true,
      message: 'テンプレートを更新しました'
    });

  } catch (error) {
    console.error('❌ テンプレート更新例外:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}