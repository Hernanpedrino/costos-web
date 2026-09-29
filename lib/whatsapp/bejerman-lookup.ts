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

export interface ArticuloBuscado extends ArticuloEncontrado {
  /** true si el artículo tiene variantes vendibles (medida, talle, color...) en bej_articulo_variantes. */
  tieneVariantes: boolean;
}

export interface ResultadoBusqueda {
  /** Artículos a mostrar (ya truncado al límite de la lista de WhatsApp). */
  articulos: ArticuloBuscado[];
  /** Cuántas coincidencias hay en total, aunque no se muestren todas. */
  totalCoincidencias: number;
}

export interface VarianteArticulo {
  codEle1: string;
  codEle2: string;
  codEle3: string;
  /** Descripción de cada elemento (artele_Desc1/2/3), ej. '2.40', 'TALLE 46', 'BLANCO'. '' si no aplica. */
  desc1: string;
  desc2: string;
  desc3: string;
  /** Precio de la lista FIN de esa variante; null si no tiene. */
  precioFin: number | null;
}

/**
 * Clave de una variante dentro de su artículo: "E1~E2~E3" con cada CodEle
 * trimmeado (los vacíos de Bejerman, ' ', quedan como ''). Es la misma clave
 * que usa bejerman-live#consultarStockVariantes, así se pueden cruzar.
 */
export function claveVariante(
  codEle1: string | null | undefined,
  codEle2: string | null | undefined,
  codEle3: string | null | undefined
): string {
  return [codEle1, codEle2, codEle3].map((e) => (e ?? "").trim()).join("~");
}

// Palabras que no aportan a la búsqueda (ya en minúsculas y sin acentos):
// - conectores: "hoja de sierra" tiene que dar lo mismo que "hoja sierra"
//   (antes "de" se exigía como palabra más);
// - intención/cortesía: "Hola, necesito harina" tiene que buscar "harina"
//   (antes buscaba "necesito harina" y no encontraba nada).
const STOPWORDS_BUSQUEDA = new Set([
  // conectores
  "de", "del", "la", "el", "los", "las", "para", "con", "x", "y", "a", "en", "un", "una",
  "por", "me", "que",
  // intención
  "necesito", "necesitaria", "necesitamos", "quiero", "queria", "quisiera", "queremos",
  "busco", "buscaba", "tenes", "tienen", "tienes", "tendras", "tendrian", "hay",
  "vendes", "venden", "precio", "cuanto", "sale", "cuesta", "das", "pasame", "mandame",
  // cortesía
  "favor", "porfa", "hola", "buenas", "buenos", "dias", "tardes", "noches", "gracias",
]);

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Normaliza el texto del usuario para buscar: minúsculas, sin acentos, sin
 * stopwords y con un plural simple. Devuelve un grupo de formas por palabra:
 * alcanza con que matchee cualquiera de las formas del grupo, pero tienen que
 * matchear todos los grupos.
 *
 *   "Hojas de sierra"        → [["hoja"], ["sierra"]]
 *   "Hola, necesito harina"  → [["harina"]]
 *   "colores"                → [["colore", "color"]]   ('es' → se prueban ambas)
 *
 * Si todas las palabras eran stopwords, se usa el texto original (sin
 * descartar nada) para no devolver "todo el catálogo".
 */
