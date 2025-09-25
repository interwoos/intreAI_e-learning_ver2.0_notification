import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ★ top-level で supabaseAdmin を定義（next/headers は一切使わない）
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

export async function GET(request: Request) {
  console.log('🔍 [GET] user-assignments API呼び出し開始');
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  
  console.log('📋 [GET] リクエストパラメータ:', { taskId });
  
  if (!taskId) {
    console.error('❌ [GET] taskIdが不足');
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  console.log('🔑 [GET] 認証ヘッダー確認:', { hasAuthHeader: !!authHeader });
  
  if (!authHeader?.startsWith("Bearer ")) {
    console.error('❌ [GET] 認証ヘッダーが無効');
    return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
  }
  const token = authHeader.slice("Bearer ".length);
  console.log('🎫 [GET] トークン抽出完了:', { tokenLength: token.length });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  
  if (authError) {
    console.error('❌ [GET] 認証エラー:', authError);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  if (!user) {
    console.error('❌ [GET] ユーザー情報が取得できません');
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  console.log('✅ [GET] ユーザー認証成功:', { userId: user.id, email: user.email });

  const { data, error } = await supabaseAdmin
    .from("user_assignments")
    .select("*")
    .eq("user_id", user.id)
    .eq("task_id", taskId);

  if (error) {
    console.error('❌ [GET] データベースクエリエラー:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  console.log('📊 [GET] クエリ結果:', { 
    assignmentsCount: data?.length || 0,
    assignments: data?.map(a => ({ 
      task_id: a.task_id, 
      completed: a.completed, 
      status: a.status 
    }))
  });
  
  return NextResponse.json({ assignments: data });
}

export async function POST(request: Request) {
  console.log('🔍 [POST] user-assignments API呼び出し開始');
  
  let body;
  try {
    body = await request.json();
    console.log('📋 [POST] リクエストボディ解析成功:', body);
  } catch (parseError) {
    console.error('❌ [POST] リクエストボディ解析エラー:', parseError);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  
  const { taskId, action = "submit", reason = "" } = body as {
    taskId?: string; action?: "submit" | "resubmit" | "cancel"; reason?: string;
  };
  
  console.log('📋 [POST] リクエストボディ:', { taskId, action, reason });
  
  if (!taskId) {
    console.error('❌ [POST] taskIdが不足');
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  console.log('🔑 [POST] 認証ヘッダー確認:', { hasAuthHeader: !!authHeader });
  
  if (!authHeader?.startsWith("Bearer ")) {
    console.error('❌ [POST] 認証ヘッダーが無効');
    return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
  }
  const token = authHeader.slice("Bearer ".length);
  console.log('🎫 [POST] トークン抽出完了:', { tokenLength: token.length });

  let user;
  try {
    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError) {
      console.error('❌ [POST] 認証エラー:', authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (!authUser) {
      console.error('❌ [POST] ユーザー情報が取得できません');
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    user = authUser;
    console.log('✅ [POST] ユーザー認証成功:', { userId: user.id, email: user.email });
  } catch (authException) {
    console.error('❌ [POST] 認証例外:', authException);
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
  

  let current;
  try {
    const { data: currentData, error: fetchError } = await supabaseAdmin
      .from("user_assignments")
      .select("completed, status, submission_count, completed_at, sheet_link")
      .eq("user_id", user.id)
      .eq("task_id", taskId)
      .single();

    if (fetchError) {
      console.error('❌ [POST] 課題取得エラー:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    
    if (!currentData) {
      console.error('❌ [POST] 課題が見つかりません:', { userId: user.id, taskId });
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    
    current = currentData;
  } catch (fetchException) {
    console.error('❌ [POST] 課題取得例外:', fetchException);
    return NextResponse.json({ error: "Database query failed" }, { status: 500 });
  }
  
  console.log('📋 [POST] 現在の課題状況:', {
    taskId,
    completed: current.completed,
    status: current.status,
    submission_count: current.submission_count,
    completed_at: current.completed_at,
    sheet_link: current.sheet_link
  });

  let update: Record<string, any> = {};
  let message = "";

  if (action === "submit") {
    console.log('📤 [POST] 初回提出処理開始');
    update = {
      completed: true,
      completed_at: new Date().toISOString(),
      status: "submitted",
      submission_count: (current.submission_count || 0) + 1,
      last_submitted_at: new Date().toISOString(),
    };
    message = "課題を提出しました";
    console.log('📤 [POST] 提出用更新データ:', update);
  } else if (action === "resubmit") {
    console.log('🔄 [POST] 再提出処理開始');
    if (current.status !== "cancelled") {
      console.error('❌ [POST] 再提出不可能な状態:', { currentStatus: current.status });
      return NextResponse.json({ error: "Cannot resubmit non-cancelled assignment" }, { status: 400 });
    }
    update = {
      completed: true,
      completed_at: new Date().toISOString(),
      status: "resubmitted",
      submission_count: (current.submission_count || 0) + 1,
      last_submitted_at: new Date().toISOString(),
    };
    message = "課題を再提出しました";
    console.log('🔄 [POST] 再提出用更新データ:', update);
  } else if (action === "cancel") {
    console.log('🗑️ [POST] 取り消し処理開始');
    if (!current.completed || current.status === "cancelled") {
      console.error('❌ [POST] 取り消し不可能な状態:', { 
        completed: current.completed, 
        status: current.status 
      });
      return NextResponse.json({ error: "Cannot cancel non-submitted assignment" }, { status: 400 });
    }
    update = {
      completed: false,
      completed_at: null,
      status: "cancelled",
      last_cancelled_at: new Date().toISOString(),
    };
    message = `提出を取り消しました${reason ? ` (理由: ${reason})` : ""}`;
    console.log('🗑️ [POST] 取り消し用更新データ:', update);
  } else {
    console.error('❌ [POST] 無効なアクション:', { action });
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  console.log('💾 [POST] データベース更新開始:', { userId: user.id, taskId, update });
  
  let updateError;
  try {
    const { error: dbUpdateError } = await supabaseAdmin
      .from("user_assignments")
      .update(update)
      .eq("user_id", user.id)
      .eq("task_id", taskId);
    
    updateError = dbUpdateError;
  } catch (updateException) {
    console.error('❌ [POST] データベース更新例外:', updateException);
    return NextResponse.json({ error: "Database update failed" }, { status: 500 });
  }

  if (updateError) {
    console.error('❌ [POST] データベース更新エラー:', updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  
  console.log('✅ [POST] データベース更新成功:', { action, message });
  
  // SQLトリガーが自動で通知を処理するため、コード主導通知は削除
  console.log('📧 [POST] 通知はSQLトリガーで自動処理されます');
  
  console.log('🎉 [POST] 処理完了:', { action, message, taskId, userId: user.id });
  return NextResponse.json({ success: true, message, action });
}
