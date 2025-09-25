// app/api/submission-link/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("taskId");
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

    // 認証ユーザー
    const cookieStore = cookies();
    const sb = supabase(cookieStore);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // 自分の提出リンクを返す
    const { data, error } = await sb
      .from("user_assignments")
      .select("drive_webview_link, last_submitted_at, completed")
      .eq("user_id", user.id)
      .eq("task_id", taskId)
      .single();

    if (error) return NextResponse.json({ error: "not found" }, { status: 404 });

    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    console.error("submission-link GET error:", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
