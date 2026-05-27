// app/(pages)/estadisticas/page.tsx
import { EstadisticasClient } from "@/components/estadisticas/EstadisticasClient"
import { getTopVariacionAction, getTopInsumosUsadosAction } from "@/actions/estadisticas"

export const dynamic = "force-dynamic"

export default async function EstadisticasPage() {
  const [topVariacion, topInsumosUsados] = await Promise.all([
    getTopVariacionAction(),
    getTopInsumosUsadosAction(),
  ])

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-3xl text-center my-5 font-bold">Estadísticas</h1>
      <EstadisticasClient
        topVariacion={topVariacion}
        topInsumosUsados={topInsumosUsados}
      />
    </div>
  )
}
