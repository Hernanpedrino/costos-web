import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id:    string
      email: string
      name:  string
      role:  string
    }
  }

  // Declarar role en User para que el callback session lo reconozca
  interface User {
    id?:   string
    role?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?:   string
    role?: string
  }
}