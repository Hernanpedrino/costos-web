"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import {
  getPlanillaAction,
  buscarProductosAction,
  agregarLineaAction,
  editarLineaAction,
  eliminarLineaAction,
  confirmarPlanillaAction,
  procesarPlanillaAction,
  type PlanillaDia,
  type LineaPlanilla,
  type ProductoProducible,
} from "@/actions/produccion"
import {
  previsualizarConsumoAction,
  type PrevisionConsumo,
} from "@/actions/produccion-bejerman"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoyISO() {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`
}

function formatFecha(iso: string) {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

function diaAnterior(iso: string) {
  const [a, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10)
}

function diaSiguiente(iso: string) {
  const [a, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10)
}

const formatNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(n)

/** 'DDMMAAAA' → 'YYYY-MM-DD' para el input date; null si no tiene ese formato */
function loteAISO(lote: string): string | null {
  const l = lote.trim()
  if (!/^\d{8}$/.test(l)) return null
  const d = l.slice(0, 2), m = l.slice(2, 4), a = l.slice(4, 8)
  const dn = Number(d), mn = Number(m)
  if (dn < 1 || dn > 31 || mn < 1 || mn > 12) return null
  return `${a}-${m}-${d}`
}

/** 'YYYY-MM-DD' → 'DDMMAAAA' */
function isoALote(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}${m}${a}`
}

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props {
  planillaInicial: PlanillaDia
}

