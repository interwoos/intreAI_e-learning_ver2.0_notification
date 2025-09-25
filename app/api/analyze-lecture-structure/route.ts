import { NextResponse } from 'next/server';
import { analyzeLectureStructure } from '@/lib/google-sheets';

export async function POST(request: Request) {
  try {
    const { templateUrl } = await request.json();

    if (!templateUrl) {
      return NextResponse.json(
        { error: 'テンプレートURLが必要です' },
        { status: 400 }
      );
    }

    // サーバー側で講義構造を解析
    const lectureConfig = await analyzeLectureStructure(templateUrl);

    return NextResponse.json({ lectureConfig });
  } catch (error: any) {
    console.error('講義構造解析エラー:', error);
    return NextResponse.json(
      { error: error.message || '講義構造の解析に失敗しました' },
      { status: 500 }
    );
  }
}