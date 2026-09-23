// lib/whatsapp/cola.ts
//
// Cola serial POR CLAVE (en el chatbot, la clave es el teléfono). Si un
// cliente manda dos mensajes seguidos (o toca un botón mientras el bot todavía
// está buscando), el segundo espera a que termine el primero: si no, los dos
// leen la misma sesión y el último que guarda pisa lo que hizo el otro.
// Clientes distintos se procesan en paralelo.
//
// Mismo patrón que lib/cola-op.ts: en memoria, vale porque PM2 corre UNA sola
// instancia de la app.

const globalForCola = globalThis as unknown as { colasPorClave?: Map<string, Promise<unknown>> };

function colas(): Map<string, Promise<unknown>> {
  if (!globalForCola.colasPorClave) globalForCola.colasPorClave = new Map();
  return globalForCola.colasPorClave;
}

export function encolarPorClave<T>(clave: string, trabajo: () => Promise<T>): Promise<T> {
  const mapa = colas();
  const anterior = mapa.get(clave) ?? Promise.resolve();
  // El error de un trabajo no tiene que frenar a los que vienen detrás
  const actual = anterior.catch(() => {}).then(trabajo);
  const cola = actual.catch(() => {});
  mapa.set(clave, cola);
  // Si cuando termina nadie más se encoló detrás, liberamos la entrada (si no,
  // el Map crece con un teléfono por cada cliente que escribió alguna vez).
  void cola.then(() => {
    if (mapa.get(clave) === cola) mapa.delete(clave);
  });
  return actual;
}
