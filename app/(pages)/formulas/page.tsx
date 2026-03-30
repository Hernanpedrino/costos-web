import { columns, Formula } from "./colums";
import { DataTable } from "./data-table";
import dataMock from "../../../MOCK_DATA.json";

async function getData(): Promise<Formula[]> {
  // Fetch data from your API here.
  const response = dataMock
  return response;
}

export default async function () {
  const data = await getData();
  return (
    <>
      {
        data.map((tabla, index) => (
          <div className="p-10" key={index}>
            <DataTable columns={columns} data={tabla.formula} title={tabla.tittle} />
          </div>
        ))
      }
    </>
  )
}
