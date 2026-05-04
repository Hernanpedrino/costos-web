/**
 * types/index.ts
 *
 * Sistema centralizado de tipos para el proyecto.
 * Basado en los modelos Prisma: Insumo, Formula, FormulaDetalle.
 *
 * Organización:
 *  1. Primitivos y helpers
 *  2. Tipos base (sin relaciones)
 *  3. Tipos con relaciones
 *  4. Unión discriminada del ingrediente
 *  5. DTOs (create / update / form)
 *  6. Respuestas de API
 */

import type { Prisma } from "@/generated/prisma";

// ─────────────────────────────────────────────────────────────
// 1. PRIMITIVOS Y HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Prisma devuelve Decimal (de la lib "decimal.js") para campos @db.Decimal.
 * En los endpoints de API necesitás serializarlo a number o string.
 * Usá PriceAsNumber cuando el valor ya fue transformado con `.toNumber()`.
 */
export type PrismaDecimal = Prisma.Decimal;
export type PriceAsNumber = number; // después de llamar .toNumber()
export type PriceAsString = string; // después de llamar .toString()

/** UUID string — alias semántico para IDs */
export type UUID = string;

/** ISO 8601 string — para fechas serializadas en JSON */
export type ISODateString = string;

// ─────────────────────────────────────────────────────────────
// 2. TIPOS BASE (solo campos del modelo, sin relaciones)
// ─────────────────────────────────────────────────────────────

/** Insumo tal cual sale de Prisma (con Decimal). Usalo internamente. */
export type InsumoRaw = Prisma.InsumoGetPayload<Record<string, never>>;

