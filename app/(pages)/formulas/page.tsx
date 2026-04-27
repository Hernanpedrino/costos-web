import { columns, Formula } from "./colums";
import { DataTable } from "./data-table";
import dataMock from "../../../MOCK_DATA.json";
import { Button } from "@/components/ui/button";
import Link from "next/link";

async function getData(): Promise<Formula[]> {
  const response = dataMock
  return response;
}

export default async function () {
  const data = await getData();
  return (
    <div className="flex flex-col items-center">
      <Link href={"/formulas/nueva"}>
        <Button
          type="button"
          className=" text-white bg-green-800 border-0 py-2 px-6 focus:outline-none hover:bg-green-600 rounded text-sm mt-10"
          form="form-insumos"
          size={"lg"}
        >
          Nueva Formula
        </Button>
      </Link>
      {
        data.map((tabla, index) => (
          <div className="p-10 w-3/4" key={index}>
            <DataTable columns={columns} data={tabla.formula} title={tabla.tittle} />
          </div>
        ))
      }
    </div>
  )
}
//TODO: CREAR UN FAB PARA IR AL INICIO DE LA PAGINA