// auth.ts — en la RAÍZ del proyecto
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import * as z from "zod"

const credencialesSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
  },

  providers: [
    Credentials({
      credentials: {
        email:    { label: "Email",      type: "email"    },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        // Validar que credentials no sea undefined antes de parsear
        if (!credentials?.email || !credentials?.password) return null

        const parsed = credencialesSchema.safeParse({
          email:    String(credentials.email),
          password: String(credentials.password),
        })
        if (!parsed.success) return null

        const { email, password } = parsed.data

        const usuario = await prisma.usuario.findUnique({ where: { email } })
        if (!usuario || !usuario.activo) return null

        const passwordOk = await bcrypt.compare(password, usuario.password)
        if (!passwordOk) return null

        return {
          id:    usuario.id,
          email: usuario.email,
          name:  usuario.nombre,
          role:  usuario.rol,
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id   = user.id
        token.role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id   = (token.id   as string) ?? ""
        session.user.role = (token.role as string) ?? ""
      }
      return session
    },
  },
})