/** Insumo serializado (listo para JSON / API response). */
export interface Insumo {
  id: UUID;
  name: string;
  suplier: string;
  price: PriceAsNumber;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Formula base (sin relaciones). */
export type FormulaRaw = Prisma.FormulaGetPayload<Record<string, never>>;

export interface Formula {
  id: UUID;
  name: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** FormulaDetalle base (sin relaciones). */
export type FormulaDetalleRaw = Prisma.FormulaDetalleGetPayload<Record<string, never>>;

export interface FormulaDetalle {
  id: UUID;
  cantidad: string;
  formulaId: UUID;
  insumoId: UUID | null;
  subFormulaId: UUID | null;
}

// ─────────────────────────────────────────────────────────────
// 3. TIPOS CON RELACIONES
// ─────────────────────────────────────────────────────────────

/**
 * Insumo con todos sus FormulaDetalle donde es usado.
 * Equivale a: prisma.insumo.findUnique({ include: { usadoEn: true } })
 */
export type InsumoWithUsage = Prisma.InsumoGetPayload<{
  include: { usadoEn: true };
}>;

/**
 * Formula con sus items (FormulaDetalle), donde cada item
 * incluye el insumo o sub-fórmula relacionados.
 */
export type FormulaWithItems = Prisma.FormulaGetPayload<{
  include: {
    items: {
      include: {
        insumo: true;
        subFormula: true;
      };
    };
  };
}>;

/**
 * Formula completa: items + relaciones + donde se usa como ingrediente.
 * Útil para vistas de detalle.
 */
export type FormulaFull = Prisma.FormulaGetPayload<{
  include: {
    items: {
      include: {
        insumo: true;
        subFormula: true;
      };
    };
    comoIngrediente: {
      include: {
        formula: true;
      };
    };
  };
}>;

/**
 * FormulaDetalle con sus dos posibles ingredientes.
 * Prisma ya deja ambos como opcionales según el schema.
 */
export type FormulaDetalleWithIngredient = Prisma.FormulaDetalleGetPayload<{
  include: {
    insumo: true;
    subFormula: true;
  };
}>;

// ─────────────────────────────────────────────────────────────
// 4. UNIÓN DISCRIMINADA DEL INGREDIENTE
// ─────────────────────────────────────────────────────────────

/**
 * En tu schema un FormulaDetalle tiene SIEMPRE un ingrediente,
 * que puede ser un Insumo O una sub-fórmula (nunca ambos, nunca ninguno).
 *
 * Esta unión discriminada expresa eso con type-safety completo.
 * Usala cuando necesitás hacer lógica dependiendo del tipo de ingrediente.
 */
export type FormulaDetalleConInsumo = Omit<
  FormulaDetalle,
  "insumoId" | "subFormulaId"
> & {
  tipo: "insumo";
  insumoId: UUID;
  subFormulaId: null;
  ingrediente: Insumo;
};

export type FormulaDetalleConSubFormula = Omit<
  FormulaDetalle,
  "insumoId" | "subFormulaId"
> & {
  tipo: "subFormula";
  insumoId: null;
  subFormulaId: UUID;
  ingrediente: Formula;
};

export type FormulaDetalleDiscriminado =
  | FormulaDetalleConInsumo
  | FormulaDetalleConSubFormula;

/**
 * Type guard: comprobá si un detalle tiene un Insumo como ingrediente.
 *
 * @example
 * if (esDetalleDeInsumo(detalle)) {
 *   console.log(detalle.ingrediente.price); // ✅ type-safe
 * }
 */
export function esDetalleDeInsumo(
  detalle: FormulaDetalleDiscriminado
): detalle is FormulaDetalleConInsumo {
  return detalle.tipo === "insumo";
}

/**
 * Normaliza un FormulaDetalle de Prisma a la unión discriminada.
 * Lanzá un error si el item no tiene ningún ingrediente (datos inválidos).
 */
export function normalizarDetalle(
  raw: FormulaDetalleWithIngredient
): FormulaDetalleDiscriminado {
  const base: FormulaDetalle = {
    id: raw.id,
    cantidad: raw.cantidad,
    formulaId: raw.formulaId,
    insumoId: raw.insumoId,
    subFormulaId: raw.subFormulaId,
  };

  if (raw.insumo) {
    return {
      ...base,
      tipo: "insumo",
      insumoId: raw.insumo.id,
      subFormulaId: null,
      ingrediente: serializarInsumo(raw.insumo),
    };
  }

  if (raw.subFormula) {
    return {
      ...base,
      tipo: "subFormula",
      insumoId: null,
      subFormulaId: raw.subFormula.id,
      ingrediente: serializarFormula(raw.subFormula),
    };
  }

  throw new Error(
    `FormulaDetalle ${raw.id} no tiene insumo ni subFórmula asignados.`
  );
}

// ─────────────────────────────────────────────────────────────
// 5. DTOs (Data Transfer Objects para forms y API requests)
// ─────────────────────────────────────────────────────────────

// — Insumo ————————————————————————————

export interface CreateInsumoDTO {
  name: string;
  suplier: string;
  /** Precio como string para manejar decimales en formularios */
  price: string;
}

export interface UpdateInsumoDTO extends Partial<CreateInsumoDTO> {
  id: UUID;
}

// — Formula ———————————————————————————

export interface CreateFormulaDetalleDTO {
  cantidad: string;
  /** Exactamente uno de los dos debe estar presente */
  insumoId?: UUID;
  subFormulaId?: UUID;
}

export interface CreateFormulaDTO {
  name: string;
  items: CreateFormulaDetalleDTO[];
}

export interface UpdateFormulaDTO extends Partial<Omit<CreateFormulaDTO, "items">> {
  id: UUID;
  /** Si se provee, reemplaza todos los items existentes */
  items?: CreateFormulaDetalleDTO[];
}

// ─────────────────────────────────────────────────────────────
// 6. RESPUESTAS DE API
// ─────────────────────────────────────────────────────────────

/** Wrapper genérico para respuestas de Next.js API routes */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

/** Respuesta paginada */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Tipos de respuesta específicos

export type InsumoResponse = ApiResponse<Insumo>;
export type InsumosResponse = ApiResponse<Insumo[]>;
export type InsumosPaginadosResponse = PaginatedResponse<Insumo>;

export type FormulaResponse = ApiResponse<Formula>;
export type FormulasResponse = ApiResponse<Formula[]>;
export type FormulaDetalleResponse = ApiResponse<FormulaDetalleDiscriminado[]>;

// ─────────────────────────────────────────────────────────────
// HELPERS DE SERIALIZACIÓN
// ─────────────────────────────────────────────────────────────

/**
 * Convierte un InsumoRaw de Prisma (con Decimal) al tipo Insumo serializable.
 * Llamá esto en tus Server Actions o API routes antes de devolver datos al cliente.
 *
 * @example
 * // En un Server Action o API route:
 * const raw = await prisma.insumo.findUniqueOrThrow({ where: { id } });
 * return serializarInsumo(raw);
 */
export function serializarInsumo(raw: InsumoRaw): Insumo {
  return {
    id: raw.id,
    name: raw.name,
    suplier: raw.suplier,
    price: raw.price.toNumber(),
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
  };
}

export function serializarFormula(raw: FormulaRaw): Formula {
  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
  };
}