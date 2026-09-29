// lib/whatsapp/bejerman-clientes.ts
// Identificación del cliente de Bejerman (tabla Clientes, SBDACANE) a partir
// de lo que escribe en el chat. SOLO LECTURA.
//
// Criterio (definido con Hernán): nunca alcanza una sola coincidencia débil
// ("López" puede ser cualquiera). Se comparan cuatro señales y se identifica
// solo si UN único cliente cumple al menos dos:
//   - dirección: mismo número y alguna palabra de la calle
//   - nombre:    alguna palabra propia de la razón social / nombre de fantasía
//   - teléfono:  los últimos 7 dígitos del WhatsApp están en cli_Tel
//   - CUIT:      exacto
// Si no hay un único cliente así, no se genera NPW: el equipo lo verifica o
// lo da de alta. Nunca se le muestra al cliente una lista de clientes.

import { getBejermanPool } from "@/lib/bejerman-op";

export interface ClienteBejerman {
  codigo: string;
  razonSocial: string;
  nombreFantasia: string;
  direccion: string;
  localidad: string;
  telefonos: string;
  cuit: string;
  /** Lista de precios de la ficha (SIV = sin IVA, FIN = con IVA). */
  listaPrecios: string;
}

export interface DatosClienteEscritos {
  nombre?: string;
  direccion?: string;
  localidad?: string;
  cuit?: string;
  /** Número de WhatsApp tal cual llega de Meta (549341…). */
  telefono?: string;
}

export type Senal = "direccion" | "nombre" | "telefono" | "cuit";

export type ResultadoIdentificacion =
  | { estado: "identificado"; cliente: ClienteBejerman; senales: Senal[] }
  | { estado: "ambiguo"; candidatos: number }
  | { estado: "sin_coincidencia" };

// ─── Carga de clientes (con caché corta) ──────────────────────────────────────

// Son ~2.000 clientes: se traen todos y se compara en memoria (sin armar SQL
// con lo que escribe el cliente). La caché evita leerlos en cada mensaje.
const CACHE_MS = 5 * 60 * 1000;
const globalForClientes = globalThis as unknown as {
  clientesBejerman?: { cargados: number; clientes: ClienteBejerman[] };
};

export async function obtenerClientes(): Promise<ClienteBejerman[]> {
  const cache = globalForClientes.clientesBejerman;
  if (cache && Date.now() - cache.cargados < CACHE_MS) return cache.clientes;

  const pool = await getBejermanPool();
  const r = await pool.request().query(`
    SELECT cli_Cod, cli_RazSoc, cli_NomFantasia, cli_Direc, cli_Loc, cli_Tel, cli_CUIT, clidlp_Cod
    FROM Clientes
    WHERE cli_Habilitado = 1
  `);
  const t = (v: unknown) => String(v ?? "").trim();
  const clientes = r.recordset.map((c: Record<string, unknown>) => ({
    codigo: t(c.cli_Cod),
    razonSocial: t(c.cli_RazSoc),
    nombreFantasia: t(c.cli_NomFantasia),
    direccion: t(c.cli_Direc),
    localidad: t(c.cli_Loc),
    telefonos: t(c.cli_Tel),
    cuit: t(c.cli_CUIT).replace(/\D/g, ""),
    listaPrecios: t(c.clidlp_Cod) || "FIN",
  }));
  globalForClientes.clientesBejerman = { cargados: Date.now(), clientes };
  return clientes;
}

/** Un cliente por código (para el vínculo WhatsApp → cliente guardado). */
export async function obtenerCliente(codigo: string): Promise<ClienteBejerman | null> {
  return (await obtenerClientes()).find((c) => c.codigo === codigo.trim()) ?? null;
}

// ─── Normalización ────────────────────────────────────────────────────────────

const normalizar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ");

const palabras = (t: string) => normalizar(t).split(/\s+/).filter(Boolean);

// Palabras que no identifican a nadie: formas societarias, conectores y
// rubros comunes ("Carnicería López" no puede matchear por "carnicería").
const GENERICAS_NOMBRE = new Set([
  "SRL", "SA", "SAS", "SH", "SC", "SOC", "SOCIEDAD", "CIA", "HNOS", "HERMANOS", "E", "HIJOS", "HIJO",
  "DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "EN", "AL",
  "CARNICERIA", "CARNICERIAS", "CARNES", "FRIGORIFICO", "ALMACEN", "SUPERMERCADO", "SUPER",
  "AUTOSERVICIO", "DISTRIBUIDORA", "MINIMERCADO", "MERCADO", "POLLERIA", "FIAMBRERIA", "COMERCIAL",
  "DON", "DONA", "LOCAL", "NEGOCIO", "COMERCIO",
]);

const GENERICAS_CALLE = new Set([
  "CALLE", "AV", "AVDA", "AVENIDA", "BV", "BVARD", "BOULEVARD", "BULEVAR", "PJE", "PASAJE",
  "NRO", "NUM", "NUMERO", "N", "DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "ESQ", "ESQUINA",
  "PISO", "DPTO", "DEPTO", "LOCAL", "KM", "RUTA",
]);

/** Palabras que sirven para comparar nombres (3+ letras, no genéricas). */
function palabrasNombre(t: string): string[] {
  return palabras(t).filter((p) => p.length >= 3 && !/^\d+$/.test(p) && !GENERICAS_NOMBRE.has(p));
}

