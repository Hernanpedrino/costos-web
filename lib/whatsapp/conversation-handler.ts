// lib/whatsapp/conversation-handler.ts
import { sendTextMessage, sendButtons, sendList, markAsRead } from "./client";
import { buscarArticulos, consultarPrecio, obtenerArticulo } from "./bejerman-lookup";
import { consultarStock } from "./bejerman-live";
import { obtenerSesion, actualizarSesion, reiniciarSesion, type Sesion } from "./session";
import { calcularFechaEntrega, INFO_RETIRO } from "./delivery-schedule";
import { buscarUltimoEnvio } from "./order-history";
import type { WhatsAppMessage, CarritoItem } from "./types";

type DatosEntrega =
  | { tipo: "RETIRO" }
  | { tipo: "TRANSPORTE" }
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

  // --- Respuesta a botón ---
  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    const idBoton = message.interactive.button_reply!.id;
    await manejarSeleccionBoton(telefono, idBoton, sesion);
    return;
  }

  // --- Respuesta a lista ---
  if (message.type === "interactive" && message.interactive?.type === "list_reply") {
    const idOpcion = message.interactive.list_reply!.id;
    await manejarSeleccionLista(telefono, idOpcion, sesion);
    return;
  }

  // Tipo no soportado todavía (imagen, audio, ubicación, etc.)
  await sendTextMessage(telefono, "Por ahora solo puedo procesar texto y las opciones de los menús 🙂");
}

// Si hay más coincidencias que las que entran en una lista de WhatsApp,
// mejor pedirle al usuario que afine la búsqueda en vez de mostrar una
// lista parcial y potencialmente no incluir lo que buscaba.
const MAX_RESULTADOS_LISTA = 8;

// Cuántas cantidades "rápidas" (1, 2, 3...) ofrecemos como filas de lista
// antes de pasar a "Más de N" (texto libre). WhatsApp limita a 10 filas
// TOTALES por lista, así que dejamos lugar para "Más de N" + "Buscar otro".
const MAX_CANTIDAD_RAPIDA = 8;

/** Devuelve el `datosEntrega` guardado en el contexto de la sesión, tipado. */
function obtenerDatosEntrega(sesion: Sesion): DatosEntrega | undefined {
  return sesion.contexto.datosEntrega as DatosEntrega | undefined;
}

async function manejarTextoLibre(telefono: string, texto: string, sesion: Sesion) {
  const textoNorm = texto.trim().toLowerCase();
  const saludo = /^(hola|buenas|hi|buen[oa]s? d[ií]as|buenas tardes)/i;

  // Salidas rápidas: saludo o "menu" interrumpen cualquier flujo en curso
  // (ej. si estaba esperando una cantidad y el usuario se arrepiente).
  // Esto sí resetea todo, incluido el tipo de entrega elegido — es un
  // reinicio explícito de la conversación.
  if (saludo.test(texto) || textoNorm === "menu" || textoNorm === "menú") {
    await actualizarSesion(telefono, { estadoActual: "MENU_PRINCIPAL", contexto: {} });
    await mostrarMenuPrincipal(telefono);
    return;
  }

  // --- Estábamos esperando que escriba una cantidad a mano ---
  if (sesion.estadoActual === "ESPERANDO_CANTIDAD") {
    await procesarCantidadEscrita(telefono, texto, sesion);
    return;
  }

  // --- Recolectando datos de reparto (nombre del local, persona, dirección) ---
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

  // A partir de acá, tratamos cualquier otro texto como una búsqueda de
  // artículo — es lo más común una vez que el usuario ya está armando pedido
  // o preguntando por algo puntual (ej. "harina 000", "tenés sal fina?").
  const { articulos, totalCoincidencias } = await buscarArticulos(texto, MAX_RESULTADOS_LISTA);

  if (totalCoincidencias === 0) {
    await sendTextMessage(
      telefono,
      `No encontré ningún artículo que coincida con "${texto}". Probá con otras palabras, o escribí "menu" para volver a las opciones.`
    );
    return;
  }

  if (totalCoincidencias === 1) {
    await mostrarDetalleArticulo(telefono, articulos[0].codigo, articulos[0].descripcion);
    return;
  }

  if (totalCoincidencias > MAX_RESULTADOS_LISTA) {
    await sendTextMessage(
      telefono,
      `Encontré ${totalCoincidencias} artículos que coinciden con "${texto}" — es demasiado para mostrarte. ¿Podés agregar algún detalle más (marca, presentación, tamaño)?`
    );
    return;
  }

  // Varios matches, pero pocos: mandamos una lista interactiva para que elija.
  await sendList(telefono, `Encontré varias coincidencias para "${texto}", elegí una:`, "Ver opciones", [
    {
      title: "Resultados",
      rows: articulos.map((r) => ({
        id: `ART_${r.codigo}`,
        title: r.codigo, // el código no se corta (límite de WhatsApp: 24 chars)
        description: r.descripcion.slice(0, 72), // acá sí entra la descripción completa (límite: 72 chars)
      })),
    },
  ]);
}

