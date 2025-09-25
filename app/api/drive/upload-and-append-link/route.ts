// app/api/drive/upload-and-append-link/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAccessTokenFromSA, extractFolderId } from "@/lib/google-sa";
import { getSheetIds } from "@/lib/google-sheets";

/** 共通レスポンス */
function bad(code: string, message: string, extra: any = {}) {
  const traceId = crypto.randomUUID();
  return NextResponse.json({ success: false, code, error: message, traceId, ...extra }, { status: 400 });
}
function oops(message: string, extra: any = {}) {
  const traceId = crypto.randomUUID();
  console.error("[upload-and-append-link] fatal", traceId, message, extra);
  return NextResponse.json({ success: false, code: "INTERNAL_ERROR", error: message, traceId }, { status: 500 });
}

/** "A5:H6" -> "A5" */
function leftTopCellFromRange(range: string | null | undefined): string {
  const r = String(range ?? "A5:H6");
  const m = r.match(/([A-Za-z]+[0-9]+)/);
  return m ? m[1] : "A5";
}
/** シート文字列の " を "" に */
function esc(s: string) {
  return String(s ?? "").replace(/"/g, '""');
}

/** タブ名を決める（優先順：完全一致 → 【…】内が assignmentId → 【…】内が R（右番号）） */
function pickSheetTitle(titles: string[], assignmentId: string): string | null {
  // 1) 完全一致
  if (titles.includes(assignmentId)) return assignmentId;

  // 2) 先頭「【 ... 】」の中身が assignmentId
  const byBracketExact = titles.find(t => {
    const m = t.match(/^【\s*(.+?)\s*】/);
    return m && m[1] === assignmentId;
  });
  if (byBracketExact) return byBracketExact;

  // 3) "L-R" を分解して右側（R）一致（元コードに近い挙動）
  const lr = assignmentId.match(/^(\d+)-(\d+)$/);
  const R = lr?.[2];
  if (R) {
    const byBracketRight = titles.find(t => {
      const m = t.match(/^【\s*(.+?)\s*】/);
      return m && m[1] === R;
    });
    if (byBracketRight) return byBracketRight;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    // 0) 認証（userIdはフォームから受け取らない）
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return bad("UNAUTHORIZED", "認証が必要です");

    // 1) 入力
    const form = await req.formData();
    const termId = String(form.get("termId") ?? "");
    const lectureIdStr = String(form.get("lectureId") ?? "");
    const assignmentId = String(form.get("assignmentId") ?? ""); // 例 "3-3"
    const file = form.get("file") as File | null;

    if (!termId || !lectureIdStr || !assignmentId || !file) {
      return bad("MISSING_PARAMS", "termId, lectureId, assignmentId, file are required", {
        termId, lectureIdStr, assignmentId, hasFile: !!file,
      });
    }
    if (!/^\d+$/.test(lectureIdStr)) return bad("BAD_LECTURE_ID", "lectureId must be numeric");
    const lectureId = Number(lectureIdStr);

    // 2) 期フォルダの特定（terms.folder_link -> folderId）
    const admin = getSupabaseAdmin();
    const term = await admin.from("terms").select("folder_link,name").eq("id", termId).single();
    if (term.error) return bad("TERM_QUERY_FAILED", term.error.message);
    const folderId = extractFolderId(term.data?.folder_link ?? "");
    if (!folderId) return bad("FOLDER_ID_PARSE_FAILED", "folder_link が不正です");

    // 3) SAトークン（Drive + Sheets）
    const accessToken = await getAccessTokenFromSA([
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/spreadsheets",
    ]);
    if (!accessToken) return oops("Failed to mint access_token");

    // 4) Drive Resumable: 開始 → PUT
    const arrayBuf = await file.arrayBuffer();
    const safeName = file.name.replace(/[^\w.\-()]/g, "_");
    const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Upload-Content-Type": file.type || "application/octet-stream",
        "X-Upload-Content-Length": String(arrayBuf.byteLength),
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ name: safeName, parents: [folderId], mimeType: file.type || "application/octet-stream" }),
    });
    if (!init.ok) {
      const text = await init.text().catch(()=> "");
      return oops("RESUMABLE_INIT_FAILED", { status: init.status, text: text.slice(0,1000) });
    }
    const uploadUrl = init.headers.get("location");
    if (!uploadUrl) return oops("UPLOAD_URL_MISSING");

    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Content-Length": String(arrayBuf.byteLength),
      },
      body: Buffer.from(arrayBuf),
    });
    if (!put.ok) {
      const text = await put.text().catch(()=> "");
      return oops("RESUMABLE_PUT_FAILED", { status: put.status, text: text.slice(0,1000) });
    }

    // 5) Drive: webViewLink を files.get で取得（あなたのスタイルに合わせる）
    let webViewLink: string | null = null;
    let fileId: string | null = null;
    try {
      const putJson = await put.json().catch(() => null);
      fileId = putJson?.id ?? null;
    } catch { fileId = null; }

    if (fileId) {
      const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,webViewLink`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!meta.ok) {
        const text = await meta.text().catch(()=> "");
        return oops("FILES_GET_FAILED", { status: meta.status, text: text.slice(0,1000) });
      }
      const j = await meta.json().catch(()=> null);
      webViewLink = j?.webViewLink ?? null;
    }
    if (!webViewLink) return oops("WEBVIEWLINK_NOT_FOUND");

    // 6) UA 行（assignment_id 優先→ task_id フォールバック）＆ sheet_link
    //   ※ あなたの既存コードは task_id 主体だったので、両対応にしておく
    let ua = await supabase
      .from("user_assignments")
      .select("id, sheet_link")
      .match({ user_id: user.id, lecture_id: lectureId, assignment_id: assignmentId })
      .maybeSingle();

    if (ua.error) return oops("UA_QUERY_FAILED: " + ua.error.message);

    if (!ua.data) {
      // フォールバック: 右側番号（R）を task_id として照合
      const R = assignmentId.split("-")[1];
      if (R && /^\d+$/.test(R)) {
        const fb = await supabase
          .from("user_assignments")
          .select("id, sheet_link")
          .match({ user_id: user.id, lecture_id: lectureId, task_id: Number(R) })
          .maybeSingle();
        if (fb.error) return oops("UA_FALLBACK_QUERY_FAILED: " + fb.error.message);
        ua = fb as any;
      }
    }

    // なければ作る（assignment_id を“正”として保存／task_id は必要なら埋める）
    if (!ua.data) {
      const R = assignmentId.split("-")[1];
      const ins = await supabase
        .from("user_assignments")
        .insert([{
          user_id: user.id,
          lecture_id: lectureId,
          assignment_id: assignmentId,
          task_id: R && /^\d+$/.test(R) ? Number(R) : null
        }])
        .select("id, sheet_link")
        .single();
      if (ins.error) return oops("UA_INSERT_FAILED: " + ins.error.message);
      ua = ins as any;
    }
    const sheetLink: string | null = ua.data?.sheet_link ?? null;
    if (!sheetLink) return bad("SHEET_LINK_NOT_FOUND", "該当行はあるが sheet_link が未設定");

    // 7) spreadsheetId 抽出 & タブ選択（getSheetIds + 「【…】」ルール）
    const m = sheetLink.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const spreadsheetId = m?.[1];
    if (!spreadsheetId) return bad("SPREADSHEET_ID_PARSE_FAILED", "sheet_link が不正です");

    const sheetMap = await getSheetIds(spreadsheetId); // { title: gid }
    const titles = Object.keys(sheetMap);
    const sheetTitle = pickSheetTitle(titles, assignmentId);
    if (!sheetTitle) return bad("SHEET_TAB_NOT_FOUND", `タブが見つかりません: assignment_id=${assignmentId}`);

    // 8) pre_assignments からレンジ＆許可
    const pa = await supabase
      .from("pre_assignments")
      .select("upload_sheet_range, allow_file_upload")
      .match({ term_id: termId, assignment_id: assignmentId })
      .maybeSingle();
    if (pa.error) return oops("PRE_ASSIGNMENT_QUERY_FAILED: " + pa.error.message);
    if (!pa.data?.allow_file_upload) return bad("UPLOAD_NOT_ALLOWED", "この課題はアップロードが許可されていません");

    const range = String(pa.data?.upload_sheet_range || "A5:H6");
    const firstCell = leftTopCellFromRange(range);

    // 9) 既存値(A5)を取得
    const getResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("'" + sheetTitle + "'!" + firstCell)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!getResp.ok) {
      const text = await getResp.text().catch(()=> "");
      return oops("SHEETS_GET_FAILED", { status:getResp.status, text:text.slice(0,1000) });
    }
    const getJson: any = await getResp.json().catch(()=> null);
    const existing = getJson?.values?.[0]?.[0] ?? "";

    // 10) 追記（既存 + 改行 + HYPERLINK）
    const linkFormula = `HYPERLINK("${webViewLink}","動画を見る")`;
    const newValue = existing
      ? `="${esc(existing)}"&CHAR(10)&${linkFormula}`
      : `=${linkFormula}`;

    const putResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("'" + sheetTitle + "'!" + firstCell)}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [[ newValue ]] }),
      }
    );
    if (!putResp.ok) {
      const text = await putResp.text().catch(()=> "");
      return oops("SHEETS_UPDATE_FAILED", { status:putResp.status, text:text.slice(0,1000) });
    }

    // 11) UA にファイル情報を反映（監査用）
    const upd = await supabase.from("user_assignments")
      .update({ upload_url: webViewLink, upload_file_id: fileId })
      .match({ user_id: user.id, lecture_id: lectureId, assignment_id: assignmentId });
    if (upd.error) console.error("[upload-and-append-link] UA_UPDATE_FAILED", upd.error);

    return NextResponse.json({ success: true, traceId: crypto.randomUUID(), webViewLink, fileId });
  } catch (e: any) {
    return oops(e?.message ?? "internal error");
  }
}
