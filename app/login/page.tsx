"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // URLパラメータからエラーメッセージを取得
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'login_disabled') {
      setError('現在ログインが停止されています。管理者にお問い合わせください。');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        switch (authError.message) {
          case "Invalid login credentials":
            throw new Error("メールアドレスまたはパスワードが正しくありません");
          case "Email not confirmed":
            throw new Error("メールアドレスが確認されていません");
          default:
            throw authError;
        }
      }

      if (!authData.user) {
        throw new Error("ユーザー情報の取得に失敗しました");
      }

      // プロフィール情報を取得
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, login_permission')
        .eq('id', authData.user.id)
        .single();

      if (profileError) {
        throw new Error("プロフィール情報の取得に失敗しました");
      }

      // ログイン許可チェック（管理者は除外）
      if (profile.role !== 'admin' && profile.login_permission === false) {
        await supabase.auth.signOut(); // 即座にサインアウト
        throw new Error("現在ログインが停止されています。管理者にお問い合わせください。");
      }

      // ロールに基づいてリダイレクト
      if (profile.role === 'admin') {
        router.push('/admin');
      } else {
        // 初回ログイン記録（コード主導通知）
        if (!profile.first_login_at) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            fetch('/api/notifications/first-login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`
              },
              body: JSON.stringify({ userId: authData.user.id })
            }).catch(err => console.error('❌ 初回ログイン通知エラー:', err));
          } catch (notificationError) {
            console.error('❌ 初回ログイン通知準備エラー:', notificationError);
          }
        }
        router.push('/mypage');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-custom-light-gray to-white">
      <div className="w-full max-w-[440px] p-8 bg-white rounded-2xl shadow-lg">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-8">
            <Image 
              src="/images/logo.png" 
              alt="Logo" 
              width={240} 
              height={80} 
              priority
              className="w-auto h-auto"
            />
          </div>
          <h1 className="text-2xl font-bold text-custom-black mb-2">ログイン</h1>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

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
              disabled={isLoading}
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
              disabled={isLoading}
            />
          </div>

          <Button
            type="submit"
            className="w-full h-12 bg-custom-dark-gray hover:bg-[#2a292a] text-white font-medium rounded-lg transition-colors"
            disabled={isLoading}
          >
            {isLoading ? "ログイン中..." : "ログイン"}
          </Button>
        </form>
      </div>
    </div>
  );
}