'use client';

import Link from "next/link";


export const Navbar = () => {
  return (

    <header className="text-gray-600 body-font">
      <div className="container mx-auto flex flex-wrap p-5 flex-col md:flex-row items-center">
        <Link href={'/'} className="flex title-font font-medium items-center text-gray-900 mb-4 md:mb-0">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className="w-10 h-10 text-white p-2 bg-indigo-500 rounded-full" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
          <span className="ml-3 text-xl">EL CHILO SRL</span>
        </Link>
        <nav className="md:mr-auto md:ml-4 md:py-1 md:pl-4 md:border-l md:border-gray-400 flex flex-wrap items-center text-base justify-center">
          <Link href={'/insumos'} className="mr-5 hover:text-gray-900">Insumos</Link>
          <Link href={'/home'} className="mr-5 hover:text-gray-900">Productos Elaborados</Link>
          <Link href={'/home'} className="mr-5 hover:text-gray-900">Estadisticas</Link>
          <Link href={'/home'} className="mr-5 hover:text-gray-900">Informes</Link>
        </nav>
        <div className="relative">
          <input type="search" placeholder="Buscar" id="email" name="email" className="w-full bg-white rounded border border-blue-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-base outline-none text-gray-700 py-1 px-3 leading-8 transition-colors duration-200 ease-in-out" />
        </div>
      </div>
    </header>

  )
}
