import { columns, Formula } from "./colums";
import { DataTable } from "./data-table";

async function getData(): Promise<Formula[]> {
  // Fetch data from your API here.
  const response: Formula[] = [{
    tittle: 'Pimenton Cafayate (Datos)',
    formula: [
      {
        id: "728ed52f",
        inputs: "Cayena Roja",
        quantity: 11,
        price: 2575.75,
        depends_formula: false
      },
      {
        id: "728ed52f",
        inputs: "Pimenton Seleccionado Español",
        quantity: 11,
        price: 2575.75,
        depends_formula: false
      },
      {
        id: "728ed52f",
        inputs: "Pimenton Cafayate",
        quantity: 11,
        price: 2575.75,
        depends_formula: false
      },
      {
        id: "728ed52f",
        inputs: "Pimenton Cafayate",
        quantity: 11,
        price: 2575.75,
        depends_formula: false
      },
    ]
  }
  ]
  return response;
}

export default async function () {
  const data = await getData();
  const listadoDeFormulas = data[0];
  return (
    <div className="p-10">
      <DataTable columns={columns} data={listadoDeFormulas.formula} title={data[0].tittle}/>
    </div>
  )
}
