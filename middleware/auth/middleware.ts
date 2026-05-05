// middleware.ts — en la RAÍZ del proyecto (junto a package.json)
// Protege todas las rutas excepto /login

import { auth } from "@/auth/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn   = !!req.auth;
  const isLoginPage  = req.nextUrl.pathname.startsWith("/login");

  if (!isLoggedIn && !isLoginPage) {
    // Redirigir a /login guardando la URL original para volver después
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isLoginPage) {
    // Si ya está logueado y va a /login, mandarlo al inicio
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Aplica el middleware a todas las rutas excepto archivos estáticos y api de NextAuth
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};