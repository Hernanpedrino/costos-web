import { getConsumoPrimasAction, getDemandaArticulosAction } from "@/actions/planificacion"
import { PlanificacionClient } from "@/components/planificacion/PlanificacionClient"


export default async function PlanificacionPage() {
  const [consumoPrimas, demandaArticulos] = await Promise.all([
    getConsumoPrimasAction(),
    getDemandaArticulosAction(),
  ])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Planificación de Demanda y Compras</h1>
      <p className="text-sm text-gray-400 mb-6">
        Proyección basada en el mismo mes del año anterior y promedio de los últimos 12 meses.
      </p>
      <PlanificacionClient
        consumoPrimas={consumoPrimas}
        demandaArticulos={demandaArticulos}
      />
    </div>
  )
}