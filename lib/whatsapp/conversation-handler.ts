// lib/whatsapp/conversation-handler.ts
import { sendTextMessage, sendButtons, sendList, markAsRead } from "./client";
import {
  buscarArticulos,
  consultarPrecio,
  consultarPrecios,
  obtenerArticulo,
  obtenerPalabrasDistintivas,
} from "./bejerman-lookup";
import { consultarStock } from "./bejerman-live";
import { obtenerSesion, actualizarSesion, reiniciarSesion, type Sesion } from "./session";
import { calcularFechaEntrega, INFO_RETIRO } from "./delivery-schedule";
import { buscarUltimoEnvio } from "./order-history";
import { enviarMail } from "@/lib/mail";
import type { WhatsAppMessage, CarritoItem } from "./types";

type DatosEntrega =
  | { tipo: "RETIRO"; nombrePersona?: string }
  | { tipo: "TRANSPORTE"; nombrePersona?: string }
  | { tipo: "REPARTO"; nombreLocal?: string; nombrePersona?: string; direccion?: string };

/**
 * Punto de entrada único para cualquier mensaje entrante.
 * Acá se decide, según el estado guardado de la conversación, qué hacer.
 */
export async function handleIncomingMessage(message: WhatsAppMessage, nombreContacto: string) {
  await markAsRead(message.id);

  const telefono = message.from;
  const sesion = await obtenerSesion(telefono, nombreContacto);

  // --- Texto libre ---
  if (message.type === "text") {
    const texto = message.text!.body.trim();
    await manejarTextoLibre(telefono, texto, sesion);
    return;
  }

  // --- Botón o fila de lista ---
  // Comparten el mismo espacio de ids (ej. "VER_CARRITO" aparece como botón
  // y como fila), así que se resuelven en un solo lugar.
  const idOpcion = message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id;
  if (message.type === "interactive" && idOpcion) {
    await manejarSeleccion(telefono, idOpcion, sesion);
    return;
  }

  // Si pidió hablar con una persona, lo que mande (audios incluidos) es para el equipo.
  if (sesion.estadoActual === "ATENCION_PERSONAL") {
    await avisarAtencion(
      sesion,
      `Mandó un mensaje de tipo "${message.type}" que no se puede reenviar por mail. Pedile que lo escriba cuando lo contactes.`
    );
    return;
  }

  // Tipo no soportado todavía (imagen, audio, ubicación, etc.)
  await sendTextMessage(
    telefono,
    `Por ahora no puedo escuchar audios ni ver imágenes 🙂 Escribime el producto que buscás. ${AYUDA_MENU}`
  );
}

// Si hay más coincidencias que las que entran en una lista de WhatsApp,
// mejor ofrecer un filtro (palabras distintivas) en vez de listar una
// parte y quizás no incluir lo que el usuario buscaba.
const MAX_RESULTADOS_LISTA = 8;

// Muestra más grande para analizar qué palabras diferencian los resultados
// cuando hay demasiadas coincidencias (no se muestran, solo se analizan).
const MUESTRA_PARA_ANALISIS = 60;

// WhatsApp limita a 10 filas TOTALES por lista: 6 cantidades rápidas +
// "Otra cantidad" + "Buscar otro" + "Ver mi pedido".
const MAX_CANTIDAD_RAPIDA = 6;

// Artículos que se pueden tocar para modificar en "Ver mi pedido"; las 2
// filas restantes de la lista son "Agregar otro" y "Finalizar pedido".
const MAX_ITEMS_EDITABLES = 8;

// Límites de la Cloud API para mensajes interactivos.
const LARGO_TITULO_FILA = 24;
const LARGO_DESCRIPCION_FILA = 72;
const LARGO_CUERPO_INTERACTIVO = 1024;

const AYUDA_MENU = "Escribí *menu* en cualquier momento para volver a las opciones.";

const formatoPrecio = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const formatoCantidad = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

/** Precio en formato argentino ("$ 1.234,50"). Sin precio en la lista FIN → "precio a confirmar". */
function formatearPrecio(precio: number | null | undefined): string {
  return precio ? formatoPrecio.format(precio) : "precio a confirmar";
}

function formatearCantidad(cantidad: number): string {
  return formatoCantidad.format(cantidad);
}

function truncar(texto: string, largo: number): string {
  return texto.length <= largo ? texto : texto.slice(0, largo - 1).trimEnd() + "…";
}

/**
 * Reconoce una cantidad escrita a mano: "12", "2,5", "x3", "3 kg", "1.000".
 * Devuelve null si el texto no es una cantidad (ej. el nombre de otro producto).
 * El punto seguido de grupos de 3 dígitos se toma como separador de miles.
 */
function interpretarCantidad(texto: string): number | null {
  const m = texto.trim().match(/^x?\s*(\d+(?:[.,]\d+)*)\s*(u|un|uni|unid|unidad|unidades|kg|kgs|kilo|kilos)?\.?$/i);
  if (!m) return null;

  const numero = /^\d{1,3}(\.\d{3})+$/.test(m[1]) ? m[1].replace(/\./g, "") : m[1].replace(",", ".");
  const cantidad = Number(numero);
  return Number.isFinite(cantidad) ? cantidad : null;
}

