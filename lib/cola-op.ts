// lib/cola-op.ts
//
// Cola serial para la creación de OP desde la web. La numeración de Bejerman
// es MAX+1 (ProdOrdenes, ord_NroComp, series S-ENT/S-SAL), así que dos
// procesamientos simultáneos tomarían los mismos números. Cada trabajo espera
// a que termine el anterior.
//
// Es en memoria: vale porque PM2 corre UNA sola instancia de la app. Para
// procesos separados (scripts/crear-op.ts) la exclusión la da el applock de
// SQL Server en crearOPparaLinea.

const globalForCola = globalThis as unknown as { colaOP?: Promise<unknown> }

export function encolarOP<T>(trabajo: () => Promise<T>): Promise<T> {
  const anterior = globalForCola.colaOP ?? Promise.resolve()
  // El error de un trabajo no tiene que frenar a los que vienen detrás
  const actual = anterior.catch(() => {}).then(trabajo)
  globalForCola.colaOP = actual.catch(() => {})
  return actual
}
