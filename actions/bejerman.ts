// actions/bejerman.ts
"use server"

import { prisma } from "@/lib/prisma"

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

export async function getRankingArticulosAction(params: {
  orden: 'facturacion' | 'unidades' | 'margen'
  periodo: 'mes' | 'trimestre' | 'semestre' | 'anio'
}): Promise<RankingArticulo[]> {

  const diasPeriodo = {
    mes: 30,
    trimestre: 90,
    semestre: 180,
    anio: 365,
  }[params.periodo];

  const desdeFecha = new Date();
  desdeFecha.setDate(desdeFecha.getDate() - diasPeriodo);

  // 1. Ventas + Notas de Pedido agrupadas por artículo
  const [ventas, notasPedido] = await Promise.all([
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
  ]);
  // Combinar ventas y NP por artículo
  const ventasMap = new Map(ventas.map(v => [v.artCodigo, {
    cantidad: Number(v._sum.cantidad ?? 0),
    neto: Number(v._sum.neto ?? 0),
  }]));

  notasPedido.forEach(np => {
    const existing = ventasMap.get(np.artCodigo);
    if (existing) {
      existing.cantidad += Number(np._sum.cantidad ?? 0);
      existing.neto += Number(np._sum.importeTotal ?? 0);
    } else {
      ventasMap.set(np.artCodigo, {
        cantidad: Number(np._sum.cantidad ?? 0),
        neto: Number(np._sum.importeTotal ?? 0),
      });
    }
  });

  // Convertir el mapa a array y ordenar
  const ventasCombinadas = [...ventasMap.entries()].map(([artCodigo, datos]) => ({
    artCodigo,
    cantidad: datos.cantidad,
    neto: datos.neto,
  }));

  const ordenadas = ventasCombinadas.sort((a, b) =>
    params.orden === 'unidades'
      ? b.cantidad - a.cantidad
      : b.neto - a.neto
  );

  const codigos = ordenadas.map(v => v.artCodigo);

  // 2. Info de artículos
  const articulos = await prisma.bejArticulo.findMany({
    where: { codigo: { in: codigos } },
    select: {
      codigo: true,
      descripcion: true,
      clasificacion: true,
      esProducido: true,
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
    by: ['artCodigo'],
    where: {
      artCodigo: { in: codigos },
      fecha: { gte: desdeCosto },
      precioUnit: { gt: 0 }
    },
    _avg: { precioUnit: true },
  });
  const costoCompraMap = new Map(
    costoCompras.map(c => [c.artCodigo, Number(c._avg.precioUnit)])
  );

  // 5. Costo desde producción — usando ProdFrm_Producidos como nexo
  const producidos = await prisma.bejProdFormulaProducido.findMany({
    where: { artCodigo: { in: codigos } },
    select: { artCodigo: true, formula: true, cantidad: true }
  });

  const formulasCodigos = [...new Set(producidos.map(p => p.formula))];
  const formulas = await prisma.bejProdFormula.findMany({
    where: { formula: { in: formulasCodigos } },
    select: { formula: true, costoTotal: true, batch: true }
  });
  const formulaMap = new Map(formulas.map(f => [f.formula, f]));

  const costoProdMap = new Map<string, number>();
  producidos.forEach(p => {
    const f = formulaMap.get(p.formula);
    if (!f) return;
    const batch = Number(f.batch) || 1;
    const cantidad = Number(p.cantidad) || 1;
    const costoUnit = (Number(f.costoTotal) / batch) * cantidad;
    if (!costoProdMap.has(p.artCodigo) || costoUnit < costoProdMap.get(p.artCodigo)!) {
      costoProdMap.set(p.artCodigo, costoUnit);
    }
  });

  // 6. Armar resultado
  const resultado: RankingArticulo[] = ordenadas.map((v, i) => {
    const art = artMap.get(v.artCodigo);
    const facturacion = v.neto;
    const unidades = v.cantidad;
    const precioSIV = precioMap.get(v.artCodigo) ?? null;

    // Determinar costo: primero compras, luego producción
    let costoUnitario: number | null = null;
    let fuenteCosto: 'compra' | 'produccion' | null = null;

    if (costoCompraMap.has(v.artCodigo)) {
      costoUnitario = costoCompraMap.get(v.artCodigo)!;
      fuenteCosto = 'compra';
    } else if (costoProdMap.has(v.artCodigo)) {
      costoUnitario = costoProdMap.get(v.artCodigo)!;
      fuenteCosto = 'produccion';
    }

    // Margen sobre precio SIV
    const margenPct = precioSIV && costoUnitario
      ? ((precioSIV - costoUnitario) / precioSIV) * 100
      : null;

    return {
      codigo: v.artCodigo,
      descripcion: art?.descripcion?.trim() ?? v.artCodigo,
      clasificacion: art?.clasificacion ?? null,
      esProducido: art?.esProducido ?? false,
      unidadesVendidas: unidades,
      facturacionNeta: facturacion,
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
      .sort((a, b) => (a.margenPct ?? 0) - (b.margenPct ?? 0));
  }

  return resultado;
}