/** Devuelve el `datosEntrega` guardado en el contexto de la sesión, tipado. */
function obtenerDatosEntrega(sesion: Sesion): DatosEntrega | undefined {
  return sesion.contexto.datosEntrega as DatosEntrega | undefined;
}

/**
 * Contexto mínimo que sobrevive entre pasos: el tipo de entrega se elige al
 * principio y tiene que durar mientras se arma el resto del pedido.
 */
function contextoBase(sesion: Sesion): Record<string, unknown> {
  return { datosEntrega: obtenerDatosEntrega(sesion) };
}

/** True si ya están todos los datos que necesita el tipo de entrega elegido. */
function entregaCompleta(datos: DatosEntrega | undefined): datos is DatosEntrega {
  if (!datos?.nombrePersona) return false;
  if (datos.tipo === "REPARTO") return !!datos.nombreLocal && !!datos.direccion;
  return true;
}

/** Bloque de texto con los datos de entrega, para el resumen y el mail de atención. */
function textoEntrega(datos: DatosEntrega): string {
  if (datos.tipo === "RETIRO") {
    return `Retiro en el local — Retira: ${datos.nombrePersona}.`;
  }
  if (datos.tipo === "TRANSPORTE") {
    return `Envío por transporte (a coordinar con nuestro equipo) — A nombre de: ${datos.nombrePersona}.`;
  }
  const { etiqueta } = calcularFechaEntrega();
  return (
    `Envío a: ${datos.nombreLocal}\n` +
    `Att: ${datos.nombrePersona}\n` +
    `Dirección: ${datos.direccion}\n` +
    `Reparto estimado: ${etiqueta}`
  );
}

function lineasCarrito(carrito: CarritoItem[]): string {
  return carrito
    .map((it) => {
      const subtotal = it.precioUnitario ? formatoPrecio.format(it.cantidad * it.precioUnitario) : "precio a confirmar";
      return `• ${formatearCantidad(it.cantidad)} x ${it.descripcion} — ${subtotal}`;
    })
    .join("\n");
}

function textoTotal(carrito: CarritoItem[]): string {
  const total = carrito.reduce((acc, it) => acc + it.cantidad * it.precioUnitario, 0);
  const haySinPrecio = carrito.some((it) => !it.precioUnitario);
  return formatoPrecio.format(total) + (haySinPrecio ? " + artículos con precio a confirmar" : "");
}

/**
 * Los mensajes interactivos aceptan hasta 1024 caracteres de cuerpo. Si el
 * detalle (ej. un pedido largo) no entra, se manda como texto aparte y el
 * mensaje interactivo lleva solo la pregunta.
 */
async function cuerpoInteractivo(telefono: string, detalle: string, pregunta: string): Promise<string> {
  const completo = `${detalle}\n\n${pregunta}`;
  if (completo.length <= LARGO_CUERPO_INTERACTIVO) return completo;
  await sendTextMessage(telefono, detalle);
  return pregunta;
}

async function manejarTextoLibre(telefono: string, texto: string, sesion: Sesion) {
  const textoNorm = texto.trim().toLowerCase();
  // \b al final es clave: sin eso, "hi" matchea el inicio de "Hilo",
  // "historia", etc. y reiniciaba la sesión por error.
  const saludo = /^(hola|buenas|hi|buen[oa]s? d[ií]as|buenas tardes)\b/i;

  // Salidas rápidas: saludo o "menu" interrumpen cualquier flujo en curso
  // (ej. si estaba esperando una cantidad y el usuario se arrepiente).
  if (saludo.test(texto) || textoNorm === "menu" || textoNorm === "menú") {
    await irAlMenu(telefono, sesion);
    return;
  }

  // Pidió hablar con una persona: lo que escriba es para el equipo, el bot no contesta.
  if (sesion.estadoActual === "ATENCION_PERSONAL") {
    await avisarAtencion(sesion, `Escribió:\n\n${texto}`);
    return;
  }

  // --- Acaba de ver un artículo (o eligió cambiar una cantidad) ---
  if (sesion.estadoActual === "ESPERANDO_CANTIDAD") {
    const cantidad = interpretarCantidad(texto);
    if (cantidad !== null) {
      await procesarCantidad(telefono, sesion, cantidad);
      return;
    }
    // No es un número: seguramente busca otro producto, sigue a la búsqueda.
  }

  // --- Recolectando datos de entrega (según el tipo elegido al principio) ---
  if (sesion.estadoActual === "ESPERANDO_NOMBRE_LOCAL") {
    await procesarNombreLocal(telefono, texto, sesion);
    return;
  }
  if (sesion.estadoActual === "ESPERANDO_NOMBRE_PERSONA") {
    await procesarNombrePersona(telefono, texto, sesion);
    return;
  }
  if (sesion.estadoActual === "ESPERANDO_DIRECCION") {
    await procesarDireccion(telefono, texto, sesion);
    return;
  }

  // Un número suelto sin artículo elegido no sirve como búsqueda.
  if (interpretarCantidad(texto) !== null) {
    await sendTextMessage(telefono, 'Primero decime qué producto querés (ej: "harina 000") y después la cantidad.');
    return;
  }

  // A partir de acá, tratamos cualquier otro texto como una búsqueda de
  // artículo — es lo más común una vez que el usuario ya está armando pedido
  // o preguntando por algo puntual (ej. "harina 000", "tenés sal fina?").
  await realizarBusquedaArticulo(telefono, sesion, texto);
}

