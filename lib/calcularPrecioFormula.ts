// lib/calcularPrecioFormula.ts
// Cálculo del precio de una fórmula a partir de sus insumos y sub-fórmulas.
// Antes esta lógica estaba duplicada (con pequeñas divergencias) en
// actions/formulas.ts, actions/bejerman.ts, actions/informes.ts y
// lib/snapshotFormulas.ts. Queda centralizada acá.
//
// Soporta 3 niveles de anidamiento (fórmula → sub-fórmula → sub-sub-fórmula),
// que es el máximo que se da en este negocio. Un insumo dentro de una
// sub-sub-fórmula (4º nivel) no se contempla y su costo se toma como 0.

interface DecimalLike {
  toNumber(): number;
}

interface ItemNivel3 {
  cantidad: DecimalLike;
  insumo?: { price: DecimalLike } | null;
}

interface ItemNivel2 {
  cantidad: DecimalLike;
  insumo?: { price: DecimalLike } | null;
  subFormula?: { items: ItemNivel3[] } | null;
}

export interface ItemNivel1 {
  cantidad: DecimalLike;
  insumo?: { price: DecimalLike } | null;
  subFormula?: { items: ItemNivel2[] } | null;
}

function promedioPonderado(items: { precio: number; cantidad: number }[]): number {
  const sumaSubtotales = items.reduce((t, i) => t + i.precio * i.cantidad, 0);
  const sumaCantidades = items.reduce((t, i) => t + i.cantidad, 0);
  return sumaCantidades > 0 ? sumaSubtotales / sumaCantidades : 0;
}

function calcularPrecioNivel3(items: ItemNivel3[]): number {
  return promedioPonderado(
    items.map((i) => ({
      precio: i.insumo ? i.insumo.price.toNumber() : 0,
      cantidad: i.cantidad.toNumber(),
    }))
  );
}

function calcularPrecioNivel2(items: ItemNivel2[]): number {
  return promedioPonderado(
    items.map((i) => ({
      precio: i.insumo
        ? i.insumo.price.toNumber()
        : i.subFormula
          ? calcularPrecioNivel3(i.subFormula.items)
          : 0,
      cantidad: i.cantidad.toNumber(),
    }))
  );
}

/** Precio de un único ítem (insumo directo o sub-fórmula). */
export function calcularPrecioDetalle(item: ItemNivel1): number {
  if (item.insumo) return item.insumo.price.toNumber();
  if (item.subFormula) return calcularPrecioNivel2(item.subFormula.items);
  return 0;
}

/** Precio total de una fórmula (promedio ponderado por cantidad de sus ítems). */
export function calcularPrecioFormula(items: ItemNivel1[]): number {
  return promedioPonderado(
    items.map((item) => ({
      precio: calcularPrecioDetalle(item),
      cantidad: item.cantidad.toNumber(),
    }))
  );
}
