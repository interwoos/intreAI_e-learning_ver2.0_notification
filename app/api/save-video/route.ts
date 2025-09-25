import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const { lectureNumber, termId, title, subtitle, type, url } = await request.json();

    if (!lectureNumber || !termId || !title || !type || !url) {
      return NextResponse.json({
        success: false,
        error: '必要なパラメータが不足しています'
      }, { status: 400 });
    }

    console.log('📤 YouTube動画保存開始:', title);

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
        subtitle: subtitle || '',
        original_file_name: `${title}.youtube`,
        url: url,
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

    console.log('✅ YouTube動画保存完了:', { videoId: videoRecord.id, url });

    return NextResponse.json({
      success: true,
      videoId: videoRecord.id,
      url: url
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });

  } catch (error) {
    console.error('❌ YouTube動画保存例外:', error);
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