// Extensión de los tipos de NextAuth para incluir id y rol
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id:    string;
      email: string;
      name:  string;
      role:  string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id:   string;
    role: string;
  }
}