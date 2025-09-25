"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, BarChart3 } from "lucide-react";

export default function AiUsageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const tabs = [
    {
      name: "チャット内容",
      href: "/admin/ai-usage/messages",
      icon: MessageSquare,
      current: pathname === "/admin/ai-usage/messages"
    },
    {
      name: "トークン利用状況",
      href: "/admin/ai-usage/tokens",
      icon: BarChart3,
      current: pathname === "/admin/ai-usage/tokens"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-custom-black">AI利用状況</h1>
      </div>

      {/* タブナビゲーション */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  tab.current
                    ? 'border-custom-dark-gray text-custom-dark-gray'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <IconComponent className="w-4 h-4" />
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}