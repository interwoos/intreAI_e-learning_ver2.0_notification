import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');
    const url = searchParams.get('url');

    console.log('🗑️ 削除API呼び出し受信:', { videoId, url });

    if (!videoId || !url) {
      console.error('❌ 必須パラメータ不足:', { videoId, url });
      return NextResponse.json({
        success: false,
        error: '動画IDまたはURLが指定されていません'
      }, { status: 400 });
    }

    const numericVideoId = parseInt(videoId);
    if (isNaN(numericVideoId)) {
      console.error('❌ 無効な動画ID:', videoId);
      return NextResponse.json({
        success: false,
        error: '無効な動画IDです'
      }, { status: 400 });
    }

    console.log('🗑️ 動画削除開始:', { videoId: numericVideoId, url });

    let deletedFromStorage = false;
    let filePath = '';

    // 1. YouTube動画かアップロード動画かを判定
    const isYouTubeVideo = url.includes('youtube.com') || url.includes('youtu.be');
    
    if (!isYouTubeVideo) {
      // アップロード動画の場合のみストレージから削除
      const urlParts = url.split('/storage/v1/object/public/videos/');
      if (urlParts.length === 2) {
        filePath = urlParts[1];
        console.log('📁 削除対象ファイルパス:', filePath);

        try {
          const { error: storageError } = await supabaseAdmin.storage
            .from('videos')
            .remove([filePath]);

          if (storageError) {
            console.error('❌ ストレージ削除エラー:', storageError);
            // ストレージ削除に失敗してもDB削除は続行
            deletedFromStorage = false;
          } else {
            console.log('✅ ストレージ削除成功:', filePath);
            deletedFromStorage = true;
          }
        } catch (storageException) {
          console.error('❌ ストレージ削除例外:', storageException);
          deletedFromStorage = false;
        }
      } else {
        console.warn('⚠️ ファイルパス抽出失敗:', url);
        deletedFromStorage = false;
      }
    } else {
      // YouTube動画の場合はストレージ削除不要
      console.log('📺 YouTube動画のためストレージ削除をスキップ');
      deletedFromStorage = true;
    }

    // 2. データベースから削除
    console.log('💾 データベース削除開始:', numericVideoId);
    const { error: dbError } = await supabaseAdmin
      .from('lecture_videos')
      .delete()
      .eq('id', numericVideoId);

    if (dbError) {
      console.error('❌ データベース削除エラー:', dbError);
      return NextResponse.json({
        success: false,
        error: `データベース削除に失敗しました: ${dbError.message}`,
        deletedFromStorage,
        deletedFromDB: false,
        filePath
      }, { status: 500 });
    }

    console.log('✅ データベース削除成功:', numericVideoId);
    console.log('🎉 動画削除完了:', { videoId: numericVideoId, deletedFromStorage, deletedFromDB: true });

    return NextResponse.json({
      success: true,
      deletedFromStorage,
      deletedFromDB: true,
      filePath,
      videoId: numericVideoId
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });

  } catch (error) {
    console.error('❌ 動画削除例外:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー',
      deletedFromStorage: false,
      deletedFromDB: false
    }, { status: 500 });
  }
}