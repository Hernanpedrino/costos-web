"use client"
import { SessionProvider } from "next-auth/react"
import { CierreInactividad } from "@/components/CierreInactividad"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CierreInactividad />
      {children}
    </SessionProvider>
  )
}
