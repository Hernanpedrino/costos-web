// lib/whatsapp/bejerman-lookup.ts
// Resolución de artículos por texto libre y consulta de precios,
// contra la base MySQL sincronizada (bej_articulos / bej_lista_precios).
//
// El stock NO se resuelve acá: como Bejerman no mantiene Stock/StockPar
// actualizados vía triggers y el ETL no los sincroniza, la consulta de
// stock tiene que hacerse en vivo contra SQL Server (ver bejerman-live.ts).

import { prisma } from "@/lib/prisma";

// Código de lista de precios a usar por defecto para el bot.
// 'FIN' es la lista de precios de venta a clientes. 'SIV' (que usa
// actions/bejerman.ts) es para costos internos — nunca mostrarla acá.
const LISTA_PRECIO_DEFAULT = "FIN";

export interface ArticuloEncontrado {
  codigo: string;
  descripcion: string;
}

export interface ResultadoBusqueda {
  /** Artículos a mostrar (ya truncado al límite de la lista de WhatsApp). */
  articulos: ArticuloEncontrado[];
  /** Cuántas coincidencias hay en total, aunque no se muestren todas. */
  totalCoincidencias: number;
}

/**
 * Busca artículos cuya descripción contenga todas las palabras del texto
 * ingresado por el usuario (orden y mayúsculas no importan).
 *
 * Ej: "harina 000" → matchea "HARINA DE TRIGO 000 X 25KG"
 *
 * Devuelve tanto los resultados a mostrar (truncados a `limite`, por el
 * máximo de filas que soporta una lista interactiva de WhatsApp) como el
 * total real de coincidencias — así el llamador puede decidir si conviene
 * mostrar la lista o pedirle al usuario que sea más específico.
 *
 * Es un matching simple por LIKE; si el catálogo crece mucho o las
 * búsquedas dan muchos falsos positivos, se puede migrar a un FULLTEXT
 * index de MySQL o a una librería de fuzzy matching (ej. Fuse.js).
 */
export async function buscarArticulos(
  textoUsuario: string,
  limite = 8
): Promise<ResultadoBusqueda> {
  const palabras = textoUsuario
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter((p) => p.length > 0);

  if (palabras.length === 0) return { articulos: [], totalCoincidencias: 0 };

  // Solo artículos vendibles — no tiene sentido ofrecer insumos internos.
  const where = {
    esVendido: true,
    AND: palabras.map((palabra) => ({
      descripcion: { contains: palabra },
    })),
  };

  const [articulos, totalCoincidencias] = await Promise.all([
    prisma.bejArticulo.findMany({
      where,
      select: { codigo: true, descripcion: true },
      take: limite,
    }),
    prisma.bejArticulo.count({ where }),
  ]);

  return { articulos, totalCoincidencias };
}

/**
 * Devuelve el precio vigente de un artículo en la lista indicada
 * (o la lista por defecto si no se especifica).
 */
export async function consultarPrecio(
  codigoArticulo: string,
  listaCod: string = LISTA_PRECIO_DEFAULT
): Promise<number | null> {
  const registro = await prisma.bejListaPrecio.findUnique({
    where: {
      listaCod_artCodigo: {
        listaCod,
        artCodigo: codigoArticulo,
      },
    },
    select: { precio: true },
  });

  return registro ? Number(registro.precio) : null;
}

/**
 * Trae la descripción de un artículo por código (útil para confirmar
 * al usuario qué artículo se resolvió antes de agregarlo al carrito).
 */
export async function obtenerArticulo(codigoArticulo: string): Promise<ArticuloEncontrado | null> {
  return prisma.bejArticulo.findUnique({
    where: { codigo: codigoArticulo },
    select: { codigo: true, descripcion: true },
  });
}