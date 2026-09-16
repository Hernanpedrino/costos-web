// lib/whatsapp/order-history.ts
// Consulta del último envío por reparto de un cliente, para ofrecerle
// "repetir la misma entrega" en vez de volver a pedirle los datos.
//
// TODO: hoy no hay ninguna fuente de historial de pedidos todavía (recién
// vamos a tener eso una vez que la creación de notas de pedido en Bejerman
// esté conectada, o si armamos una tabla propia de pedidos en MySQL). Por
// ahora esta función siempre devuelve null, así el flujo de reparto pide
// los datos de siempre — pero ya queda el enganche listo: el día que haya
// de dónde leer el historial, solo hay que completar esta función.

export interface UltimoEnvio {
  nombreLocal: string;
  nombrePersona: string;
  direccion: string;
}

export async function buscarUltimoEnvio(_telefono: string): Promise<UltimoEnvio | null> {
  return null;
}
