"use client"

import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from "recharts"
import type { DetalleArticulo } from "@/actions/bejerman"

const formatPeso = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0
  }).format(n);

const formatNum = (n: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);

const formatMes = (mes: string) => {
  const [anio, m] = mes.split('-');
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${meses[parseInt(m) - 1]} ${anio}`;
};

export function DetalleArticuloClient({ detalle }: { detalle: DetalleArticulo }) {
  const totalFact = detalle.evolucion.reduce((a, m) => a + m.facturacion, 0);
  const totalUnid = detalle.evolucion.reduce((a, m) => a + m.unidades, 0);

  return (
    <div>
      {/* Encabezado */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">{detalle.descripcion}</h1>
          {detalle.clasificacion && (
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${detalle.clasificacion === 'A' ? 'bg-green-100 text-green-700' :
              detalle.clasificacion === 'B' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-600'
              }`}>
              Clase {detalle.clasificacion}
            </span>
          )}
        </div>
        <div className="text-sm text-gray-400">{detalle.codigo}</div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">Facturación total</div>
          <div className="text-lg font-bold">{formatPeso(totalFact)}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">Unidades vendidas</div>
          <div className="text-lg font-bold">{formatNum(totalUnid)}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">Precio SIV</div>
          <div className="text-lg font-bold">
            {detalle.precioSIV ? formatPeso(detalle.precioSIV) : '—'}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-400 mb-1">
            Costo unit. {detalle.fuenteCosto === 'compra' ? '🛒' : detalle.fuenteCosto === 'produccion' ? '⚙️' : ''}
          </div>
          <div className="text-lg font-bold">
            {detalle.costoUnit ? formatPeso(detalle.costoUnit) : '—'}
          </div>
        </div>
      </div>

      {/* Gráfico de facturación */}
      <div className="mb-8">
        <h2 className="text-base font-semibold mb-3">Facturación mensual</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={detalle.evolucion}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mes" tickFormatter={formatMes} tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(v) => [formatPeso(Number(v ?? 0)), 'Facturación']}
              labelFormatter={(label) => formatMes(String(label))}
            />
            <Bar dataKey="facturacion" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico de margen */}
      {detalle.costoUnit && (
        <div className="mb-8">
          <h2 className="text-base font-semibold mb-3">Margen mensual</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={detalle.evolucion}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tickFormatter={formatMes} tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(v) => [`${Number(v ?? 0).toFixed(1)}%`, 'Margen']}
                labelFormatter={(label) => formatMes(String(label))}
              />
              <Line
                type="monotone"
                dataKey="margenPct"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabla mensual */}
      <div>
        <h2 className="text-base font-semibold mb-3">Detalle por mes</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="pb-2 text-left">Mes</th>
              <th className="pb-2 text-right">Unidades</th>
              <th className="pb-2 text-right">Facturación</th>
              <th className="pb-2 text-right">Margen</th>
            </tr>
          </thead>
          <tbody>
            {detalle.evolucion.map(m => (
              <tr key={m.mes} className="border-b hover:bg-gray-50">
                <td className="py-2">{formatMes(m.mes)}</td>
                <td className="py-2 text-right">{formatNum(m.unidades)}</td>
                <td className="py-2 text-right">{formatPeso(m.facturacion)}</td>
                <td className="py-2 text-right">
                  {m.margenPct !== null ? (
                    <span className={`font-medium ${m.margenPct < 20 ? 'text-red-500' :
                      m.margenPct < 35 ? 'text-yellow-500' : 'text-green-600'
                      }`}>
                      {m.margenPct.toFixed(1)}%
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}