/** "Colón 1357", "BV. OROÑO 1234 PB" → { numero: "1357", calle: ["COLON"] }. */
export function partesDireccion(t: string): { numero: string | null; calle: string[] } {
  const ps = palabras(t);
  // El número de puerta es el último número de 2 a 5 dígitos ("9 de Julio 850" → 850).
  const numeros = ps.filter((p) => /^\d{2,5}$/.test(p));
  const numero = numeros.length > 0 ? String(Number(numeros[numeros.length - 1])) : null;
  const calle = ps.filter((p) => p.length >= 3 && !/^\d+$/.test(p) && !GENERICAS_CALLE.has(p));
  return { numero, calle };
}

// Dos palabras "coinciden" si son iguales o una es el comienzo de la otra con
// 4+ letras (abreviaturas: "S MARTIN" vs "SAN MARTIN" coincide por "MARTIN";
// "MITRE" vs "MITRE"; "OROÑO" vs "ORONO").
const coinciden = (a: string, b: string) =>
  a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

const algunaCoincide = (xs: string[], ys: string[]) => xs.some((x) => ys.some((y) => coinciden(x, y)));

/** Últimos 7 dígitos de cada número de un campo con uno o varios teléfonos. */
function finalesTelefono(t: string): string[] {
  return t
    .split(/[\/;,]|\s{2,}|\bY\b|\bO\b/i)
    .map((p) => p.replace(/\D/g, ""))
    .filter((p) => p.length >= 7)
    .map((p) => p.slice(-7));
}

// ─── Identificación ───────────────────────────────────────────────────────────

// Una palabra de nombre que aparece en más clientes que esto es común
// ("CARLOS" en 58, "JUAN" en 56): sola no identifica.
const MAX_FRECUENCIA_PALABRA_RARA = 8;

/** En cuántos clientes aparece cada palabra de nombre. */
function frecuenciasNombre(clientes: ClienteBejerman[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const c of clientes) {
    for (const p of new Set([...palabrasNombre(c.razonSocial), ...palabrasNombre(c.nombreFantasia)])) {
      freq.set(p, (freq.get(p) ?? 0) + 1);
    }
  }
  return freq;
}

function senalesDe(c: ClienteBejerman, datos: DatosClienteEscritos, frecuencias: Map<string, number>): Senal[] {
  const senales: Senal[] = [];

  if (datos.direccion) {
    const escrita = partesDireccion(datos.direccion);
    const ficha = partesDireccion(c.direccion);
    // Si dijo la localidad y la ficha tiene otra, no es la misma dirección.
    const locEscrita = datos.localidad ? palabrasNombre(datos.localidad) : [];
    const locFicha = palabrasNombre(c.localidad);
    const mismaLocalidad = locEscrita.length === 0 || locFicha.length === 0 || algunaCoincide(locEscrita, locFicha);
    if (escrita.numero && escrita.numero === ficha.numero && algunaCoincide(escrita.calle, ficha.calle) && mismaLocalidad) {
      senales.push("direccion");
    }
  }

  if (datos.nombre) {
    const escritas = palabrasNombre(datos.nombre);
    const ficha = [...new Set([...palabrasNombre(c.razonSocial), ...palabrasNombre(c.nombreFantasia)])];
    const coincidentes = ficha.filter((f) => escritas.some((e) => coinciden(e, f)));
    // Un nombre de pila o apellido común ("JUAN", "RODRIGUEZ") solo no alcanza:
    // hacen falta dos palabras, o una que casi nadie más tenga.
    const rara = coincidentes.some((p) => (frecuencias.get(p) ?? 0) <= MAX_FRECUENCIA_PALABRA_RARA);
    if (coincidentes.length >= 2 || rara) senales.push("nombre");
  }

  if (datos.telefono) {
    const propio = datos.telefono.replace(/\D/g, "").slice(-7);
    if (propio.length === 7 && finalesTelefono(c.telefonos).includes(propio)) senales.push("telefono");
  }

  if (datos.cuit) {
    const cuit = datos.cuit.replace(/\D/g, "");
    if (cuit.length === 11 && cuit === c.cuit) senales.push("cuit");
  }

  return senales;
}

/**
 * Busca al cliente con lo que escribió. Identifica solo si un único cliente
 * cumple al menos dos señales; si hay empate entre varios con dos, gana el
 * que tenga más, y si siguen empatados es "ambiguo" (lo resuelve el equipo).
 */
export async function identificarCliente(datos: DatosClienteEscritos): Promise<ResultadoIdentificacion> {
  const clientes = await obtenerClientes();
  const frecuencias = frecuenciasNombre(clientes);

  const candidatos = clientes
    .map((cliente) => ({ cliente, senales: senalesDe(cliente, datos, frecuencias) }))
    .filter((c) => c.senales.length >= 2)
    .sort((a, b) => b.senales.length - a.senales.length);

  if (candidatos.length === 0) return { estado: "sin_coincidencia" };
  const [mejor, segundo] = candidatos;
  if (segundo && segundo.senales.length === mejor.senales.length) {
    return { estado: "ambiguo", candidatos: candidatos.filter((c) => c.senales.length === mejor.senales.length).length };
  }
  return { estado: "identificado", cliente: mejor.cliente, senales: mejor.senales };
}