/**
 * Vuelve al menú sin perder un pedido en curso: antes, "hola" o "menu"
 * vaciaban el carrito sin avisar. Para descartarlo está "Cancelar pedido".
 */
async function irAlMenu(telefono: string, sesion: Sesion) {
  const hayPedido = sesion.carritoActual.length > 0;
  await actualizarSesion(telefono, {
    estadoActual: "MENU_PRINCIPAL",
    contexto: hayPedido ? contextoBase(sesion) : {},
  });
  await mostrarMenuPrincipal(telefono, sesion.carritoActual);
}

/**
 * Busca artículos por texto y decide qué mostrar según cuántas coincidencias
 * haya. Está separada de manejarTextoLibre porque también se llama de forma
 * recursiva cuando el usuario elige una palabra para refinar la búsqueda.
 */
async function realizarBusquedaArticulo(telefono: string, sesion: Sesion, texto: string) {
  const { articulos, totalCoincidencias } = await buscarArticulos(texto, MAX_RESULTADOS_LISTA);

  if (totalCoincidencias === 0) {
    await sendTextMessage(
      telefono,
      `No encontré productos para "${texto}". Probá con menos palabras (ej: solo "pimienta"). ${AYUDA_MENU}`
    );
    return;
  }

  if (totalCoincidencias === 1) {
    await mostrarDetalleArticulo(telefono, sesion, articulos[0].codigo, articulos[0].descripcion);
    return;
  }

  if (totalCoincidencias > MAX_RESULTADOS_LISTA) {
    // Demasiadas coincidencias: en vez de listar una parte al azar, traemos
    // una muestra más grande para ver qué palabras las diferencian
    // (ej. "FINO"/"MEDIO"/"GRUESO", "1KG"/"5KG") y las ofrecemos como filtro.
    const muestra = await buscarArticulos(texto, MUESTRA_PARA_ANALISIS);
    const palabras = obtenerPalabrasDistintivas(muestra.articulos, texto);

    if (palabras.length === 0) {
      // No encontramos ninguna palabra que sirva de filtro (raro, pero
      // puede pasar) — pedimos más detalle a mano como último recurso.
      await sendTextMessage(
        telefono,
        `Hay ${totalCoincidencias} productos para "${texto}". ¿Podés agregar algún detalle más (marca, presentación, tamaño)?`
      );
      return;
    }

    await sendList(
      telefono,
      `Hay ${totalCoincidencias} productos para "${texto}". Para encontrar el tuyo más rápido, tocá "Filtrar" y elegí una característica, o escribí una búsqueda más precisa.`,
      "Filtrar",
      [
        {
          title: "Filtros sugeridos",
          rows: palabras.map((p) => ({
            id: `REFINAR|${p.palabra}|${texto}`,
            title: truncar(p.palabra, LARGO_TITULO_FILA),
            description: `${p.cantidad} productos`,
          })),
        },
      ]
    );
    return;
  }

  // Pocas coincidencias: lista con la descripción como título (el código no
  // le dice nada al cliente) y el precio abajo.
  const precios = await consultarPrecios(articulos.map((a) => a.codigo));

  await sendList(telefono, `Encontré ${totalCoincidencias} opciones para "${texto}". Tocá "Ver opciones" y elegí una:`, "Ver opciones", [
    {
      title: "Resultados",
      rows: articulos.map((r) => {
        // Si la descripción no entra en el título, va completa abajo junto al precio.
        const partes = [
          r.descripcion.length > LARGO_TITULO_FILA ? r.descripcion : null,
          formatearPrecio(precios.get(r.codigo)),
        ].filter(Boolean);
        return {
          id: `ART_${r.codigo}`,
          title: truncar(r.descripcion, LARGO_TITULO_FILA),
          description: truncar(partes.join(" · "), LARGO_DESCRIPCION_FILA),
        };
      }),
    },
  ]);
}

/**
 * Aplica una cantidad escrita a mano o elegida de la lista: agrega el
 * artículo pendiente al carrito, o cambia la cantidad si venía de
 * "Cambiar cantidad" en "Ver mi pedido".
 */
async function procesarCantidad(telefono: string, sesion: Sesion, cantidad: number) {
  if (!(cantidad > 0)) {
    await sendTextMessage(telefono, "La cantidad tiene que ser mayor a cero, ej: 12");
    return; // seguimos en ESPERANDO_CANTIDAD, no hace falta tocar la sesión
  }

  const codigoPendiente = sesion.contexto.codigoPendiente as string | undefined;
  const descripcionPendiente = sesion.contexto.descripcionPendiente as string | undefined;

  if (!codigoPendiente) {
    await actualizarSesion(telefono, { estadoActual: "ARMANDO_PEDIDO", contexto: contextoBase(sesion) });
    await sendTextMessage(telefono, "Se me perdió a qué producto te referías, ¿podés escribirlo de nuevo?");
    return;
  }

  if (sesion.contexto.editando) {
    await cambiarCantidadItem(telefono, sesion, codigoPendiente, cantidad);
    return;
  }

  await agregarItemAlCarrito(telefono, sesion, codigoPendiente, descripcionPendiente ?? codigoPendiente, cantidad);
}

