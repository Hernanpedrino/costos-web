// app/(pages)/insumos/page.tsx

import { Separator } from "@/components/ui/separator"
import { Form } from "@/components/form/Form"
import { getInsumosAction } from "@/actions/insumos"
import { InsumosClient } from "@/components/insumos/InsumosClient"
export const dynamic = 'force-dynamic'

export default async function InsumosPage() {
  const data = await getInsumosAction()

  return (
    <div className="container mx-auto px-2 py-10">
      <h1 className="text-3xl text-center my-5 font-bold">
        Listado de productos e insumos
      </h1>

      {/* Server pasa los datos, Client maneja la interacción */}
      <InsumosClient initialData={data} />

      <Separator orientation="horizontal" className="my-10" />
      <Form />
    </div>
  )
}
