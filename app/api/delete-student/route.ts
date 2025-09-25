import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');

    if (!studentId) {
      return NextResponse.json({
        success: false,
        error: '生徒IDが指定されていません'
      }, { status: 400 });
    }

    console.log('🗑️ 生徒削除API呼び出し:', { studentId });

    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        error: '認証が必要です'
      }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: '認証が無効です'
      }, { status: 401 });
    }

    // 管理者権限チェック
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json({
        success: false,
        error: '管理者権限が必要です'
      }, { status: 403 });
    }

    // 削除対象の生徒情報を取得
    const { data: student, error: studentError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      return NextResponse.json({
        success: false,
        error: '生徒が見つかりません'
      }, { status: 404 });
    }

    // 管理者の削除を防ぐ
    if (student.role === 'admin') {
      return NextResponse.json({
        success: false,
        error: '管理者アカウントは削除できません'
      }, { status: 403 });
    }

    console.log('🗑️ 生徒削除開始:', { 
      studentId, 
      name: student.full_name, 
      email: student.email 
    });

    // 1. データベースから関連データを削除（SQL関数）
    const { error: deleteError } = await supabaseAdmin.rpc('delete_student_completely', {
      target_student_id: studentId
    });

    if (deleteError) {
      console.error('❌ 生徒削除エラー:', deleteError);
      return NextResponse.json({
        success: false,
        error: `生徒の削除に失敗しました: ${deleteError.message}`
      }, { status: 500 });
    }

    // 2. Supabase認証ユーザーを削除（Admin API使用）
    try {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(studentId);
      
      if (authDeleteError) {
        console.error('❌ 認証ユーザー削除エラー:', authDeleteError);
        // 認証ユーザー削除に失敗してもDBからは削除済みなので警告のみ
        console.warn('⚠️ 認証ユーザーの削除に失敗しましたが、DBからは削除されました');
      } else {
        console.log('✅ 認証ユーザー削除完了:', studentId);
      }
    } catch (authError) {
      console.error('❌ 認証ユーザー削除例外:', authError);
      console.warn('⚠️ 認証ユーザーの削除に失敗しましたが、DBからは削除されました');
    }
    console.log('✅ 生徒削除完了:', { 
      studentId, 
      name: student.full_name 
    });

    return NextResponse.json({
      success: true,
      message: `${student.full_name}さんを削除しました`,
      deletedStudent: {
        id: student.id,
        name: student.full_name,
        email: student.email
      }
    });

  } catch (error) {
    console.error('❌ 生徒削除例外:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}