import { columns, Payment } from "./columns"
import { DataTable } from "./data-table";

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
      <DataTable columns={columns} data={data} />
    </div>
  )
}
