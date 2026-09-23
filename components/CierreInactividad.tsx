"use client"

import { useEffect } from "react"
import { signOut, useSession } from "next-auth/react"

// Tiene que coincidir con session.maxAge de auth/config.ts
const INACTIVIDAD_MS = 30 * 60 * 1000
const CHEQUEO_MS = 30_000
// No escribimos en localStorage en cada movimiento del mouse
const REGISTRO_MIN_MS = 15_000

const CLAVE = "costos-web:ultimaActividad"
const EVENTOS = ["pointerdown", "keydown", "scroll", "mousemove", "touchstart"] as const

const leerUltimaActividad = (): number => {
  try {
    return Number(localStorage.getItem(CLAVE)) || 0
  } catch {
    return 0
  }
}

const guardarUltimaActividad = (t: number) => {
  try {
    localStorage.setItem(CLAVE, String(t))
  } catch {
    // modo privado o storage bloqueado: queda solo el valor en memoria
  }
}

/**
 * Cierra la sesión tras 30 minutos sin interacción del usuario.
 *
 * No alcanza con el maxAge del JWT: proxy.ts renueva la cookie en cada
 * request, incluidos los refrescos automáticos (ej. el home cada 60 s), así
 * que una pestaña abierta la mantendría viva para siempre. Por eso la
 * inactividad se mide acá, solo con eventos reales del usuario, y se comparte
 * entre pestañas por localStorage: trabajar en una pestaña mantiene viva la
 * sesión de las demás.
 */
export function CierreInactividad() {
  const { status } = useSession()

  useEffect(() => {
    if (status !== "authenticated") return

    let ultima = Math.max(Date.now(), leerUltimaActividad())
    guardarUltimaActividad(ultima)

    const registrar = () => {
      const t = Date.now()
      if (t - ultima < REGISTRO_MIN_MS) return
      ultima = t
      guardarUltimaActividad(t)
    }

    const chequear = () => {
      ultima = Math.max(ultima, leerUltimaActividad())
      if (Date.now() - ultima >= INACTIVIDAD_MS) {
        signOut({ callbackUrl: `${window.location.origin}/login` })
      }
    }

    EVENTOS.forEach((e) => window.addEventListener(e, registrar, { passive: true }))
    // Al volver a la pestaña (o despertar la PC) se chequea en el momento
    document.addEventListener("visibilitychange", chequear)
    const id = setInterval(chequear, CHEQUEO_MS)

    return () => {
      EVENTOS.forEach((e) => window.removeEventListener(e, registrar))
      document.removeEventListener("visibilitychange", chequear)
      clearInterval(id)
    }
  }, [status])

  return null
}
