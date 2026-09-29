// lib/whatsapp/types.ts
// Tipos mínimos para los payloads que manda Meta al webhook.
// Referencia completa: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: {
    messaging_product: "whatsapp";
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts?: { profile: { name: string }; wa_id: string }[];
    messages?: WhatsAppMessage[];
    statuses?: WhatsAppStatus[]; // acuses de recibo (sent/delivered/read)
  };
  field: "messages";
}

export interface WhatsAppMessage {
  from: string; // número del usuario, ej "5493411234567"
  id: string;
  timestamp: string;
  type: "text" | "interactive" | "button" | "image" | "document" | "audio" | "location";
  text?: { body: string };
  /** Ubicación compartida (📎 → Ubicación, o el botón de location_request_message). */
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

export interface WhatsAppStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
}

// ---- Estados de conversación propios (para tu máquina de estados) ----

export type ConversationState =
  | "MENU_PRINCIPAL"
  | "VIENDO_CATALOGO"
  | "ARMANDO_PEDIDO"
  | "ESPERANDO_VARIANTE" // artículo con variantes (medida, talle, color): falta elegir cuál
  | "ESPERANDO_DETALLE_CONSULTA" // rubro de atención personal: el cliente describe qué necesita
  | "ESPERANDO_CANTIDAD"
  | "ESPERANDO_TIPO_ENTREGA"
  | "ESPERANDO_REPETIR_ENVIO"
  | "ESPERANDO_NOMBRE_LOCAL"
  | "ESPERANDO_NOMBRE_PERSONA"
  | "ESPERANDO_DIRECCION"
  | "ESPERANDO_LOCALIDAD" // reparto con dirección escrita sin localidad reconocible
  | "ESPERANDO_CONFIRMACION"
  | "CONSULTA_LIBRE"
  | "ESPERANDO_ASUNTO_ATENCION" // "Hablar con persona": eligiendo el tema
  | "ESPERANDO_MENSAJE_ATENCION" // "Hablar con persona": falta escribir la consulta
  | "ATENCION_PERSONAL"; // pidió hablar con una persona: el bot no responde texto

export interface CarritoItem {
  codigoArticulo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  // Variante de Bejerman (CodEle1/2/3, trimmeados; '' si el artículo no tiene
  // variantes). La nota de pedido necesita CodGen + CodEle1/2/3. Las sesiones
  // guardadas antes de las variantes no los traen: el handler los completa
  // con '' al leer la sesión.
  codEle1: string;
  codEle2: string;
  codEle3: string;
  /** Descripción de la variante para mostrar, ej. "2.40" o "TALLE 46 / BLANCO". '' si no hay. */
  descVariante: string;
  /** Unidad de venta ('UN', 'KG', 'MT', 'CJ', 'LT'). Opcional: sesiones viejas no la traen → 'UN'. */
  unidad?: string;
  /**
   * Producto "a consultar" (rubros que asesora el equipo: cuchillos,
   * repuestos, bandejas, chairas, vainas): el cliente describe lo que
   * necesita y el equipo lo resuelve. Sin precio ni variante.
   */
  consulta?: boolean;
  /** Identifica la línea de consulta (puede haber varias del mismo rubro). */
  idConsulta?: string;
}