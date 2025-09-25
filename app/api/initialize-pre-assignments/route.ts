import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const { termId } = await request.json();

    if (!termId) {
      return NextResponse.json(
        { error: 'termIdが必要です' },
        { status: 400 }
      );
    }

    console.log('📋 事前課題初期化開始:', termId);
    
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('initialize_pre_assignments_for_term', {
      target_term_id: termId
    });

    if (rpcError) {
      console.error('❌ 事前課題初期化RPC呼び出しエラー:', rpcError);
      console.error('❌ エラー詳細:', {
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
        code: rpcError.code
      });
      throw rpcError;
    }

    console.log('✅ 事前課題初期化RPC呼び出し成功:', rpcResult);

    // 初期化結果を確認
    const { data: createdAssignments, error: checkError } = await supabaseAdmin
      .from('pre_assignments')
      .select('assignment_id, title')
      .eq('term_id', termId)
      .order('assignment_id');

    if (checkError) {
      console.error('❌ 事前課題確認エラー:', checkError);
      throw checkError;
    }

    console.log('✅ 初期化確認完了:', {
      termId,
      createdCount: createdAssignments?.length || 0,
      assignmentIds: createdAssignments?.map(a => a.assignment_id) || []
    });

    return NextResponse.json({ 
      success: true,
      createdCount: createdAssignments?.length || 0,
      assignmentIds: createdAssignments?.map(a => a.assignment_id) || []
    });
  } catch (error) {
    console.error('❌ 事前課題初期化例外:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}