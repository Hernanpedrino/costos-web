// actions/bejerman.ts
"use server"

import { prisma } from "@/lib/prisma"

export interface DetalleArticuloMes {
  mes: string   // "2025-01"
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

  // 1. Ventas CANE + LILI agrupadas por artículo
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
  ]);

  // Mapa lili → cane
  const liliACane = new Map(mapeos.map(m => [m.codigoLili, m.codigoCane]));

  // Combinar todo bajo códigos CANE
  const ventasMap = new Map<string, { cantidad: number; neto: number }>();

  // Ventas CANE
  ventasCane.forEach(v => {
    ventasMap.set(v.artCodigo, {
      cantidad: Number(v._sum.cantidad ?? 0),
      neto: Number(v._sum.neto ?? 0),
    });
  });

  // NP CANE
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

  // Ventas LILI — traducir código LILI → CANE
  ventasLili.forEach(v => {
    const codigoCane = liliACane.get(v.artCodigo);
    if (!codigoCane) return; // sin mapeo → descartar
    const existing = ventasMap.get(codigoCane);
    if (existing) {
      existing.cantidad += Number(v._sum.cantidad ?? 0);
      existing.neto += Number(v._sum.neto ?? 0);
    } else {
      ventasMap.set(codigoCane, {
        cantidad: Number(v._sum.cantidad ?? 0),
        neto: Number(v._sum.neto ?? 0),
      });
    }
  });

  // Ordenar y extraer códigos
  const ordenadas = [...ventasMap.entries()]
    .map(([artCodigo, datos]) => ({ artCodigo, ...datos }))
    .sort((a, b) =>
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
export async function getDetalleArticuloAction(codigo: string): Promise<DetalleArticulo | null> {
  // Info base del artículo
  const articulo = await prisma.bejArticulo.findUnique({
    where: { codigo },
    select: { codigo: true, descripcion: true, clasificacion: true, esProducido: true }
  });
  if (!articulo) return null;

  // Precio SIV
  const precioSIV = await prisma.bejListaPrecio.findFirst({
    where: { artCodigo: codigo, listaCod: 'SIV' },
    select: { precio: true }
  });

  // Ventas CANE por mes (últimos 12 meses)
  const desdeFecha = new Date();
  desdeFecha.setMonth(desdeFecha.getMonth() - 12);

  const ventasCane = await prisma.bejVentaDet.findMany({
    where: { artCodigo: codigo, fecha: { gte: desdeFecha } },
    select: { cantidad: true, neto: true, fecha: true }
  });

  const npCane = await prisma.bejNPDet.findMany({
    where: { artCodigo: codigo, fecha: { gte: desdeFecha } },
    select: { cantidad: true, importeTotal: true, fecha: true }
  });

  // Ventas LILI por mes — buscar mapeo
  const mapeo = await prisma.bejArticuloMapeo.findFirst({
    where: { codigoCane: codigo, verificado: true },
    select: { codigoLili: true }
  });

  const ventasLili = mapeo ? await prisma.liliVentaDet.findMany({
    where: { artCodigo: mapeo.codigoLili, fecha: { gte: desdeFecha } },
    select: { cantidad: true, neto: true, fecha: true }
  }) : [];

  // Agrupar todo por mes
  const mesMap = new Map<string, { unidades: number; neto: number }>();

  const agregarAlMes = (fecha: Date, cantidad: number, neto: number) => {
    const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    const existing = mesMap.get(mes);
    if (existing) {
      existing.unidades += cantidad;
      existing.neto += neto;
    } else {
      mesMap.set(mes, { unidades: cantidad, neto });
    }
  };

  ventasCane.forEach(v => agregarAlMes(v.fecha, Number(v.cantidad), Number(v.neto)));
  npCane.forEach(v => agregarAlMes(v.fecha, Number(v.cantidad), Number(v.importeTotal)));
  ventasLili.forEach(v => agregarAlMes(v.fecha, Number(v.cantidad), Number(v.neto)));

  // Costo unitario
  const desdeCosto = new Date();
  desdeCosto.setDate(desdeCosto.getDate() - 90);

  let costoUnit: number | null = null;
  let fuenteCosto: 'compra' | 'produccion' | null = null;

  const costoCompra = await prisma.bejCompraDet.aggregate({
    where: { artCodigo: codigo, fecha: { gte: desdeCosto }, precioUnit: { gt: 0 } },
    _avg: { precioUnit: true }
  });

  if (costoCompra._avg.precioUnit) {
    costoUnit = Number(costoCompra._avg.precioUnit);
    fuenteCosto = 'compra';
  } else {
    const producido = await prisma.bejProdFormulaProducido.findFirst({
      where: { artCodigo: codigo },
      include: { prodFormula: true }
    });
    if (producido) {
      const batch = Number(producido.prodFormula.batch) || 1;
      costoUnit = Number(producido.prodFormula.costoTotal) / batch;
      fuenteCosto = 'produccion';
    }
  }

  // Armar evolución ordenada por mes
  const evolucion: DetalleArticuloMes[] = [...mesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, datos]) => {
      const precioRef = Number(precioSIV?.precio ?? 0);
      const margenPct = precioRef > 0 && costoUnit
        ? ((precioRef - costoUnit) / precioRef) * 100
        : null;
      return {
        mes,
        unidades: datos.unidades,
        facturacion: datos.neto,
        costoUnit,
        margenPct,
      };
    });

  return {
    codigo: articulo.codigo,
    descripcion: articulo.descripcion,
    clasificacion: articulo.clasificacion,
    esProducido: articulo.esProducido,
    precioSIV: precioSIV ? Number(precioSIV.precio) : null,
    costoUnit,
    fuenteCosto,
    evolucion,
  };
}