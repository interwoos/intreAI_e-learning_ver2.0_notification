// app/api/upload_users/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createSpreadsheetFromTemplate, getSheetIds } from '@/lib/google-sheets';
import util from 'util';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file   = formData.get('file')  as File;
    const termId = String(formData.get('termId') || '');
    if (!file || !termId) {
      return NextResponse.json({ error: 'ファイルと期の指定が必要です' }, { status: 400 });
    }

    const { data: term, error: termError } = await supabaseAdmin
      .from('terms')
      .select('*')
      .eq('id', termId)
      .single();
    if (termError || !term) {
      console.error('Error fetching term:', util.inspect(termError, { depth: 5 }));
      return NextResponse.json({ error: '期の情報が取得できませんでした' }, { status: 500 });
    }

    // CSVパース（CRLF対策つき）
    const text = (await file.text()).replace(/\r/g, '');
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSVが空です' }, { status: 400 });
    }
    const header = lines[0].split(',');
    const rows = lines.slice(1)
      .map(line => line.split(',').map((c) => c.trim()))
      .filter(cells => cells.length >= 6)
      .map(cells =>
        Object.fromEntries(header.map((key, i) => [key.trim(), cells[i] ?? '']))
      );

    const results: Array<{ email: string; status: string; message?: string }> = [];

    for (const user of rows) {
      const { full_name, email, password, company, department, position } = user as any;
      try {
        // (1) メール重複チェック
        const { data: exists, error: chkErr } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();
        if (chkErr) throw chkErr;
        if (exists) {
          results.push({ email, status: 'error', message: 'このメールは既に登録されています' });
          continue;
        }

        // (2) Supabase 認証ユーザー作成
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { full_name }
        });
        if (authErr || !authData.user) throw authErr || new Error('ユーザー作成に失敗しました');

        // (3) Google Drive からテンプレートコピー（サービスアカウント方式）
        let spreadsheetId: string, spreadsheetUrl: string;
        try {
          console.log('📋 スプレッドシート作成開始:', { email, templateLink: term.template_link });
          ({ spreadsheetId, spreadsheetUrl } = await createSpreadsheetFromTemplate(
            term.template_link,
            `【${term.name}】${full_name}`,
            term.folder_link
          ));
          console.log('✅ スプレッドシート作成成功:', { email, spreadsheetId });
        } catch (e: any) {
          console.error(`❌ [${email}] スプレッドシート作成エラー:`, {
            message: e?.message, stack: e?.stack, name: e?.name,
            code: e?.code,
            reason: e?.response?.data?.error?.errors?.[0]?.reason || e?.errors?.[0]?.reason
          });

          // レート制限だけワンリトライ
          if (e?.errors?.some((er: any) => er.reason === 'userRateLimitExceeded')) {
            console.log('⏳ レート制限エラー、1秒待機してリトライ');
            await delay(1000);
            ({ spreadsheetId, spreadsheetUrl } = await createSpreadsheetFromTemplate(
              term.template_link,
              `【${term.name}】${full_name}`,
              term.folder_link
            ));
          } else {
            throw e;
          }
        }

        // (4) profiles テーブルにレコード挿入
        const { error: profErr } = await supabaseAdmin
          .from('profiles')
          .upsert(
            {
              id: authData.user.id,
              email, full_name, company, department, position,
              term_id: termId,
              role: 'student'
            },
            { onConflict: 'email' }
          );
        if (profErr) throw profErr;

        // (5) スプレッドシートGID取得→user_assignments生成
        console.log('📊 シートマップ取得開始:', { email, spreadsheetId });
        const sheetMap = await getSheetIds(spreadsheetId);
        console.log('✅ シートマップ取得成功:', { email, sheetCount: Object.keys(sheetMap).length });

        // (6) 課題シートのリンクを設定（lecture_id付き）
        for (const [title, gid] of Object.entries(sheetMap)) {
          const match = title.match(/^【(.+?)】/);
          if (!match) continue;

          const task_id = match[1];
          const sheet_link = `${spreadsheetUrl}?gid=${gid}`;

          // task_idから講義番号を抽出（例: "1-0" → 1）
          const lectureNumber = parseInt(task_id.split('-')[0]);

          // 講義レコードのIDを取得
          const { data: lecture, error: lectureError } = await supabaseAdmin
            .from('lectures')
            .select('id')
            .eq('term_id', termId)
            .eq('lecture_number', lectureNumber)
            .single();

          if (lectureError || !lecture) {
            console.error('❌ 講義レコード取得エラー:', { email, task_id, lectureNumber, lectureError });
            continue;
          }

          console.log('📝 課題シート設定:', { email, task_id, sheet_link });

          // user_assignments作成/更新
          const { error } = await supabaseAdmin
            .from('user_assignments')
            .upsert(
              {
                user_id: authData.user.id,
                lecture_id: lecture.id,
                task_id: task_id,
                sheet_link: sheet_link,
                completed: false
              },
              { onConflict: 'user_id,lecture_id,task_id', ignoreDuplicates: false }
            );
          if (error) {
            console.error('❌ user_assignments挿入エラー:', { email, task_id, lecture_id: lecture.id, error });
            throw error;
          }
        }

        console.log('✅ ユーザー登録完了:', email);
        results.push({ email, status: 'success' });
      } catch (e: any) {
        console.error(`❌ [${(user as any).email}] ユーザー登録エラー:`, {
          message: e?.message, stack: e?.stack, name: e?.name
        });
        results.push({
          email: (user as any).email,
          status: 'error',
          message: e?.message || 'unknown error'
        });
      }

      // rate limit対策（最低限）
      await delay(200);
    }

    return NextResponse.json({ results });

  } catch (e: any) {
    console.error('upload_users route fatal error:', util.inspect(e, { showHidden: true, depth: 5 }));
    return NextResponse.json({ error: e?.message || 'fatal error' }, { status: 500 });
  }
}
