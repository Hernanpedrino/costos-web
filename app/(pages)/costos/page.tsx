import { getCostosPeriodoAction, getEvolucionCostosAction } from "@/actions/costos"
import { CostosClient } from "@/components/costos/CostosClient"


function periodoActual() {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

export default async function CostosPage() {
  const periodo = periodoActual()
  const [resumen, evolucion] = await Promise.all([
    getCostosPeriodoAction(periodo),
    getEvolucionCostosAction(12),
  ])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Costos Operativos</h1>
      <CostosClient resumenInicial={resumen} evolucionInicial={evolucion} />
    </div>
  )
}