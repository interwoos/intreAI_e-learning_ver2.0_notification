// app/api/terms/create/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createSpreadsheetFromTemplate, analyzeLectureStructure } from '@/lib/google-sheets';
import util from 'util';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    // 0) リクエストボディの安全な取得
    let requestBody: any;
    try {
      requestBody = await request.json();
    } catch (parseError) {
      console.error('❌ リクエストボディのJSON解析エラー:', parseError);
      return NextResponse.json(
        { error: 'リクエストボディが正しいJSON形式ではありません' },
        { status: 400 }
      );
    }

    const { name, start_date, end_date, folder_link, template_link } = requestBody ?? {};

    // 1) 入力値検証
    if (!name || !start_date || !end_date || !folder_link || !template_link) {
      console.error('❌ 必要なパラメータが不足:', { name, start_date, end_date, folder_link, template_link });
      return NextResponse.json(
        { error: '必要なパラメータが不足しています' },
        { status: 400 }
      );
    }

    console.log('🚀 期作成処理開始:', { name, template_link, folder_link });

    // 2) SAキー存在チェック（OAuth2は不使用）
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      console.error('❌ GOOGLE_SERVICE_ACCOUNT_KEY が未設定');
      return NextResponse.json(
        { error: 'Google サービスアカウントの認証情報が未設定です（GOOGLE_SERVICE_ACCOUNT_KEY）。' },
        { status: 500 }
      );
    }
    console.log('✅ サービスアカウントキーの存在を確認');

    // 3) 次の期番号を決定
    let existingTerms, fetchError;
    try {
      const result = await supabaseAdmin
        .from('terms')
        .select('term_number')
        .order('term_number', { ascending: false })
        .limit(1);
      existingTerms = result.data;
      fetchError = result.error;
    } catch (supabaseError) {
      console.error('❌ Supabase接続エラー:', supabaseError);
      return NextResponse.json({
        error: 'データベース接続に失敗しました',
        details: supabaseError instanceof Error ? supabaseError.message : 'Unknown database error'
      }, { status: 500 });
    }

    if (fetchError) {
      console.error('❌ 既存期取得エラー:', fetchError);
      return NextResponse.json({
        error: '既存の期の情報取得に失敗しました',
        details: fetchError.message
      }, { status: 500 });
    }

    const nextTermNumber: number =
      existingTerms && existingTerms.length > 0 ? existingTerms[0].term_number + 1 : 1;

    console.log('📊 次の期番号:', nextTermNumber);

    // 4) テンプレートスプレッドシートをコピー（SAで実行）
    const spreadsheetName = `【${name}】テンプレート`;
    console.log('📋 テンプレートコピー開始:', {
      originalTemplate: template_link,
      newName: spreadsheetName,
      targetFolder: folder_link
    });

    let copiedSpreadsheetId = '';
    let copiedSpreadsheetUrl = '';

    try {
      const copyResult = await createSpreadsheetFromTemplate(
        template_link,   // 管理者が入力したテンプレートURL/ID
        spreadsheetName, // コピー後のファイル名
        folder_link      // コピー先フォルダURL/ID
      );

      copiedSpreadsheetId = copyResult.spreadsheetId;
      copiedSpreadsheetUrl = copyResult.spreadsheetUrl;

      console.log('✅ テンプレートコピー完了:', {
        copiedSpreadsheetId,
        copiedSpreadsheetUrl
      });
    } catch (copyError: any) {
      console.error('❌ テンプレートコピーエラー:', copyError);

      const msg = typeof copyError?.message === 'string' ? copyError.message : '';
      const reason = copyError?.errors?.[0]?.reason ?? copyError?.code ?? '';

      // 代表的な失敗パターンでHTTPステータスを分岐
      if (reason === 'quotaExceeded' || msg.includes('quota')) {
        return NextResponse.json({
          error: 'テンプレートのコピーに失敗しました（Driveストレージの上限に達しています）。',
          details: msg
        }, { status: 507 }); // 507 Insufficient Storage（準拠）
      }
      if (reason === 'notFound' || msg.toLowerCase().includes('not found')) {
        return NextResponse.json({
          error: 'テンプレートまたはフォルダが見つかりません。',
          details: msg
        }, { status: 404 });
      }
      if (reason === 'forbidden' || msg.toLowerCase().includes('permission')) {
        return NextResponse.json({
          error: 'テンプレート/フォルダへのアクセス権限がありません（SAを編集者以上で共有してください）。',
          details: msg
        }, { status: 403 });
      }

      return NextResponse.json({
        error: `テンプレートのコピーに失敗しました: ${msg || '不明なエラー'}`,
        details: copyError?.stack
      }, { status: 500 });
    }

    // 5) 講義構造を解析（コピー後のスプレッドシートから）
    let lectureConfig: any = null;
    try {
      console.log('📊 講義構造解析開始:', copiedSpreadsheetUrl);
      lectureConfig = await analyzeLectureStructure(copiedSpreadsheetUrl);
      console.log('✅ 講義構造解析完了:', lectureConfig);
    } catch (analysisError: any) {
      console.error('❌ 講義構造解析エラー:', analysisError);
      return NextResponse.json({
        error: `講義構造の解析に失敗しました: ${analysisError instanceof Error ? analysisError.message : '不明なエラー'}`,
        details: analysisError instanceof Error ? analysisError.stack : undefined
      }, { status: 500 });
    }

    // 6) Supabaseに期を保存
    console.log('💾 Supabaseに期を挿入中...');
    const { data: newTerm, error: insertError } = await supabaseAdmin
      .from('terms')
      .insert({
        name,
        term_number: nextTermNumber,
        start_date,
        end_date,
        folder_link,
        // このプロジェクトでは「template_link」列にコピー後URLを保存する運用
        template_link: copiedSpreadsheetUrl,
        lecture_config: lectureConfig
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ 期挿入エラー:', insertError);
      return NextResponse.json({
        error: '期レコードの作成に失敗しました',
        details: insertError.message
      }, { status: 500 });
    }

    console.log('✅ 期の挿入成功:', newTerm);

    // 7) 講義レコードを作成（totalLectures が未定義でも落ちない）
    const totalLectures = Math.max(0, Number(lectureConfig?.totalLectures ?? 0));
    if (newTerm?.id && totalLectures > 0) {
      console.log('📚 講義レコードを作成中...（件数:', totalLectures, '）');

      const lectureRecords = Array.from({ length: totalLectures }, (_, i) => ({
        term_id: newTerm.id,
        lecture_number: i + 1,
        mode: 'オンライン',
        assignment_deadline_time: '17:00'
      }));

      const { error: lectureError } = await supabaseAdmin
        .from('lectures')
        .insert(lectureRecords);

      if (lectureError) {
        console.error('❌ 講義レコード作成エラー:', lectureError);
        // 期は作成済みなので継続（警告のみ）
      } else {
        console.log('✅ 講義レコード作成完了:', lectureRecords.length, '件');
      }
    } else {
      console.warn('⚠️ lectureConfig.totalLectures が 0 または未定義のため、講義レコード作成をスキップしました。');
    }

    // 8) 事前課題レコードを初期化（必須処理）
    console.log('📋 事前課題レコード初期化中...');
    try {
      const { data: initResult, error: initError } = await supabaseAdmin.rpc(
        'initialize_pre_assignments_for_term',
        { target_term_id: newTerm.id }
      );

      if (initError) {
        console.error('❌ 事前課題初期化RPC呼び出しエラー:', initError);
        return NextResponse.json({
          error: '事前課題の初期化に失敗しました',
          details: initError.message
        }, { status: 500 });
      }

      console.log('✅ 事前課題レコード初期化完了:', initResult);

      // 作成結果の確認（任意）
      const { data: createdAssignments, error: checkError } = await supabaseAdmin
        .from('pre_assignments')
        .select('assignment_id')
        .eq('term_id', newTerm.id);

      if (checkError) {
        console.error('❌ 事前課題確認エラー:', checkError);
      } else {
        console.log('✅ 作成された事前課題数:', createdAssignments?.length || 0);
        console.log('✅ 作成された課題ID一覧:', createdAssignments?.map(a => a.assignment_id) || []);
      }
    } catch (assignmentError: any) {
      console.error('❌ 事前課題初期化エラー:', assignmentError);
      return NextResponse.json({
        error: `事前課題の初期化に失敗しました: ${assignmentError?.message ?? '不明なエラー'}`,
        details: assignmentError?.stack
      }, { status: 500 });
    }

    console.log('🎉 期作成完了!');

    return NextResponse.json({
      success: true,
      term: newTerm,
      copiedTemplateUrl: copiedSpreadsheetUrl,
      lectureConfig,
      message: `期「${name}」を作成し、テンプレートをコピーしました`
    });
  } catch (error: any) {
    console.error('🔥 期作成エラー:', util.inspect(error, { showHidden: true, depth: 5 }));
    return NextResponse.json({
      error: error instanceof Error ? error.message : '期の作成に失敗しました',
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