/**
 * Interpreta el número que el usuario escribió a mano (solo para cantidades
 * grandes, vía la opción "Más de N" — las cantidades chicas se eligen
 * directo de la lista, sin pasar por acá).
 */
async function procesarCantidadEscrita(telefono: string, texto: string, sesion: Sesion) {
  const cantidad = Number(texto.trim().replace(",", "."));

  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    await sendTextMessage(telefono, `"${texto}" no me parece una cantidad válida. Decime un número, ej: 12`);
    return; // seguimos en ESPERANDO_CANTIDAD, no hace falta tocar la sesión
  }

  const codigoPendiente = sesion.contexto.codigoPendiente as string | undefined;
  const descripcionPendiente = sesion.contexto.descripcionPendiente as string | undefined;

  if (!codigoPendiente) {
    await actualizarSesion(telefono, { estadoActual: "MENU_PRINCIPAL", contexto: {} });
    await sendTextMessage(telefono, "Se me perdió a qué artículo te referías, ¿podés escribirlo de nuevo?");
    return;
  }

  await agregarItemAlCarrito(telefono, sesion, codigoPendiente, descripcionPendiente ?? codigoPendiente, cantidad);
}

/**
 * Agrega un item al carrito de la sesión y confirma, ofreciendo
 * "Agregar otro" / "Finalizar pedido". Importante: preserva `datosEntrega`
 * en el contexto — ya se eligió al principio del flujo y tiene que
 * sobrevivir mientras se arma el resto del pedido.
 */
async function agregarItemAlCarrito(
  telefono: string,
  sesion: Sesion,
  codigo: string,
  descripcion: string,
  cantidad: number
) {
  const precio = (await consultarPrecio(codigo)) ?? 0;

  const nuevoItem: CarritoItem = {
    codigoArticulo: codigo,
    descripcion,
    cantidad,
    precioUnitario: precio,
  };

  const carritoActualizado = [...sesion.carritoActual, nuevoItem];

  await actualizarSesion(telefono, {
    estadoActual: "ARMANDO_PEDIDO",
    carritoActual: carritoActualizado,
    contexto: { datosEntrega: obtenerDatosEntrega(sesion) },
  });

  const totalCarrito = carritoActualizado.reduce((acc, it) => acc + it.cantidad * it.precioUnitario, 0);

  await sendButtons(
    telefono,
    `Agregado: ${cantidad} x ${nuevoItem.descripcion}\n\nLlevás ${carritoActualizado.length} artículo(s) — total: $${totalCarrito.toFixed(2)}`,
    [
      { id: "AGREGAR_OTRO", title: "Agregar otro" },
      { id: "FINALIZAR_PEDIDO", title: "Finalizar pedido" },
    ]
  );
}

/**
 * Muestra stock y precio de un artículo puntual, ya resuelto a un código
 * único, y deja elegir la cantidad ahí mismo (lista con 1..8 + "Más de 8"
 * + "Buscar otro"). Elegir una cantidad de la lista agrega directo al
 * carrito, sin pasar por un mensaje de texto aparte.
 */
async function mostrarDetalleArticulo(telefono: string, codigo: string, descripcion: string) {
  try {
    const [precio, stock] = await Promise.all([
      consultarPrecio(codigo),
      consultarStock(codigo),
    ]);

    const precioTexto = precio !== null ? `$${precio.toFixed(2)}` : "consultar";
    const stockTexto = stock.disponible > 0 ? `${stock.disponible} unidades disponibles` : "sin stock por el momento";

    const filasCantidad = Array.from({ length: MAX_CANTIDAD_RAPIDA }, (_, i) => {
      const n = i + 1;
      return { id: `CANT|${n}|${codigo}`, title: `${n} unidad${n > 1 ? "es" : ""}` };
    });

    await sendList(
      telefono,
      `*${descripcion}*\nCódigo: ${codigo}\nPrecio: ${precioTexto}\nStock: ${stockTexto}\n\n¿Cuántas unidades querés?`,
      "Elegir cantidad",
      [
        { title: "Cantidad", rows: filasCantidad },
        {
          title: "Otras opciones",
          rows: [
            { id: `MASCANT|${codigo}`, title: `Más de ${MAX_CANTIDAD_RAPIDA}`, description: "Escribir la cantidad exacta" },
            { id: "BUSCAR_OTRO", title: "Buscar otro artículo" },
          ],
        },
      ]
    );
  } catch (err) {
    console.error(`Error consultando detalle de ${codigo}:`, err);
    await sendTextMessage(
      telefono,
      "Tuve un problema consultando ese artículo en el sistema. Probá de nuevo en un momento."
    );
  }
}