export function ProduccionClient({ planillaInicial }: Props) {
  const [planilla, setPlanilla] = useState(planillaInicial)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "error"; msg: string } | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [detalleProceso, setDetalleProceso] = useState<string[]>([])

  // Alta
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<ProductoProducible[]>([])
  const [seleccionado, setSeleccionado] = useState<ProductoProducible | null>(null)
  const [cantidad, setCantidad] = useState("")

  // Lote: se guarda siempre como DDMMAAAA
  const [lote, setLote] = useState(isoALote(hoyISO()))
  const [loteTocado, setLoteTocado] = useState(false)

  // Previsualización de consumo
  const [prevision, setPrevision] = useState<PrevisionConsumo | null>(null)
  const [cargandoPrev, setCargandoPrev] = useState(false)

  // Edición inline
  const [editando, setEditando] = useState<number | null>(null)
  const [editCantidad, setEditCantidad] = useState("")
  const [editLote, setEditLote] = useState("")

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Autocompletado de producto
  useEffect(() => {
    if (seleccionado) return
    if (debounce.current) clearTimeout(debounce.current)
    if (busqueda.trim().length < 2) { setResultados([]); return }
    debounce.current = setTimeout(async () => {
      setResultados(await buscarProductosAction(busqueda))
    }, 300)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [busqueda, seleccionado])

  // Previsualización: qué partidas se van a consumir
  useEffect(() => {
    const cant = Number(cantidad.replace(",", "."))
    if (!seleccionado || !Number.isFinite(cant) || cant <= 0) {
      setPrevision(null)
      return
    }
    setCargandoPrev(true)
    const t = setTimeout(async () => {
      const p = await previsualizarConsumoAction(seleccionado.codigo, cant)
      setPrevision(p)
      setCargandoPrev(false)
      // El lote sigue al insumo clave mientras el usuario no lo haya tocado
      if (p?.loteSugerido && !loteTocado) setLote(p.loteSugerido)
    }, 400)
    return () => { clearTimeout(t); setCargandoPrev(false) }
  }, [seleccionado, cantidad, loteTocado])

  async function refrescar(fecha = planilla.fecha) {
    setPlanilla(await getPlanillaAction(fecha))
  }

  function cambiarFecha(fecha: string) {
    startTransition(async () => {
      await refrescar(fecha)
      setFeedback(null)
      setEditando(null)
    })
  }

  function elegirProducto(p: ProductoProducible) {
    setSeleccionado(p)
    setBusqueda(`${p.codigo} — ${p.descripcion}`)
    setResultados([])
  }

  function limpiarFormulario() {
    setSeleccionado(null)
    setBusqueda("")
    setCantidad("")
    setPrevision(null)
    setResultados([])
    setLote(isoALote(hoyISO()))
    setLoteTocado(false)
  }

  async function agregar() {
    if (!seleccionado) {
      setFeedback({ tipo: "error", msg: "Elegí un producto de la lista." })
      return
    }
    if (!/^\d{8}$/.test(lote.trim())) {
      setFeedback({ tipo: "error", msg: "El lote tiene que ser de 8 dígitos (DDMMAAAA)." })
      return
    }
    setFeedback(null)

    const result = await agregarLineaAction({
      fechaISO: planilla.fecha,
      productoCod: seleccionado.codigo,
      productoDesc: seleccionado.descripcion,
      formulaCod: seleccionado.formula,
      loteISO: loteAISO(lote) ?? hoyISO(),  // la action normaliza a DDMMAAAA
      cantidad,
    })

    if (result.success) {
      limpiarFormulario()
      await refrescar()
    } else {
      setFeedback({ tipo: "error", msg: result.error })
    }
  }

  function iniciarEdicion(l: LineaPlanilla) {
    setEditando(l.id)
    setEditCantidad(String(l.cantidad))
    setEditLote(loteAISO(l.lote) ?? hoyISO())
    setFeedback(null)
  }

  async function guardarEdicion(id: number) {
    const result = await editarLineaAction({ id, loteISO: editLote, cantidad: editCantidad })
    if (result.success) { setEditando(null); await refrescar() }
    else setFeedback({ tipo: "error", msg: result.error })
  }

  async function eliminar(l: LineaPlanilla) {
    if (!confirm(`¿Eliminar ${l.productoCod} — ${l.productoDesc}?`)) return
    const result = await eliminarLineaAction(l.id)
    if (result.success) await refrescar()
    else setFeedback({ tipo: "error", msg: result.error })
  }

  /**
   * Confirma y crea las OP en Bejerman en un solo paso. Las líneas que ya
   * tienen orden no se vuelven a tocar, así que se puede repetir durante el día.
   */
  async function confirmar() {
    if (!confirm(
      `Se van a crear ${pendientes} orden(es) de producción en Bejerman, ` +
      `con el consumo de insumos correspondiente. ¿Continuar?`
    )) return

    setProcesando(true)
    setFeedback(null)
    setDetalleProceso([])

    try {
      const conf = await confirmarPlanillaAction(planilla.fecha)
      if (!conf.success) {
        setFeedback({ tipo: "error", msg: conf.error })
        return
      }

      const proc = await procesarPlanillaAction(planilla.fecha)
      if (!proc.success) {
        setFeedback({ tipo: "error", msg: proc.error })
        return
      }

      const { ok, errores, detalle } = proc.data
      setDetalleProceso(detalle)

      if (errores.length === 0) {
        setFeedback({ tipo: "ok", msg: `${ok} orden(es) creada(s) en Bejerman.` })
      } else {
        setFeedback({
          tipo: "error",
          msg: `${ok} creada(s), ${errores.length} con error: ` +
               errores.map(e => `${e.producto} (${e.error})`).join(" | "),
        })
      }
      await refrescar()
    } finally {
      setProcesando(false)
    }
  }

  const badgeEstado =
    planilla.estado === "procesada" ? "bg-green-100 text-green-800"
    : planilla.estado === "confirmada" ? "bg-blue-100 text-blue-800"
    : "bg-gray-100 text-gray-700"

  const hayFaltante = prevision?.insumos.some(i => i.faltante > 0) ?? false
  const pendientes = planilla.lineas.filter(l => !l.ordenBej).length

  return (
    <div className="space-y-6">

      {/* Cabecera */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => cambiarFecha(diaAnterior(planilla.fecha))}
                className="px-3 py-1.5 border rounded hover:bg-gray-50">←</button>
        <input type="date" value={planilla.fecha}
               onChange={e => cambiarFecha(e.target.value)}
               className="border rounded px-3 py-1.5" />
        <button onClick={() => cambiarFecha(diaSiguiente(planilla.fecha))}
                className="px-3 py-1.5 border rounded hover:bg-gray-50">→</button>
        <span className="text-lg font-medium">{formatFecha(planilla.fecha)}</span>
        <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${badgeEstado}`}>
          {planilla.estado}
        </span>
        {isPending && <span className="text-sm text-gray-500">Cargando…</span>}
      </div>

      {feedback && (
        <div className={`px-4 py-2 rounded text-sm ${
          feedback.tipo === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {feedback.msg}
        </div>
      )}

      {/* Alta — disponible todo el día: la producción se carga a medida que se envasa */}
      <div className="border rounded-lg p-4 space-y-4">
          <h2 className="font-medium">Agregar producción</h2>

          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end">
            <div className="relative">
              <label className="block text-sm text-gray-600 mb-1">Producto</label>
              <input type="text" value={busqueda}
                     onChange={e => { setBusqueda(e.target.value); setSeleccionado(null) }}
                     placeholder="Código o descripción…"
                     className="w-full border rounded px-3 py-2" />
              {resultados.length > 0 && (
                <ul className="absolute z-10 w-full bg-white border rounded mt-1 max-h-64 overflow-auto shadow-lg">
                  {resultados.map(p => (
                    <li key={p.codigo}>
                      <button onClick={() => elegirProducto(p)}
                              className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm">
                        <span className="font-mono text-xs text-gray-500">{p.codigo}</span>{" "}
                        {p.descripcion}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Cantidad</label>
              <input type="text" inputMode="decimal" value={cantidad}
                     onChange={e => setCantidad(e.target.value)}
                     className="w-full border rounded px-3 py-2" />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Lote
                {prevision?.loteSugerido && !loteTocado && (
                  <span className="ml-1 text-xs text-green-700">(del insumo)</span>
                )}
              </label>
              <input type="text" inputMode="numeric" maxLength={8} value={lote}
                     onChange={e => { setLote(e.target.value); setLoteTocado(true) }}
                     placeholder="DDMMAAAA"
                     className={`w-full border rounded px-3 py-2 font-mono ${
                       prevision?.loteSugerido && !loteTocado ? "border-green-600 bg-green-50" : ""}`} />
            </div>

            <button onClick={agregar}
                    disabled={!seleccionado || !cantidad || hayFaltante}
                    className="px-5 py-2 bg-green-800 text-white rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
              Agregar
            </button>
          </div>

          {/* Previsualización de consumo */}
          {cargandoPrev && <p className="text-sm text-gray-500">Consultando stock…</p>}

          {prevision && !cargandoPrev && (
            <div className="bg-gray-50 rounded p-3 space-y-3">
              <p className="text-sm text-gray-600">
                Fórmula <span className="font-medium">{prevision.formula}</span> — va a consumir:
              </p>

              <table className="w-full text-sm">
                <thead className="text-gray-500">
                  <tr>
                    <th className="text-left font-medium pb-1">Insumo</th>
                    <th className="text-right font-medium pb-1">Cantidad</th>
                    <th className="text-left font-medium pb-1 pl-6">Partida</th>
                  </tr>
                </thead>
                <tbody>
                  {prevision.insumos.map(i => (
                    <tr key={i.componente} className="border-t border-gray-200 align-top">
                      <td className="py-1.5">
                        <span className="font-mono text-xs text-gray-500">{i.componente}</span>{" "}
                        {i.descripcion}
                        {i.esClave && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                            define el lote
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {formatNum(i.cantidad)} {i.unidad}
                      </td>
                      <td className="py-1.5 pl-6">
                        {!i.llevaPartida && <span className="text-gray-400">sin partida</span>}
                        {i.llevaPartida && i.partidas.length === 0 && (
                          <span className="text-red-700">sin stock</span>
                        )}
                        {i.partidas.map(p => (
                          <div key={p.partida} className="whitespace-nowrap">
                            <span className="font-mono">{p.partida}</span>
                            <span className="text-gray-500">
                              {" "}— {formatNum(p.cantidad)} de {formatNum(p.saldo)}
                            </span>
                          </div>
                        ))}
                        {i.faltante > 0 && (
                          <div className="text-red-700">
                            faltan {formatNum(i.faltante)} {i.unidad}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {prevision.advertencias.map((a, n) => (
                <p key={n} className="text-sm text-amber-800 bg-amber-50 rounded px-3 py-2">{a}</p>
              ))}
            </div>
          )}
      </div>

      {/* Tabla de líneas */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Producto</th>
              <th className="text-left px-4 py-2 font-medium">Lote</th>
              <th className="text-right px-4 py-2 font-medium">Cantidad</th>
              <th className="text-left px-4 py-2 font-medium">Bejerman</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {planilla.lineas.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                No hay producción cargada para este día.
              </td></tr>
            )}

            {planilla.lineas.map(l => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-2">
                  <span className="font-mono text-xs text-gray-500">{l.productoCod}</span>{" "}
                  {l.productoDesc}
                </td>
                <td className="px-4 py-2">
                  {editando === l.id ? (
                    <input type="date" value={editLote}
                           onChange={e => setEditLote(e.target.value)}
                           className="border rounded px-2 py-1" />
                  ) : <span className="font-mono">{l.lote}</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  {editando === l.id ? (
                    <input type="text" inputMode="decimal" value={editCantidad}
                           onChange={e => setEditCantidad(e.target.value)}
                           className="border rounded px-2 py-1 w-24 text-right" />
                  ) : formatNum(l.cantidad)}
                </td>
                <td className="px-4 py-2">
                  {l.nroCompBej ? <span className="text-green-700">OP {l.nroCompBej}</span>
                   : l.error ? <span className="text-red-700" title={l.error}>Error</span>
                   : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {!l.ordenBej && (
                    editando === l.id ? (
                      <>
                        <button onClick={() => guardarEdicion(l.id)}
                                className="text-green-700 hover:underline mr-3">Guardar</button>
                        <button onClick={() => setEditando(null)}
                                className="text-gray-500 hover:underline">Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => iniciarEdicion(l)}
                                className="text-blue-700 hover:underline mr-3">Editar</button>
                        <button onClick={() => eliminar(l)}
                                className="text-red-700 hover:underline">Eliminar</button>
                      </>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalleProceso.length > 0 && (
        <details className="border rounded-lg p-3 text-sm" open>
          <summary className="cursor-pointer text-gray-600">
            Detalle de lo procesado en Bejerman
          </summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-gray-700">
            {detalleProceso.join("\n")}
          </pre>
        </details>
      )}

      {planilla.lineas.length > 0 && (
        <div className="flex items-center justify-end gap-3">
          {pendientes > 0 ? (
            <>
              <span className="text-sm text-gray-500">
                {pendientes} línea(s) sin procesar
              </span>
              <button onClick={confirmar} disabled={procesando}
                      className="px-5 py-2 bg-blue-700 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">
                {procesando ? "Creando órdenes…" : "Confirmar y crear OP"}
              </button>
            </>
          ) : (
            <span className="text-sm text-green-700">
              Toda la producción del día está procesada en Bejerman.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
