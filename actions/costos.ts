"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Prisma } from "@/generated/prisma"

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CategoriaConRegistro {
  id:          string
  nombre:      string
  tipo:        'FIJO' | 'VARIABLE'
  orden:       number
  importe:     number | null
  registroId:  string | null
  nota:        string | null
}

export interface ResumenPeriodo {
  periodo:      string
  totalFijo:    number
  totalVariable: number
  total:        number
  categorias:   CategoriaConRegistro[]
}

export interface EvolucionMes {
  periodo:      string
  totalFijo:    number
  totalVariable: number
  total:        number
}

// ─── GET: categorías con registros de un período ──────────────────────────────

export async function getCostosPeriodoAction(periodo: string): Promise<ResumenPeriodo> {
  const [categorias, registros] = await Promise.all([
    prisma.costoCategoria.findMany({
      where:   { activo: true },
      orderBy: { orden: 'asc' }
    }),
    prisma.costoRegistro.findMany({
      where: { periodo }
    })
  ])

  const registroMap = new Map(registros.map(r => [r.categoriaId, r]))

  const cats: CategoriaConRegistro[] = categorias.map(c => {
    const reg = registroMap.get(c.id)
    return {
      id:         c.id,
      nombre:     c.nombre,
      tipo:       c.tipo,
      orden:      c.orden,
      importe:    reg ? Number(reg.importe) : null,
      registroId: reg?.id ?? null,
      nota:       reg?.nota ?? null,
    }
  })

  const totalFijo     = cats.filter(c => c.tipo === 'FIJO').reduce((t, c) => t + (c.importe ?? 0), 0)
  const totalVariable = cats.filter(c => c.tipo === 'VARIABLE').reduce((t, c) => t + (c.importe ?? 0), 0)

  return {
    periodo,
    totalFijo,
    totalVariable,
    total: totalFijo + totalVariable,
    categorias: cats,
  }
}

// ─── GET: evolución de últimos N meses ───────────────────────────────────────

export async function getEvolucionCostosAction(meses: number = 12): Promise<EvolucionMes[]> {
  const periodos: string[] = []
  const hoy = new Date()
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    periodos.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const [categorias, registros] = await Promise.all([
    prisma.costoCategoria.findMany({ where: { activo: true }, select: { id: true, tipo: true } }),
    prisma.costoRegistro.findMany({
      where:   { periodo: { in: periodos } },
      select:  { periodo: true, importe: true, categoriaId: true }
    })
  ])

  const tipoMap = new Map(categorias.map(c => [c.id, c.tipo]))

  return periodos.map(periodo => {
    const regs = registros.filter(r => r.periodo === periodo)
    const totalFijo     = regs.filter(r => tipoMap.get(r.categoriaId) === 'FIJO').reduce((t, r) => t + Number(r.importe), 0)
    const totalVariable = regs.filter(r => tipoMap.get(r.categoriaId) === 'VARIABLE').reduce((t, r) => t + Number(r.importe), 0)
    return { periodo, totalFijo, totalVariable, total: totalFijo + totalVariable }
  })
}

// ─── UPSERT: guardar importe de una categoría en un período ──────────────────

export async function guardarCostoAction(data: {
  categoriaId: string
  periodo:     string
  importe:     string
  nota?:       string
}): Promise<ActionResult<null>> {
  try {
    const importe = parseFloat(data.importe)
    if (isNaN(importe) || importe < 0) {
      return { success: false, error: 'El importe debe ser un número positivo.' }
    }

    await prisma.costoRegistro.upsert({
      where:  { categoriaId_periodo: { categoriaId: data.categoriaId, periodo: data.periodo } },
      update: { importe: new Prisma.Decimal(importe), nota: data.nota ?? null },
      create: {
        categoriaId: data.categoriaId,
        periodo:     data.periodo,
        importe:     new Prisma.Decimal(importe),
        nota:        data.nota ?? null,
      }
    })

    revalidatePath('/costos')
    return { success: true, data: null }
  } catch (err) {
    console.error('[guardarCostoAction]', err)
    return { success: false, error: 'Error al guardar el costo.' }
  }
}

// ─── CREATE: nueva categoría ──────────────────────────────────────────────────

export async function crearCategoriaAction(data: {
  nombre:      string
  tipo:        'FIJO' | 'VARIABLE'
  descripcion?: string
}): Promise<ActionResult<null>> {
  try {
    const maxOrden = await prisma.costoCategoria.aggregate({ _max: { orden: true } })
    await prisma.costoCategoria.create({
      data: {
        nombre:      data.nombre,
        tipo:        data.tipo,
        descripcion: data.descripcion ?? null,
        orden:       (maxOrden._max.orden ?? 0) + 1,
      }
    })
    revalidatePath('/costos')
    return { success: true, data: null }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { success: false, error: 'Ya existe una categoría con ese nombre.' }
    }
    return { success: false, error: 'Error al crear la categoría.' }
  }
}

// ─── GET: períodos disponibles ────────────────────────────────────────────────

export async function getPeriodosDisponiblesAction(): Promise<string[]> {
  const registros = await prisma.costoRegistro.findMany({
    distinct: ['periodo'],
    select:   { periodo: true },
    orderBy:  { periodo: 'desc' }
  })
  return registros.map(r => r.periodo)
}

// ─── GET: prorrateo de costos operativos por artículo ────────────────────────

export async function getProrrateoAction(periodo: string): Promise<{
  totalCostos: number
  totalFacturacion: number
  pctSobreVentas: number
}> {
  // Total costos del período
  const registros = await prisma.costoRegistro.findMany({
    where:  { periodo },
    select: { importe: true }
  })
  const totalCostos = registros.reduce((t, r) => t + Number(r.importe), 0)

  // Facturación del período
  const [anio, mes] = periodo.split('-').map(Number)
  const desde = new Date(anio, mes - 1, 1)
  const hasta = new Date(anio, mes, 1)

  const ventas = await prisma.bejVentaDet.aggregate({
    where:  { fecha: { gte: desde, lt: hasta } },
    _sum:   { neto: true }
  })
  const totalFacturacion = Number(ventas._sum.neto ?? 0)

  return {
    totalCostos,
    totalFacturacion,
    pctSobreVentas: totalFacturacion > 0 ? (totalCostos / totalFacturacion) * 100 : 0,
  }
}