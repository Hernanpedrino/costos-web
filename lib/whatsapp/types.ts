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
  | "ESPERANDO_CONFIRMACION"
  | "CONSULTA_LIBRE";

export interface CarritoItem {
  codigoArticulo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}