/**
 * Agrega un item al carrito de la sesión y confirma. Si el artículo ya
 * estaba, suma la cantidad en vez de duplicar la línea: así cada artículo
 * aparece una sola vez y se puede identificar por código al modificarlo.
 */
async function agregarItemAlCarrito(
  telefono: string,
  sesion: Sesion,
  codigo: string,
  descripcion: string,
  cantidad: number
) {
  const existente = sesion.carritoActual.find((it) => it.codigoArticulo === codigo);

  let carritoActualizado: CarritoItem[];
  if (existente) {
    carritoActualizado = sesion.carritoActual.map((it) =>
      it.codigoArticulo === codigo ? { ...it, cantidad: it.cantidad + cantidad } : it
    );
  } else {
    const precio = (await consultarPrecio(codigo)) ?? 0;
    carritoActualizado = [
      ...sesion.carritoActual,
      { codigoArticulo: codigo, descripcion, cantidad, precioUnitario: precio },
    ];
  }

  await actualizarSesion(telefono, {
    estadoActual: "ARMANDO_PEDIDO",
    carritoActual: carritoActualizado,
    contexto: contextoBase(sesion),
  });

  const linea = existente
    ? `Sumé ${formatearCantidad(cantidad)} más de ${descripcion} — ahora llevás ${formatearCantidad(existente.cantidad + cantidad)}.`
    : `Agregado: ${formatearCantidad(cantidad)} x ${descripcion}`;

  await sendButtons(
    telefono,
    `${linea}\n\nTu pedido tiene ${carritoActualizado.length} producto(s) — total: ${textoTotal(carritoActualizado)}`,
    [
      { id: "AGREGAR_OTRO", title: "Agregar otro" },
      { id: "VER_CARRITO", title: "Ver mi pedido" },
      { id: "FINALIZAR_PEDIDO", title: "Finalizar pedido" },
    ]
  );
}

/**
 * Muestra precio y disponibilidad de un artículo puntual, ya resuelto a un
 * código único, y queda esperando la cantidad: se puede escribir (ej. "12")
 * o elegir de la lista. Elegir de la lista agrega directo al carrito.
 */
async function mostrarDetalleArticulo(telefono: string, sesion: Sesion, codigo: string, descripcion: string) {
  try {
    const [precio, stock] = await Promise.all([
      consultarPrecio(codigo),
      consultarStock(codigo),
    ]);

    // No mostramos la cantidad exacta: al cliente le alcanza con saber si hay.
    const stockTexto = stock.disponible > 0 ? "✅ Hay stock" : "⚠️ Sin stock por el momento";

    const filasCantidad = Array.from({ length: MAX_CANTIDAD_RAPIDA }, (_, i) => ({
      id: `CANT|${i + 1}|${codigo}`,
      title: String(i + 1),
    }));

    const otrasOpciones: { id: string; title: string; description?: string }[] = [
      { id: `MASCANT|${codigo}`, title: "Otra cantidad", description: "Escribir la cantidad exacta" },
      { id: "BUSCAR_OTRO", title: "Buscar otro producto" },
    ];
    if (sesion.carritoActual.length > 0) {
      otrasOpciones.push({ id: "VER_CARRITO", title: "Ver mi pedido" });
    }

    await actualizarSesion(telefono, {
      estadoActual: "ESPERANDO_CANTIDAD",
      contexto: { ...contextoBase(sesion), codigoPendiente: codigo, descripcionPendiente: descripcion },
    });

    await sendList(
      telefono,
      `*${descripcion}*\nPrecio: ${formatearPrecio(precio)}\n${stockTexto}\nCódigo: ${codigo}\n\n` +
        `¿Cuánto querés? Escribí la cantidad (ej: 12) o tocá "Elegir cantidad".`,
      "Elegir cantidad",
      [
        { title: "Cantidad", rows: filasCantidad },
        { title: "Otras opciones", rows: otrasOpciones },
      ]
    );
  } catch (err) {
    console.error(`Error consultando detalle de ${codigo}:`, err);
    await sendTextMessage(
      telefono,
      "Tuve un problema consultando ese producto en el sistema. Probá de nuevo en un momento."
    );
  }
}

/** Reinicia el flujo de búsqueda, preservando el tipo de entrega ya elegido. */
async function iniciarBusquedaOtro(telefono: string, sesion: Sesion) {
  await actualizarSesion(telefono, {
    estadoActual: "ARMANDO_PEDIDO",
    contexto: contextoBase(sesion),
  });
  await sendTextMessage(telefono, '¿Qué otro producto necesitás? Escribilo como lo conocés (ej: "sal fina").');
}

