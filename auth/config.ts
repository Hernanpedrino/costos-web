// auth/config.ts
// Configuración de NextAuth separada para poder importarla en proxy.ts
import type { NextAuthConfig } from "next-auth"

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [], // los providers con bcrypt/prisma solo van en auth/index.ts
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id   = user.id
        token.role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      const user = session.user as unknown as { id: string; email: string; name: string; role: string }
      if (token) {
        user.id   = (token.id   as string) ?? ""
        user.role = (token.role as string) ?? ""
      }
      return session
    },
    authorized({ auth }) {
      return !!auth?.user
    },
  },
}