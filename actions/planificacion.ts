"use server"

import { prisma } from "@/lib/prisma"

export interface ConsumoMateriaPrima {
  codigo: string
  descripcion: string
  unidadMedida: string
  consumoMensual: { mes: string; cantidad: number }[]
  promedio6m: number
  promedio12m: number
  mismoMesAnioAnt: number | null
  proyeccionProxMes: number
  variacionPct: number | null  // vs mismo mes año anterior
}

export interface DemandaArticulo {
  codigo: string
  descripcion: string
  esElaborado: boolean
  ventasMensual: { mes: string; cantidad: number; neto: number }[]
  promedio6m: number
  promedio12m: number
  mismoMesAnioAnt: number | null
  proyeccionProxMes: number
  variacionPct: number | null
  esPico: boolean  // si proyección > promedio12m × 1.3
}

// ─── Helper: generar lista de últimos N meses ─────────────────────────────────

function generarMeses(n: number): string[] {
  const meses: string[] = []
  const hoy = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)  // ← sin el -1
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return meses
}

/** Etiqueta "YYYY-MM" (local) del mes al que pertenece una fecha. */
function mesDeFecha(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

// ─── Consumo de materias primas ───────────────────────────────────────────────

export async function getConsumoPrimasAction(): Promise<ConsumoMateriaPrima[]> {
  const meses12 = generarMeses(12)
  const desdeRango = new Date(`${meses12[0]}-01`)

  // Ventas de elaborados de TODO el rango en una sola query por fuente
  // (antes se hacía una query por mes × fuente = 36 round-trips).
  const [ventasCane, npCane, ventasLili, mapeos] = await Promise.all([
    prisma.bejVentaDet.findMany({
      where: { fecha: { gte: desdeRango } },
      select: { artCodigo: true, cantidad: true, fecha: true }
    }),
    prisma.bejNPDet.findMany({
      where: { fecha: { gte: desdeRango } },
      select: { artCodigo: true, cantidad: true, fecha: true }
    }),
    prisma.liliVentaDet.findMany({
      where: { fecha: { gte: desdeRango } },
      select: { artCodigo: true, cantidad: true, fecha: true }
    }),
    prisma.bejArticuloMapeo.findMany({
      where: { verificado: true },
      select: { codigoLili: true, codigoCane: true }
    })
  ])

  const liliACane = new Map(mapeos.map(m => [m.codigoLili, m.codigoCane]))

  // Ventas agrupadas en memoria por mes y artículo
  const ventasPorMesArt = new Map<string, Map<string, number>>()
  const sumarVenta = (mes: string, artCodigo: string, cantidad: number) => {
    if (!ventasPorMesArt.has(mes)) ventasPorMesArt.set(mes, new Map())
    const mesMap = ventasPorMesArt.get(mes)!
    mesMap.set(artCodigo, (mesMap.get(artCodigo) ?? 0) + cantidad)
  }

  ventasCane.forEach(v => sumarVenta(mesDeFecha(v.fecha), v.artCodigo, Number(v.cantidad)))
  npCane.forEach(v => sumarVenta(mesDeFecha(v.fecha), v.artCodigo, Number(v.cantidad)))
  ventasLili.forEach(v => {
    const cane = liliACane.get(v.artCodigo)
    if (cane) sumarVenta(mesDeFecha(v.fecha), cane, Number(v.cantidad))
  })

  // El "mismo mes, año anterior" respecto al mes próximo cae matemáticamente
  // siempre en meses12[0] (el mes más viejo de esta ventana de 12 meses),
  // así que se reutiliza en vez de volver a consultar la DB.
  const ventasAntMap = ventasPorMesArt.get(meses12[0]) ?? new Map<string, number>()

  // Fórmulas y componentes
  const producidos = await prisma.bejProdFormulaProducido.findMany({
    include: { prodFormula: { include: { componentes: true } } }
  })
  const artProdMap = new Map(producidos.map(p => [p.artCodigo, p]))

  // Artículos que son componentes
  const componentesCodigos = [...new Set(
    producidos.flatMap(p => p.prodFormula.componentes.map(c => c.componente))
  )]
  const artComponentes = await prisma.bejArticulo.findMany({
    where: { codigo: { in: componentesCodigos } },
    select: { codigo: true, descripcion: true }
  })
  const descMap = new Map(artComponentes.map(a => [a.codigo, a.descripcion.trim()]))

  // Calcular consumo por componente por mes
  const consumoPorComp = new Map<string, Map<string, number>>()

  for (const mes of meses12) {
    const mesVentas = ventasPorMesArt.get(mes) ?? new Map()

    for (const [artCodigo, cantVendida] of mesVentas) {
      const prod = artProdMap.get(artCodigo)
      if (!prod) continue

      const batch = Number(prod.prodFormula.batch) || 1
      prod.prodFormula.componentes.forEach(comp => {
        const consumoUnit = (Number(comp.cantidad) / batch) * cantVendida
        if (!consumoPorComp.has(comp.componente)) {
          consumoPorComp.set(comp.componente, new Map())
        }
        const compMes = consumoPorComp.get(comp.componente)!
        compMes.set(mes, (compMes.get(mes) ?? 0) + consumoUnit)
      })
    }
  }

  // Calcular consumo año anterior del mismo mes para proyección
  const consumoAntPorComp = new Map<string, number>()
  const mesVentasAnt = ventasAntMap
  for (const [artCodigo, cantVendida] of mesVentasAnt) {
    const prod = artProdMap.get(artCodigo)
    if (!prod) continue
    const batch = Number(prod.prodFormula.batch) || 1
    prod.prodFormula.componentes.forEach(comp => {
      const consumoUnit = (Number(comp.cantidad) / batch) * cantVendida
      consumoAntPorComp.set(comp.componente,
        (consumoAntPorComp.get(comp.componente) ?? 0) + consumoUnit)
    })
  }

  // Armar resultado
  const resultado: ConsumoMateriaPrima[] = []

  for (const [codigo, mesMapa] of consumoPorComp) {
    const consumoMensual = meses12.map(mes => ({
      mes,
      cantidad: mesMapa.get(mes) ?? 0
    }))

    const valores12 = consumoMensual.map(m => m.cantidad).filter(v => v > 0)
    const valores6 = consumoMensual.slice(-6).map(m => m.cantidad).filter(v => v > 0)

    const promedio12m = valores12.length > 0 ? valores12.reduce((a, b) => a + b, 0) / valores12.length : 0
    const promedio6m = valores6.length > 0 ? valores6.reduce((a, b) => a + b, 0) / valores6.length : 0

    const mismoMesAntCant = consumoAntPorComp.get(codigo) ?? null
    const proyeccion = mismoMesAntCant ?? promedio6m

    const variacionPct = mismoMesAntCant && promedio12m > 0
      ? ((mismoMesAntCant - promedio12m) / promedio12m) * 100
      : null

    resultado.push({
      codigo,
      descripcion: descMap.get(codigo) ?? codigo,
      unidadMedida: 'kg',
      consumoMensual,
      promedio6m,
      promedio12m,
      mismoMesAnioAnt: mismoMesAntCant,
      proyeccionProxMes: proyeccion,
      variacionPct,
    })
  }

  return resultado.sort((a, b) => b.proyeccionProxMes - a.proyeccionProxMes)
}

// ─── Demanda de artículos de venta directa ────────────────────────────────────

export async function getDemandaArticulosAction(): Promise<DemandaArticulo[]> {
  const meses12 = generarMeses(12)
  const desdeRango = new Date(`${meses12[0]}-01`)

  const mapeos = await prisma.bejArticuloMapeo.findMany({
    where: { verificado: true },
    select: { codigoLili: true, codigoCane: true }
  })
  const liliACane = new Map(mapeos.map(m => [m.codigoLili, m.codigoCane]))

  // Artículos con fórmula (elaborados)
  const producidos = await prisma.bejProdFormulaProducido.findMany({
    select: { artCodigo: true }
  })
  const elaboradosSet = new Set(producidos.map(p => p.artCodigo))

  // Ventas de TODO el rango en una sola query por fuente, agrupadas en
  // memoria por mes (antes: una query por mes × fuente = 36 round-trips).
  const [ventasCane, npCane, ventasLili] = await Promise.all([
    prisma.bejVentaDet.findMany({
      where: { fecha: { gte: desdeRango } },
      select: { artCodigo: true, cantidad: true, neto: true, fecha: true }
    }),
    prisma.bejNPDet.findMany({
      where: { fecha: { gte: desdeRango } },
      select: { artCodigo: true, cantidad: true, importeTotal: true, fecha: true }
    }),
    prisma.liliVentaDet.findMany({
      where: { fecha: { gte: desdeRango } },
      select: { artCodigo: true, cantidad: true, neto: true, fecha: true }
    }),
  ])

  const ventasPorMes = new Map<string, Map<string, { cantidad: number; neto: number }>>()
  const sumarVenta = (mes: string, artCodigo: string, cantidad: number, neto: number) => {
    if (!ventasPorMes.has(mes)) ventasPorMes.set(mes, new Map())
    const mesMap = ventasPorMes.get(mes)!
    const acumulado = mesMap.get(artCodigo) ?? { cantidad: 0, neto: 0 }
    acumulado.cantidad += cantidad
    acumulado.neto += neto
    mesMap.set(artCodigo, acumulado)
  }

  ventasCane.forEach(v => sumarVenta(mesDeFecha(v.fecha), v.artCodigo, Number(v.cantidad), Number(v.neto)))
  npCane.forEach(v => sumarVenta(mesDeFecha(v.fecha), v.artCodigo, Number(v.cantidad), Number(v.importeTotal)))
  ventasLili.forEach(v => {
    const cane = liliACane.get(v.artCodigo)
    if (cane) sumarVenta(mesDeFecha(v.fecha), cane, Number(v.cantidad), Number(v.neto))
  })

  // El "mismo mes, año anterior" respecto al mes próximo cae matemáticamente
  // siempre en meses12[0] (el mes más viejo de esta ventana de 12 meses),
  // así que se reutiliza en vez de volver a consultar la DB.
  const ventasMesMasViejo = ventasPorMes.get(meses12[0]) ?? new Map<string, { cantidad: number; neto: number }>()
  const antMap = new Map<string, number>()
  ventasMesMasViejo.forEach((v, art) => antMap.set(art, v.cantidad))

  // Artículos únicos con ventas
  const todosArts = new Set<string>()
  ventasPorMes.forEach(mesMap => mesMap.forEach((_, art) => todosArts.add(art)))

  const artInfo = await prisma.bejArticulo.findMany({
    where: { codigo: { in: [...todosArts] } },
    select: { codigo: true, descripcion: true }
  })
  const artDescMap = new Map(artInfo.map(a => [a.codigo, a.descripcion.trim()]))

  const resultado: DemandaArticulo[] = []

  for (const artCodigo of todosArts) {
    const ventasMensual = meses12.map(mes => {
      const d = ventasPorMes.get(mes)?.get(artCodigo)
      return { mes, cantidad: d?.cantidad ?? 0, neto: d?.neto ?? 0 }
    })

    const cantidades12 = ventasMensual.map(v => v.cantidad).filter(v => v > 0)
    const cantidades6 = ventasMensual.slice(-6).map(v => v.cantidad).filter(v => v > 0)

    const promedio12m = cantidades12.length > 0 ? cantidades12.reduce((a, b) => a + b, 0) / cantidades12.length : 0
    const promedio6m = cantidades6.length > 0 ? cantidades6.reduce((a, b) => a + b, 0) / cantidades6.length : 0

    const mismoMesAntCant = antMap.get(artCodigo) ?? null
    const proyeccion = mismoMesAntCant ?? promedio6m

    const variacionPct = mismoMesAntCant && promedio12m > 0
      ? ((mismoMesAntCant - promedio12m) / promedio12m) * 100
      : null

    resultado.push({
      codigo: artCodigo,
      descripcion: artDescMap.get(artCodigo) ?? artCodigo,
      esElaborado: elaboradosSet.has(artCodigo),
      ventasMensual,
      promedio6m,
      promedio12m,
      mismoMesAnioAnt: mismoMesAntCant,
      proyeccionProxMes: proyeccion,
      variacionPct,
      esPico: proyeccion > promedio12m * 1.3,
    })
  }

  return resultado
    .filter(a => a.promedio12m > 0)
    .sort((a, b) => b.proyeccionProxMes - a.proyeccionProxMes)
}
export async function exportarPlanificacionExcelAction(): Promise<{
  buffer: string
  filename: string
}> {
  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)
  const XLSX = require('xlsx')

  const [consumoPrimas, demandaArticulos] = await Promise.all([
    getConsumoPrimasAction(),
    getDemandaArticulosAction(),
  ])

  const wb = XLSX.utils.book_new()

  // ─── Hoja 1: Materias Primas ───────────────────────────────────────────────
  const mesesLabels = consumoPrimas[0]?.consumoMensual.map(m => formatMesExcel(m.mes)) ?? []

  const dataPrimas = consumoPrimas.map(p => {
    const fila: Record<string, any> = {
      'Código': p.codigo,
      'Descripción': p.descripcion,
      'Promedio 6m': redondear(p.promedio6m),
      'Promedio 12m': redondear(p.promedio12m),
      'Mismo mes año ant.': p.mismoMesAnioAnt !== null ? redondear(p.mismoMesAnioAnt) : '',
      'Proyección': redondear(p.proyeccionProxMes),
      'Variación %': p.variacionPct !== null ? redondear(p.variacionPct) : '',
    }
    p.consumoMensual.forEach((m, i) => {
      fila[mesesLabels[i]] = redondear(m.cantidad)
    })
    return fila
  })

  const wsPrimas = XLSX.utils.json_to_sheet(dataPrimas)
  wsPrimas['!cols'] = [
    { wch: 15 }, { wch: 40 }, { wch: 12 }, { wch: 12 },
    { wch: 18 }, { wch: 12 }, { wch: 12 },
    ...mesesLabels.map(() => ({ wch: 12 }))
  ]
  XLSX.utils.book_append_sheet(wb, wsPrimas, 'Materias Primas')

  // ─── Hoja 2: Artículos ─────────────────────────────────────────────────────
  const mesesLabelsArt = demandaArticulos[0]?.ventasMensual.map(m => formatMesExcel(m.mes)) ?? []

  const dataArticulos = demandaArticulos.map(a => {
    const fila: Record<string, any> = {
      'Código': a.codigo,
      'Descripción': a.descripcion,
      'Tipo': a.esElaborado ? 'Elaborado' : 'Directo',
      'Pico': a.esPico ? 'Sí' : '',
      'Promedio 6m': redondear(a.promedio6m),
      'Promedio 12m': redondear(a.promedio12m),
      'Mismo mes año ant.': a.mismoMesAnioAnt !== null ? redondear(a.mismoMesAnioAnt) : '',
      'Proyección': redondear(a.proyeccionProxMes),
      'Variación %': a.variacionPct !== null ? redondear(a.variacionPct) : '',
    }
    a.ventasMensual.forEach((m, i) => {
      fila[mesesLabelsArt[i]] = redondear(m.cantidad)
    })
    return fila
  })

  const wsArticulos = XLSX.utils.json_to_sheet(dataArticulos)
  wsArticulos['!cols'] = [
    { wch: 15 }, { wch: 40 }, { wch: 12 }, { wch: 6 },
    { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 },
    ...mesesLabelsArt.map(() => ({ wch: 12 }))
  ]
  XLSX.utils.book_append_sheet(wb, wsArticulos, 'Artículos')

  // ─── Generar buffer ────────────────────────────────────────────────────────
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
  const hoy = new Date()
  const fecha = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`

  return {
    buffer: base64 as string,
    filename: `planificacion_${fecha}.xlsx`
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMesExcel(m: string): string {
  const [anio, mes] = m.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${meses[parseInt(mes) - 1]} ${anio}`
}

function redondear(n: number): number {
  return Math.round(n * 10) / 10
}