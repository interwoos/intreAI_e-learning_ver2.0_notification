"use client";

import { Card } from "@/components/ui/card";
import { 
  TrendingUp, 
  MessageSquare, 
  Users, 
  Zap 
} from "lucide-react";

interface KpiData {
  totalTokens: number;
  averageDaily: number;
  totalMessages: number;
  activeUsers: number;
}

interface KpiCardsProps {
  data: KpiData;
  isLoading: boolean;
}

export function KpiCards({ data, isLoading }: KpiCardsProps) {
  const kpis = [
    {
      title: "総トークン数",
      value: data.totalTokens.toLocaleString(),
      icon: Zap,
      color: "text-blue-600",
      bgColor: "bg-blue-50"
    },
    {
      title: "日平均トークン",
      value: data.averageDaily.toLocaleString(),
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-50"
    },
    {
      title: "総メッセージ数",
      value: data.totalMessages.toLocaleString(),
      icon: MessageSquare,
      color: "text-purple-600",
      bgColor: "bg-purple-50"
    },
    {
      title: "利用ユーザー数",
      value: data.activeUsers.toLocaleString(),
      icon: Users,
      color: "text-orange-600",
      bgColor: "bg-orange-50"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => {
        const IconComponent = kpi.icon;
        return (
          <Card key={kpi.title} className="p-6">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${kpi.bgColor}`}>
                <IconComponent className={`w-6 h-6 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">
                  {kpi.title}
                </p>
                <p className="text-2xl font-bold text-custom-black">
                  {isLoading ? "..." : kpi.value}
                </p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}