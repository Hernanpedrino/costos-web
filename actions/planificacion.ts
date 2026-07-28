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

function mesAnioAnterior(mes: string): string {
  const [anio, m] = mes.split('-').map(Number)
  return `${anio - 1}-${String(m).padStart(2, '0')}`
}

function proxMes(): string {
  const hoy = new Date()
  const d = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── Consumo de materias primas ───────────────────────────────────────────────

export async function getConsumoPrimasAction(): Promise<ConsumoMateriaPrima[]> {
  const meses12 = generarMeses(12)
  const meses6 = meses12.slice(-6)
  const proximo = proxMes()
  const mismoMesAnt = mesAnioAnterior(proximo)

  // Ventas de elaborados por mes (CANE + NP + LILI)
  const [ventasCane, npCane, ventasLili, mapeos] = await Promise.all([
    prisma.bejVentaDet.groupBy({
      by: ['artCodigo'],
      where: { fecha: { gte: new Date(`${meses12[0]}-01`) } },
      _sum: { cantidad: true }
    }),
    prisma.bejNPDet.groupBy({
      by: ['artCodigo'],
      where: { fecha: { gte: new Date(`${meses12[0]}-01`) } },
      _sum: { cantidad: true }
    }),
    prisma.liliVentaDet.groupBy({
      by: ['artCodigo'],
      where: { fecha: { gte: new Date(`${meses12[0]}-01`) } },
      _sum: { cantidad: true }
    }),
    prisma.bejArticuloMapeo.findMany({
      where: { verificado: true },
      select: { codigoLili: true, codigoCane: true }
    })
  ])

  // Ventas mensuales por artículo elaborado
  const liliACane = new Map(mapeos.map(m => [m.codigoLili, m.codigoCane]))

  // Necesitamos ventas MES A MES — hacer query por mes
  const ventasPorMesArt = new Map<string, Map<string, number>>()

  for (const mes of meses12) {
    const [anioM, mesM] = mes.split('-').map(Number)
    const desde = new Date(Date.UTC(anioM, mesM - 1, 1))
    const hasta = new Date(Date.UTC(anioM, mesM, 1))

    const [vc, np, vl] = await Promise.all([
      prisma.bejVentaDet.groupBy({
        by: ['artCodigo'],
        where: { fecha: { gte: desde, lt: hasta } },
        _sum: { cantidad: true }
      }),
      prisma.bejNPDet.groupBy({
        by: ['artCodigo'],
        where: { fecha: { gte: desde, lt: hasta } },
        _sum: { cantidad: true }
      }),
      prisma.liliVentaDet.groupBy({
        by: ['artCodigo'],
        where: { fecha: { gte: desde, lt: hasta } },
        _sum: { cantidad: true }
      }),
    ])

    const mesMap = new Map<string, number>()
    vc.forEach(v => mesMap.set(v.artCodigo, (mesMap.get(v.artCodigo) ?? 0) + Number(v._sum.cantidad ?? 0)))
    np.forEach(v => mesMap.set(v.artCodigo, (mesMap.get(v.artCodigo) ?? 0) + Number(v._sum.cantidad ?? 0)))
    vl.forEach(v => {
      const cane = liliACane.get(v.artCodigo)
      if (cane) mesMap.set(cane, (mesMap.get(cane) ?? 0) + Number(v._sum.cantidad ?? 0))
    })
    ventasPorMesArt.set(mes, mesMap)
  }

  // Mismo mes año anterior
  const [anioAnt, mesAnt] = mismoMesAnt.split('-').map(Number)
  const mismoMesDesde = new Date(Date.UTC(anioAnt, mesAnt - 1, 1))
  const mismoMesHasta = new Date(Date.UTC(anioAnt, mesAnt, 1))
  const [vcAnt, npAnt, vlAnt] = await Promise.all([
    prisma.bejVentaDet.groupBy({
      by: ['artCodigo'],
      where: { fecha: { gte: mismoMesDesde, lt: mismoMesHasta } },
      _sum: { cantidad: true }
    }),
    prisma.bejNPDet.groupBy({
      by: ['artCodigo'],
      where: { fecha: { gte: mismoMesDesde, lt: mismoMesHasta } },
      _sum: { cantidad: true }
    }),
    prisma.liliVentaDet.groupBy({
      by: ['artCodigo'],
      where: { fecha: { gte: mismoMesDesde, lt: mismoMesHasta } },
      _sum: { cantidad: true }
    }),
  ])
  const ventasAntMap = new Map<string, number>()
  vcAnt.forEach(v => ventasAntMap.set(v.artCodigo, (ventasAntMap.get(v.artCodigo) ?? 0) + Number(v._sum.cantidad ?? 0)))
  npAnt.forEach(v => ventasAntMap.set(v.artCodigo, (ventasAntMap.get(v.artCodigo) ?? 0) + Number(v._sum.cantidad ?? 0)))
  vlAnt.forEach(v => {
    const cane = liliACane.get(v.artCodigo)
    if (cane) ventasAntMap.set(cane, (ventasAntMap.get(cane) ?? 0) + Number(v._sum.cantidad ?? 0))
  })

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
  const proximo = proxMes()
  const mismoMesAnt = mesAnioAnterior(proximo)

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

  // Ventas mensuales
  const ventasPorMes = new Map<string, Map<string, { cantidad: number; neto: number }>>()

  for (const mes of meses12) {
    const [anioM, mesM] = mes.split('-').map(Number)
    const desde = new Date(Date.UTC(anioM, mesM - 1, 1))
    const hasta = new Date(Date.UTC(anioM, mesM, 1))

    const [vc, np, vl] = await Promise.all([
      prisma.bejVentaDet.groupBy({
        by: ['artCodigo'],
        where: { fecha: { gte: desde, lt: hasta } },
        _sum: { cantidad: true, neto: true }
      }),
      prisma.bejNPDet.groupBy({
        by: ['artCodigo'],
        where: { fecha: { gte: desde, lt: hasta } },
        _sum: { cantidad: true, importeTotal: true }
      }),
      prisma.liliVentaDet.groupBy({
        by: ['artCodigo'],
        where: { fecha: { gte: desde, lt: hasta } },
        _sum: { cantidad: true, neto: true }
      }),
    ])

    const mesMap = new Map<string, { cantidad: number; neto: number }>()
    vc.forEach(v => {
      const c = mesMap.get(v.artCodigo) ?? { cantidad: 0, neto: 0 }
      c.cantidad += Number(v._sum.cantidad ?? 0)
      c.neto += Number(v._sum.neto ?? 0)
      mesMap.set(v.artCodigo, c)
    })
    np.forEach(v => {
      const c = mesMap.get(v.artCodigo) ?? { cantidad: 0, neto: 0 }
      c.cantidad += Number(v._sum.cantidad ?? 0)
      c.neto += Number(v._sum.importeTotal ?? 0)
      mesMap.set(v.artCodigo, c)
    })
    vl.forEach(v => {
      const cane = liliACane.get(v.artCodigo)
      if (!cane) return
      const c = mesMap.get(cane) ?? { cantidad: 0, neto: 0 }
      c.cantidad += Number(v._sum.cantidad ?? 0)
      c.neto += Number(v._sum.neto ?? 0)
      mesMap.set(cane, c)
    })
    ventasPorMes.set(mes, mesMap)
  }

  // Mismo mes año anterior
  const [anioAnt, mesAnt] = mismoMesAnt.split('-').map(Number)
  const mismoMesDesde = new Date(Date.UTC(anioAnt, mesAnt - 1, 1))
  const mismoMesHasta = new Date(Date.UTC(anioAnt, mesAnt, 1))
  const [vcAnt, npAnt, vlAnt] = await Promise.all([
    prisma.bejVentaDet.groupBy({
      by: ['artCodigo'],
      where: { fecha: { gte: mismoMesDesde, lt: mismoMesHasta } },
      _sum: { cantidad: true, neto: true }
    }),
    prisma.bejNPDet.groupBy({
      by: ['artCodigo'],
      where: { fecha: { gte: mismoMesDesde, lt: mismoMesHasta } },
      _sum: { cantidad: true, importeTotal: true }
    }),
    prisma.liliVentaDet.groupBy({
      by: ['artCodigo'],
      where: { fecha: { gte: mismoMesDesde, lt: mismoMesHasta } },
      _sum: { cantidad: true, neto: true }
    }),
  ])
  const antMap = new Map<string, number>()
  vcAnt.forEach(v => antMap.set(v.artCodigo, (antMap.get(v.artCodigo) ?? 0) + Number(v._sum.cantidad ?? 0)))
  npAnt.forEach(v => antMap.set(v.artCodigo, (antMap.get(v.artCodigo) ?? 0) + Number(v._sum.cantidad ?? 0)))
  vlAnt.forEach(v => {
    const cane = liliACane.get(v.artCodigo)
    if (cane) antMap.set(cane, (antMap.get(cane) ?? 0) + Number(v._sum.cantidad ?? 0))
  })

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