/** Reinicia el flujo de búsqueda, preservando el tipo de entrega ya elegido. */
async function iniciarBusquedaOtro(telefono: string, sesion: Sesion) {
  await actualizarSesion(telefono, {
    estadoActual: "ARMANDO_PEDIDO",
    contexto: { datosEntrega: obtenerDatosEntrega(sesion) },
  });
  await sendTextMessage(telefono, "Decime qué otro artículo necesitás.");
}

async function manejarSeleccionBoton(telefono: string, idBoton: string, sesion: Sesion) {
  if (idBoton === "BUSCAR_OTRO" || idBoton === "AGREGAR_OTRO") {
    await iniciarBusquedaOtro(telefono, sesion);
    return;
  }

  if (idBoton === "FINALIZAR_PEDIDO") {
    await mostrarResumenPedido(telefono, sesion);
    return;
  }

  // --- Elección del tipo de entrega (primer paso al hacer un pedido) ---
  if (idBoton === "REPARTO") {
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

  if (idBoton === "TRANSPORTE") {
    await actualizarSesion(telefono, {
      estadoActual: "ARMANDO_PEDIDO",
      contexto: { datosEntrega: { tipo: "TRANSPORTE" } },
    });
    await sendTextMessage(
      telefono,
      "Para envíos por transporte coordinamos los detalles (empresa, costo, tiempos) directo con vos. Decime igual qué artículos necesitás, así lo dejamos anotado como referencia."
    );
    return;
  }

  if (idBoton === "RETIRO") {
    await actualizarSesion(telefono, {
      estadoActual: "ARMANDO_PEDIDO",
      contexto: { datosEntrega: { tipo: "RETIRO" } },
    });
    await sendTextMessage(telefono, "Buenísimo, ¿qué artículo necesitás? (escribilo como lo conocés, ej: \"harina 000\")");
    return;
  }

  if (idBoton === "REPETIR_SI") {
    await actualizarSesion(telefono, { estadoActual: "ARMANDO_PEDIDO" }); // datosEntrega ya quedó cargado del historial
    await sendTextMessage(telefono, "Buenísimo, ¿qué artículo necesitás?");
    return;
  }

  if (idBoton === "REPETIR_NO") {
    await actualizarSesion(telefono, {
      estadoActual: "ESPERANDO_NOMBRE_LOCAL",
      contexto: { datosEntrega: { tipo: "REPARTO" } }, // descartamos los datos del historial
    });
    await sendTextMessage(telefono, "¿Cuál es el nombre del local/comercio al que hacemos la entrega?");
    return;
  }

  if (idBoton === "CONFIRMAR_PEDIDO") {
    await confirmarPedido(telefono, sesion);
    return;
  }

  if (idBoton === "CANCELAR_PEDIDO") {
    await reiniciarSesion(telefono);
    await sendTextMessage(telefono, "Pedido cancelado. Cuando quieras, escribí \"menu\" para empezar de nuevo.");
    return;
  }

  switch (idBoton) {
    case "HACER_PEDIDO":
      await actualizarSesion(telefono, { estadoActual: "ESPERANDO_TIPO_ENTREGA" });
      await sendButtons(telefono, "¿Cómo querés recibir tu pedido?", [
        { id: "REPARTO", title: "Envío por reparto" },
        { id: "TRANSPORTE", title: "Envío por transporte" },
        { id: "RETIRO", title: "Retiro en el local" },
      ]);
      break;
    case "VER_CATALOGO":
      await sendTextMessage(telefono, "Te muestro el catálogo... (pendiente: menú por categorías)");
      break;
    case "CONSULTAR_PEDIDO":
      await sendTextMessage(telefono, "Decime tu número de pedido o cliente para consultarlo.");
      break;
    default:
      await mostrarMenuPrincipal(telefono);
  }
}

async function procesarNombreLocal(telefono: string, texto: string, sesion: Sesion) {
  const datosEntrega = { ...(obtenerDatosEntrega(sesion) as object), nombreLocal: texto.trim() };
  await actualizarSesion(telefono, { estadoActual: "ESPERANDO_NOMBRE_PERSONA", contexto: { datosEntrega } });
  await sendTextMessage(telefono, "¿A nombre de quién recibimos el pedido?");
}

async function procesarNombrePersona(telefono: string, texto: string, sesion: Sesion) {
  const datosEntrega = { ...(obtenerDatosEntrega(sesion) as object), nombrePersona: texto.trim() };
  await actualizarSesion(telefono, { estadoActual: "ESPERANDO_DIRECCION", contexto: { datosEntrega } });
  await sendTextMessage(telefono, "¿Cuál es la dirección de entrega?");
}

async function procesarDireccion(telefono: string, texto: string, sesion: Sesion) {
  const datosEntrega = { ...(obtenerDatosEntrega(sesion) as object), direccion: texto.trim() };
  await actualizarSesion(telefono, { estadoActual: "ARMANDO_PEDIDO", contexto: { datosEntrega } });
  await sendTextMessage(telefono, "Buenísimo, ¿qué artículo necesitás? (escribilo como lo conocés, ej: \"harina 000\")");
}

/**
 * Muestra el resumen del carrito antes de confirmar, con el detalle de
 * entrega según el tipo ya elegido al principio del flujo.
 */
async function mostrarResumenPedido(telefono: string, sesion: Sesion) {
  if (sesion.carritoActual.length === 0) {
    await sendTextMessage(telefono, "Todavía no agregaste ningún artículo al pedido.");
    return;
  }

  const lineas = sesion.carritoActual
    .map((it) => `• ${it.cantidad} x ${it.descripcion} — $${(it.cantidad * it.precioUnitario).toFixed(2)}`)
    .join("\n");
  const total = sesion.carritoActual.reduce((acc, it) => acc + it.cantidad * it.precioUnitario, 0);

  const datosEntrega = obtenerDatosEntrega(sesion);

  let bloqueEntrega = "";
  if (datosEntrega?.tipo === "RETIRO") {
    bloqueEntrega = "\n\nRetiro en el local.";
  } else if (datosEntrega?.tipo === "TRANSPORTE") {
    bloqueEntrega = "\n\nEnvío por transporte (a coordinar con nuestro equipo).";
  } else if (datosEntrega?.tipo === "REPARTO") {
    const { etiqueta } = calcularFechaEntrega();
    bloqueEntrega =
      `\n\nEnvío a: ${datosEntrega.nombreLocal ?? "-"}\n` +
      `Att: ${datosEntrega.nombrePersona ?? "-"}\n` +
      `Dirección: ${datosEntrega.direccion ?? "-"}\n` +
      `Reparto estimado: ${etiqueta}`;
  }

  await actualizarSesion(telefono, { estadoActual: "ESPERANDO_CONFIRMACION" });

  await sendButtons(telefono, `Resumen de tu pedido:\n\n${lineas}\n\nTotal: $${total.toFixed(2)}${bloqueEntrega}`, [
    { id: "CONFIRMAR_PEDIDO", title: "Confirmar" },
    { id: "CANCELAR_PEDIDO", title: "Cancelar" },
  ]);
}

/**
 * Mensaje final tras confirmar, adaptado al tipo de entrega.
 * TODO: todavía no crea la nota de pedido real en Bejerman (SegCabV/SegDetV)
 * — eso es el próximo paso grande pendiente.
 */
async function confirmarPedido(telefono: string, sesion: Sesion) {
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

async function manejarSeleccionLista(telefono: string, idOpcion: string, sesion: Sesion) {
  if (idOpcion === "BUSCAR_OTRO") {
    await iniciarBusquedaOtro(telefono, sesion);
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

  // "Más de N": pasamos a pedir la cantidad exacta por texto.
  if (idOpcion.startsWith("MASCANT|")) {
    const codigo = idOpcion.replace("MASCANT|", "");
    const articulo = await obtenerArticulo(codigo);
    await actualizarSesion(telefono, {
      estadoActual: "ESPERANDO_CANTIDAD",
      contexto: {
        datosEntrega: obtenerDatosEntrega(sesion),
        codigoPendiente: codigo,
        descripcionPendiente: articulo?.descripcion ?? codigo,
      },
    });
    await sendTextMessage(telefono, `Decime la cantidad exacta de ${articulo?.descripcion ?? codigo} que querés.`);
    return;
  }

  // Selección de un resultado de búsqueda por texto: "ART_<codigo>"
  if (idOpcion.startsWith("ART_")) {
    const codigo = idOpcion.replace("ART_", "");
    const articulo = await obtenerArticulo(codigo);
    await mostrarDetalleArticulo(telefono, codigo, articulo?.descripcion ?? codigo);
    return;
  }

  await sendTextMessage(telefono, `Opción no reconocida: ${idOpcion}`);
}

async function mostrarMenuPrincipal(telefono: string) {
  await sendButtons(telefono, "¡Hola! ¿En qué te puedo ayudar hoy?", [
    { id: "HACER_PEDIDO", title: "Hacer pedido" },
    { id: "VER_CATALOGO", title: "Ver catálogo" },
    { id: "CONSULTAR_PEDIDO", title: "Consultar pedido" },
  ]);
}