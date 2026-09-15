"use server"

// actions/produccion.ts
// Planilla de producción: carga diaria de producto / lote / cantidad.
// El procesamiento contra Bejerman va en un script aparte (scripts/crear-op.ts).

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { registrarAccion } from "@/lib/registrarAccion"
import { revalidatePath } from "next/cache"
import { getBejermanPool, crearOPparaLinea } from "@/lib/bejerman-op"

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LineaPlanilla {
  id: number
  productoCod: string
  productoDesc: string
  lote: string
  cantidad: number
  formulaCod: string | null
  ordenBej: number | null
  nroCompBej: string | null
  procesadaEn: Date | null
  error: string | null
}

export interface PlanillaDia {
  id: number | null
  fecha: string // YYYY-MM-DD
  estado: string
  observacion: string | null
  lineas: LineaPlanilla[]
}

export interface ProductoProducible {
  codigo: string
  descripcion: string
  formula: string
  cantProducida: number
}

export interface InsumoExplotado {
  componente: string
  descripcion: string
  cantidad: number
}
export interface ResultadoProceso {
  ok: number
  errores: { producto: string; error: string }[]
  detalle: string[]
}
type ActionResult = { success: true } | { success: false; error: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' → Date en UTC, para que no corra el día por timezone */
function fechaUTC(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

/** 'YYYY-MM-DD' → 'DDMMAAAA' (formato de lote normalizado) */
function loteDesdeISO(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}${m}${a}`
}

function hoyISO(): string {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`
}

// ─── GET: planilla de una fecha ───────────────────────────────────────────────

export async function getPlanillaAction(fechaISO?: string): Promise<PlanillaDia> {
  const iso = fechaISO ?? hoyISO()

  const planilla = await prisma.planillaProduccion.findUnique({
    where: { fecha: fechaUTC(iso) },
    include: { lineas: { orderBy: { orden: "asc" } } },
  })

  if (!planilla) {
    return { id: null, fecha: iso, estado: "borrador", observacion: null, lineas: [] }
  }

  return {
    id: planilla.id,
    fecha: iso,
    estado: planilla.estado,
    observacion: planilla.observacion,
    lineas: planilla.lineas.map(l => ({
      id: l.id,
      productoCod: l.productoCod,
      productoDesc: l.productoDesc,
      lote: l.lote,
      cantidad: Number(l.cantidad),
      formulaCod: l.formulaCod,
      ordenBej: l.ordenBej,
      nroCompBej: l.nroCompBej,
      procesadaEn: l.procesadaEn,
      error: l.error,
    })),
  }
}

// ─── GET: productos con fórmula vigente ───────────────────────────────────────

export async function buscarProductosAction(busqueda: string): Promise<ProductoProducible[]> {
  const q = busqueda.trim()
  if (q.length < 2) return []

  const rows = await prisma.$queryRaw<
    { codigo: string; descripcion: string; formula: string; cantProducida: number }[]
  >`
    SELECT a.codigo, a.descripcion, f.formula, p.cantidad AS cantProducida
    FROM bej_prod_formula_producidos p
    JOIN bej_prod_formulas f ON f.formula = p.formula AND f.vigente = 1
    JOIN bej_articulos a     ON a.codigo  = p.artCodigo
    WHERE a.esProducido = 1
      AND (a.codigo LIKE ${`%${q}%`} OR a.descripcion LIKE ${`%${q}%`})
    ORDER BY a.descripcion
    LIMIT 30
  `

  return rows.map(r => ({
    codigo: r.codigo,
    descripcion: r.descripcion,
    formula: r.formula,
    cantProducida: Number(r.cantProducida),
  }))
}

// ─── GET: explosión de fórmula ────────────────────────────────────────────────

export async function explotarFormulaAction(
  productoCod: string,
  cantidad: number,
): Promise<InsumoExplotado[]> {
  if (!productoCod || !Number.isFinite(cantidad) || cantidad <= 0) return []

  const rows = await prisma.$queryRaw<
    { componente: string; descripcion: string | null; cantComp: number; cantProducida: number }[]
  >`
    SELECT c.componente,
           ai.descripcion,
           c.cantidad AS cantComp,
           p.cantidad AS cantProducida
    FROM bej_prod_formula_producidos p
    JOIN bej_prod_formulas f     ON f.formula = p.formula AND f.vigente = 1
    JOIN bej_prod_formula_comp c ON c.formula = f.formula
    LEFT JOIN bej_articulos ai   ON ai.codigo = c.componente
    WHERE p.artCodigo = ${productoCod}
  `

  return rows.map(r => ({
    componente: r.componente,
    descripcion: r.descripcion ?? r.componente,
    cantidad: Number(r.cantComp) * (cantidad / Number(r.cantProducida)),
  }))
}

// ─── Alta de línea ────────────────────────────────────────────────────────────

export async function agregarLineaAction(input: {
  fechaISO: string
  productoCod: string
  productoDesc: string
  formulaCod: string
  loteISO: string // del date picker
  cantidad: string
}): Promise<ActionResult> {
  const session = await auth()
  const usuarioId = session?.user?.id ?? ""
  const usuario = session?.user?.name ?? session?.user?.email ?? "desconocido"

  const cantidad = Number(input.cantidad.replace(",", "."))
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return { success: false, error: "La cantidad debe ser un número mayor a cero." }
  }
  if (!input.productoCod) {
    return { success: false, error: "Elegí un producto." }
  }

  const fecha = fechaUTC(input.fechaISO)
  const lote = loteDesdeISO(input.loteISO)

  try {
    const planilla = await prisma.planillaProduccion.upsert({
      where: { fecha },
      create: { fecha, creadoPor: usuario },
      update: {},
      include: { lineas: { select: { orden: true } } },
    })

    const maxOrden = planilla.lineas.reduce((m, l) => Math.max(m, l.orden), 0)

    if (planilla.estado === "procesada") {
      await prisma.planillaProduccion.update({
        where: { id: planilla.id },
        data: { estado: "confirmada", procesadaEn: null },
      })
    }

    const linea = await prisma.planillaProduccionLinea.create({
      data: {
        planillaId: planilla.id,
        productoCod: input.productoCod,
        productoDesc: input.productoDesc,
        formulaCod: input.formulaCod,
        lote,
        cantidad,
        orden: maxOrden + 1,
      },
    })

    await registrarAccion({
      usuarioId,
      accion: "CREAR",
      entidad: "Produccion",
      entidadId: String(linea.id),
      detalle: { fecha: input.fechaISO, producto: input.productoCod, lote, cantidad },
    })

    revalidatePath("/produccion")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message ?? "Error al guardar la línea." }
  }
}

