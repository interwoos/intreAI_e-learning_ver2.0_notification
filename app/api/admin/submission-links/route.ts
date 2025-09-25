// app/api/admin/submission-links/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/roles";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("taskId");
    const termId = searchParams.get("termId");
    if (!taskId || !termId) {
      return NextResponse.json({ error: "taskId and termId required" }, { status: 400 });
    }

    // 認証ユーザー
    const cookieStore = cookies();
    const sb = supabase(cookieStore);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // 管理者チェック
    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 期に属するユーザーの提出一覧（profiles と紐付け）
    const { data, error } = await sb
      .from("user_assignments")
      .select(`
        user_id,
        task_id,
        drive_webview_link,
        last_submitted_at,
        completed,
        profiles!inner(id, full_name, term_id)
      `)
      .eq("profiles.term_id", termId)
      .eq("task_id", taskId);

    if (error) return NextResponse.json({ error: "query failed" }, { status: 500 });

    // 整形して返す
    const rows = (data || []).map((r: any) => ({
      user_id: r.user_id,
      full_name: r.profiles?.full_name,
      link: r.drive_webview_link,
      submitted_at: r.last_submitted_at,
      completed: r.completed,
    }));

    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    console.error("admin/submission-links GET error:", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
