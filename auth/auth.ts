import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import * as z from "zod";

// Schema de validación de las credenciales recibidas
const credencialesSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // JWT stateless — no necesita tabla Session en la DB
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login", // redirige acá si no está autenticado
  },

  providers: [
    Credentials({
      async authorize(credentials) {
        // 1. Validar formato con zod antes de tocar la DB
        const parsed = credencialesSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // 2. Buscar el usuario en la DB
        const usuario = await prisma.usuario.findUnique({
          where: { email },
        });

        // 3. Verificar que existe, está activo y la contraseña es correcta
        if (!usuario || !usuario.activo) return null;

        const passwordOk = await bcrypt.compare(password, usuario.password);
        if (!passwordOk) return null;

        // 4. Devolver el objeto que se guarda en el token JWT
        return {
          id:     usuario.id,
          email:  usuario.email,
          name:   usuario.nombre,
          role:   usuario.rol,
        };
      },
    }),
  ],

  callbacks: {
    // Agregar rol e id al token JWT
    async jwt({ token, user }) {
      if (user) {
        token.id   = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    // Exponer id y rol en la session del cliente
    async session({ session, token }) {
      if (token) {
        session.user.id   = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
});