async function manejarSeleccion(telefono: string, idOpcion: string, sesion: Sesion) {
  if (idOpcion === "BUSCAR_OTRO" || idOpcion === "AGREGAR_OTRO") {
    await iniciarBusquedaOtro(telefono, sesion);
    return;
  }

  if (idOpcion === "VER_CARRITO") {
    await mostrarCarrito(telefono, sesion);
    return;
  }

  if (idOpcion === "FINALIZAR_PEDIDO") {
    await mostrarResumenPedido(telefono, sesion);
    return;
  }

  if (idOpcion === "HACER_PEDIDO") {
    await pedirTipoEntrega(telefono, "¿Cómo querés recibir tu pedido?");
    return;
  }

  if (idOpcion === "HABLAR_PERSONA") {
    await derivarAPersona(telefono, sesion);
    return;
  }

  // --- Elección del tipo de entrega ---
  if (idOpcion === "REPARTO") {
    const ultimoEnvio = await buscarUltimoEnvio(telefono);

    if (ultimoEnvio) {
      await actualizarSesion(telefono, {
        estadoActual: "ESPERANDO_REPETIR_ENVIO",
        contexto: { datosEntrega: { tipo: "REPARTO", ...ultimoEnvio } },
      });
      await sendButtons(
        telefono,
        `El último envío fue a ${ultimoEnvio.nombreLocal}. Recibe ${ultimoEnvio.nombrePersona} - ${ultimoEnvio.direccion}.\n\n¿Repetimos el envío a esa dirección?`,
        [
          { id: "REPETIR_SI", title: "Sí" },
          { id: "REPETIR_NO", title: "No" },
        ]
      );
      return;
    }

    await actualizarSesion(telefono, {
      estadoActual: "ESPERANDO_NOMBRE_LOCAL",
      contexto: { datosEntrega: { tipo: "REPARTO" } },
    });
    await sendTextMessage(telefono, "¿Cuál es el nombre del local/comercio al que hacemos la entrega?");
    return;
  }

  if (idOpcion === "TRANSPORTE") {
    await actualizarSesion(telefono, {
      estadoActual: "ESPERANDO_NOMBRE_PERSONA",
      contexto: { datosEntrega: { tipo: "TRANSPORTE" } },
    });
    await sendTextMessage(telefono, "¿A nombre de quién hacemos el pedido?");
    return;
  }

  if (idOpcion === "RETIRO") {
    await actualizarSesion(telefono, {
      estadoActual: "ESPERANDO_NOMBRE_PERSONA",
      contexto: { datosEntrega: { tipo: "RETIRO" } },
    });
    await sendTextMessage(telefono, "¿A nombre de quién retira el pedido?");
    return;
  }

  if (idOpcion === "REPETIR_SI") {
    const datosEntrega = obtenerDatosEntrega(sesion); // quedó cargado del historial
    if (!datosEntrega) {
      await pedirTipoEntrega(telefono, "¿Cómo querés recibir tu pedido?");
      return;
    }
    await continuarTrasEntrega(telefono, sesion, datosEntrega);
    return;
  }

  if (idOpcion === "REPETIR_NO") {
    await actualizarSesion(telefono, {
      estadoActual: "ESPERANDO_NOMBRE_LOCAL",
      contexto: { datosEntrega: { tipo: "REPARTO" } }, // descartamos los datos del historial
    });
    await sendTextMessage(telefono, "¿Cuál es el nombre del local/comercio al que hacemos la entrega?");
    return;
  }

  if (idOpcion === "CONFIRMAR_PEDIDO") {
    await confirmarPedido(telefono, sesion);
    return;
  }

  if (idOpcion === "CANCELAR_PEDIDO") {
    await reiniciarSesion(telefono);
    await sendTextMessage(telefono, 'Pedido cancelado. Cuando quieras, escribí *menu* para empezar de nuevo.');
    return;
  }

  // Cantidad rápida elegida directo de la lista: "CANT|<n>|<codigo>"
  if (idOpcion.startsWith("CANT|")) {
    const [, cantidadStr, codigo] = idOpcion.split("|");
    const cantidad = Number(cantidadStr);
    const articulo = await obtenerArticulo(codigo);
    await agregarItemAlCarrito(telefono, sesion, codigo, articulo?.descripcion ?? codigo, cantidad);
    return;
  }

  // "Otra cantidad": pedimos la cantidad exacta por texto.
  if (idOpcion.startsWith("MASCANT|")) {
    const codigo = idOpcion.replace("MASCANT|", "");
    const articulo = await obtenerArticulo(codigo);
    await actualizarSesion(telefono, {
      estadoActual: "ESPERANDO_CANTIDAD",
      contexto: {
        ...contextoBase(sesion),
        codigoPendiente: codigo,
        descripcionPendiente: articulo?.descripcion ?? codigo,
      },
    });
    await sendTextMessage(telefono, `Escribí la cantidad de ${articulo?.descripcion ?? codigo} que querés (ej: 12).`);
    return;
  }

  // Filtro elegido para acotar una búsqueda con demasiados resultados:
  // "REFINAR|<palabra>|<textoOriginal>"
  if (idOpcion.startsWith("REFINAR|")) {
    const partes = idOpcion.split("|");
    const palabra = partes[1];
    const textoOriginal = partes.slice(2).join("|");
    await realizarBusquedaArticulo(telefono, sesion, `${textoOriginal} ${palabra}`);
    return;
  }

  // Selección de un resultado de búsqueda por texto: "ART_<codigo>"
  if (idOpcion.startsWith("ART_")) {
    const codigo = idOpcion.replace("ART_", "");
    const articulo = await obtenerArticulo(codigo);
    await mostrarDetalleArticulo(telefono, sesion, codigo, articulo?.descripcion ?? codigo);
    return;
  }

  // Artículo del carrito elegido en "Ver mi pedido": "ITEM|<codigo>"
  if (idOpcion.startsWith("ITEM|")) {
    await mostrarOpcionesItem(telefono, sesion, idOpcion.replace("ITEM|", ""));
    return;
  }

  if (idOpcion.startsWith("CAMBIAR|")) {
    const codigo = idOpcion.replace("CAMBIAR|", "");
    const item = sesion.carritoActual.find((it) => it.codigoArticulo === codigo);
    if (!item) {
      await mostrarCarrito(telefono, sesion);
      return;
    }
    await actualizarSesion(telefono, {
      estadoActual: "ESPERANDO_CANTIDAD",
      contexto: {
        ...contextoBase(sesion),
        codigoPendiente: codigo,
        descripcionPendiente: item.descripcion,
        editando: true,
      },
    });
    await sendTextMessage(
      telefono,
      `Escribí la nueva cantidad de ${item.descripcion} (ahora tenés ${formatearCantidad(item.cantidad)}).`
    );
    return;
  }

  if (idOpcion.startsWith("QUITAR|")) {
    const codigo = idOpcion.replace("QUITAR|", "");
    const item = sesion.carritoActual.find((it) => it.codigoArticulo === codigo);
    const carrito = sesion.carritoActual.filter((it) => it.codigoArticulo !== codigo);
    await actualizarSesion(telefono, { carritoActual: carrito });
    if (item) await sendTextMessage(telefono, `Quité ${item.descripcion} del pedido.`);
    await mostrarCarrito(telefono, { ...sesion, carritoActual: carrito });
    return;
  }

  // Botones de versiones anteriores del menú ("Ver catálogo", "Consultar
  // pedido") u opciones desconocidas: volvemos al menú.
  await irAlMenu(telefono, sesion);
}

