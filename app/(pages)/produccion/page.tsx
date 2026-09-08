import { getPlanillaAction } from "@/actions/produccion"
import { ProduccionClient } from "@/components/produccion/ProduccionClient"

export const dynamic = "force-dynamic"

export default async function ProduccionPage() {
  const planilla = await getPlanillaAction()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Planilla de Producción</h1>
      <ProduccionClient planillaInicial={planilla} />
    </div>
  )
}
