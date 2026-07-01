// actions/bejerman.ts
"use server"

import { prisma } from "@/lib/prisma"

export interface ComponenteCosto {
  nombre: string
  costo: number
  porcentaje: number
}

export interface DetalleArticuloMes {
  mes: string
  unidades: number
  facturacion: number
  costoUnit: number | null
  margenPct: number | null
}

export interface DetalleArticulo {
  codigo: string
  descripcion: string
  clasificacion: string | null
  esProducido: boolean
  precioSIV: number | null
  costoUnit: number | null
  fuenteCosto: 'compra' | 'produccion' | null
  evolucion: DetalleArticuloMes[]
  componentesCosto: ComponenteCosto[]
}

export interface RankingArticulo {
  codigo: string
  descripcion: string
  clasificacion: string | null
  esProducido: boolean
  unidadesVendidas: number
  facturacionNeta: number
  costoUnitario: number | null
  fuenteCosto: 'compra' | 'produccion' | null
  margenPct: number | null
  precioSIV: number | null
}

// ─── Helper: construir mapa de precios desde Costos El Chilo ─────────────────

type FormulaChiloConItems = Awaited<ReturnType<typeof prisma.formula.findMany<{
  include: {
    items: {
      include: {
        insumo: true
        subFormula: {
          include: {
            items: {
              include: {
                insumo: true
                subFormula: { include: { items: { include: { insumo: true } } } }
              }
            }
          }
        }
      }
    }
  }
}>>>[number]

function calcularPrecioFormula(formula: FormulaChiloConItems): number {
  const items = formula.items.map(item => {
    const cantidad = item.cantidad.toNumber()
    let precio = 0
    if (item.insumo) {
      precio = item.insumo.price.toNumber()
    } else if (item.subFormula) {
      const subSuma = item.subFormula.items.reduce((t, si) =>
        t + (si.insumo?.price.toNumber() ?? 0) * si.cantidad.toNumber(), 0)
      const subCant = item.subFormula.items.reduce((t, si) =>
        t + si.cantidad.toNumber(), 0)
      precio = subCant > 0 ? subSuma / subCant : 0
    }
    return { precio, cantidad }
  })

  const sumaSubtotales = items.reduce((t, i) => t + i.precio * i.cantidad, 0)
  const sumaCantidades = items.reduce((t, i) => t + i.cantidad, 0)
  return sumaCantidades > 0 ? sumaSubtotales / sumaCantidades : 0
}

// ─── Helper: traer fórmulas de Costos El Chilo con include completo ──────────

async function getFormulasChilo(codigos: string[]) {
  return prisma.formula.findMany({
    where: { codigoBejerman: { in: codigos } },
    include: {
      items: {
        include: {
          insumo: true,
          subFormula: {
            include: {
              items: {
                include: {
                  insumo: true,
                  subFormula: {
                    include: { items: { include: { insumo: true } } }
                  }
                }
              }
            }
          }
        }
      }
    }
  })
}

// ─── Helper: construir mapas de precios para componentes ─────────────────────

async function construirMapasPrecios(
  todosComponentes: string[],
  desdeCosto: Date
): Promise<Map<string, number>> {

  const [formulasChilo, comprasCane, mapeosLili] = await Promise.all([
    getFormulasChilo(todosComponentes),
    prisma.bejCompraDet.groupBy({
      by: ['artCodigo'],
      where: { artCodigo: { in: todosComponentes }, fecha: { gte: desdeCosto }, precioUnit: { gt: 0 } },
      _avg: { precioUnit: true }
    }),
    prisma.bejArticuloMapeo.findMany({
      where: { codigoCane: { in: todosComponentes }, verificado: true },
      select: { codigoCane: true, codigoLili: true }
    }),
  ])

  const precioMap = new Map<string, number>()

  // 1. Fórmulas de Costos El Chilo
  formulasChilo.forEach(f => {
    if (!f.codigoBejerman) return
    precioMap.set(f.codigoBejerman, calcularPrecioFormula(f))
  })

  // 2. Insumos de Costos El Chilo con codigoBejerman
  const insumosChilo = await prisma.insumo.findMany({
    where: { codigoBejerman: { in: todosComponentes } },
    select: { codigoBejerman: true, price: true }
  })
  insumosChilo.forEach(i => {
    if (!i.codigoBejerman) return
    if (!precioMap.has(i.codigoBejerman)) {
      precioMap.set(i.codigoBejerman, i.price.toNumber())
    }
  })

  // 3. Compras CANE
  comprasCane.forEach(c => {
    if (!precioMap.has(c.artCodigo) && c._avg.precioUnit) {
      precioMap.set(c.artCodigo, Number(c._avg.precioUnit))
    }
  })

  // 4. Compras LILI para los que todavía no tienen precio
  const sinPrecio = todosComponentes.filter(c => !precioMap.has(c))
  if (sinPrecio.length > 0 && mapeosLili.length > 0) {
    const codigosLili = mapeosLili
      .filter(m => sinPrecio.includes(m.codigoCane))
      .map(m => m.codigoLili)

    if (codigosLili.length > 0) {
      const comprasLili = await prisma.liliCompraDet.groupBy({
        by: ['artCodigo'],
        where: { artCodigo: { in: codigosLili }, fecha: { gte: desdeCosto }, precioUnit: { gt: 0 } },
        _avg: { precioUnit: true }
      })
      comprasLili.forEach(c => {
        const mapeo = mapeosLili.find(m => m.codigoLili === c.artCodigo)
        if (mapeo && c._avg.precioUnit && !precioMap.has(mapeo.codigoCane)) {
          precioMap.set(mapeo.codigoCane, Number(c._avg.precioUnit))
        }
      })
    }
  }

  return precioMap
}

