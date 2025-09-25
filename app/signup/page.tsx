"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement actual login logic with auth check
    // 仮実装: 管理者アカウントの場合は管理者ページへ、それ以外は受講者マイページへ
    if (email === "nowstart0723@gmail.com" && password === "kazukazu") {
      router.push("/admin");
    } else {
      router.push("/mypage");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-custom-light-gray to-white">
      <div className="w-full max-w-[440px] p-8 bg-white rounded-2xl shadow-lg">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-8">
            <Image 
              src="/images/logo.png" 
              alt="InterWoos Logo" 
              width={240} 
              height={80} 
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-custom-black mb-2">ログイン</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-sm text-custom-black">
              メールアドレス
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-custom-dark-gray focus:border-transparent"
              placeholder="example@email.com"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-custom-black">
              パスワード
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-custom-dark-gray focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full h-12 bg-custom-dark-gray hover:bg-[#2a292a] text-white font-medium rounded-lg transition-colors"
          >
            ログイン
          </Button>

          <div className="flex flex-col items-center gap-4 pt-8">
            <Link
              href="/forgot-password"
              className="text-sm text-custom-dark-gray hover:text-[#2a292a] transition-colors"
            >
              パスワードを忘れた場合
            </Link>
            <Link
              href="/help"
              className="text-sm text-custom-dark-gray hover:text-[#2a292a] transition-colors"
            >
              ログインできない場合
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}