// ─── Edición de línea ─────────────────────────────────────────────────────────

export async function editarLineaAction(input: {
  id: number
  loteISO?: string
  cantidad?: string
}): Promise<ActionResult> {
  const session = await auth()
  const usuarioId = session?.user?.id ?? ""

  try {
    const linea = await prisma.planillaProduccionLinea.findUnique({
      where: { id: input.id },
      include: { planilla: true },
    })
    if (!linea) return { success: false, error: "No se encontró la línea." }
    if (linea.ordenBej) {
      return { success: false, error: "La línea ya se procesó en Bejerman, no se puede editar." }
    }

    const data: { lote?: string; cantidad?: number } = {}
    if (input.loteISO) data.lote = loteDesdeISO(input.loteISO)
    if (input.cantidad !== undefined) {
      const cantidad = Number(input.cantidad.replace(",", "."))
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        return { success: false, error: "La cantidad debe ser un número mayor a cero." }
      }
      data.cantidad = cantidad
    }

    await prisma.planillaProduccionLinea.update({ where: { id: input.id }, data })

    await registrarAccion({
      usuarioId,
      accion: "EDITAR",
      entidad: "Produccion",
      entidadId: String(input.id),
      detalle: { ...data },
    })

    revalidatePath("/produccion")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message ?? "Error al editar la línea." }
  }
}

// ─── Baja de línea ────────────────────────────────────────────────────────────

export async function eliminarLineaAction(id: number): Promise<ActionResult> {
  const session = await auth()
  const usuarioId = session?.user?.id ?? ""

  try {
    const linea = await prisma.planillaProduccionLinea.findUnique({
      where: { id },
      include: { planilla: true },
    })
    if (!linea) return { success: false, error: "No se encontró la línea." }
    if (linea.ordenBej) {
      return { success: false, error: "La línea ya se procesó en Bejerman, no se puede eliminar." }
    }

    await prisma.planillaProduccionLinea.delete({ where: { id } })

    await registrarAccion({
      usuarioId,
      accion: "ELIMINAR",
      entidad: "Produccion",
      entidadId: String(id),
      detalle: { producto: linea.productoCod, lote: linea.lote, cantidad: Number(linea.cantidad) },
    })

    revalidatePath("/produccion")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message ?? "Error al eliminar la línea." }
  }
}

// ─── Confirmar / reabrir ──────────────────────────────────────────────────────

/**
 * Marca la planilla como lista para procesar. Se puede repetir durante el día:
 * las líneas se van cargando a medida que se envasa, y cada confirmación deja
 * disponibles para el script las que todavía no tienen OP.
 */
