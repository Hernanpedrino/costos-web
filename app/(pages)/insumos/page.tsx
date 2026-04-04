import { Separator } from "@/components/ui/separator";
import { columns, Insumos as DataInsumos } from "./columns"
import { DataTable } from "./data-table";
import { Form } from "@/components/form/Form";
import fakeData from "../../../MOCK_DATA _INSUMO.json";

async function getData(): Promise<DataInsumos[]> {
  const response = fakeData
  return response;
}

export default async function Insumos() {
  const data = await getData()
  return (
    <div className="container mx-auto px-2 py-10">
      <h1 className="text-3xl text-center my-5 font-bold">Listado de insumos</h1>
      <DataTable columns={columns} data={data} />
      <Separator orientation="horizontal" className="my-10" />
      <Form />
    </div>
  )
}