/** Primer paso de un pedido, o paso previo al resumen si todavía no se eligió. */
async function pedirTipoEntrega(telefono: string, texto: string) {
  await actualizarSesion(telefono, { estadoActual: "ESPERANDO_TIPO_ENTREGA" });
  await sendButtons(telefono, texto, [
    { id: "REPARTO", title: "Envío por reparto" },
    { id: "TRANSPORTE", title: "Envío por transporte" },
    { id: "RETIRO", title: "Retiro en el local" },
  ]);
}

// Destino de los avisos de "Hablar con persona" hasta que haya un número y
// un responsable definidos para atender.
const MAIL_ATENCION = process.env.MAIL_ATENCION ?? "hernanpedrino@elchilo.com";

/**
 * Manda un aviso por mail al equipo. Mismo asunto para toda la conversación,
 * así Gmail agrupa los mensajes de un cliente en un solo hilo. Si el mail
 * falla, se loguea y el bot sigue.
 */
async function avisarAtencion(sesion: Sesion, cuerpo: string) {
  const nombre = sesion.nombreContacto ?? "Sin nombre";
  try {
    await enviarMail({
      to: MAIL_ATENCION,
      subject: `Atención WhatsApp — ${nombre} (${sesion.telefono})`,
      text: `${nombre} (+${sesion.telefono})\n\n${cuerpo}\n\nEscribirle por WhatsApp: https://wa.me/${sesion.telefono}`,
    });
  } catch (err) {
    console.error(`[whatsapp] No se pudo mandar el mail de atención de ${sesion.telefono}:`, err);
  }
}

/**
 * Deja la conversación en manos del equipo: el bot no responde más texto
 * hasta que el cliente escriba "menu" (lo que escriba se reenvía por mail).
 * El carrito se conserva.
 */
async function derivarAPersona(telefono: string, sesion: Sesion) {
  await actualizarSesion(telefono, { estadoActual: "ATENCION_PERSONAL", contexto: contextoBase(sesion) });

  const datosEntrega = obtenerDatosEntrega(sesion);
  const pedido =
    sesion.carritoActual.length > 0
      ? `Pedido en curso:\n${lineasCarrito(sesion.carritoActual)}\nTotal: ${textoTotal(sesion.carritoActual)}`
      : "Sin productos cargados.";
  await avisarAtencion(
    sesion,
    `Pidió hablar con una persona.\n\n${pedido}` +
      (entregaCompleta(datosEntrega) ? `\n\nEntrega:\n${textoEntrega(datosEntrega)}` : "")
  );

  await sendTextMessage(
    telefono,
    `Listo, le avisamos al equipo. Alguien se va a comunicar con vos por WhatsApp (puede ser desde otro número). ` +
      `Mientras tanto, podés dejarnos tu consulta escrita acá.\n\n` +
      `Horario de atención: ${INFO_RETIRO.horario}.\n\n` +
      `Si querés volver al asistente automático, escribí *menu*.`
  );
}

