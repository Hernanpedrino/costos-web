"use client";


export const Table = () => {
  /*Ver la posibilidad de implementar datable*/
  return (

    <div className="container flex justify-center mx-auto mt-5">
      <div className="flex flex-col">
        <div className="w-full">
          <div className="border-b border-gray-200 shadow">
            <table className="divide-y divide-gray-300 ">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-2 text-xs text-gray-500">
                    ID
                  </th>
                  <th className="px-6 py-2 text-xs text-gray-500">
                    Insumo
                  </th>
                  <th className="px-6 py-2 text-xs text-gray-500">
                    Proveedor
                  </th>
                  <th className="px-6 py-2 text-xs text-gray-500">
                    Precio
                  </th>
                  <th className="px-6 py-2 text-xs text-gray-500">
                    Ultima Modificacion
                  </th>
                  <th className="px-6 py-2 text-xs text-gray-500">
                    Editar
                  </th>
                  <th className="px-6 py-2 text-xs text-gray-500">
                    Borrar
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-300">
                <tr className="whitespace-nowrap">
                  <td className="px-6 py-4 text-sm text-gray-500">
                    1
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      Almidon de maiz
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500">Glutal</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500">$ 3500</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    2021-1-12
                  </td>
                  <td className="px-6 py-4">
                    <a href="#" className="px-4 py-1 text-sm text-white bg-indigo-700 rounded-full">Editar</a>
                  </td>
                  <td className="px-6 py-4">
                    <a href="#" className="px-4 py-1 text-sm text-white bg-red-700 rounded-full">Borrar</a>
                  </td>
                </tr>
                <tr className="whitespace-nowrap">
                  <td className="px-6 py-4 text-sm text-gray-500">
                    2
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      Huevo en polvo
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500">Aesa</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500">$ 4200</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    2021-1-12
                  </td>
                  <td className="px-6 py-4">
                    <a href="#" className="px-4 py-1 text-sm text-white bg-indigo-700 rounded-full">Editar</a>
                  </td>
                  <td className="px-6 py-4">
                    <a href="#" className="px-4 py-1 text-sm text-white bg-red-700 rounded-full">Borrar</a>
                  </td>
                </tr>
                <tr className="whitespace-nowrap">
                  <td className="px-6 py-4 text-sm text-gray-500">
                    3
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      Bernecol
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500">Bernesa</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500">$ 6000</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    2021-1-12
                  </td>
                  <td className="px-6 py-4">
                    <a href="#" className="px-4 py-1 text-sm text-white bg-indigo-700 rounded-full">Editar</a>
                  </td>
                  <td className="px-6 py-4">
                    <a href="#" className="px-4 py-1 text-sm text-white bg-red-700 rounded-full">Borrar</a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
