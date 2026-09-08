'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { LogOut, ChevronDown } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

// ─── Definición de los grupos ─────────────────────────────────────────────────

interface Item {
  href: string;
  label: string;
}

interface Grupo {
  label: string;
  items: Item[];
}

const GRUPOS: Grupo[] = [
  {
    label: "Datos",
    items: [
      { href: "/insumos", label: "Insumos" },
      { href: "/formulas", label: "Fórmulas" },
    ],
  },
  {
    label: "Análisis",
    items: [
      { href: "/estadisticas", label: "Estadísticas" },
      { href: "/bejerman", label: "Estadísticas Bejerman" },
      { href: "/informes", label: "Informes" },
      { href: "/costos", label: "Costos" },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/planificacion", label: "Planificación" },
      { href: "/produccion", label: "Producción" },
    ],
  },
];

// ─── Dropdown ─────────────────────────────────────────────────────────────────

function Dropdown({ grupo, pathname }: { grupo: Grupo; pathname: string }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activo = grupo.items.some(i => pathname.startsWith(i.href));

  // Cerrar al hacer click afuera o con Escape
  useEffect(() => {
    if (!abierto) return;

    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [abierto]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto(v => !v)}
        className={`mr-5 inline-flex items-center gap-1 hover:text-gray-900 ${
          activo ? "text-gray-900 font-medium" : ""
        }`}
      >
        {grupo.label}
        <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-52 rounded-md border bg-white py-1 shadow-lg">
          {grupo.items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setAbierto(false)}
              className={`block px-4 py-2 text-sm hover:bg-gray-100 ${
                pathname.startsWith(item.href) ? "bg-gray-50 font-medium text-gray-900" : "text-gray-600"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

export const Navbar = () => {
  const { data: session } = useSession();
  const pathname = usePathname();

  return (
    <header className="text-gray-600 body-font">
      <div className="container mx-auto flex flex-wrap p-5 flex-col md:flex-row items-center">

        <Link href="/" className="flex title-font font-medium items-center text-gray-900 mb-4 md:mb-0">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className="w-10 h-10 text-white p-2 bg-indigo-500 rounded-full" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
          <span className="ml-3 text-xl">EL CHILO SRL</span>
        </Link>

        <nav className="md:mr-auto md:ml-4 md:py-1 md:pl-4 md:border-l md:border-gray-400 flex flex-wrap items-center text-base justify-center">
          {GRUPOS.map(g => (
            <Dropdown key={g.label} grupo={g} pathname={pathname} />
          ))}

          {session?.user?.role === "ADMIN" && (
            <Link
              href="/admin/usuarios"
              className={`mr-5 hover:text-gray-900 ${
                pathname.startsWith("/admin/usuarios") ? "text-gray-900 font-medium" : ""
              }`}
            >
              Usuarios
            </Link>
          )}
        </nav>

        {/* Logout directo desde el cliente — evita el problema de imports de next-auth */}
        <button
          onClick={() => signOut({ callbackUrl: `${window.location.origin}/login` })}
          title="Cerrar sesión"
          className="inline-flex items-center gap-2 mt-4 md:mt-0 px-3 py-1.5 rounded text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="hidden md:inline">Salir</span>
        </button>

      </div>
    </header>
  );
};