async function procesarNombreLocal(telefono: string, texto: string, sesion: Sesion) {
  const datosEntrega = { ...(obtenerDatosEntrega(sesion) as object), nombreLocal: texto.trim() };
  await actualizarSesion(telefono, { estadoActual: "ESPERANDO_NOMBRE_PERSONA", contexto: { datosEntrega } });
  await sendTextMessage(telefono, "¿A nombre de quién recibimos el pedido?");
}

/**
 * Después del nombre de la persona, el siguiente paso depende del tipo de
 * entrega: reparto todavía necesita la dirección; retiro y transporte ya
 * tienen todo lo necesario.
 */
async function procesarNombrePersona(telefono: string, texto: string, sesion: Sesion) {
  const datosEntrega = { ...(obtenerDatosEntrega(sesion) as object), nombrePersona: texto.trim() } as DatosEntrega;

  if (datosEntrega.tipo === "REPARTO") {
    await actualizarSesion(telefono, { estadoActual: "ESPERANDO_DIRECCION", contexto: { datosEntrega } });
    await sendTextMessage(telefono, "¿Cuál es la dirección de entrega?");
    return;
  }

  await continuarTrasEntrega(telefono, sesion, datosEntrega);
}

async function procesarDireccion(telefono: string, texto: string, sesion: Sesion) {
  const datosEntrega = { ...(obtenerDatosEntrega(sesion) as object), direccion: texto.trim() } as DatosEntrega;
  await continuarTrasEntrega(telefono, sesion, datosEntrega);
}

/**
 * Con los datos de entrega completos: si ya había productos en el carrito
 * (ej. buscó directo desde el menú y después tocó "Finalizar"), pasa al
 * resumen; si no, pide el primer producto.
 */
async function continuarTrasEntrega(telefono: string, sesion: Sesion, datosEntrega: DatosEntrega) {
  await actualizarSesion(telefono, { estadoActual: "ARMANDO_PEDIDO", contexto: { datosEntrega } });

  if (sesion.carritoActual.length > 0) {
    await mostrarResumenPedido(telefono, { ...sesion, contexto: { datosEntrega } });
    return;
  }

  const mensaje =
    datosEntrega.tipo === "TRANSPORTE"
      ? "Para envíos por transporte coordinamos los detalles (empresa, costo, tiempos) directo con vos. Decime igual qué productos necesitás, así lo dejamos anotado."
      : 'Buenísimo, ¿qué producto necesitás? Escribilo como lo conocés (ej: "harina 000").';
  await sendTextMessage(telefono, mensaje);
}

/**
 * "Ver mi pedido": detalle del carrito con una lista para tocar un artículo
 * y modificarlo, agregar otro o finalizar.
 */
async function mostrarCarrito(telefono: string, sesion: Sesion) {
  const carrito = sesion.carritoActual;

  if (carrito.length === 0) {
    await actualizarSesion(telefono, { estadoActual: "ARMANDO_PEDIDO", contexto: contextoBase(sesion) });
    await sendTextMessage(telefono, 'Tu pedido está vacío. Escribí el producto que buscás (ej: "harina 000").');
    return;
  }

  // Salir de ESPERANDO_CONFIRMACION invalida un "Confirmar" viejo: si el
  // pedido cambia, hay que volver a ver el resumen antes de confirmar.
  await actualizarSesion(telefono, { estadoActual: "ARMANDO_PEDIDO", contexto: contextoBase(sesion) });

  const detalle = `*Tu pedido*\n\n${lineasCarrito(carrito)}\n\nTotal: ${textoTotal(carrito)}`;
  const pregunta =
    carrito.length > MAX_ITEMS_EDITABLES
      ? `Tocá "Opciones" para modificar un producto (se muestran los primeros ${MAX_ITEMS_EDITABLES}), agregar otro o finalizar.`
      : 'Tocá "Opciones" para modificar un producto, agregar otro o finalizar.';

  await sendList(telefono, await cuerpoInteractivo(telefono, detalle, pregunta), "Opciones", [
    {
      title: "Modificar un producto",
      rows: carrito.slice(0, MAX_ITEMS_EDITABLES).map((it) => ({
        id: `ITEM|${it.codigoArticulo}`,
        title: truncar(it.descripcion, LARGO_TITULO_FILA),
        description: `Cantidad: ${formatearCantidad(it.cantidad)}`,
      })),
    },
    {
      title: "Pedido",
      rows: [
        { id: "AGREGAR_OTRO", title: "Agregar otro producto" },
        { id: "FINALIZAR_PEDIDO", title: "Finalizar pedido" },
      ],
    },
  ]);
}

