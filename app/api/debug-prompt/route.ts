import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const { taskId, userId } = await request.json();

    if (!taskId || !userId) {
      return NextResponse.json(
        { error: 'taskIdとuserIdが必要です' },
        { status: 400 }
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('term_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.term_id) {
      return NextResponse.json({
        taskId,
        source: 'default_error',
        systemPrompt: '丁寧かつ適切に回答してください。',
        details: { error: 'プロフィール情報の取得に失敗しました' }
      });
    }

    const { data: preAssignment, error: preAssignmentError } = await supabaseAdmin
      .from('pre_assignments')
      .select('ai_name, ai_description, initial_message, system_instruction, knowledge_base')
      .eq('term_id', profile.term_id)
      .eq('assignment_id', taskId)
      .single();

    if (preAssignmentError) {
      return NextResponse.json({
        taskId,
        source: 'default_error',
        systemPrompt: '丁寧かつ適切に回答してください。',
        details: { 
          error: `pre_assignments取得エラー: ${preAssignmentError.message}`,
          termId: profile.term_id
        }
      });
    }

    if (!preAssignment) {
      return NextResponse.json({
        taskId,
        source: 'default_error',
        systemPrompt: '丁寧かつ適切に回答してください。',
        details: { 
          error: 'pre_assignmentレコードが見つかりません',
          termId: profile.term_id
        }
      });
    }

    // プロンプト決定ロジック
    let systemPrompt = '丁寧かつ適切に回答してください。';
    let source = 'default';

    if (preAssignment.system_instruction?.trim()) {
      systemPrompt = preAssignment.system_instruction;
      source = 'pre_assignments';
    } else {
      source = 'default_empty';
    }

    return NextResponse.json({
      taskId,
      source,
      systemPrompt,
      details: {
        termId: profile.term_id,
        ai_name: preAssignment.ai_name || '',
        ai_description: preAssignment.ai_description || '',
        initial_message: preAssignment.initial_message || '',
        system_instruction_length: (preAssignment.system_instruction || '').length,
        knowledge_base_length: (preAssignment.knowledge_base || '').length,
        has_system_instruction: !!preAssignment.system_instruction?.trim(),
        record_exists: true
      }
    });

  } catch (error) {
    console.error('プロンプトデバッグエラー:', error);
    return NextResponse.json({
      taskId: taskId || 'unknown',
      source: 'default_error',
      systemPrompt: '丁寧かつ適切に回答してください。',
      details: { 
        error: error instanceof Error ? error.message : '不明なエラー'
      }
    }, { status: 500 });
  }
}