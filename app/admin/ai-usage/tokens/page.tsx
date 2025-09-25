"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TokenChart } from "@/components/admin/ai-usage/TokenChart";
import { KpiCards } from "@/components/admin/ai-usage/KpiCards";
import { BarChart3, TrendingUp, Calendar } from "lucide-react";

interface Term {
  id: string;
  name: string;
  term_number: number;
}

interface UsageData {
  date: string;
  total_tokens: number;
  message_count: number;
  user_count: number;
}

interface KpiData {
  totalTokens: number;
  averageDaily: number;
  totalMessages: number;
  activeUsers: number;
}

export default function AiUsageTokensPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [scope, setScope] = useState<"all" | "term">("all");
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [kpiData, setKpiData] = useState<KpiData>({
    totalTokens: 0,
    averageDaily: 0,
    totalMessages: 0,
    activeUsers: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  // 期一覧を取得
  useEffect(() => {
    const fetchTerms = async () => {
      const { data, error } = await supabase
        .from("terms")
        .select("id, name, term_number")
        .order("term_number", { ascending: true });

      if (data && !error) {
        setTerms(data);
      }
    };

    fetchTerms();
  }, []);

  // 利用状況データを取得
  useEffect(() => {
    const fetchUsageData = async () => {
      setIsLoading(true);
      try {
        // 期間の開始日を計算
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - parseInt(period));

        // chat_historyから直接集計（chat_usageテーブルがない場合）
        let query = supabase
          .from("chat_history")
          .select(`
            message_timestamp,
            user_id,
            model,
            profiles!inner(term_id)
          `)
          .eq("role", "assistant")
          .gte("message_timestamp", startDate.toISOString())
          .lte("message_timestamp", endDate.toISOString());

        // 期でフィルタ
        if (scope === "term" && selectedTermId) {
          // まずユーザーIDを取得
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id")
            .eq("term_id", selectedTermId);
          
          const userIds = profiles?.map(p => p.id) || [];
          if (userIds.length > 0) {
            query = query.in("user_id", userIds);
          } else {
            // 該当ユーザーがいない場合は空の結果を返す
            setUsageData([]);
            setKpiData({
              totalTokens: 0,
              averageDaily: 0,
              totalMessages: 0,
              activeUsers: 0
            });
            setIsLoading(false);
            return;
          }
        }

        // JOINを削除してシンプルなクエリに変更
        const { data: chatData, error } = await supabase
          .from("chat_history")
          .select("message_timestamp, user_id, model, content")
          .eq("role", "assistant")
          .gte("message_timestamp", startDate.toISOString())
          .lte("message_timestamp", endDate.toISOString())
          .then(async (result) => {
            if (scope === "term" && selectedTermId) {
              const { data: profiles } = await supabase
                .from("profiles")
                .select("id")
                .eq("term_id", selectedTermId);
              
              const userIds = profiles?.map(p => p.id) || [];
              if (userIds.length > 0) {
                return supabase
                  .from("chat_history")
                  .select("message_timestamp, user_id, model, content")
                  .eq("role", "assistant")
                  .gte("message_timestamp", startDate.toISOString())
                  .lte("message_timestamp", endDate.toISOString())
                  .in("user_id", userIds);
              }
            }
            return result;
          });

        if (error) {
          console.error("利用状況取得エラー:", error);
          return;
        }

        // 日付別に集計
        const dailyUsage = new Map<string, {
          tokens: number;
          messages: number;
          users: Set<string>;
        }>();

        chatData?.forEach(chat => {
          const date = new Date(chat.message_timestamp).toISOString().split('T')[0];
          const estimatedTokens = chat.content?.length * 1.0 || 100; // 仮の計算

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
        });

        // 日付配列を生成（データがない日は0で補間）
        const usageArray: UsageData[] = [];
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          const dayData = dailyUsage.get(dateStr);
          
          usageArray.push({
            date: dateStr,
            total_tokens: Math.round(dayData?.tokens || 0),
            message_count: dayData?.messages || 0,
            user_count: dayData?.users.size || 0
          });
        }

        setUsageData(usageArray);

        // KPI計算
        const totalTokens = usageArray.reduce((sum, day) => sum + day.total_tokens, 0);
        const totalMessages = usageArray.reduce((sum, day) => sum + day.message_count, 0);
        const allUsers = new Set<string>();
        chatData?.forEach(chat => allUsers.add(chat.user_id));

        setKpiData({
          totalTokens,
          averageDaily: Math.round(totalTokens / parseInt(period)),
          totalMessages,
          activeUsers: allUsers.size
        });

      } catch (error) {
        console.error("利用状況取得例外:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsageData();
  }, [scope, selectedTermId, period]);

  return (
    <div className="space-y-6">
      {/* フィルター */}
      <Card className="p-6">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-custom-black">表示範囲:</label>
            <Select value={scope} onValueChange={(value: "all" | "term") => setScope(value)}>
              <SelectTrigger className="w-[120px] focus:ring-custom-dark-gray">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全体</SelectItem>
                <SelectItem value="term">各期</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === "term" && (
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-custom-black">期:</label>
              <Select value={selectedTermId} onValueChange={setSelectedTermId}>
                <SelectTrigger className="w-[200px] focus:ring-custom-dark-gray">
                  <SelectValue placeholder="期を選択" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((term) => (
                    <SelectItem key={term.id} value={term.id}>
                      {term.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-custom-black">期間:</label>
            <Select value={period} onValueChange={(value: "7" | "30" | "90") => setPeriod(value)}>
              <SelectTrigger className="w-[120px] focus:ring-custom-dark-gray">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">直近7日</SelectItem>
                <SelectItem value="30">直近30日</SelectItem>
                <SelectItem value="90">直近90日</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* KPIカード */}
      <KpiCards data={kpiData} isLoading={isLoading} />

      {/* トークン利用状況グラフ */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="w-5 h-5 text-custom-dark-gray" />
          <h2 className="text-lg font-semibold text-custom-black">
            トークン利用推移
          </h2>
          <span className="text-sm text-gray-500">
            ({scope === "all" ? "全体" : terms.find(t => t.id === selectedTermId)?.name || "期未選択"})
          </span>
        </div>
        
        <TokenChart data={usageData} isLoading={isLoading} />
      </Card>
    </div>
  );
}