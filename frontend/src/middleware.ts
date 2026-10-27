import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root: public home for logged-out visitors; signed-in users go to dashboard.
  if (pathname === '/') {
    if (request.cookies.has('duka_refresh')) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // /login alias: rewrite to /auth/login (keeps URL in browser)
  if (pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.rewrite(url);
  }

  // First-run setup is available at /auth/setup. The API itself refuses a
  // second setup, so this page is safe on an already-configured shop.
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login'],
};
