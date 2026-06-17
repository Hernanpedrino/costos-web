// actions/bejerman.ts
"use server"

import { prisma } from "@/lib/prisma"

export interface RankingArticulo {
  codigo:          string
  descripcion:     string
  clasificacion:   string | null
  esProducido:     boolean
  unidadesVendidas: number
  facturacionNeta: number
  costoUnitario:   number | null
  fuenteCosto:     'compra' | 'produccion' | null
  margenPct:       number | null
  precioSIV:       number | null
}

export async function getRankingArticulosAction(params: {
  orden:   'facturacion' | 'unidades' | 'margen'
  limite:  number
  periodo: 'mes' | 'trimestre' | 'semestre' | 'anio'
}): Promise<RankingArticulo[]> {

  const diasPeriodo = {
    mes:       30,
    trimestre: 90,
    semestre:  180,
    anio:      365,
  }[params.periodo];

  const desdeFecha = new Date();
  desdeFecha.setDate(desdeFecha.getDate() - diasPeriodo);

  // 1. Ventas agrupadas por artículo en el período
  const ventas = await prisma.bejVentaDet.groupBy({
    by:    ['artCodigo'],
    where: { fecha: { gte: desdeFecha } },
    _sum:  { cantidad: true, neto: true },
    orderBy: params.orden === 'unidades'
      ? { _sum: { cantidad: 'desc' } }
      : { _sum: { neto: 'desc' } },
    take: params.orden === 'margen' ? 500 : params.limite,
  });

  if (ventas.length === 0) return [];

  const codigos = ventas.map(v => v.artCodigo);

  // 2. Info de artículos
  const articulos = await prisma.bejArticulo.findMany({
    where: { codigo: { in: codigos } },
    select: {
      codigo:       true,
      descripcion:  true,
      clasificacion: true,
      esProducido:  true,
    }
  });
  const artMap = new Map(articulos.map(a => [a.codigo, a]));

  // 3. Precios de lista SIV
  const precios = await prisma.bejListaPrecio.findMany({
    where: { artCodigo: { in: codigos }, listaCod: 'SIV' },
    select: { artCodigo: true, precio: true }
  });
  const precioMap = new Map(precios.map(p => [p.artCodigo, Number(p.precio)]));

  // 4. Costo desde compras (promedio últimos 90 días)
  const desdeCosto = new Date();
  desdeCosto.setDate(desdeCosto.getDate() - 90);

  const costoCompras = await prisma.bejCompraDet.groupBy({
    by:    ['artCodigo'],
    where: {
      artCodigo: { in: codigos },
      fecha:     { gte: desdeCosto },
      precioUnit: { gt: 0 }
    },
    _avg: { precioUnit: true },
  });
  const costoCompraMap = new Map(
    costoCompras.map(c => [c.artCodigo, Number(c._avg.precioUnit)])
  );

  // 5. Costo desde producción
  const costosProd = await prisma.bejProdFormulaComp.findMany({
    where: { componente: { in: codigos } },
    select: { componente: true, formula: true }
  });

  const formulasCodigos = [...new Set(costosProd.map(c => c.formula))];
  const formulas = await prisma.bejProdFormula.findMany({
    where: { formula: { in: formulasCodigos } },
    select: { formula: true, costoTotal: true, batch: true }
  });

  // Artículos producidos: buscar en ProdFrm_Producidos qué artículo produce cada fórmula
  const producidos = await prisma.bejProdFormulaComp.findMany({
    where: { formula: { in: formulasCodigos } },
    select: { formula: true, componente: true }
  });

  const costoProdMap = new Map<string, number>();
  formulas.forEach(f => {
    const batch = Number(f.batch) || 1;
    const costoUnit = Number(f.costoTotal) / batch;
    // Asociar a los artículos que produce esta fórmula
    producidos
      .filter(p => p.formula === f.formula)
      .forEach(p => costoProdMap.set(p.componente, costoUnit));
  });

  // 6. Armar resultado
  const resultado: RankingArticulo[] = ventas.map(v => {
    const art          = artMap.get(v.artCodigo);
    const facturacion  = Number(v._sum.neto ?? 0);
    const unidades     = Number(v._sum.cantidad ?? 0);
    const precioSIV    = precioMap.get(v.artCodigo) ?? null;

    // Determinar costo: primero compras, luego producción
    let costoUnitario: number | null = null;
    let fuenteCosto: 'compra' | 'produccion' | null = null;

    if (costoCompraMap.has(v.artCodigo)) {
      costoUnitario = costoCompraMap.get(v.artCodigo)!;
      fuenteCosto   = 'compra';
    } else if (costoProdMap.has(v.artCodigo)) {
      costoUnitario = costoProdMap.get(v.artCodigo)!;
      fuenteCosto   = 'produccion';
    }

    // Margen sobre precio SIV
    const margenPct = precioSIV && costoUnitario
      ? ((precioSIV - costoUnitario) / precioSIV) * 100
      : null;

    return {
      codigo:           v.artCodigo,
      descripcion:      art?.descripcion?.trim() ?? v.artCodigo,
      clasificacion:    art?.clasificacion ?? null,
      esProducido:      art?.esProducido ?? false,
      unidadesVendidas: unidades,
      facturacionNeta:  facturacion,
      costoUnitario,
      fuenteCosto,
      margenPct,
      precioSIV,
    };
  });

  // Si el orden es por margen, ordenar acá
  if (params.orden === 'margen') {
    return resultado
      .filter(r => r.margenPct !== null)
      .sort((a, b) => (a.margenPct ?? 0) - (b.margenPct ?? 0))
      .slice(0, params.limite);
  }

  return resultado;
}