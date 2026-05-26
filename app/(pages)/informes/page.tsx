// app/(pages)/informes/page.tsx
import { getInformeFormulasAction } from "@/actions/informes"
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react"

export const dynamic = "force-dynamic"

const formatearPrecio = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS",
    minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const formatearFecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(iso))

export default async function InformesPage() {
  const formulas = await getInformeFormulasAction()

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-3xl text-center my-5 font-bold">Informes de fórmulas</h1>
      <p className="text-center text-sm text-muted-foreground mb-8">
        Variación de precios respecto al registro anterior
      </p>

      <div className="overflow-hidden rounded-md border shadow-xl">
        <table className="w-full">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium">Fórmula</th>
              <th className="text-right px-4 py-3 text-sm font-medium">Precio anterior</th>
              <th className="text-right px-4 py-3 text-sm font-medium">Precio actual</th>
              <th className="text-right px-4 py-3 text-sm font-medium">Variación</th>
              <th className="text-center px-4 py-3 text-sm font-medium">Tendencia</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">
                Último cambio
              </th>
            </tr>
          </thead>
          <tbody>
            {formulas.map((f, i) => (
              <tr key={f.id} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                {/* Nombre */}
                <td className="px-4 py-3 font-medium text-sm">{f.nombre}</td>

                {/* Precio anterior */}
                <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                  {f.precioAnterior !== null ? formatearPrecio(f.precioAnterior) : "—"}
                </td>

                {/* Precio actual */}
                <td className="px-4 py-3 text-right text-sm font-semibold">
                  {formatearPrecio(f.precioActual)}
                </td>

                {/* % Variación */}
                <td className="px-4 py-3 text-right text-sm font-semibold">
                  {f.variacionPct === null ? (
                    <span className="text-muted-foreground text-xs">Sin historial</span>
                  ) : (
                    <span className={
                      f.tendencia === "sube" ? "text-red-600" :
                      f.tendencia === "baja" ? "text-green-600" :
                      "text-muted-foreground"
                    }>
                      {f.variacionPct > 0 ? "+" : ""}
                      {f.variacionPct.toFixed(2)}%
                    </span>
                  )}
                </td>

                {/* Ícono tendencia */}
                <td className="px-4 py-3 text-center">
                  {f.tendencia === "sube"  && <TrendingUp   className="w-4 h-4 text-red-500 inline"   />}
                  {f.tendencia === "baja"  && <TrendingDown  className="w-4 h-4 text-green-600 inline" />}
                  {f.tendencia === "igual" && <Minus         className="w-4 h-4 text-gray-400 inline"  />}
                  {f.tendencia === "nuevo" && <Sparkles      className="w-4 h-4 text-blue-400 inline"  />}
                </td>

                {/* Último cambio */}
                <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                  {f.ultimoCambio ? formatearFecha(f.ultimoCambio) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Leyenda */}
      <div className="flex gap-6 justify-center mt-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <TrendingUp  className="w-3 h-3 text-red-500"   /> Precio subió
        </span>
        <span className="flex items-center gap-1">
          <TrendingDown className="w-3 h-3 text-green-600" /> Precio bajó
        </span>
        <span className="flex items-center gap-1">
          <Minus        className="w-3 h-3 text-gray-400"  /> Sin cambios
        </span>
        <span className="flex items-center gap-1">
          <Sparkles     className="w-3 h-3 text-blue-400"  /> Sin historial aún
        </span>
      </div>
    </div>
  )
}
