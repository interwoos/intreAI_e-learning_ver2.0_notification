import { supabase } from '@/lib/supabase';

export interface UsageData {
  date: string;
  total_tokens: number;
  message_count: number;
  user_count: number;
}

export interface KpiData {
  totalTokens: number;
  averageDaily: number;
  totalMessages: number;
  activeUsers: number;
}

export async function fetchUsageData(
  scope: "all" | "term",
  termId?: string,
  days: number = 30
): Promise<{ usageData: UsageData[]; kpiData: KpiData }> {
  try {
    // 期間の計算
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    // chat_historyから直接集計
    let query = supabase
      .from("chat_history")
      .select(`
        message_timestamp,
        user_id,
        model,
        content,
        profiles!inner(term_id)
      `)
      .eq("role", "assistant")
      .gte("message_timestamp", startDate.toISOString())
      .lte("message_timestamp", endDate.toISOString());

    // まずユーザーIDを取得
    let userIds: string[] = [];
    if (scope === "term" && termId) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("term_id", termId);
      userIds = profiles?.map(p => p.id) || [];
    }

    // チャットデータを取得（JOINなし）
    let chatQuery = supabase
      .from("chat_history")
      .select("message_timestamp, user_id, model, content")
      .eq("role", "assistant")
      .gte("message_timestamp", startDate.toISOString())
      .lte("message_timestamp", endDate.toISOString());

    // 期でフィルタする場合
    if (scope === "term" && userIds.length > 0) {
      chatQuery = chatQuery.in("user_id", userIds);
    }

    const { data: chatData, error } = await chatQuery;

    if (error) {
      console.error("利用状況取得エラー:", error);
      return {
        usageData: [],
        kpiData: { totalTokens: 0, averageDaily: 0, totalMessages: 0, activeUsers: 0 }
      };
    }

    // 日付別に集計
    const dailyUsage = new Map<string, {
      tokens: number;
      messages: number;
      users: Set<string>;
    }>();

    let totalTokens = 0;
    let totalMessages = 0;
    const allUsers = new Set<string>();

    chatData?.forEach(chat => {
      const date = new Date(chat.message_timestamp).toISOString().split('T')[0];
      const estimatedTokens = Math.round((chat.content?.length || 0) * 1.0) || 100;

      if (!dailyUsage.has(date)) {
        dailyUsage.set(date, {
          tokens: 0,
          messages: 0,
          users: new Set()
        });
      }

      const dayData = dailyUsage.get(date)!;
      dayData.tokens += estimatedTokens;
      dayData.messages += 1;
      dayData.users.add(chat.user_id);

      totalTokens += estimatedTokens;
      totalMessages += 1;
      allUsers.add(chat.user_id);
    });

    // 日付配列を生成（データがない日は0で補間）
    const usageArray: UsageData[] = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayData = dailyUsage.get(dateStr);
      
      usageArray.push({
        date: dateStr,
        total_tokens: dayData?.tokens || 0,
        message_count: dayData?.messages || 0,
        user_count: dayData?.users.size || 0
      });
    }

    const kpiData: KpiData = {
      totalTokens,
      averageDaily: Math.round(totalTokens / days),
      totalMessages,
      activeUsers: allUsers.size
    };

    return { usageData: usageArray, kpiData };

  } catch (error) {
    console.error('利用状況取得例外:', error);
    return {
      usageData: [],
      kpiData: { totalTokens: 0, averageDaily: 0, totalMessages: 0, activeUsers: 0 }
    };
  }
}