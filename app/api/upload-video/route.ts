import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface VideoUploadResult {
  success: boolean;
  url?: string;
  videoId?: number;
  error?: string;
  progress?: number;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const lectureNumber = parseInt(formData.get('lectureNumber') as string);
    const termId = formData.get('termId') as string;
    const title = formData.get('title') as string;
    const subtitle = formData.get('subtitle') as string || '';

    if (!file || !lectureNumber || !termId || !title) {
      return NextResponse.json({
        success: false,
        error: '必要なパラメータが不足しています'
      }, { status: 400 });
    }

    // ファイルサイズ制限をチェック
    const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        success: false,
        error: `ファイルサイズは${MAX_FILE_SIZE / 1024 / 1024}MB以下にしてください`
      }, { status: 400 });
    }

    console.log('📤 動画アップロード開始（自動ID）:', title);

    // 1. 同一期・同一講義の既存動画数を取得して次の表示順序を決定
    const { data: existingVideos, error: countError } = await supabaseAdmin
      .from('lecture_videos')
      .select('display_order')
      .eq('term_id', termId)
      .eq('lecture_number', lectureNumber)
      .order('display_order', { ascending: false })
      .limit(1);

    if (countError) {
      console.error('❌ 既存動画数取得エラー:', countError);
      return NextResponse.json({
        success: false,
        error: `既存動画数の取得に失敗しました: ${countError.message}`
      }, { status: 500 });
    }

    // 次の表示順序を計算（既存の最大値 + 1、または1）
    const nextDisplayOrder = existingVideos && existingVideos.length > 0 
      ? (existingVideos[0].display_order || 0) + 1 
      : 1;

    console.log('📊 次の表示順序:', nextDisplayOrder);
    // 2. データベースに動画メタ情報を挿入してIDを取得
    const { data: videoRecord, error: dbError } = await supabaseAdmin
      .from('lecture_videos')
      .insert({
        lecture_number: lectureNumber,
        term_id: termId,
        title: title,
        subtitle: subtitle,
        original_file_name: file.name,
        display_order: nextDisplayOrder
      })
      .select('id')
      .single();

    if (dbError || !videoRecord) {
      console.error('❌ データベース挿入エラー:', dbError);
      return NextResponse.json({
        success: false,
        error: `データベース登録に失敗しました: ${dbError?.message}`
      }, { status: 500 });
    }

    const videoId = videoRecord.id;
    console.log('✅ 動画ID取得:', videoId);

    // 2. ファイル拡張子を取得
    const fileExtension = file.name.split('.').pop() || 'mp4';
    
    // 3. 安全なファイル名を生成
    const safeFileName = `lecture-${lectureNumber}/${videoId}.${fileExtension}`;

    console.log('📁 生成されたファイルパス:', safeFileName);

    // 4. Supabaseストレージにアップロード
    const arrayBuffer = await file.arrayBuffer();
    const { data, error } = await supabaseAdmin.storage
      .from('videos')
      .upload(safeFileName, arrayBuffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type
      });

    if (error) {
      console.error('❌ ストレージアップロードエラー:', error);
      
      // アップロード失敗時はDBレコードを削除
      await supabaseAdmin
        .from('lecture_videos')
        .delete()
        .eq('id', videoId);

      return NextResponse.json({
        success: false,
        error: `アップロードに失敗しました: ${error.message}`
      }, { status: 500 });
    }

    // 5. 公開URLを取得
    const { data: urlData } = supabaseAdmin.storage
      .from('videos')
      .getPublicUrl(data.path);

    console.log('🔗 公開URL取得:', urlData.publicUrl);

    // 6. データベースのURLカラムを更新
    const { error: updateError } = await supabaseAdmin
      .from('lecture_videos')
      .update({ url: urlData.publicUrl })
      .eq('id', videoId);

    if (updateError) {
      console.error('❌ URL更新エラー:', updateError);
      return NextResponse.json({
        success: false,
        error: `URL更新に失敗しました: ${updateError.message}`
      }, { status: 500 });
    }

    console.log('✅ 動画アップロード完了:', urlData.publicUrl);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      videoId: videoId
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });

  } catch (error) {
    console.error('❌ 動画アップロード例外:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }
}