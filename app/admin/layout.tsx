"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { UserMenu } from "@/components/ui/user-menu";
import { Toaster } from "sonner";
import {
  Users,
  Calendar,
  BookOpen,
  FileText,
  Settings,
  BarChart3,
  Home,
  Bot,
  ChevronDown,
  Bug,
} from "lucide-react";

interface Profile {
  id: string;
  full_name: string | null;
  role: "student" | "admin";
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLectureDropdownOpen, setIsLectureDropdownOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAuth = async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", user.id)
        .single();

      if (profileError || !profileData) {
        router.push("/login");
        return;
      }

      if (profileData.role !== "admin") {
        router.push("/mypage");
        return;
      }

      setProfile(profileData);
    } catch (error) {
      console.error("Auth check error:", error);
      router.push("/login");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">読み込み中...</div>
      </div>
    );
  }

  if (!profile) return null;

  const navigationItems = [
    {
      name: "管理ダッシュボード",
      href: "/admin",
      icon: Home,
      current: pathname === "/admin",
    },
    {
      name: "受講者管理",
      href: "/admin/students",
      icon: Users,
      current: pathname === "/admin/students",
    },
    {
      name: "課題提出状況",
      href: "/admin/submissions",
      icon: BarChart3,
      current: pathname === "/admin/submissions",
    },
    {
      name: "AI利用状況",
      href: "/admin/ai-usage/messages",
      icon: Bot,
      current: pathname.startsWith("/admin/ai-usage"),
    },
  ];

  return (
    <div className="min-h-screen bg-custom-light-gray">
      <Toaster />
      <div className="flex">
        {/* サイドバー */}
        <div className="w-64 bg-white border-r border-gray-200 min-h-screen">
          <div className="p-6">
            <h1 className="text-xl font-bold text-custom-black">管理画面</h1>
          </div>
          <nav className="px-4 space-y-2">
            {navigationItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    item.current
                      ? "bg-custom-dark-gray text-white"
                      : "text-gray-600 hover:text-custom-black hover:bg-gray-100"
                  }`}
                >
                  <IconComponent className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* メインコンテンツ */}
        <div className="flex-1">
          <header className="bg-white border-b border-gray-200">
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">管理者</span>
                <span className="text-sm font-medium text-custom-black">
                  {profile.full_name}
                </span>
              </div>
              <UserMenu name={profile.full_name || ""} isAdmin={true} />
            </div>
          </header>
          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}