// ─── getRankingArticulosAction ────────────────────────────────────────────────

export async function getRankingArticulosAction(params: {
  orden: 'facturacion' | 'unidades' | 'margen'
  periodo: 'mes' | 'trimestre' | 'semestre' | 'anio'
  aplicarCostosOp?: boolean
}): Promise<RankingArticulo[]> {

  const diasPeriodo = { mes: 30, trimestre: 90, semestre: 180, anio: 365 }[params.periodo]
  const desdeFecha = new Date()
  desdeFecha.setDate(desdeFecha.getDate() - diasPeriodo)

  // 1. Ventas CANE + NP + LILI
  const [ventasCane, notasPedido, ventasLili, mapeos] = await Promise.all([
    prisma.bejVentaDet.groupBy({
      by: ['artCodigo'],
      where: { fecha: { gte: desdeFecha } },
      _sum: { cantidad: true, neto: true },
    }),
    prisma.bejNPDet.groupBy({
      by: ['artCodigo'],
      where: { fecha: { gte: desdeFecha } },
      _sum: { cantidad: true, importeTotal: true },
    }),
    prisma.liliVentaDet.groupBy({
      by: ['artCodigo'],
      where: { fecha: { gte: desdeFecha } },
      _sum: { cantidad: true, neto: true },
    }),
    prisma.bejArticuloMapeo.findMany({
      where: { verificado: true },
      select: { codigoLili: true, codigoCane: true }
    }),
  ])

  const liliACane = new Map(mapeos.map(m => [m.codigoLili, m.codigoCane]))
  const ventasMap = new Map<string, { cantidad: number; neto: number }>()

  ventasCane.forEach(v => {
    ventasMap.set(v.artCodigo, {
      cantidad: Number(v._sum.cantidad ?? 0),
      neto: Number(v._sum.neto ?? 0),
    })
  })

  notasPedido.forEach(np => {
    const existing = ventasMap.get(np.artCodigo)
    if (existing) {
      existing.cantidad += Number(np._sum.cantidad ?? 0)
      existing.neto += Number(np._sum.importeTotal ?? 0)
    } else {
      ventasMap.set(np.artCodigo, {
        cantidad: Number(np._sum.cantidad ?? 0),
        neto: Number(np._sum.importeTotal ?? 0),
      })
    }
  })

  ventasLili.forEach(v => {
    const codigoCane = liliACane.get(v.artCodigo)
    if (!codigoCane) return
    const existing = ventasMap.get(codigoCane)
    if (existing) {
      existing.cantidad += Number(v._sum.cantidad ?? 0)
      existing.neto += Number(v._sum.neto ?? 0)
    } else {
      ventasMap.set(codigoCane, {
        cantidad: Number(v._sum.cantidad ?? 0),
        neto: Number(v._sum.neto ?? 0),
      })
    }
  })

  const ordenadas = [...ventasMap.entries()]
    .map(([artCodigo, datos]) => ({ artCodigo, ...datos }))
    .sort((a, b) => params.orden === 'unidades' ? b.cantidad - a.cantidad : b.neto - a.neto)

  const codigos = ordenadas.map(v => v.artCodigo)

  // 2. Info artículos
  const articulos = await prisma.bejArticulo.findMany({
    where: { codigo: { in: codigos } },
    select: { codigo: true, descripcion: true, clasificacion: true, esProducido: true }
  })
  const artMap = new Map(articulos.map(a => [a.codigo, a]))

  // 3. Precios SIV
  const precios = await prisma.bejListaPrecio.findMany({
    where: { artCodigo: { in: codigos }, listaCod: 'SIV' },
    select: { artCodigo: true, precio: true }
  })
  const precioMap = new Map(precios.map(p => [p.artCodigo, Number(p.precio)]))

  // 4. Costo desde compras directas
  const desdeCosto = new Date()
  desdeCosto.setDate(desdeCosto.getDate() - 365)

  const costoCompras = await prisma.bejCompraDet.groupBy({
    by: ['artCodigo'],
    where: { artCodigo: { in: codigos }, fecha: { gte: desdeCosto }, precioUnit: { gt: 0 } },
    _avg: { precioUnit: true },
  })
  const costoCompraMap = new Map(
    costoCompras.map(c => [c.artCodigo, Number(c._avg.precioUnit)])
  )

  // 5. Costo desde producción
  const producidos = await prisma.bejProdFormulaProducido.findMany({
    where: { artCodigo: { in: codigos } },
    include: { prodFormula: { include: { componentes: true } } }
  })

  const todosComponentes = [...new Set(
    producidos.flatMap(p => p.prodFormula.componentes.map(c => c.componente))
  )]

  const preciosComponentes = await construirMapasPrecios(todosComponentes, desdeCosto)

  const costoProdMap = new Map<string, number>()
  producidos.forEach(p => {
    const batch = Number(p.prodFormula.batch) || 1
    let costoTotal = 0
    let tieneAlgunPrecio = false

    p.prodFormula.componentes.forEach(comp => {
      const cantidad = Number(comp.cantidad)
      const precio = preciosComponentes.get(comp.componente) ?? null
      if (precio !== null) {
        costoTotal += precio * cantidad
        tieneAlgunPrecio = true
      }
    })

    if (tieneAlgunPrecio) {
      costoProdMap.set(p.artCodigo, costoTotal / batch)
    }
  })

  // 6. Factor de prorrateo costos operativos ← ANTES del map
  let factorProrrateo = 0
  if (params.aplicarCostosOp) {
    // Buscar el último período con datos cargados
    const ultimoRegistro = await prisma.costoRegistro.findFirst({
      where: { importe: { gt: 0 } },
      orderBy: { periodo: 'desc' },
      select: { periodo: true }
    })

    if (ultimoRegistro) {
      const periodoUsar = ultimoRegistro.periodo

      const registros = await prisma.costoRegistro.findMany({
        where: { periodo: periodoUsar },
        select: { importe: true }
      })
      const totalCostos = registros.reduce((t, r) => t + Number(r.importe), 0)

      const [anio, mes] = periodoUsar.split('-').map(Number)
      const desde = new Date(anio, mes - 1, 1)
      const hasta = new Date(anio, mes, 1)

      const ventasMes = await prisma.bejVentaDet.aggregate({
        where: { fecha: { gte: desde, lt: hasta } },
        _sum: { neto: true }
      })
      const totalFacturacion = Number(ventasMes._sum.neto ?? 0)
      factorProrrateo = totalFacturacion > 0 ? totalCostos / totalFacturacion : 0
    }
  }

  // 7. Armar resultado
  const resultado: RankingArticulo[] = ordenadas.map(v => {
    const art = artMap.get(v.artCodigo)
    const precioSIV = precioMap.get(v.artCodigo) ?? null

    let costoUnitario: number | null = null
    let fuenteCosto: 'compra' | 'produccion' | null = null

    if (costoCompraMap.has(v.artCodigo)) {
      costoUnitario = costoCompraMap.get(v.artCodigo)!
      fuenteCosto = 'compra'
    } else if (costoProdMap.has(v.artCodigo)) {
      costoUnitario = costoProdMap.get(v.artCodigo)!
      fuenteCosto = 'produccion'
    }

    // Costo operativo prorrateado sobre precio SIV
    const costoOp = factorProrrateo > 0 && precioSIV ? precioSIV * factorProrrateo : 0
    const costoTotal = (costoUnitario ?? 0) + costoOp

    const margenPct = precioSIV && costoUnitario
      ? ((precioSIV - costoTotal) / precioSIV) * 100
      : null

    return {
      codigo: v.artCodigo,
      descripcion: art?.descripcion?.trim() ?? v.artCodigo,
      clasificacion: art?.clasificacion ?? null,
      esProducido: art?.esProducido ?? false,
      unidadesVendidas: v.cantidad,
      facturacionNeta: v.neto,
      costoUnitario,
      fuenteCosto,
      margenPct,
      precioSIV,
    }
  })

  if (params.orden === 'margen') {
    return resultado
      .filter(r => r.margenPct !== null)
      .sort((a, b) => (a.margenPct ?? 0) - (b.margenPct ?? 0))
  }

  return resultado
}

