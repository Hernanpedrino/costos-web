// lib/whatsapp/delivery-schedule.ts
// Reglas de horarios: cuándo corresponde el reparto (envío) y datos fijos
// del local para el mensaje de retiro.

const ZONA_HORARIA = "America/Argentina/Buenos_Aires";
const HORA_CORTE = { horas: 9, minutos: 30 };

// Repartos: solo de lunes (1) a viernes (5). 0 = domingo, 6 = sábado.
const DIAS_HABILES_REPARTO = [1, 2, 3, 4, 5];

const NOMBRES_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export interface FechaEntrega {
  esHoy: boolean;
  /** Texto listo para mostrarle al cliente: "hoy" o el nombre del día ("lunes", "martes", ...). */
  etiqueta: string;
}

/**
 * Determina cuándo corresponde el reparto de un pedido hecho "ahora":
 * - Si hoy es día hábil de reparto (lun-vie) y todavía no pasaron las 9:30hs → hoy.
 * - Si no (fin de semana, o ya pasó el corte) → el próximo día hábil de reparto.
 */
export function calcularFechaEntrega(ahora: Date = new Date()): FechaEntrega {
  const formateador = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const partes = formateador.formatToParts(ahora);
  const diaTexto = partes.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? "0");

  const diasMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const diaActual = diasMap[diaTexto] ?? 1;

  const minutosActuales = hora * 60 + minuto;
  const minutosCorte = HORA_CORTE.horas * 60 + HORA_CORTE.minutos;

  const esHabil = (dia: number) => DIAS_HABILES_REPARTO.includes(dia);

  if (esHabil(diaActual) && minutosActuales < minutosCorte) {
    return { esHoy: true, etiqueta: "hoy" };
  }

  // Buscar el próximo día hábil de reparto (salta fines de semana).
  let diaEntrega = diaActual;
  do {
    diaEntrega = (diaEntrega + 1) % 7;
  } while (!esHabil(diaEntrega));

  return { esHoy: false, etiqueta: NOMBRES_DIA[diaEntrega] };
}

/** Datos fijos del local, para el mensaje de confirmación de retiro. */
export const INFO_RETIRO = {
  direccion: "Constitución 2398 esquina Viamonte, Rosario",
  horario: "Lunes a Viernes de 8:00 a 16:00hs, Sábados de 8:00 a 13:00hs",
};