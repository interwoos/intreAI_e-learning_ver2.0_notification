import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

interface StorageCopyJob {
  sourceTermId: string;
  targetTermId: string;
  logId: string;
}

export async function POST(request: Request) {
  try {
    const { sourceTermId, targetTermId, logId }: StorageCopyJob = await request.json();

    if (!sourceTermId || !targetTermId || !logId) {
      return NextResponse.json({
        success: false,
        error: '必要なパラメータが不足しています'
      }, { status: 400 });
    }

    console.log('🗂️ ストレージコピージョブ開始:', { sourceTermId, targetTermId, logId });

    // ログステータスを「実行中」に更新
    await supabaseAdmin
      .from('term_import_logs')
      .update({ storage_copy_status: 'running' })
      .eq('id', logId);

    try {
      // ソース期の動画ファイル一覧を取得
      const { data: sourceVideos, error: sourceError } = await supabaseAdmin
        .from('lecture_videos')
        .select('id, url, original_file_name')
        .eq('term_id', sourceTermId)
        .not('url', 'like', '%youtube.com%')
        .not('url', 'like', '%youtu.be%');

      if (sourceError) {
        throw new Error(`ソース動画取得エラー: ${sourceError.message}`);
      }

      if (!sourceVideos || sourceVideos.length === 0) {
        console.log('📹 コピー対象のアップロード動画がありません');
        
        await supabaseAdmin
          .from('term_import_logs')
          .update({ 
            storage_copy_status: 'done',
            results: { storageFiles: { copied: 0, skipped: 0 } }
          })
          .eq('id', logId);

        return NextResponse.json({
          success: true,
          message: 'コピー対象のファイルがありませんでした',
          copiedCount: 0
        });
      }

      let copiedCount = 0;
      let errorCount = 0;

      // 各動画ファイルをコピー
      for (const video of sourceVideos) {
        try {
          if (!video.url) continue;

          // URLからファイルパスを抽出
          const urlParts = video.url.split('/storage/v1/object/public/videos/');
          if (urlParts.length !== 2) continue;

          const sourceFilePath = urlParts[1];
          const targetFilePath = sourceFilePath.replace(
            new RegExp(`^lecture-\\d+/`), 
            `lecture-${targetTermId}/`
          );

          console.log('📁 ファイルコピー:', { sourceFilePath, targetFilePath });

          // ファイルをダウンロード
          const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from('videos')
            .download(sourceFilePath);

          if (downloadError) {
            console.error('❌ ファイルダウンロードエラー:', downloadError);
            errorCount++;
            continue;
          }

          // ファイルをアップロード
          const { error: uploadError } = await supabaseAdmin.storage
            .from('videos')
            .upload(targetFilePath, fileData, {
              cacheControl: '3600',
              upsert: true
            });

          if (uploadError) {
            console.error('❌ ファイルアップロードエラー:', uploadError);
            errorCount++;
            continue;
          }

          // 新しい公開URLを取得
          const { data: newUrlData } = supabaseAdmin.storage
            .from('videos')
            .getPublicUrl(targetFilePath);

          // ターゲット期の動画レコードのURLを更新
          await supabaseAdmin
            .from('lecture_videos')
            .update({ url: newUrlData.publicUrl })
            .eq('term_id', targetTermId)
            .eq('original_file_name', video.original_file_name);

          copiedCount++;
          console.log('✅ ファイルコピー完了:', targetFilePath);

        } catch (fileError) {
          console.error('❌ 個別ファイルコピーエラー:', fileError);
          errorCount++;
        }
      }

      // 最終ステータス更新
      const finalStatus = errorCount === 0 ? 'done' : 'error';
      await supabaseAdmin
        .from('term_import_logs')
        .update({ 
          storage_copy_status: finalStatus,
          results: { 
            storageFiles: { 
              copied: copiedCount, 
              skipped: errorCount 
            } 
          },
          error_details: errorCount > 0 ? `${errorCount}件のファイルコピーに失敗` : null
        })
        .eq('id', logId);

      console.log('🎉 ストレージコピージョブ完了:', { copiedCount, errorCount });

      return NextResponse.json({
        success: true,
        copiedCount,
        errorCount,
        message: `${copiedCount}件のファイルをコピーしました`
      });

    } catch (jobError) {
      console.error('❌ ストレージコピージョブエラー:', jobError);
      
      // エラーステータス更新
      await supabaseAdmin
        .from('term_import_logs')
        .update({ 
          storage_copy_status: 'error',
          error_details: jobError instanceof Error ? jobError.message : '不明なエラー'
        })
        .eq('id', logId);

      throw jobError;
    }

  } catch (error) {
    console.error('❌ ストレージコピージョブ例外:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}