"use client"

// components/sinonimos/SinonimosClient.tsx
// Búsquedas del chat sin resultado (a la izquierda) → se convierten en
// sinónimo de uno o más artículos (a la derecha). Abajo, los sinónimos cargados.

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  agregarSinonimoAction,
  buscarArticulosSinonimoAction,
  descartarBusquedaAction,
  eliminarSinonimoAction,
  getBusquedasSinResultadoAction,
  getSinonimosAction,
  type ArticuloOpcion,
  type BusquedaSinResultado,
  type SinonimoItem,
} from "@/actions/sinonimos"

interface Props {
  sinonimosIniciales: SinonimoItem[]
  busquedasIniciales: BusquedaSinResultado[]
}

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))

export function SinonimosClient({ sinonimosIniciales, busquedasIniciales }: Props) {
  const [sinonimos, setSinonimos] = useState(sinonimosIniciales)
  const [busquedas, setBusquedas] = useState(busquedasIniciales)
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "error"; msg: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  // Formulario de alta
  const [sinonimo, setSinonimo] = useState("")
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<ArticuloOpcion[]>([])
  const [elegidos, setElegidos] = useState<ArticuloOpcion[]>([])
  const inputSinonimo = useRef<HTMLInputElement>(null)

  // Filtro de la tabla de sinónimos
  const [filtro, setFiltro] = useState("")

  // Buscador de artículos (con demora para no consultar en cada tecla)
  useEffect(() => {
    if (busqueda.trim().length < 2) return
    const t = setTimeout(async () => setResultados(await buscarArticulosSinonimoAction(busqueda)), 300)
    return () => clearTimeout(t)
  }, [busqueda])

  async function refrescar() {
    const [s, b] = await Promise.all([getSinonimosAction(), getBusquedasSinResultadoAction()])
    setSinonimos(s)
    setBusquedas(b)
  }

  function usarBusqueda(b: BusquedaSinResultado) {
    setSinonimo(b.texto)
    setFeedback(null)
    inputSinonimo.current?.focus()
  }

  function descartar(b: BusquedaSinResultado) {
    startTransition(async () => {
      const r = await descartarBusquedaAction(b.textoNorm)
      if (!r.success) setFeedback({ tipo: "error", msg: r.error })
      else setBusquedas((prev) => prev.filter((x) => x.textoNorm !== b.textoNorm))
    })
  }

  function elegir(a: ArticuloOpcion) {
    setElegidos((prev) => (prev.some((x) => x.codigo === a.codigo) ? prev : [...prev, a]))
  }

  function guardar() {
    startTransition(async () => {
      const r = await agregarSinonimoAction(sinonimo, elegidos.map((a) => a.codigo))
      if (!r.success) {
        setFeedback({ tipo: "error", msg: r.error })
        return
      }
      setFeedback({
        tipo: "ok",
        msg: r.data > 0
          ? `Listo: "${sinonimo.trim()}" quedó asociado a ${r.data} artículo(s). El chat ya lo encuentra.`
          : "Ese sinónimo ya estaba asociado a esos artículos.",
      })
      setSinonimo("")
      setBusqueda("")
      setResultados([])
      setElegidos([])
      await refrescar()
    })
  }

  function quitar(s: SinonimoItem) {
    if (!confirm(`¿Quitar "${s.sinonimo}" de ${s.artCodigo}?`)) return
    startTransition(async () => {
      await eliminarSinonimoAction(s.id)
      await refrescar()
    })
  }

  const sinonimosFiltrados = useMemo(() => {
    const f = filtro.trim().toLowerCase()
    if (!f) return sinonimos
    return sinonimos.filter((s) =>
      [s.sinonimo, s.artCodigo, s.artDescripcion].some((x) => x.toLowerCase().includes(f))
    )
  }, [sinonimos, filtro])

  return (
    <div className="flex flex-col gap-6">
      {feedback && (
        <div
          className={`px-4 py-2 rounded text-sm ${
            feedback.tipo === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Búsquedas sin resultado ── */}
        <section className="border rounded-lg p-4">
          <h2 className="font-semibold mb-1">Búsquedas sin resultado</h2>
          <p className="text-xs text-gray-500 mb-3">
            Lo que escribieron los clientes en los últimos 60 días y el chat no encontró. Tocá
            &quot;Asignar&quot; para cargarlo como sinónimo, o &quot;Descartar&quot; si no es un producto.
          </p>
          {busquedas.length === 0 ? (
            <p className="text-sm text-gray-500">No hay búsquedas sin resultado pendientes. 👌</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-1">Escribieron</th>
                  <th className="py-1 text-right">Veces</th>
                  <th className="py-1 text-right">Clientes</th>
                  <th className="py-1">Última</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {busquedas.map((b) => (
                  <tr key={b.textoNorm} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 font-medium">{b.texto}</td>
                    <td className="py-1.5 text-right">{b.veces}</td>
                    <td className="py-1.5 text-right">{b.clientes}</td>
                    <td className="py-1.5 pl-2 text-gray-500 whitespace-nowrap">{fecha(b.ultima)}</td>
                    <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                      <button onClick={() => usarBusqueda(b)} className="text-blue-700 hover:underline mr-3">
                        Asignar
                      </button>
                      <button onClick={() => descartar(b)} disabled={isPending} className="text-gray-500 hover:underline">
                        Descartar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── Nuevo sinónimo ── */}
        <section className="border rounded-lg p-4">
          <h2 className="font-semibold mb-3">Nuevo sinónimo</h2>

          <label className="block text-sm text-gray-600 mb-1">Cómo lo llama el cliente</label>
          <input
            ref={inputSinonimo}
            value={sinonimo}
            onChange={(e) => setSinonimo(e.target.value)}
            placeholder='Ej: chinesca, batter económico'
            maxLength={80}
            className="w-full border rounded px-3 py-2 mb-4"
          />

          <label className="block text-sm text-gray-600 mb-1">Artículo(s) de Bejerman</label>
          <input
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value)
              if (e.target.value.trim().length < 2) setResultados([])
            }}
            placeholder="Buscá por código o descripción (ej: TRI0000004, cerdo 70)"
            className="w-full border rounded px-3 py-2"
          />
          {resultados.length > 0 && (
            <ul className="border rounded mt-1 max-h-56 overflow-y-auto text-sm">
              {resultados.map((a) => (
                <li key={a.codigo}>
                  <button
                    onClick={() => elegir(a)}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 disabled:text-gray-400"
                    disabled={elegidos.some((x) => x.codigo === a.codigo)}
                  >
                    <span className="font-mono text-xs text-gray-500 mr-2">{a.codigo}</span>
                    {a.descripcion}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {elegidos.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {elegidos.map((a) => (
                <span key={a.codigo} className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200 rounded px-2 py-1 text-xs">
                  <span className="font-mono">{a.codigo}</span> {a.descripcion}
                  <button
                    onClick={() => setElegidos((prev) => prev.filter((x) => x.codigo !== a.codigo))}
                    className="ml-1 text-blue-600 hover:text-blue-900"
                    aria-label={`Quitar ${a.codigo}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-500 mt-3">
            Si el nombre corresponde a varios artículos (ej. distintas medidas), elegí todos: el chat le va a mostrar la lista.
          </p>

          <button
            onClick={guardar}
            disabled={isPending || !sinonimo.trim() || elegidos.length === 0}
            className="mt-4 px-5 py-2 bg-green-800 text-white rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Guardar sinónimo
          </button>
        </section>
      </div>

      {/* ── Sinónimos cargados ── */}
      <section className="border rounded-lg p-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="font-semibold">Sinónimos cargados ({sinonimos.length})</h2>
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar"
            className="border rounded px-3 py-1.5 text-sm w-56"
          />
        </div>
        {sinonimosFiltrados.length === 0 ? (
          <p className="text-sm text-gray-500">{sinonimos.length === 0 ? "Todavía no hay sinónimos cargados." : "Ninguno coincide con el filtro."}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-1">Sinónimo</th>
                <th className="py-1">Artículo</th>
                <th className="py-1">Cargado por</th>
                <th className="py-1">Fecha</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sinonimosFiltrados.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 font-medium">{s.sinonimo}</td>
                  <td className="py-1.5 pr-2">
                    <span className="font-mono text-xs text-gray-500 mr-2">{s.artCodigo}</span>
                    {s.artDescripcion}
                  </td>
                  <td className="py-1.5 pr-2 text-gray-500">{s.creadoPor}</td>
                  <td className="py-1.5 pr-2 text-gray-500 whitespace-nowrap">{fecha(s.creadoEn)}</td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => quitar(s)} disabled={isPending} className="text-red-600 hover:underline">
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
