
import type { NextAuthConfig } from "next-auth"

export const authConfig: NextAuthConfig = {
  session: {
    strategy: "jwt",
    // 30 min desde el último request (proxy.ts renueva la cookie en cada uno).
    // Cubre el navegador cerrado; la inactividad con la pestaña abierta la
    // controla components/CierreInactividad.tsx.
    maxAge: 30 * 60,
  },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [], // los providers con bcrypt/prisma solo van en auth/index.ts
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      const user = session.user as unknown as { id: string; email: string; name: string; role: string }
      if (token) {
        user.id = (token.id as string) ?? ""
        user.role = (token.role as string) ?? ""
      }
      return session
    },
    authorized({ auth }) {
      return !!auth?.user
    },
  },
}