export async function confirmarPlanillaAction(fechaISO: string): Promise<ActionResult> {
  const session = await auth()
  const usuarioId = session?.user?.id ?? ""

  try {
    const planilla = await prisma.planillaProduccion.findUnique({
      where: { fecha: fechaUTC(fechaISO) },
      include: { lineas: true },
    })
    if (!planilla) return { success: false, error: "No hay planilla para esa fecha." }

    const pendientes = planilla.lineas.filter(l => !l.ordenBej)
    if (pendientes.length === 0) {
      return { success: false, error: "No hay líneas pendientes de procesar." }
    }

    const sinFormula = pendientes.filter(l => !l.formulaCod)
    if (sinFormula.length > 0) {
      return {
        success: false,
        error: `Hay ${sinFormula.length} línea(s) sin fórmula: ${sinFormula.map(l => l.productoCod).join(", ")}`,
      }
    }

    await prisma.planillaProduccion.update({
      where: { id: planilla.id },
      data: { estado: "confirmada", confirmadaEn: new Date() },
    })

    await registrarAccion({
      usuarioId,
      accion: "EDITAR",
      entidad: "Produccion",
      entidadId: String(planilla.id),
      detalle: { evento: "confirmar", fecha: fechaISO, lineas: pendientes.length },
    })

    revalidatePath("/produccion")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message ?? "Error al confirmar la planilla." }
  }
}

/** Vuelve la planilla a borrador, solo si ninguna línea llegó a Bejerman */
export async function reabrirPlanillaAction(fechaISO: string): Promise<ActionResult> {
  const session = await auth()
  const usuarioId = session?.user?.id ?? ""

  try {
    const planilla = await prisma.planillaProduccion.findUnique({
      where: { fecha: fechaUTC(fechaISO) },
      include: { lineas: true },
    })
    if (!planilla) return { success: false, error: "No hay planilla para esa fecha." }

    const yaProcesadas = planilla.lineas.filter(l => l.ordenBej)
    if (yaProcesadas.length > 0) {
      return {
        success: false,
        error: `No se puede reabrir: ${yaProcesadas.length} línea(s) ya se crearon en Bejerman.`,
      }
    }

    await prisma.planillaProduccion.update({
      where: { id: planilla.id },
      data: { estado: "borrador", confirmadaEn: null },
    })

    await registrarAccion({
      usuarioId,
      accion: "EDITAR",
      entidad: "Produccion",
      entidadId: String(planilla.id),
      detalle: { evento: "reabrir", fecha: fechaISO },
    })

    revalidatePath("/produccion")
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message ?? "Error al reabrir la planilla." }
  }

}
export async function procesarPlanillaAction(fechaISO: string): Promise<
  { success: true; data: ResultadoProceso } | { success: false; error: string }
> {
  const session = await auth()
  const usuarioId = session?.user?.id ?? ""

  try {
    const planilla = await prisma.planillaProduccion.findUnique({
      where: { fecha: fechaUTC(fechaISO) },
      include: { lineas: { orderBy: { orden: "asc" } } },
    })
    if (!planilla) return { success: false, error: "No hay planilla para esa fecha." }
    if (planilla.estado === "borrador") {
      return { success: false, error: "Confirmá la planilla antes de procesarla." }
    }

    const pendientes = planilla.lineas.filter(l => !l.ordenBej)
    if (pendientes.length === 0) {
      return { success: false, error: "No hay líneas pendientes de procesar." }
    }

    const pool = await getBejermanPool()
    const detalle: string[] = []
    const errores: { producto: string; error: string }[] = []
    let ok = 0

    for (const l of pendientes) {
      try {
        const r = await crearOPparaLinea(
          pool,
          {
            id: l.id,
            productoCod: l.productoCod,
            productoDesc: l.productoDesc,
            lote: l.lote,
            cantidad: Number(l.cantidad),
            formulaCod: l.formulaCod,
          },
          fechaISO,
          { log: (m) => detalle.push(m) },
        )

        await prisma.planillaProduccionLinea.update({
          where: { id: l.id },
          data: {
            ordenBej: r.orden,
            nroCompBej: r.nroComp,
            procesadaEn: new Date(),
            error: null,
          },
        })
        ok++
      } catch (err: any) {
        const msg = err.message ?? String(err)
        errores.push({ producto: `${l.productoCod} — ${l.productoDesc}`, error: msg })
        await prisma.planillaProduccionLinea.update({
          where: { id: l.id }, data: { error: msg },
        })
      }
    }

    if (errores.length === 0) {
      await prisma.planillaProduccion.update({
        where: { id: planilla.id },
        data: { estado: "procesada", procesadaEn: new Date() },
      })
    }

    await registrarAccion({
      usuarioId,
      accion: "CREAR",
      entidad: "Produccion",
      entidadId: String(planilla.id),
      detalle: { evento: "procesar", fecha: fechaISO, ok, errores: errores.length },
    })

    revalidatePath("/produccion")
    return { success: true, data: { ok, errores, detalle } }
  } catch (e: any) {
    return { success: false, error: e.message ?? "Error al procesar la planilla." }
  }
}