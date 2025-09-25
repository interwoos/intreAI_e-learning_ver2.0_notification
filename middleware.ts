import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { recordFirstLogin } from '@/lib/notifications';

export async function middleware(request: NextRequest) {
  const res = NextResponse.next();
  
  // 開発ページへのアクセスは常に許可
  if (request.nextUrl.pathname === '/dev') {
    return NextResponse.next();
  }

  // ルートページへのアクセスを開発ページにリダイレクト
  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // ログインページと管理者ページは常に許可
  if (request.nextUrl.pathname === '/login' || 
      request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  // 認証が必要なページでのログイン許可チェック
  if (request.nextUrl.pathname.startsWith('/mypage') || 
      request.nextUrl.pathname.startsWith('/lecture')) {
    
    const supabase = createMiddlewareClient({ req: request, res });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      // 初回ログイン記録（非同期、エラーは無視）
      recordFirstLogin(session.user.id).catch(console.error);
      
      // ユーザーのログイン許可状況をチェック
      const { data: profile } = await supabase
        .from('profiles')
        .select('login_permission, role')
        .eq('id', session.user.id)
        .single();
      
      // 管理者は常にアクセス許可
      if (profile?.role === 'admin') {
        return NextResponse.next();
      }
      
      // 受講生のログイン許可チェック
      if (profile?.login_permission === false) {
        // ログイン停止中の場合はログインページにリダイレクト
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('error', 'login_disabled');
        return NextResponse.redirect(loginUrl);
      }
    }
  }
  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};