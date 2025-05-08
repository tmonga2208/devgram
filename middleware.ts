import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// Add paths that require authentication
const protectedPaths = [
  '/settings',
  '/profile',
  '/messages',
  '/notifications',
  '/create-post',
  '/edit-profile'
]

// Add paths that should redirect to home if user is already authenticated
const authPaths = ['/login', '/signup', '/forgot-password']

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('token')
  const { pathname } = request.nextUrl

  // Check if the path requires authentication
  if (protectedPaths.some(path => pathname.startsWith(path))) {
    if (!token) {
      // Redirect to login page if no token is present
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }

    try {
      // Verify token
      const secret = new TextEncoder().encode(process.env.JWT_SECRET)
      await jwtVerify(token.value, secret)
    } catch {
      // Token is invalid or expired
      const response = NextResponse.redirect(new URL('/login', request.url))
      response.cookies.delete('token')
      return response
    }
  }

  // Redirect authenticated users away from auth pages
  if (authPaths.some(path => pathname.startsWith(path))) {
    if (token) {
      try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET)
        await jwtVerify(token.value, secret)
        return NextResponse.redirect(new URL('/', request.url))
      } catch {
        // Token is invalid, clear it
        const response = NextResponse.next()
        response.cookies.delete('token')
        return response
      }
    }
  }

  return NextResponse.next()
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
} 