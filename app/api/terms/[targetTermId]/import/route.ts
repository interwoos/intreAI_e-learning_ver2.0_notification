import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

interface ImportRequest {
  sourceTermId: string;
  copy: {
    lectures: boolean;
    videosMeta: boolean;
    assignments: boolean;
    prompts: boolean;
    settings: boolean;
    storageFiles: boolean;
  };
  dryRun: boolean;
}

interface ImportResponse {
  ok: boolean;
  counts: {
    lectures: { copied: number; skipped: number };
    videosMeta: { copied: number; skipped: number };
    assignments: { copied: number; skipped: number };
    prompts: { copied: number; skipped: number };
    settings: { copied: number; skipped: number };
  };
  job: { storageCopy: "queued" | "skipped" | "done" };
  executionTimeMs?: number;
  error?: string;
}

export async function POST(
  request: Request,
  { params }: { params: { targetTermId: string } }
) {
  try {
    const { targetTermId } = params;
    const body: ImportRequest = await request.json();
    const { sourceTermId, dryRun } = body;

    // 入力値検証
    if (!sourceTermId || !targetTermId) {
      return NextResponse.json({
        ok: false,
        error: 'ソース期IDとターゲット期IDが必要です'
      }, { status: 400 });
    }

    if (sourceTermId === targetTermId) {
      return NextResponse.json({
        ok: false,
        error: 'ソース期とターゲット期が同じです'
      }, { status: 400 });
    }

    // 認証ヘッダーから直接トークンを取得
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ 認証ヘッダーが見つかりません');
      return NextResponse.json({
        ok: false,
        error: '認証が必要です'
      }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      console.error('❌ 認証エラー:', authError);
      return NextResponse.json({
        ok: false,
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
        ok: false,
        error: '管理者権限が必要です'
      }, { status: 403 });
    }

    // ソース期とターゲット期の存在確認
    const { data: sourceTermExists } = await supabaseAdmin
      .from('terms')
      .select('id, name')
      .eq('id', sourceTermId)
      .single();

    const { data: targetTermExists } = await supabaseAdmin
      .from('terms')
      .select('id, name')
      .eq('id', targetTermId)
      .single();

    if (!sourceTermExists) {
      return NextResponse.json({
        ok: false,
        error: 'ソース期が見つかりません'
      }, { status: 404 });
    }

    if (!targetTermExists) {
      return NextResponse.json({
        ok: false,
        error: 'ターゲット期が見つかりません'
      }, { status: 404 });
    }

    console.log('🔄 期間コンテンツコピー開始:', {
      source: sourceTermExists.name,
      target: targetTermExists.name,
      dryRun
    });

    if (dryRun) {
      // プレビュー実行 - 各テーブルの件数をカウント
      const { data: videosCount } = await supabaseAdmin
        .from('lecture_videos')
        .select('id', { count: 'exact', head: true })
        .eq('term_id', sourceTermId);

      const { data: assignmentsCount } = await supabaseAdmin
        .from('pre_assignments')
        .select('assignment_id', { count: 'exact', head: true })
        .eq('term_id', sourceTermId);

      const { data: lecturesCount } = await supabaseAdmin
        .from('lectures')
        .select('id', { count: 'exact', head: true })
        .eq('term_id', sourceTermId);

      return NextResponse.json({
        ok: true,
        counts: {
          lectures: { copied: lecturesCount || 0, skipped: 0 },
          videosMeta: { copied: videosCount || 0, skipped: 0 },
          assignments: { copied: assignmentsCount || 0, skipped: 0 },
          prompts: { copied: 0, skipped: 0 },
          settings: { copied: 0, skipped: 0 }
        },
        job: { storageCopy: "skipped" }
      });
    }

    // 実際のコピー実行
    const startTime = Date.now();
    let lecturesCopied = 0;
    let videosCopied = 0;
    let assignmentsCopied = 0;

    try {
      // 1. 講義データのコピー
      const { data: sourceLectures, error: lecturesError } = await supabaseAdmin
        .from('lectures')
        .select('*')
        .eq('term_id', sourceTermId);

      if (lecturesError) {
        throw new Error(`講義データ取得エラー: ${lecturesError.message}`);
      }

      if (sourceLectures && sourceLectures.length > 0) {
        const lectureInserts = sourceLectures.map(lecture => ({
          term_id: targetTermId,
          lecture_number: lecture.lecture_number,
          schedule: lecture.schedule,
          mode: lecture.mode,
          assignment_deadline_date: lecture.assignment_deadline_date,
          assignment_deadline_time: lecture.assignment_deadline_time,
          time_schedule: lecture.time_schedule,
          roles: lecture.roles,
          materials_link: lecture.materials_link,
          folder: lecture.folder,
          remarks: lecture.remarks
        }));

        const { error: lectureInsertError } = await supabaseAdmin
          .from('lectures')
          .upsert(lectureInserts, { onConflict: 'term_id,lecture_number' });

        if (lectureInsertError) {
          throw new Error(`講義データコピーエラー: ${lectureInsertError.message}`);
        }

        lecturesCopied = lectureInserts.length;
        console.log('✅ 講義データコピー完了:', lecturesCopied, '件');
      }

      // 2. 動画データのコピー
      const { data: sourceVideos, error: videosError } = await supabaseAdmin
        .from('lecture_videos')
        .select('*')
        .eq('term_id', sourceTermId);

      if (videosError) {
        throw new Error(`動画データ取得エラー: ${videosError.message}`);
      }

      if (sourceVideos && sourceVideos.length > 0) {
        const videoInserts = sourceVideos.map(video => ({
          lecture_number: video.lecture_number,
          term_id: targetTermId,
          title: video.title,
          subtitle: video.subtitle,
          original_file_name: video.original_file_name,
          url: video.url,
          display_order: video.display_order
        }));

        const { error: videoInsertError } = await supabaseAdmin
          .from('lecture_videos')
          .insert(videoInserts);

        if (videoInsertError) {
          throw new Error(`動画データコピーエラー: ${videoInsertError.message}`);
        }

        videosCopied = videoInserts.length;
        console.log('✅ 動画データコピー完了:', videosCopied, '件');
      }

      // 3. 事前課題データのコピー（全カラム）
      const { data: sourceAssignments, error: assignmentsError } = await supabaseAdmin
        .from('pre_assignments')
        .select('*')
        .eq('term_id', sourceTermId);

      if (assignmentsError) {
        throw new Error(`事前課題データ取得エラー: ${assignmentsError.message}`);
      }

      if (sourceAssignments && sourceAssignments.length > 0) {
        const assignmentInserts = sourceAssignments.map(assignment => ({
          term_id: targetTermId,
          assignment_id: assignment.assignment_id,
          title: assignment.title,
          edit_title: assignment.edit_title,
          description: assignment.description,
          ai_name: assignment.ai_name,
          ai_description: assignment.ai_description,
          initial_message: assignment.initial_message,
          system_instruction: assignment.system_instruction,
          knowledge_base: assignment.knowledge_base
        }));

        const { error: assignmentInsertError } = await supabaseAdmin
          .from('pre_assignments')
          .upsert(assignmentInserts, { onConflict: 'term_id,assignment_id' });

        if (assignmentInsertError) {
          throw new Error(`事前課題データコピーエラー: ${assignmentInsertError.message}`);
        }

        assignmentsCopied = assignmentInserts.length;
        console.log('✅ 事前課題データコピー完了:', assignmentsCopied, '件');
      }

      const executionTime = Date.now() - startTime;

      console.log('✅ 期間コンテンツコピー完了:', {
        lectures: lecturesCopied,
        videos: videosCopied,
        assignments: assignmentsCopied,
        executionTimeMs: executionTime
      });

      const response: ImportResponse = {
        ok: true,
        counts: {
          lectures: { copied: lecturesCopied, skipped: 0 },
          videosMeta: { copied: videosCopied, skipped: 0 },
          assignments: { copied: assignmentsCopied, skipped: 0 },
          prompts: { copied: 0, skipped: 0 },
          settings: { copied: 0, skipped: 0 }
        },
        job: { 
          storageCopy: "skipped"
        },
        executionTimeMs: executionTime
      };

      return NextResponse.json(response);

    } catch (copyError) {
      console.error('❌ コピー処理エラー:', copyError);
      return NextResponse.json({
        ok: false,
        error: `コピー処理に失敗しました: ${copyError instanceof Error ? copyError.message : '不明なエラー'}`
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ 期間コンテンツコピー例外:', error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: { targetTermId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceTermId = searchParams.get('source');

    if (!sourceTermId) {
      return NextResponse.json({
        ok: false,
        error: 'ソース期IDが必要です'
      }, { status: 400 });
    }

    // プレビュー実行（GET版）
    const { data: videosCount } = await supabaseAdmin
      .from('lecture_videos')
      .select('id', { count: 'exact', head: true })
      .eq('term_id', sourceTermId);

    const { data: assignmentsCount } = await supabaseAdmin
      .from('pre_assignments')
      .select('assignment_id', { count: 'exact', head: true })
      .eq('term_id', sourceTermId);

    const { data: lecturesCount } = await supabaseAdmin
      .from('lectures')
      .select('id', { count: 'exact', head: true })
      .eq('term_id', sourceTermId);

    return NextResponse.json({
      ok: true,
      preview: {
        lectures: { count: lecturesCount || 0 },
        videosMeta: { count: videosCount || 0 },
        assignments: { count: assignmentsCount || 0 }
      }
    });

  } catch (error) {
    console.error('❌ プレビュー取得例外:', error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}