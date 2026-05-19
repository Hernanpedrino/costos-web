// components/estadisticas/EstadisticasClient.tsx
"use client"

import { useState, useTransition } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
import {
  getHistorialInsumoAction,
  buscarInsumosAction,
  type HistorialInsumo,
  type TopVariacion,
} from "@/actions/estadisticas"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatearPrecio = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n)

const formatearFecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  }).format(new Date(iso))

const colorVariacion = (pct: number) =>
  pct > 0 ? "text-red-600" : pct < 0 ? "text-green-600" : "text-muted-foreground"

const signo = (pct: number) => (pct > 0 ? "+" : "")

// ─── Card del Top 5 ───────────────────────────────────────────────────────────

function TopCard({ item, onSelect }: { item: TopVariacion; onSelect: (id: string) => void }) {
  return (
    <div
      className="border rounded-lg p-4 shadow-sm cursor-pointer hover:border-green-600 transition-colors"
      onClick={() => onSelect(item.id)}
    >
      <p className="font-medium text-sm truncate" title={item.nombre}>{item.nombre}</p>
      <div className="flex items-end justify-between mt-2">
        <div>
          <p className="text-xs text-muted-foreground">Inicial</p>
          <p className="text-sm">{formatearPrecio(item.precioInicial)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Actual</p>
          <p className="text-sm font-semibold">{formatearPrecio(item.precioActual)}</p>
        </div>
      </div>
      <div className={`mt-2 text-center text-lg font-bold ${colorVariacion(item.variacionPct)}`}>
        {signo(item.variacionPct)}{item.variacionPct.toFixed(1)}%
      </div>
      <p className="text-xs text-muted-foreground text-center mt-1">
        {item.cantCambios} cambio{item.cantCambios !== 1 ? "s" : ""}
      </p>
    </div>
  )
}

// ─── Gráfico + tabla de historial ─────────────────────────────────────────────

function HistorialDetalle({ historial }: { historial: HistorialInsumo }) {
  if (historial.puntos.length === 0) {
    return (
      <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground">
        <p className="font-medium text-gray-700 mb-1">{historial.nombre}</p>
        Este insumo no tiene cambios de precio registrados todavía.
      </div>
    )
  }

  // Datos para el gráfico: mostramos el precio después de cada cambio + precio actual
  const datosGrafico = [
    ...historial.puntos.map((p) => ({
      fecha:  formatearFecha(p.fecha),
      precio: p.precioDespues,
    })),
  ]

  return (
    <div className="border rounded-lg p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-base">{historial.nombre}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Precio actual: <span className="font-medium text-gray-800">{formatearPrecio(historial.precioActual)}</span>
          </p>
        </div>
        <div className={`text-2xl font-bold ${colorVariacion(historial.variacionTotal)}`}>
          {signo(historial.variacionTotal)}{historial.variacionTotal.toFixed(1)}%
        </div>
      </div>

      {/* Gráfico */}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={datosGrafico} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `$${new Intl.NumberFormat("es-AR").format(v)}`}
            width={80}
          />
          <Tooltip
            formatter={(value) => [formatearPrecio(Number(value ?? 0)), "Precio"]}
            labelFormatter={(label) => `Fecha: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="precio"
            stroke="#166534"
            strokeWidth={2}
            dot={{ fill: "#166534", r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Tabla de cambios */}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-xs">Fecha</th>
              <th className="text-right px-3 py-2 font-medium text-xs">Antes</th>
              <th className="text-right px-3 py-2 font-medium text-xs">Después</th>
              <th className="text-right px-3 py-2 font-medium text-xs">Variación</th>
              <th className="text-left px-3 py-2 font-medium text-xs">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {[...historial.puntos].reverse().map((p, i) => {
              const variacion = p.precioAntes > 0
                ? ((p.precioDespues - p.precioAntes) / p.precioAntes) * 100
                : 0
              return (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 text-xs">{formatearFecha(p.fecha)}</td>
                  <td className="px-3 py-2 text-xs text-right text-muted-foreground">
                    {formatearPrecio(p.precioAntes)}
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-medium">
                    {formatearPrecio(p.precioDespues)}
                  </td>
                  <td className={`px-3 py-2 text-xs text-right font-semibold ${colorVariacion(variacion)}`}>
                    {signo(variacion)}{variacion.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.usuario}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function EstadisticasClient({ topVariacion }: { topVariacion: TopVariacion[] }) {
  const [query, setQuery]             = useState("")
  const [resultados, setResultados]   = useState<{ id: string; name: string; price: number }[]>([])
  const [historial, setHistorial]     = useState<HistorialInsumo | null>(null)
  const [isPending, startTransition]  = useTransition()

  const buscar = () => {
    if (!query.trim()) return
    startTransition(async () => {
      const res = await buscarInsumosAction(query)
      setResultados(res)
      setHistorial(null)
    })
  }

  const seleccionar = (id: string) => {
    setResultados([])
    setQuery("")
    startTransition(async () => {
      const h = await getHistorialInsumoAction(id)
      setHistorial(h)
    })
  }

  return (
    <div className="space-y-10">

      {/* ── Top 5 variación ── */}
      {topVariacion.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-4">
            Top 5 — Mayor variación de precio
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            Hacé clic en una card para ver el historial completo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {topVariacion.map((item) => (
              <TopCard key={item.id} item={item} onSelect={seleccionar} />
            ))}
          </div>
        </section>
      )}

      {topVariacion.length === 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Todavía no hay cambios de precio registrados.
        </p>
      )}

      {/* ── Buscador ── */}
      <section>
        <h2 className="text-base font-semibold mb-4">Buscar insumo</h2>
        <div className="flex gap-2 max-w-md">
          <Input
            placeholder="Nombre del insumo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            className="border-green-800"
          />
          <Button
            onClick={buscar}
            disabled={isPending}
            className="bg-green-800 text-white hover:bg-green-600"
          >
            <Search className="w-4 h-4" />
          </Button>
        </div>

        {/* Resultados de búsqueda */}
        {resultados.length > 0 && (
          <div className="mt-2 border rounded-lg overflow-hidden max-w-md shadow-sm">
            {resultados.map((r) => (
              <button
                key={r.id}
                onClick={() => seleccionar(r.id)}
                className="w-full text-left px-4 py-2 text-sm hover:bg-muted/50 transition-colors border-b last:border-b-0 flex justify-between"
              >
                <span>{r.name}</span>
                <span className="text-muted-foreground">{formatearPrecio(r.price)}</span>
              </button>
            ))}
          </div>
        )}

        {resultados.length === 0 && query && !isPending && historial === null && (
          <p className="text-sm text-muted-foreground mt-2">Sin resultados para "{query}".</p>
        )}
      </section>

      {/* ── Historial del insumo seleccionado ── */}
      {isPending && (
        <p className="text-sm text-muted-foreground animate-pulse">Cargando historial...</p>
      )}
      {!isPending && historial && (
        <section>
          <h2 className="text-base font-semibold mb-4">Historial de precios</h2>
          <HistorialDetalle historial={historial} />
        </section>
      )}

    </div>
  )
}
