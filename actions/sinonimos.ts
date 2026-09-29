"use server"

// actions/sinonimos.ts
// Pantalla "Sinónimos del chat": cómo llaman los clientes a los artículos
// ("chinesca" → TRI0000004) y las búsquedas del chat que no encontraron nada.

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { buscarArticulos, normalizarTexto } from "@/lib/whatsapp/bejerman-lookup"

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string }

export interface SinonimoItem {
  id: number
  sinonimo: string
  artCodigo: string
  artDescripcion: string
  creadoPor: string
  creadoEn: string // ISO
}

export interface BusquedaSinResultado {
  textoNorm: string
  texto: string // la última vez que se escribió así
  veces: number
  clientes: number
  ultima: string // ISO
}

export interface ArticuloOpcion {
  codigo: string
  descripcion: string
}

// Cuántos días hacia atrás se miran las búsquedas sin resultado.
const DIAS_BUSQUEDAS = 60
const MAX_BUSQUEDAS = 50

async function usuarioActual(): Promise<string | null> {
  const session = await auth()
  return session?.user?.name ?? session?.user?.email ?? null
}

// ─── Búsquedas sin resultado ──────────────────────────────────────────────────

export async function getBusquedasSinResultadoAction(): Promise<BusquedaSinResultado[]> {
  const desde = new Date(Date.now() - DIAS_BUSQUEDAS * 24 * 60 * 60 * 1000)
  const filas = await prisma.busquedaWhatsApp.findMany({
    where: { resultados: 0, descartada: false, creadoEn: { gte: desde } },
    orderBy: { creadoEn: "desc" },
    select: { textoNorm: true, texto: true, telefono: true, creadoEn: true },
  })

  const grupos = new Map<string, { texto: string; veces: number; telefonos: Set<string>; ultima: Date }>()
  for (const f of filas) {
    const g = grupos.get(f.textoNorm)
    if (g) {
      g.veces++
      g.telefonos.add(f.telefono)
    } else {
      grupos.set(f.textoNorm, { texto: f.texto, veces: 1, telefonos: new Set([f.telefono]), ultima: f.creadoEn })
    }
  }

  const ordenadas = [...grupos.entries()]
    .sort((a, b) => b[1].veces - a[1].veces || b[1].ultima.getTime() - a[1].ultima.getTime())
    .slice(0, MAX_BUSQUEDAS)

  // Las que ahora sí encuentran algo (por un sinónimo nuevo) ya no se muestran.
  const pendientes: BusquedaSinResultado[] = []
  for (const [textoNorm, g] of ordenadas) {
    const { totalCoincidencias } = await buscarArticulos(g.texto, 1)
    if (totalCoincidencias > 0) continue
    pendientes.push({ textoNorm, texto: g.texto, veces: g.veces, clientes: g.telefonos.size, ultima: g.ultima.toISOString() })
  }
  return pendientes
}

/** "No es un producto" (ej. un saludo raro, una pregunta): deja de aparecer. */
export async function descartarBusquedaAction(textoNorm: string): Promise<ActionResult> {
  if (!(await usuarioActual())) return { success: false, error: "Tu sesión venció. Volvé a ingresar." }
  await prisma.busquedaWhatsApp.updateMany({ where: { textoNorm }, data: { descartada: true } })
  revalidatePath("/sinonimos")
  return { success: true, data: undefined }
}

// ─── Sinónimos ────────────────────────────────────────────────────────────────

export async function getSinonimosAction(): Promise<SinonimoItem[]> {
  const filas = await prisma.articuloSinonimo.findMany({
    orderBy: [{ sinonimoNorm: "asc" }, { artCodigo: "asc" }],
    include: { articulo: { select: { descripcion: true } } },
  })
  return filas.map((s) => ({
    id: s.id,
    sinonimo: s.sinonimo,
    artCodigo: s.artCodigo,
    artDescripcion: s.articulo.descripcion,
    creadoPor: s.creadoPor,
    creadoEn: s.creadoEn.toISOString(),
  }))
}

/** Buscador de artículos para asignar: por código o por palabras de la descripción. */
export async function buscarArticulosSinonimoAction(busqueda: string): Promise<ArticuloOpcion[]> {
  const palabras = busqueda.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return []
  return prisma.bejArticulo.findMany({
    where: {
      esVendido: true,
      OR: [
        { codigo: { startsWith: busqueda.trim().toUpperCase() } },
        { AND: palabras.map((p) => ({ descripcion: { contains: p } })) },
      ],
    },
    select: { codigo: true, descripcion: true },
    orderBy: { codigo: "asc" },
    take: 20,
  })
}

export async function agregarSinonimoAction(sinonimo: string, codigos: string[]): Promise<ActionResult<number>> {
  const usuario = await usuarioActual()
  if (!usuario) return { success: false, error: "Tu sesión venció. Volvé a ingresar." }

  const texto = sinonimo.trim().replace(/\s+/g, " ")
  const norm = normalizarTexto(texto)
  if (norm.length < 2) return { success: false, error: "Escribí el sinónimo (al menos 2 letras)." }
  if (texto.length > 80) return { success: false, error: "El sinónimo puede tener hasta 80 caracteres." }
  const unicos = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))]
  if (unicos.length === 0) return { success: false, error: "Elegí al menos un artículo." }

  const existentes = await prisma.bejArticulo.count({ where: { codigo: { in: unicos } } })
  if (existentes !== unicos.length) return { success: false, error: "Alguno de los artículos ya no existe." }

  const r = await prisma.articuloSinonimo.createMany({
    data: unicos.map((artCodigo) => ({ sinonimo: texto, sinonimoNorm: norm, artCodigo, creadoPor: usuario.slice(0, 60) })),
    skipDuplicates: true,
  })
  revalidatePath("/sinonimos")
  return { success: true, data: r.count }
}

export async function eliminarSinonimoAction(id: number): Promise<ActionResult> {
  if (!(await usuarioActual())) return { success: false, error: "Tu sesión venció. Volvé a ingresar." }
  await prisma.articuloSinonimo.delete({ where: { id } }).catch(() => null)
  revalidatePath("/sinonimos")
  return { success: true, data: undefined }
}
