export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { extractDriveFolderId } from '@/lib/google-sheets';
import { google } from 'googleapis';
import { Readable } from 'stream';

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}'),
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });

export async function GET() {
  return NextResponse.json({ message: "upload-task alive" });
}

export async function POST(request: Request) {
  try {
    console.log('📤 ファイルアップロード開始');
    
    const formData = await request.formData();
    const userId = formData.get('userId') as string;
    const file = formData.get('file') as File;
    const taskId = formData.get('taskId') as string;
    const termId = formData.get('termId') as string;
    const lectureNumber = formData.get('lectureNumber') as string;

    // バリデーション
    if (!userId || !file || !taskId || !termId) {
      return NextResponse.json(
        { error: '必須パラメータが不足しています' },
        { status: 400 }
      );
    }

    // ファイルタイプチェック（video/*のみ許可、空の場合は通す）
    if (file.type && !file.type.startsWith('video/')) {
      return NextResponse.json(
        { error: '動画ファイルのみアップロード可能です' },
        { status: 400 }
      );
    }

    console.log('📋 リクエストパラメータ:', { 
      userId, 
      taskId, 
      termId, 
      lectureNumber, 
      fileType: file.type, 
      fileSize: file.size,
      fileName: file.name
    });

    // 期情報取得
    const { data: term, error: termError } = await supabaseAdmin
      .from('terms')
      .select('folder_link')
      .eq('id', termId)
      .single();

    if (termError || !term?.folder_link) {
      console.error('❌ 期情報取得エラー:', termError);
      return NextResponse.json(
        { error: '期のフォルダ情報が見つかりません' },
        { status: 404 }
      );
    }

    // フォルダID抽出
    const folderId = extractDriveFolderId(term.folder_link);
    if (!folderId) {
      return NextResponse.json(
        { error: '無効なフォルダリンクです' },
        { status: 400 }
      );
    }

    // 生徒名取得
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.full_name) {
      console.error('❌ プロフィール取得エラー:', profileError);
      return NextResponse.json(
        { error: '生徒情報が見つかりません' },
        { status: 404 }
      );
    }

    // 講義番号決定
    let finalLectureNumber: number;
    if (lectureNumber && !isNaN(parseInt(lectureNumber))) {
      finalLectureNumber = parseInt(lectureNumber);
    } else {
      // taskIdから講義番号を抽出（例: "2-3" → 2）
      const match = taskId.match(/^(\d+)/);
      finalLectureNumber = match ? parseInt(match[1]) : 1;
    }

    // ファイル名生成: {生徒名}_第{n}回講義{拡張子}
    const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '';
    const fileName = `${profile.full_name}_第${finalLectureNumber}回講義${ext}`;

    console.log('📁 アップロード情報:', { fileName, folderId, finalLectureNumber });

    // ファイルをGoogle Driveにアップロード
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileStream = Readable.from(fileBuffer);

    const { data: uploadResult } = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId]
      },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body: fileStream
      }
    });

    if (!uploadResult.id) {
      throw new Error('ファイルアップロードに失敗しました');
    }

    console.log('✅ Drive アップロード完了:', uploadResult.id);

    // 公開権限付与
    await drive.permissions.create({
      fileId: uploadResult.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    // ファイル情報取得
    const { data: fileInfo } = await drive.files.get({
      fileId: uploadResult.id,
      fields: 'id,name,webViewLink'
    });

    console.log('📋 ファイル情報取得完了:', fileInfo);

    // user_assignments更新
    const { error: updateError } = await supabaseAdmin
      .from('user_assignments')
      .update({
        drive_file_id: fileInfo.id,
        drive_webview_link: fileInfo.webViewLink,
        upload_file_name: fileName,
        last_submitted_at: new Date().toISOString(),
        completed: true
      })
      .eq('user_id', userId)
      .eq('task_id', taskId);

    if (updateError) {
      console.error('❌ DB更新エラー:', updateError);
      return NextResponse.json(
        { error: 'データベース更新に失敗しました' },
        { status: 500 }
      );
    }

    console.log('✅ DB更新完了');

    return NextResponse.json({
      success: true,
      fileId: fileInfo.id,
      fileName: fileInfo.name,
      fileUrl: fileInfo.webViewLink
    });

  } catch (error) {
    console.error('upload-task error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラー' },
      { status: 500 }
    );
  }
}