export function normalizarBusqueda(textoUsuario: string): string[][] {
  const palabras = sinAcentos(textoUsuario.trim().toLowerCase())
    .split(/\s+/)
    // Puntuación en los bordes ("hola," / "¿tenés" / "harina?"), sin tocar la
    // interna: "2.40" y "n-8" tienen que llegar enteros.
    .map((p) => p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((p) => p.length > 0);

  const utiles = palabras.filter((p) => !STOPWORDS_BUSQUEDA.has(p));
  const base = utiles.length > 0 ? utiles : palabras;

  return base.map((p) => {
    if (p.length <= 3 || !p.endsWith("s")) return [p];
    // Como el match es por "contiene", la forma más corta también cubre la
    // larga: "hoja" encuentra "HOJAS". Por eso solo hace falta recortar.
    const formas = [p.slice(0, -1)];
    if (p.endsWith("es") && p.length - 2 >= 3) formas.push(p.slice(0, -2));
    return formas;
  });
}

/**
 * Busca artículos vendibles donde cada palabra del texto (ya normalizada, ver
 * normalizarBusqueda) aparezca en la descripción del artículo o en la
 * descripción de alguna de sus variantes (medida, talle, color).
 *
 * Ej: "harina 000"  → matchea "HARINA DE TRIGO 000 X 25KG"
 *     "hoja 2.40"   → matchea "Hoja de sierra circular..." porque tiene la variante 2.40
 *     "chomba azul" → matchea "Chomba de pique" por la variante color AZUL
 *
 * Cada palabra se evalúa por separado (puede matchear variantes distintas).
 * Mayúsculas y acentos no importan: la collation de MySQL
 * (utf8mb4_unicode_ci) ya compara case/accent-insensitive, y además el texto
 * del usuario se normaliza antes.
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
  limite = 8,
  rubro?: string
): Promise<ResultadoBusqueda> {
  const where = whereBusqueda(textoUsuario, rubro);
  if (!where) return { articulos: [], totalCoincidencias: 0 };

  const [encontrados, totalCoincidencias] = await Promise.all([
    prisma.bejArticulo.findMany({
      where,
      select: { codigo: true, descripcion: true, _count: { select: { variantes: true } } },
      take: limite,
    }),
    prisma.bejArticulo.count({ where }),
  ]);

  const articulos = encontrados.map((a) => ({
    codigo: a.codigo,
    descripcion: a.descripcion,
    tieneVariantes: a._count.variantes > 0,
  }));

  return { articulos, totalCoincidencias };
}

/**
 * Rubros del catálogo. Bejerman no tiene un campo de rubro en Articulos (la
 * tabla Rubro es contable y Grupos está vacía): el rubro es el prefijo del
 * código. Los nombres siguen las categorías de la tienda online vieja
 * (TQ_Rubros). Títulos ≤ 24 caracteres (filas de lista de WhatsApp).
 */
export const RUBROS: Record<string, string> = {
  ADI: "Aditivos",
  BAN: "Bandejas y bazar",
  CHA: "Chairas",
  CUC: "Cuchillería",
  DIS: "Discos y cuchillas",
  EMB: "Embudos",
  ESP: "Especias",
  FSL: "Frutas y semillas",
  GAN: "Ganchos",
  HIL: "Hilos",
  HOJ: "Hojas de sierra",
  INS: "Insumos",
  MAQ: "Máquinas",
  PIE: "Piedras de afilar",
  RED: "Sintéticos, papel, redes",
  REG: "Regalos",
  REP: "Repuestos",
  ROP: "Ropa de trabajo",
  TAB: "Tablas",
  TRI: "Tripas naturales",
  VAI: "Vainas",
  VAR: "Varios",
};

/** Prefijo de rubro de un código ("ADI1000013" → "ADI"). */
export const rubroDe = (codigo: string) => codigo.slice(0, 3).toUpperCase();

/** Nombre del rubro para mostrar ("ADI" → "Aditivos"); el prefijo si no está en la tabla. */
export const nombreRubro = (prefijo: string) => RUBROS[prefijo] ?? prefijo;

/**
 * Cuántas coincidencias de la búsqueda hay en cada rubro, de mayor a menor.
 * Sirve para ofrecer primero el rubro cuando la búsqueda mezcla cosas muy
 * distintas ("hamburguesa": condimentos, moldes y papel).
 */
export async function contarPorRubro(textoUsuario: string): Promise<{ rubro: string; cantidad: number }[]> {
  const where = whereBusqueda(textoUsuario);
  if (!where) return [];

  const codigos = await prisma.bejArticulo.findMany({ where, select: { codigo: true } });
  const conteo = new Map<string, number>();
  for (const { codigo } of codigos) conteo.set(rubroDe(codigo), (conteo.get(rubroDe(codigo)) ?? 0) + 1);

  return [...conteo.entries()]
    .map(([rubro, cantidad]) => ({ rubro, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

/** Filtro de Prisma de buscarArticulos; null si el texto no tiene palabras. */
function whereBusqueda(textoUsuario: string, rubro?: string) {
  const grupos = normalizarBusqueda(textoUsuario);
  if (grupos.length === 0) return null;

  // Solo artículos vendibles — no tiene sentido ofrecer insumos internos.
  return {
    esVendido: true,
    ...(rubro ? { codigo: { startsWith: rubro } } : {}),
    AND: grupos.map((formas) => ({
      OR: formas.flatMap((forma) => [
        { descripcion: { contains: forma } },
        {
          variantes: {
            some: {
              OR: [
                { desc1: { contains: forma } },
                { desc2: { contains: forma } },
                { desc3: { contains: forma } },
              ],
            },
          },
        },
        // Cómo lo llaman los clientes ("chinesca" → tripa de cerdo), cargado
        // desde la pantalla "Sinónimos del chat".
        { sinonimos: { some: { sinonimoNorm: { contains: forma } } } },
      ]),
    })),
  };
}

/**
 * Texto normalizado para guardar y comparar sinónimos y búsquedas:
 * minúsculas, sin acentos, sin puntuación y con espacios simples.
 * "Batter Económico" → "batter economico".
 */
export function normalizarTexto(texto: string): string {
  return sinAcentos(texto.toLowerCase())
    .replace(/[^\p{L}\p{N}.\/-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Variantes vendibles de un artículo (vacío si no tiene), ordenadas por
 * CodEle1, CodEle2, CodEle3. Para el stock de cada una, cruzar con
 * bejerman-live#consultarStockVariantes usando claveVariante().
 */
export async function obtenerVariantes(codGen: string): Promise<VarianteArticulo[]> {
  const filas = await prisma.bejArticuloVariante.findMany({
    where: { codGen },
    select: {
      codEle1: true, codEle2: true, codEle3: true,
      desc1: true, desc2: true, desc3: true,
      precioFin: true,
    },
    orderBy: [{ codEle1: "asc" }, { codEle2: "asc" }, { codEle3: "asc" }],
  });

  return filas.map((v) => ({ ...v, precioFin: v.precioFin?.toNumber() ?? null }));
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
 * Precios de varios artículos en una sola consulta (para mostrarlos en la
 * lista de resultados de búsqueda). Los que no están en la lista no vienen.
 */
export async function consultarPrecios(
  codigos: string[],
  listaCod: string = LISTA_PRECIO_DEFAULT
): Promise<Map<string, number>> {
  const registros = await prisma.bejListaPrecio.findMany({
    where: { listaCod, artCodigo: { in: codigos } },
    select: { artCodigo: true, precio: true },
  });

  return new Map(registros.map((r) => [r.artCodigo, r.precio.toNumber()]));
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

// Palabras demasiado genéricas como para servir de filtro (conectores,
// unidades sueltas, etc.) — se excluyen aunque sean frecuentes.
const STOPWORDS_FILTRO = new Set([
  "X", "DE", "DEL", "LA", "EL", "LOS", "LAS", "PARA", "CON", "Y", "A", "EN", "POR", "SIN",
  "KG", "GR", "GRS", "UN", "UNA", "UNI", "C", "S", "CM", "MM", "MT", "MTS", "LT", "CC", "N", "NRO",
]);

// ─── Filtros para acotar una búsqueda con muchos resultados ──────────────────
//
// Cuando una búsqueda da más resultados de los que entran en una lista, se
// ofrecen filtros armados con lo que diferencia a esos productos:
//   - Presentación: "1 kg", "5 kg", "25 kg" (sale de "por 5 Kg", "x 25 KG")
//   - Variedad "sin": "Sin ajo", "Sin especias" (antes se ofrecía "AJO" solo,
//     que decía lo contrario de lo que filtraba)
//   - Palabra: "Condimento", "Integral" (singular y plural juntos)
// Los filtros se aplican sobre la lista ya encontrada y se acumulan: cada uno
// deja estrictamente menos productos, así que no se puede entrar en un ciclo.
//
// Clave de un filtro (va en los ids de WhatsApp): "P:5 kg", "S:ajo", "W:condimento".

export interface FiltroSugerido {
  clave: string;
  titulo: string;
  cantidad: number;
  tipo: "presentacion" | "sin" | "palabra";
}

const UNIDADES_PRESENTACION: Record<string, string> = {
  kg: "kg", kgs: "kg", k: "kg", kilo: "kg", kilos: "kg",
  gr: "g", grs: "g", g: "g",
  lt: "l", lts: "l", l: "l", litro: "l", litros: "l",
  cc: "cc", ml: "ml",
  mt: "m", mts: "m", metro: "m", metros: "m",
  cm: "cm", mm: "mm",
  u: "u", un: "u", unid: "u", unidades: "u",
};

// El número no puede venir pegado a una letra: "S1211K" es un modelo, no 1211 kg.
const RE_PRESENTACION = /(?<![a-z0-9])(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|k|grs?|g|lts?|litros?|l|cc|ml|mts?|metros?|cm|mm|unid(?:ades)?|un|u)\b/i;

/** "Preparados para milanesas por 5 Kg" → "5 kg"; null si no dice presentación. */
function presentacionDe(descripcion: string): string | null {
  const m = sinAcentos(descripcion.toLowerCase()).match(RE_PRESENTACION);
  if (!m) return null;
  const numero = String(Number(m[1].replace(",", "."))).replace(".", ",");
  return `${numero} ${UNIDADES_PRESENTACION[m[2].toLowerCase()] ?? m[2].toLowerCase()}`;
}

/** Singular simple para comparar palabras ("preparados" → "preparado"). */
function singular(palabra: string): string {
  const p = sinAcentos(palabra.toLowerCase());
  return p.length > 3 && p.endsWith("s") ? p.slice(0, -1) : p;
}

/** Palabras de una descripción (minúsculas, sin acentos, sin puntuación de borde). */
function palabrasDescripcion(descripcion: string): string[] {
  return sinAcentos(descripcion.toLowerCase())
    .split(/[\s/]+/) // "manual/electrica" son dos palabras
    .map((p) => p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

/** Lo que va después de cada "sin" ("SIN AJO" → ["ajo"]). */
function sinDe(descripcion: string): string[] {
  const palabras = palabrasDescripcion(descripcion);
  return palabras.flatMap((p, i) => (p === "sin" && palabras[i + 1] ? [singular(palabras[i + 1])] : []));
}

/** ¿La descripción cumple el filtro? */
export function cumpleFiltro(descripcion: string, clave: string): boolean {
  const [tipo, ...resto] = clave.split(":");
  const valor = resto.join(":");
  if (tipo === "P") return presentacionDe(descripcion) === valor;
  if (tipo === "S") return sinDe(descripcion).includes(singular(valor));
  // "W:" o una palabra suelta (ids de mensajes anteriores: "CONDIMENTO").
  const palabra = singular(tipo === "W" ? valor : clave);
  return palabrasDescripcion(descripcion).some((p) => singular(p) === palabra);
}

/** Título legible de un filtro ya aplicado, para el encabezado ("5 kg", "sin ajo"). */
export function tituloFiltro(clave: string): string {
  const [tipo, ...resto] = clave.split(":");
  const valor = resto.join(":");
  if (tipo === "P") return valor;
  if (tipo === "S") return `sin ${valor}`;
  return (tipo === "W" ? valor : clave).toLowerCase();
}

const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Filtros que sirven para acotar `articulos`: presentaciones, "sin X" y
 * palabras. Solo se ofrecen los que dejan menos productos que ahora (y, las
 * palabras, que filtren de verdad: no una que tienen casi todos).
 */
export function sugerirFiltros(
  articulos: ArticuloEncontrado[],
  textoBusqueda: string,
  maxFiltros = 10
): FiltroSugerido[] {
  const total = articulos.length;
  const formasBuscadas = new Set(normalizarBusqueda(textoBusqueda).flat().map(singular));

  const presentaciones = new Map<string, number>();
  const sin = new Map<string, { titulo: string; cantidad: number }>();
  const palabras = new Map<string, { titulo: string; cantidad: number }>();

  for (const art of articulos) {
    const p = presentacionDe(art.descripcion);
    if (p) presentaciones.set(p, (presentaciones.get(p) ?? 0) + 1);

    const sinArt = sinDe(art.descripcion);
    for (const s of new Set(sinArt)) {
      const previa = sin.get(s);
      // El título conserva la palabra como está en la descripción ("Sin especias").
      const original = palabrasDescripcion(art.descripcion).find((p) => singular(p) === s) ?? s;
      sin.set(s, { titulo: previa?.titulo ?? `Sin ${original}`, cantidad: (previa?.cantidad ?? 0) + 1 });
    }

    const vistas = new Set<string>();
    for (const cruda of palabrasDescripcion(art.descripcion)) {
      const clave = singular(cruda);
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      if (clave.length < 3 || /\d/.test(clave)) continue; // números, "5kg", códigos
      if (STOPWORDS_FILTRO.has(clave.toUpperCase()) || clave === "sin") continue;
      if (UNIDADES_PRESENTACION[clave] || sinArt.includes(clave)) continue;
      if ([...formasBuscadas].some((f) => clave === f || (f.length >= 4 && clave.startsWith(f)))) continue;
      const previa = palabras.get(clave);
      palabras.set(clave, { titulo: previa?.titulo ?? capitalizar(clave), cantidad: (previa?.cantidad ?? 0) + 1 });
    }
  }

  const util = (cantidad: number) => cantidad >= 1 && cantidad < total;
  const numero = (p: string) => Number(p.split(" ")[0].replace(",", "."));

  // Las presentaciones más frecuentes (hasta MAX_PRESENTACIONES), mostradas
  // de menor a mayor. En rubros con muchos tamaños (cuchillos de 6 a 30 cm)
  // no pueden ocupar toda la lista: el tipo o la marca también importan.
  const filtrosPresentacion: FiltroSugerido[] = [...presentaciones.entries()]
    .filter(([, n]) => util(n))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PRESENTACIONES)
    .sort((a, b) => a[0].split(" ")[1].localeCompare(b[0].split(" ")[1]) || numero(a[0]) - numero(b[0]))
    .map(([p, n]) => ({ clave: `P:${p}`, titulo: p, cantidad: n, tipo: "presentacion" }));

  const filtrosSin: FiltroSugerido[] = [...sin.values()]
    .filter((v) => util(v.cantidad))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, MAX_SIN)
    .map((v) => ({ clave: `S:${v.titulo.slice(4).toLowerCase()}`, titulo: v.titulo, cantidad: v.cantidad, tipo: "sin" }));

  // Una palabra que tienen casi todos no acota (ej. "PREPARADO" en 10 de 11).
  const lugarPalabras = maxFiltros - filtrosPresentacion.length - filtrosSin.length;
  const filtrosPalabra: FiltroSugerido[] = [...palabras.entries()]
    .filter(([, v]) => v.cantidad >= 2 && v.cantidad <= Math.max(1, Math.floor(total * 0.75)))
    .sort((a, b) => b[1].cantidad - a[1].cantidad)
    .slice(0, Math.max(0, lugarPalabras))
    .map(([clave, v]) => ({ clave: `W:${clave}`, titulo: v.titulo, cantidad: v.cantidad, tipo: "palabra" }));

  // Presentación y "sin" primero (son lo que más distingue); palabras al final.
  return [...filtrosPresentacion, ...filtrosSin, ...filtrosPalabra];
}

const MAX_PRESENTACIONES = 4;
const MAX_SIN = 2;
