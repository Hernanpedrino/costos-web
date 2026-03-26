import { columns, Formulas } from "./colums";
import { DataTable } from "./data-table";

async function getData(): Promise<Formulas[]> {
  // Fetch data from your API here.
  return [
    {
      id: "728ed52f",
      name: 'Paprika',
      inputs: "Cayena Roja",
      quantity: 11,
      price: 2575.75,
      total: 28315.5,
      depends_formula: false
    },
    {
      id: "728ed52f",
      name: 'Paprika',
      inputs: "Pimenton Seleccionado Español",
      quantity: 11,
      price: 2575.75,
      total: 28315.5,
      depends_formula: false
    },
    {
      id: "728ed52f",
      name: 'Paprika',
      inputs: "Pimenton Cafayate",
      quantity: 11,
      price: 2575.75,
      total: 28315.5,
      depends_formula: false
    },
    {
      id: "728ed52f",
      name: 'Paprika',
      inputs: "Pimenton Cafayate",
      quantity: 11,
      price: 2575.75,
      total: 28315.5,
      depends_formula: false
    },
    
    // ...
  ]
}

export default async function () {
  const data = await getData()
  return (
    <div className="p-10">
      <DataTable columns={columns} data={data}/>
    </div>
  )
}
