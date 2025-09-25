// /app/api/deep-research/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Node16互換: OpenAI SDKの代わりにfetch直叩き
async function openaiRetrieve(responseId: string) {
  const res = await fetch(`https://api.openai.com/v1/responses/${responseId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
      "Content-Type": "application/json",
    },
  });
  
  const text = await res.text();
  if (!res.ok) {
    console.error(`❌ OpenAI Retrieve Error ${res.status}:`, text.slice(0, 800));
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 800)}`);
  }
  
  return JSON.parse(text);
}

// レート制限対応のリトライ関数
function retryDelay(retryAfterHeader: string | null, errorBody: string): number {
  if (retryAfterHeader) {
    return Math.max(100, Math.ceil(parseFloat(retryAfterHeader) * 1000));
  }
  const match = /try again in ([0-9.]+)s/i.exec(errorBody || "");
  return match ? Math.ceil(parseFloat(match[1]) * 1000) : 1200;
}

// リトライ付きOpenAI呼び出し
async function openaiRetrieveWithRetry(responseId: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await openaiRetrieve(responseId);
    } catch (error: any) {
      if (error.message?.includes('429') && attempt < maxRetries) {
        const delay = retryDelay(null, error.message);
        console.warn(`⏳ Rate limit hit, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
function parseOutput(resp: any) {
  const out = Array.isArray(resp?.output) ? resp.output : [];
  const last = out[out.length - 1];
  const content0 = Array.isArray(last?.content) ? last.content[0] : null;
  const text = content0?.text ?? "";
  const citations = Array.isArray(content0?.annotations) ? content0.annotations : [];
  
  // 引用情報の品質向上（一次ソース優先）
  const sortedCitations = citations.sort((a: any, b: any) => {
    const aPrimary = isPrimarySource(a.url || '');
    const bPrimary = isPrimarySource(b.url || '');
    if (aPrimary && !bPrimary) return -1;
    if (!aPrimary && bPrimary) return 1;
    return 0;
  });
  
  const steps = out.filter(
    (x: any) =>
      x &&
      ["reasoning", "web_search_call", "code_interpreter_call", "mcp_call"].includes(x.type)
  );
  return { text, citations: sortedCitations, steps };
}

// 一次ソース判定関数
function isPrimarySource(url: string): boolean {
  const primaryDomains = [
    'gov', 'edu', 'org',
    'press', 'official', 'pdf',
    'research', 'journal', 'paper'
  ];
  return primaryDomains.some(domain => url.includes(domain));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('🔍 DeepResearch結果取得:', { id: params.id });
    
    const data = await openaiRetrieveWithRetry(params.id);

    if (data.status === "queued" || data.status === "in_progress") {
      console.log('⏳ DeepResearch実行中:', { id: params.id, status: data.status });
      return NextResponse.json({ status: data.status, tag: "DR" });
    }
    
    if (data.status === "completed") {
      const { text, citations, steps } = parseOutput(data);
      console.log('✅ DeepResearch完了:', {
        id: params.id,
        textLength: text.length,
        citationsCount: citations.length,
        stepsCount: steps.length
      });
      
      return NextResponse.json({
        status: "completed",
        text,
        citations,
        steps,
        modelUsed: data.model,
        tag: "DR",
      });
    }
    
    console.warn('⚠️ DeepResearch失敗:', { id: params.id, status: data.status, error: data?.error });
    return NextResponse.json({ status: data.status || "failed", error: data?.error, tag: "DR" });
  } catch (e: any) {
    console.error("[DR RETRIEVE ERROR]", e?.status || "", e?.message || e);
    return NextResponse.json({ status: "failed", error: e?.message || String(e), tag: "DR" }, { status: 500 });
  }
}
