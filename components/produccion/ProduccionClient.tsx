"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import {
  getPlanillaAction,
  buscarProductosAction,
  explotarFormulaAction,
  agregarLineaAction,
  editarLineaAction,
  eliminarLineaAction,
  confirmarPlanillaAction,
  reabrirPlanillaAction,
  type PlanillaDia,
  type LineaPlanilla,
  type ProductoProducible,
  type InsumoExplotado,
} from "@/actions/produccion"

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
  const f = new Date(Date.UTC(a, m - 1, d - 1))
  return f.toISOString().slice(0, 10)
}

function diaSiguiente(iso: string) {
  const [a, m, d] = iso.split("-").map(Number)
  const f = new Date(Date.UTC(a, m - 1, d + 1))
  return f.toISOString().slice(0, 10)
}

const formatNum = (n: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(n)

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props {
  planillaInicial: PlanillaDia
}

export function ProduccionClient({ planillaInicial }: Props) {
  const [planilla, setPlanilla] = useState(planillaInicial)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "error"; msg: string } | null>(null)

  // Formulario de alta
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<ProductoProducible[]>([])
  const [seleccionado, setSeleccionado] = useState<ProductoProducible | null>(null)
  const [loteISO, setLoteISO] = useState(hoyISO())
  const [cantidad, setCantidad] = useState("")
  const [preview, setPreview] = useState<InsumoExplotado[]>([])

  // Edición inline
  const [editando, setEditando] = useState<number | null>(null)
  const [editCantidad, setEditCantidad] = useState("")
  const [editLote, setEditLote] = useState("")

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const bloqueada = planilla.estado !== "borrador"

  // Autocompletado con debounce
  useEffect(() => {
    if (seleccionado) return
    if (debounce.current) clearTimeout(debounce.current)
    if (busqueda.trim().length < 2) {
      setResultados([])
      return
    }
    debounce.current = setTimeout(async () => {
      setResultados(await buscarProductosAction(busqueda))
    }, 300)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [busqueda, seleccionado])

  // Previsualización de insumos
  useEffect(() => {
    const cant = Number(cantidad.replace(",", "."))
    if (!seleccionado || !Number.isFinite(cant) || cant <= 0) {
      setPreview([])
      return
    }
    const t = setTimeout(async () => {
      setPreview(await explotarFormulaAction(seleccionado.codigo, cant))
    }, 300)
    return () => clearTimeout(t)
  }, [seleccionado, cantidad])

  async function refrescar(fecha = planilla.fecha) {
    const nueva = await getPlanillaAction(fecha)
    setPlanilla(nueva)
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
    setPreview([])
    setResultados([])
  }

  async function agregar() {
    if (!seleccionado) {
      setFeedback({ tipo: "error", msg: "Elegí un producto de la lista." })
      return
    }
    setFeedback(null)
    const result = await agregarLineaAction({
      fechaISO:     planilla.fecha,
      productoCod:  seleccionado.codigo,
      productoDesc: seleccionado.descripcion,
      formulaCod:   seleccionado.formula,
      loteISO,
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
    // el lote se guarda como DDMMAAAA: lo paso a YYYY-MM-DD para el input date
    const d = l.lote.slice(0, 2)
    const m = l.lote.slice(2, 4)
    const a = l.lote.slice(4, 8)
    setEditLote(a.length === 4 ? `${a}-${m}-${d}` : hoyISO())
    setFeedback(null)
  }

  async function guardarEdicion(id: number) {
    const result = await editarLineaAction({ id, loteISO: editLote, cantidad: editCantidad })
    if (result.success) {
      setEditando(null)
      await refrescar()
    } else {
      setFeedback({ tipo: "error", msg: result.error })
    }
  }

  async function eliminar(l: LineaPlanilla) {
    if (!confirm(`¿Eliminar ${l.productoCod} — ${l.productoDesc}?`)) return
    const result = await eliminarLineaAction(l.id)
    if (result.success) await refrescar()
    else setFeedback({ tipo: "error", msg: result.error })
  }

  async function confirmar() {
    if (!confirm("Una vez confirmada no se puede editar. ¿Confirmar la planilla?")) return
    const result = await confirmarPlanillaAction(planilla.fecha)
    if (result.success) {
      setFeedback({ tipo: "ok", msg: "Planilla confirmada. Ya puede procesarse en Bejerman." })
      await refrescar()
    } else {
      setFeedback({ tipo: "error", msg: result.error })
    }
  }

  async function reabrir() {
    const result = await reabrirPlanillaAction(planilla.fecha)
    if (result.success) {
      setFeedback({ tipo: "ok", msg: "Planilla reabierta." })
      await refrescar()
    } else {
      setFeedback({ tipo: "error", msg: result.error })
    }
  }

  const badgeEstado =
    planilla.estado === "procesada" ? "bg-green-100 text-green-800"
    : planilla.estado === "confirmada" ? "bg-blue-100 text-blue-800"
    : "bg-gray-100 text-gray-700"

  return (
    <div className="space-y-6">

      {/* Cabecera: fecha y estado */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => cambiarFecha(diaAnterior(planilla.fecha))}
          className="px-3 py-1.5 border rounded hover:bg-gray-50"
        >
          ←
        </button>
        <input
          type="date"
          value={planilla.fecha}
          onChange={e => cambiarFecha(e.target.value)}
          className="border rounded px-3 py-1.5"
        />
        <button
          onClick={() => cambiarFecha(diaSiguiente(planilla.fecha))}
          className="px-3 py-1.5 border rounded hover:bg-gray-50"
        >
          →
        </button>
        <span className="text-lg font-medium">{formatFecha(planilla.fecha)}</span>
        <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${badgeEstado}`}>
          {planilla.estado}
        </span>
        {isPending && <span className="text-sm text-gray-500">Cargando…</span>}
      </div>

      {feedback && (
        <div
          className={`px-4 py-2 rounded text-sm ${
            feedback.tipo === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Formulario de alta */}
      {!bloqueada && (
        <div className="border rounded-lg p-4 space-y-4">
          <h2 className="font-medium">Agregar producción</h2>

          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end">
            <div className="relative">
              <label className="block text-sm text-gray-600 mb-1">Producto</label>
              <input
                type="text"
                value={busqueda}
                onChange={e => {
                  setBusqueda(e.target.value)
                  setSeleccionado(null)
                }}
                placeholder="Código o descripción…"
                className="w-full border rounded px-3 py-2"
              />
              {resultados.length > 0 && (
                <ul className="absolute z-10 w-full bg-white border rounded mt-1 max-h-64 overflow-auto shadow-lg">
                  {resultados.map(p => (
                    <li key={p.codigo}>
                      <button
                        onClick={() => elegirProducto(p)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                      >
                        <span className="font-mono text-xs text-gray-500">{p.codigo}</span>{" "}
                        {p.descripcion}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Lote (fecha)</label>
              <input
                type="date"
                value={loteISO}
                onChange={e => setLoteISO(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Cantidad</label>
              <input
                type="text"
                inputMode="decimal"
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <button
              onClick={agregar}
              disabled={!seleccionado || !cantidad}
              className="px-5 py-2 bg-green-800 text-white rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Agregar
            </button>
          </div>

          {/* Previsualización de insumos */}
          {preview.length > 0 && (
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-600 mb-2">Va a consumir:</p>
              <ul className="text-sm space-y-1">
                {preview.map(i => (
                  <li key={i.componente} className="flex justify-between max-w-md">
                    <span>
                      <span className="font-mono text-xs text-gray-500">{i.componente}</span>{" "}
                      {i.descripcion}
                    </span>
                    <span className="font-medium">{formatNum(i.cantidad)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

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
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No hay producción cargada para este día.
                </td>
              </tr>
            )}

            {planilla.lineas.map(l => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-2">
                  <span className="font-mono text-xs text-gray-500">{l.productoCod}</span>{" "}
                  {l.productoDesc}
                </td>

                <td className="px-4 py-2">
                  {editando === l.id ? (
                    <input
                      type="date"
                      value={editLote}
                      onChange={e => setEditLote(e.target.value)}
                      className="border rounded px-2 py-1"
                    />
                  ) : (
                    <span className="font-mono">{l.lote}</span>
                  )}
                </td>

                <td className="px-4 py-2 text-right">
                  {editando === l.id ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editCantidad}
                      onChange={e => setEditCantidad(e.target.value)}
                      className="border rounded px-2 py-1 w-24 text-right"
                    />
                  ) : (
                    formatNum(l.cantidad)
                  )}
                </td>

                <td className="px-4 py-2">
                  {l.nroCompBej ? (
                    <span className="text-green-700">OP {l.nroCompBej}</span>
                  ) : l.error ? (
                    <span className="text-red-700" title={l.error}>Error</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>

                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {!bloqueada && !l.ordenBej && (
                    editando === l.id ? (
                      <>
                        <button
                          onClick={() => guardarEdicion(l.id)}
                          className="text-green-700 hover:underline mr-3"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setEditando(null)}
                          className="text-gray-500 hover:underline"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => iniciarEdicion(l)}
                          className="text-blue-700 hover:underline mr-3"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => eliminar(l)}
                          className="text-red-700 hover:underline"
                        >
                          Eliminar
                        </button>
                      </>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Acciones de planilla */}
      {planilla.lineas.length > 0 && (
        <div className="flex justify-end gap-3">
          {planilla.estado === "borrador" && (
            <button
              onClick={confirmar}
              className="px-5 py-2 bg-blue-700 text-white rounded hover:bg-blue-600"
            >
              Confirmar planilla
            </button>
          )}
          {planilla.estado === "confirmada" && (
            <button
              onClick={reabrir}
              className="px-5 py-2 border rounded hover:bg-gray-50"
            >
              Reabrir
            </button>
          )}
        </div>
      )}
    </div>
  )
}
