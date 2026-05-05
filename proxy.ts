// proxy.ts — en la RAÍZ del proyecto
import NextAuth from "next-auth"
import { authConfig } from "./auth/config"  // import relativo desde la raíz

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const isLoggedIn  = !!req.auth
  const isLoginPage = req.nextUrl.pathname.startsWith("/login")
  const isApiAuth   = req.nextUrl.pathname.startsWith("/api/auth")

  if (isApiAuth) return

  if (!isLoggedIn && !isLoginPage) {
    const loginUrl = new URL("/login", req.nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname)
    return Response.redirect(loginUrl)
  }

  if (isLoggedIn && isLoginPage) {
    return Response.redirect(new URL("/", req.nextUrl.origin))
  }
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)" ],
}