async function mostrarOpcionesItem(telefono: string, sesion: Sesion, codigo: string) {
  const item = sesion.carritoActual.find((it) => it.codigoArticulo === codigo);
  if (!item) {
    await mostrarCarrito(telefono, sesion); // mensaje viejo de un artículo que ya no está
    return;
  }

  const subtotal = item.precioUnitario ? formatoPrecio.format(item.cantidad * item.precioUnitario) : "precio a confirmar";
  await sendButtons(
    telefono,
    `*${item.descripcion}*\nCantidad: ${formatearCantidad(item.cantidad)}\nSubtotal: ${subtotal}\n\n¿Qué querés hacer?`,
    [
      { id: `CAMBIAR|${codigo}`, title: "Cambiar cantidad" },
      { id: `QUITAR|${codigo}`, title: "Quitar del pedido" },
      { id: "VER_CARRITO", title: "Volver al pedido" },
    ]
  );
}

async function cambiarCantidadItem(telefono: string, sesion: Sesion, codigo: string, cantidad: number) {
  const carrito = sesion.carritoActual.map((it) => (it.codigoArticulo === codigo ? { ...it, cantidad } : it));
  await actualizarSesion(telefono, { carritoActual: carrito });
  await mostrarCarrito(telefono, { ...sesion, carritoActual: carrito });
}

/**
 * Muestra el resumen del carrito antes de confirmar, con el detalle de
 * entrega. Si todavía no se eligió cómo recibirlo (o faltan datos), lo pide
 * primero y vuelve acá al completarlo.
 */
async function mostrarResumenPedido(telefono: string, sesion: Sesion) {
  if (sesion.carritoActual.length === 0) {
    await sendTextMessage(telefono, 'Todavía no agregaste ningún producto. Escribí el que buscás (ej: "harina 000").');
    return;
  }

  const datosEntrega = obtenerDatosEntrega(sesion);
  if (!entregaCompleta(datosEntrega)) {
    await pedirTipoEntrega(telefono, "Antes de finalizar: ¿cómo querés recibir tu pedido?");
    return;
  }

  await actualizarSesion(telefono, { estadoActual: "ESPERANDO_CONFIRMACION" });

  const detalle =
    `*Resumen de tu pedido*\n\n${lineasCarrito(sesion.carritoActual)}\n\n` +
    `Total: ${textoTotal(sesion.carritoActual)}\n\n${textoEntrega(datosEntrega)}`;

  await sendButtons(telefono, await cuerpoInteractivo(telefono, detalle, "¿Confirmamos el pedido?"), [
    { id: "CONFIRMAR_PEDIDO", title: "Confirmar" },
    { id: "VER_CARRITO", title: "Modificar" },
    { id: "CANCELAR_PEDIDO", title: "Cancelar pedido" },
  ]);
}

/**
 * Mensaje final tras confirmar, adaptado al tipo de entrega.
 * TODO: todavía no crea la nota de pedido real en Bejerman (SegCabV/SegDetV)
 * — eso es el próximo paso grande pendiente.
 */
async function confirmarPedido(telefono: string, sesion: Sesion) {
  // Un "Confirmar" de un mensaje viejo (pedido ya confirmado, cancelado o
  // modificado después del resumen) no puede confirmar nada.
  if (sesion.estadoActual !== "ESPERANDO_CONFIRMACION" || sesion.carritoActual.length === 0) {
    await sendTextMessage(telefono, "Ese resumen ya no está vigente (puede ser un mensaje anterior).");
    await irAlMenu(telefono, sesion);
    return;
  }

  const datosEntrega = obtenerDatosEntrega(sesion);

  if (datosEntrega?.tipo === "RETIRO") {
    await sendTextMessage(
      telefono,
      `¡Gracias! Tu pedido va a estar listo para retirar en aproximadamente 30 minutos.\n\n` +
        `Horario de atención: ${INFO_RETIRO.horario}.\n` +
        `Dirección: ${INFO_RETIRO.direccion}.`
    );
  } else if (datosEntrega?.tipo === "TRANSPORTE") {
    await sendTextMessage(
      telefono,
      "¡Gracias! Tomamos nota de lo que necesitás — nuestro equipo te va a contactar para coordinar la empresa de transporte, el costo y los tiempos de entrega."
    );
  } else {
    await sendTextMessage(
      telefono,
      "¡Gracias! Todavía estoy aprendiendo a cargar el pedido directo en el sistema — por ahora, alguien del equipo te va a confirmar el pedido a la brevedad."
    );
  }

  await reiniciarSesion(telefono);
}

async function mostrarMenuPrincipal(telefono: string, carrito: CarritoItem[]) {
  const ayuda = `También podés escribir directamente el producto que buscás (ej: "harina 000"). ${AYUDA_MENU}`;

  if (carrito.length > 0) {
    await sendButtons(telefono, `¡Hola! Tenés un pedido en curso con ${carrito.length} producto(s).\n\n${ayuda}`, [
      { id: "VER_CARRITO", title: "Ver mi pedido" },
      { id: "HABLAR_PERSONA", title: "Hablar con persona" },
      { id: "CANCELAR_PEDIDO", title: "Cancelar pedido" },
    ]);
    return;
  }

  await sendButtons(telefono, `¡Hola! Soy el asistente de pedidos de El Chilo. ¿En qué te puedo ayudar?\n\n${ayuda}`, [
    { id: "HACER_PEDIDO", title: "Hacer pedido" },
    { id: "HABLAR_PERSONA", title: "Hablar con persona" },
  ]);
}