// ─── getDetalleArticuloAction ─────────────────────────────────────────────────

export async function getDetalleArticuloAction(codigo: string): Promise<DetalleArticulo | null> {
  const articulo = await prisma.bejArticulo.findUnique({
    where: { codigo },
    select: { codigo: true, descripcion: true, clasificacion: true, esProducido: true }
  })
  if (!articulo) return null

  const desdeFecha = new Date()
  desdeFecha.setMonth(desdeFecha.getMonth() - 12)

  const desdeCosto = new Date()
  desdeCosto.setDate(desdeCosto.getDate() - 365)

  const [precioSIV, ventasCane, npCane, mapeo, costoCompra] = await Promise.all([
    prisma.bejListaPrecio.findFirst({
      where: { artCodigo: codigo, listaCod: 'SIV' },
      select: { precio: true }
    }),
    prisma.bejVentaDet.findMany({
      where: { artCodigo: codigo, fecha: { gte: desdeFecha } },
      select: { cantidad: true, neto: true, fecha: true }
    }),
    prisma.bejNPDet.findMany({
      where: { artCodigo: codigo, fecha: { gte: desdeFecha } },
      select: { cantidad: true, importeTotal: true, fecha: true }
    }),
    prisma.bejArticuloMapeo.findFirst({
      where: { codigoCane: codigo, verificado: true },
      select: { codigoLili: true }
    }),
    prisma.bejCompraDet.aggregate({
      where: { artCodigo: codigo, fecha: { gte: desdeCosto }, precioUnit: { gt: 0 } },
      _avg: { precioUnit: true }
    }),
  ])

  const ventasLili = mapeo ? await prisma.liliVentaDet.findMany({
    where: { artCodigo: mapeo.codigoLili, fecha: { gte: desdeFecha } },
    select: { cantidad: true, neto: true, fecha: true }
  }) : []

  // Agrupar por mes
  const mesMap = new Map<string, { unidades: number; neto: number }>()
  const agregarAlMes = (fecha: Date, cantidad: number, neto: number) => {
    const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
    const existing = mesMap.get(mes)
    if (existing) {
      existing.unidades += cantidad
      existing.neto += neto
    } else {
      mesMap.set(mes, { unidades: cantidad, neto })
    }
  }

  ventasCane.forEach(v => agregarAlMes(v.fecha, Number(v.cantidad), Number(v.neto)))
  npCane.forEach(v => agregarAlMes(v.fecha, Number(v.cantidad), Number(v.importeTotal)))
  ventasLili.forEach(v => agregarAlMes(v.fecha, Number(v.cantidad), Number(v.neto)))

  // Costo unitario
  let costoUnit: number | null = null
  let fuenteCosto: 'compra' | 'produccion' | null = null
  let componentesCosto: ComponenteCosto[] = []

  if (costoCompra._avg.precioUnit) {
    costoUnit = Number(costoCompra._avg.precioUnit)
    fuenteCosto = 'compra'
  } else {
    const producido = await prisma.bejProdFormulaProducido.findFirst({
      where: { artCodigo: codigo },
      include: { prodFormula: { include: { componentes: true } } }
    })
    if (producido) {
      const todosComponentes = producido.prodFormula.componentes.map(c => c.componente)
      const preciosComp = await construirMapasPrecios(todosComponentes, desdeCosto)

      const batch = Number(producido.prodFormula.batch) || 1
      let costoTotal = 0
      const desglose: { componente: string; costo: number }[] = []

      producido.prodFormula.componentes.forEach(comp => {
        const precio = preciosComp.get(comp.componente) ?? null
        if (precio !== null) {
          const costoComp = precio * Number(comp.cantidad)
          costoTotal += costoComp
          desglose.push({ componente: comp.componente, costo: costoComp })
        }
      })

      if (costoTotal > 0) {
        costoUnit = costoTotal / batch
        fuenteCosto = 'produccion'

        const artComp = await prisma.bejArticulo.findMany({
          where: { codigo: { in: desglose.map(d => d.componente) } },
          select: { codigo: true, descripcion: true }
        })
        const descMap = new Map(artComp.map(a => [a.codigo, a.descripcion.trim()]))

        componentesCosto = desglose.map(d => ({
          nombre: descMap.get(d.componente) ?? d.componente,
          costo: d.costo / batch,
          porcentaje: (d.costo / costoTotal) * 100,
        }))
      }
    }
  }

  const evolucion: DetalleArticuloMes[] = [...mesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, datos]) => {
      const precioRef = Number(precioSIV?.precio ?? 0)
      const margenPct = precioRef > 0 && costoUnit
        ? ((precioRef - costoUnit) / precioRef) * 100
        : null
      return { mes, unidades: datos.unidades, facturacion: datos.neto, costoUnit, margenPct }
    })

  return {
    codigo: articulo.codigo,
    descripcion: articulo.descripcion,
    clasificacion: articulo.clasificacion,
    esProducido: articulo.esProducido,
    precioSIV: precioSIV ? Number(precioSIV.precio) : null,
    costoUnit,
    fuenteCosto,
    evolucion,
    componentesCosto,
  }
}