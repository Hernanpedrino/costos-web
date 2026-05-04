import { Separator } from "@/components/ui/separator";
import { columns } from "./columns";
import { DataTable } from "./data-table";
import { Form } from "@/components/form/Form";
import { getInsumosAction } from "@/actions/Insumos";


export default async function Insumos() {
  const data = await getInsumosAction();

  return (
    <div className="container mx-auto px-2 py-10">
      <h1 className="text-3xl text-center my-5 font-bold">
        Listado de productos e insumos
      </h1>
      <DataTable columns={columns} data={data} />
      <Separator orientation="horizontal" className="my-10" />
      <Form />
    </div>
  );
}