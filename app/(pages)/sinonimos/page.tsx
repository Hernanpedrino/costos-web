import { getBusquedasSinResultadoAction, getSinonimosAction } from "@/actions/sinonimos"
import { SinonimosClient } from "@/components/sinonimos/SinonimosClient"

export const dynamic = "force-dynamic"

export default async function SinonimosPage() {
  const [sinonimos, busquedas] = await Promise.all([getSinonimosAction(), getBusquedasSinResultadoAction()])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Sinónimos del chat</h1>
      <p className="text-sm text-gray-500 mb-6">
        Cómo llaman los clientes a los artículos cuando no coincide con la descripción de Bejerman
        (ej. &quot;chinesca&quot;). El chat de WhatsApp los busca junto con la descripción.
      </p>
      <SinonimosClient sinonimosIniciales={sinonimos} busquedasIniciales={busquedas} />
    </div>
  )
}
