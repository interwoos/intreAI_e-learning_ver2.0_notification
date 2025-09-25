// app/api/drive/resumable-start/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAccessTokenFromSA, extractFolderId } from "@/lib/google-sa";

export async function POST(req: Request) {
  const traceId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => null);
    const { termId, fileName, mimeType, fileSize } = body || {};

    if (!termId || !fileName || !mimeType || !fileSize) {
      return NextResponse.json(
        { success: false, code: "MISSING_PARAMS", error: "termId, fileName, mimeType, fileSize are required", traceId },
        { status: 400 }
      );
    }

    // 1) terms からフォルダIDを取得
    const supabaseAdmin = getSupabaseAdmin();
    const { data: term, error: termErr } = await supabaseAdmin
      .from("terms")
      .select("folder_link")
      .eq("id", termId)
      .single();
    if (termErr) return NextResponse.json({ success: false, code: "TERM_QUERY_FAILED", error: termErr.message, traceId }, { status: 500 });

    const folderId = extractFolderId(term?.folder_link ?? "");
    if (!folderId) return NextResponse.json({ success: false, code: "FOLDER_ID_PARSE_FAILED", error: "Invalid folder_link", traceId }, { status: 400 });

    // 2) SA でアクセストークン取得
    const accessToken = await getAccessTokenFromSA();
    if (!accessToken) return NextResponse.json({ success: false, code: "TOKEN_FAILED", error: "Failed to mint SA token", traceId }, { status: 500 });

    // 3) Resumable セッション開始
    const initResp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(fileSize),
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
        mimeType,
      }),
    });

    if (!initResp.ok) {
      const text = await initResp.text().catch(() => "");
      console.error("[resumable-start] init error", initResp.status, text);
      return NextResponse.json({ success: false, code: "RESUMABLE_INIT_FAILED", error: "Failed to init resumable", traceId }, { status: 502 });
    }

    const uploadUrl = initResp.headers.get("location");
    if (!uploadUrl) return NextResponse.json({ success: false, code: "UPLOAD_URL_MISSING", error: "Upload URL missing", traceId }, { status: 502 });

    return NextResponse.json({ success: true, uploadUrl, traceId });
  } catch (e: any) {
    console.error("[resumable-start] fatal", traceId, e);
    return NextResponse.json({ success: false, code: "INTERNAL_ERROR", error: e?.message ?? "internal", traceId }, { status: 500 });
  }
}
