import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { google } from 'googleapis';
import { Readable } from 'stream';

export const runtime = 'nodejs';

function initAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

let auth:any, drive:any, sheets:any;
try { auth = initAuth(); drive = google.drive({version:'v3',auth}); sheets = google.sheets({version:'v4',auth}); } catch(e){ console.error(e); auth=null; }

export async function POST(req: Request) {
  try {
    if (!auth) return NextResponse.json({ error: 'google auth not ready' }, { status: 500 });

    const fd = await req.formData();
    const userId = String(fd.get('userId') || '');
    const assignmentId = String(fd.get('assignmentId') || '');
    const termId = String(fd.get('termId') || '');
    const file = fd.get('file') as File | null;

    if (!userId || !assignmentId || !termId || !file) return NextResponse.json({ error: 'missing params' }, { status: 400 });

    // term & profile
    const { data: term } = await supabaseAdmin.from('terms').select('name, folder_link').eq('id', termId).single();
    const { data: profile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', userId).single();
    const { data: pa } = await supabaseAdmin.from('pre_assignments').select('allow_file_upload, upload_sheet_range, upload_accept_mime').eq('term_id', termId).eq('assignment_id', assignmentId).single();
    const { data: ua } = await supabaseAdmin.from('user_assignments').select('sheet_link').eq('user_id', userId).eq('assignment_id', assignmentId).single();

    if (!term?.folder_link) return NextResponse.json({ error: 'invalid term.folder_link' }, { status: 400 });
    if (!pa?.allow_file_upload) return NextResponse.json({ error: 'upload not allowed' }, { status: 403 });

    const allowed = (pa.upload_accept_mime ?? ['video/*']) as string[];
    const ok = allowed.some(m => m.endsWith('/*') ? file.type.startsWith(m.slice(0,-1)) : file.type === m);
    if (!ok) return NextResponse.json({ error: `mime not allowed: ${file.type}` }, { status: 400 });

    const m = term.folder_link.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (!m) return NextResponse.json({ error: 'invalid folder link' }, { status: 400 });
    const baseFolderId = m[1];

    async function ensureFolder(name: string, parentId: string) {
      const q = `name='${name.replace(/'/g,"\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const { data } = await drive.files.list({ q, fields: 'files(id,name)' });
      if (data.files?.[0]?.id) return data.files[0].id as string;
      const created = await drive.files.create({ requestBody: { name, parents: [parentId], mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
      return created.data.id as string;
    }

    const uploadsId = await ensureFolder('uploads', baseFolderId);
    const assignId = await ensureFolder(assignmentId, uploadsId);
    const userFolderId = await ensureFolder(userId.substring(0,8), assignId);

    const ts = new Date().toISOString().replace(/[:.]/g,'-').substring(0,19);
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'mp4';
    const fileName = `${profile?.full_name || userId}.${assignmentId}.${ts}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const body = Readable.from(buf);

    const created = await drive.files.create({
      requestBody: { name: fileName, parents: [userFolderId] },
      media: { mimeType: file.type || 'application/octet-stream', body },
      fields: 'id',
    });
    const fileId = created.data.id;
    if (!fileId) return NextResponse.json({ error: 'upload failed' }, { status: 500 });

    await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
    const got = await drive.files.get({ fileId, fields: 'webViewLink' });
    const fileUrl = got.data.webViewLink as string;

    // DB更新
    await supabaseAdmin.from('user_assignments').update({
      upload_url: fileUrl, uploaded_at: new Date().toISOString(), upload_file_id: fileId, updated_at: new Date().toISOString()
    }).eq('user_id', userId).eq('assignment_id', assignmentId);

    // シート貼り付け
    try {
      const sheetUrl = ua?.sheet_link;
      if (sheetUrl) {
        const sm = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
        if (sm) {
          const spreadsheetId = sm[1];
          const fullRange = (pa.upload_sheet_range || 'B5:H5') as string;
          const a1 = fullRange.split(':')[0];
          const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(title,sheetId)' });
          const target = meta.data.sheets?.find((s:any)=> s?.properties?.title?.includes(`【${assignmentId}】`));
          if (target) {
            const sheetName = target.properties!.title as string;
            const formula = `=HYPERLINK("${fileUrl}","📹 動画リンク")`;
            await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetName}!${a1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[formula]] } });
          }
        }
      }
    } catch (e) { console.warn('sheet write failed but upload ok', e); }

    return NextResponse.json({ success: true, fileUrl, fileName, fileId });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || 'server error' }, { status: 500 });
  }
}
