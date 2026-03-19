import { Separator } from "@/components/ui/separator";
import { columns, Payment } from "./columns"
import { DataTable } from "./data-table";
import { Form } from "@/components/form/Form";
import { Button } from "@/components/ui/button";

async function getData(): Promise<Payment[]> {
  // Fetch data from your API here.
  return [
    {
      id: "728ed52f",
      amount: 80,
      status: "pending",
      email: "rtrerp@example.com",
    },
    {
      id: "754ed52f",
      amount: 480,
      status: "pending",
      email: "nmba@example.com",
    },
    {
      id: "792ed52f",
      amount: 4500,
      status: "pending",
      email: "sghgg@example.com",
    },
    {
      id: "359ed52f",
      amount: 1500,
      status: "pending",
      email: "wevzxcm@example.com",
    },
    {
      id: "299ed52f",
      amount: 150,
      status: "pending",
      email: "serwsi@example.com",
    },
    // ...
  ]
}
export default async function Insumos() {
  const data = await getData()

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl text-center my-5 font-bold">Listado de insumos</h1>
      <DataTable columns={columns} data={data} />
      <Separator orientation="horizontal" className="mt-20"/>
      <Button 
      className="inline-flex text-white bg-green-800 border-0 py-2 px-6 focus:outline-none hover:bg-green-600 rounded text-lg mt-10"
      type="button"
      >
          Agregar Insumo
      </Button>
      <Form/>
    </div>
  )
}
