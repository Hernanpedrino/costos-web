// components/formulas/FormulaPieChart.tsx
"use client"

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts"
import type { FormulaListItem } from "@/actions/formulas"

const COLORES_PRINCIPALES = [
  "#166534", // verde oscuro
  "#1d4ed8", // azul
  "#b45309", // ámbar
  "#7c3aed", // violeta
]
const COLOR_RESTO = "#E65720" // gris claro para los que no tienen leyenda

const formatearPrecio = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", minimumFractionDigits: 2,
  }).format(n)

export function FormulaPieChart({ formula }: { formula: FormulaListItem }) {
  const datosConSubtotal = formula.items.map((item) => ({
    name: item.nombreIngrediente,
    subtotal: item.precioIngrediente * item.cantidad,
    value: 0,
    esPrincipal: false,
  }))

  const totalSubtotales = datosConSubtotal.reduce((t, i) => t + i.subtotal, 0)
  if (totalSubtotales === 0) return null

  // Calcular % y ordenar de mayor a menor
  const conPct = datosConSubtotal
    .map((item) => ({
      ...item,
      value: parseFloat(((item.subtotal / totalSubtotales) * 100).toFixed(2)),
    }))
    .sort((a, b) => b.value - a.value)

  // Los 4 primeros son "principales" — tienen color y leyenda
  const datos = conPct.map((item, i) => ({
    ...item,
    esPrincipal: i < 4,
  }))

  // Leyenda personalizada — solo muestra los 4 principales
  const renderLeyenda = () => (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
      {datos.filter((d) => d.esPrincipal).map((d, i) => (
        <span key={i} className="flex items-center gap-1 text-xs">
          <span
            className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0"
            style={{ backgroundColor: COLORES_PRINCIPALES[i] }}
          />
          <span className="truncate max-w-[90px]" title={d.name}>
            {d.name.length > 12 ? d.name.substring(0, 12) + "…" : d.name}
          </span>
        </span>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart margin={{ top: 20, right: 20, bottom: 5, left: 40 }}>
          <Pie
            data={datos}
            cx="55%"
            cy="50%"
            outerRadius={70}
            paddingAngle={1}
            dataKey="value"
            label={({ value, index }) =>
              index < 4 && Number(value ?? 0) >= 8 ? `${Number(value ?? 0).toFixed(1)}%` : ""
            }
            labelLine={false}
          >
            {datos.map((item, index) => (
              <Cell
                key={`cell-${index}`}
                fill={item.esPrincipal
                  ? COLORES_PRINCIPALES[index]
                  : COLOR_RESTO
                }
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, _, props) => [
              `${Number(value ?? 0).toFixed(2)}% — ${formatearPrecio(props.payload.subtotal)}`,
              props.payload.name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      {renderLeyenda()}
    </div>
  )
}
