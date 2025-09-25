"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function DevNavigation() {
  const routes = [
    {
      name: "管理者ダッシュボード",
      path: "/admin",
      description: "管理者向けのダッシュボード画面"
    },
    {
      name: "ログイン",
      path: "/login",
      description: "ユーザーログイン画面"
    },
    {
      name: "マイページ",
      path: "/mypage",
      description: "ユーザーマイページ"
    },
    {
      name: "第1回講義",
      path: "/lecture/1",
      description: "第1回講義ページ"
    },
    {
      name: "第2回講義",
      path: "/lecture/2",
      description: "第2回講義ページ"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">開発ナビゲーション</h1>
            <p className="text-gray-600">
              開発中の全ページにアクセスできます
            </p>
          </div>

          <div className="grid gap-4">
            {routes.map((route) => (
              <Card key={route.path} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800 mb-1">
                      {route.name}
                    </h2>
                    <p className="text-sm text-gray-600">
                      {route.description}
                    </p>
                  </div>
                  <Link href={route.path}>
                    <Button variant="outline" className="flex items-center gap-2">
                      アクセス
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}