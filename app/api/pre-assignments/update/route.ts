import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const { termId, assignmentId, data } = await request.json();

    if (!termId || !assignmentId || !data) {
      return NextResponse.json(
        { error: '必要なパラメータが不足しています' },
        { status: 400 }
      );
    }

    console.log('📝 事前課題一括更新開始:', { termId, assignmentId });

    const { error } = await supabaseAdmin
      .from('pre_assignments')
      .upsert({
        term_id: termId,
        assignment_id: assignmentId,
        ...data,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'term_id,assignment_id'
      });

    if (error) {
      console.error('❌ 事前課題一括更新エラー:', error);
      throw error;
    }

    console.log(`✅ 事前課題一括更新完了: ${assignmentId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ 事前課題一括更新例外:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}