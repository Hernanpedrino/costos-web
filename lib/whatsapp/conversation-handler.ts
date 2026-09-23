// lib/whatsapp/conversation-handler.ts
import { sendTextMessage, sendButtons, sendList, markAsRead } from "./client";
import {
  buscarArticulos,
  claveVariante,
  consultarPrecio,
  consultarPrecios,
  obtenerArticulo,
  obtenerPalabrasDistintivas,
  obtenerVariantes,
  type VarianteArticulo,
} from "./bejerman-lookup";
import { consultarStock, consultarStockVariantes } from "./bejerman-live";
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
  // Ítems de sesiones guardadas antes de las variantes: sin CodEle → sin variante.
  sesion.carritoActual = sesion.carritoActual.map(normalizarItem);

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

/** Completa los campos de variante que no traen los ítems de sesiones viejas. */
function normalizarItem(it: CarritoItem): CarritoItem {
  const viejo = it as Partial<CarritoItem>;
  return {
    ...it,
    codEle1: (viejo.codEle1 ?? "").trim(),
    codEle2: (viejo.codEle2 ?? "").trim(),
    codEle3: (viejo.codEle3 ?? "").trim(),
    descVariante: viejo.descVariante ?? "",
  };
}

/**
 * Clave de un ítem del carrito: "<codigo>~E1~E2~E3". El mismo artículo en
 * otra variante (ej. otra medida de hoja) es otra línea del pedido.
 */
function claveItem(it: Pick<CarritoItem, "codigoArticulo" | "codEle1" | "codEle2" | "codEle3">): string {
  return `${it.codigoArticulo}~${claveVariante(it.codEle1, it.codEle2, it.codEle3)}`;
}

/**
 * Clave recibida en un id (ITEM|, CAMBIAR|, QUITAR|). Los botones de mensajes
 * anteriores a las variantes traen solo el código: equivalen a "sin variante".
 */
function claveDesdeId(valor: string): string {
  return valor.includes("~") ? valor : `${valor}~~~`;
}

/** Descripción a mostrar: "Hoja de sierra… — 2.40" si tiene variante. */
function descripcionItem(it: Pick<CarritoItem, "descripcion" | "descVariante">): string {
  return it.descVariante ? `${it.descripcion} — ${it.descVariante}` : it.descripcion;
}

function lineasCarrito(carrito: CarritoItem[]): string {
  return carrito
    .map((it) => {
      const subtotal = it.precioUnitario ? formatoPrecio.format(it.cantidad * it.precioUnitario) : "precio a confirmar";
      return `• ${formatearCantidad(it.cantidad)} x ${descripcionItem(it)} — ${subtotal}`;
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

// Separadores entre palabras de un saludo: espacios, puntuación ("¡", "?",
// ","), símbolos y emojis (incluidos los modificadores y el ZWJ que arman
// emojis compuestos).
const SEP = String.raw`[\s\p{P}\p{S}\p{M}\p{Cf}]`;
// Un saludo es una palabra ENTERA: el lookahead exige separador o fin de
// texto, así "hi" no matchea "Hilo"/"historia" ni "hola" matchea "holanda".
const PARTE_SALUDO = new RegExp(
  String.raw`^${SEP}*(` +
    [
      String.raw`hola+s?`,
      String.raw`holis`,
      String.raw`hi`,
      String.raw`buen[oa]?s?\s+d[ií]as?`, // buen día, buenos días, buenas días
      String.raw`buenas\s+(?:tardes|noches)`,
      String.raw`buenas`,
    ].join("|") +
    String.raw`)(?=${SEP}|$)`,
  "iu"
);
// Cortesías que solo cuentan si vienen después de un saludo ("hola, ¿cómo
// estás?"). Solas no son saludo ("que tal la harina 000" es una búsqueda).
const PARTE_CORTESIA = new RegExp(
  String.raw`^${SEP}*(` +
    [
      String.raw`c[oó]mo\s+(?:est[aá]s|est[aá]n|and[aá]s|va|le\s+va|te\s+va)`,
      String.raw`qu[eé]\s+tal`,
      String.raw`todo\s+bien`,
      String.raw`gente|chic[oa]s|amig[oa]s?|che`,
    ].join("|") +
    String.raw`)(?=${SEP}|$)`,
  "iu"
);
const SOLO_SEPARADORES = new RegExp(String.raw`^${SEP}*$`, "u");
const ES_MENU = new RegExp(String.raw`^${SEP}*men[uú]${SEP}*$`, "iu");

/**
 * Separa un saludo del principio del mensaje.
 * - "hola", "Buen día!", "hola, cómo estás?", "hola buen día 👋" → saludo puro.
 * - "Hola, necesito harina 000" → no es puro; resto = "necesito harina 000".
 * - "Hola de sierra" (quiso decir "Hoja") → no es puro; resto = "de sierra".
 * - "Hilo", "historia" → no empieza con saludo; resto = texto tal cual.
 */
function separarSaludo(texto: string): { saludoPuro: boolean; resto: string } {
  let resto = texto.normalize("NFC");
  let huboSaludo = false;

  for (;;) {
    const m = PARTE_SALUDO.exec(resto) ?? (huboSaludo ? PARTE_CORTESIA.exec(resto) : null);
    if (!m) break;
    huboSaludo = true;
    resto = resto.slice(m[0].length);
  }

  if (!huboSaludo) return { saludoPuro: false, resto: texto };
  if (SOLO_SEPARADORES.test(resto)) return { saludoPuro: true, resto: "" };
  // Sacamos la puntuación que quedó entre el saludo y el resto (", necesito…").
  return { saludoPuro: false, resto: resto.replace(new RegExp(`^${SEP}+`, "u"), "").trim() };
}

async function manejarTextoLibre(telefono: string, texto: string, sesion: Sesion) {
  const { saludoPuro, resto } = separarSaludo(texto);

  // Salidas rápidas: un saludo solo (sin nada más) o "menu" interrumpen
  // cualquier flujo en curso (ej. si estaba esperando una cantidad y el
  // usuario se arrepiente). Si el saludo viene con texto ("Hola de sierra",
  // "hola, necesito harina"), NO se vuelve al menú: se sigue con el resto.
  if (saludoPuro || ES_MENU.test(texto)) {
    await irAlMenu(telefono, sesion);
    return;
  }

  // Pidió hablar con una persona: lo que escriba es para el equipo, el bot no
  // contesta. Se reenvía el mensaje original, con saludo incluido.
  if (sesion.estadoActual === "ATENCION_PERSONAL") {
    await avisarAtencion(sesion, `Escribió:\n\n${texto}`);
    return;
  }

  // De acá en adelante trabajamos sin el saludo inicial.
  texto = resto;

  // --- Acaba de ver un artículo (o eligió cambiar una cantidad) ---
  if (sesion.estadoActual === "ESPERANDO_CANTIDAD") {
    const cantidad = interpretarCantidad(texto);
    if (cantidad !== null) {
      await procesarCantidad(telefono, sesion, cantidad);
      return;
    }
    // No es un número: seguramente busca otro producto, sigue a la búsqueda.
  }

  // --- Eligiendo la variante (medida, talle, color) de un artículo ---
  if (sesion.estadoActual === "ESPERANDO_VARIANTE") {
    await procesarTextoVariante(telefono, texto, sesion);
    return;
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
  // Una búsqueda nueva descarta el artículo que estaba esperando cantidad o
  // variante: si no, un "3" escrito después se sumaba al artículo anterior.
  if (sesion.estadoActual === "ESPERANDO_CANTIDAD" || sesion.estadoActual === "ESPERANDO_VARIANTE") {
    await actualizarSesion(telefono, { estadoActual: "ARMANDO_PEDIDO", contexto: contextoBase(sesion) });
  }

  const { articulos, totalCoincidencias } = await buscarArticulos(texto, MAX_RESULTADOS_LISTA);

  if (totalCoincidencias === 0) {
    await sendTextMessage(
      telefono,
      `No encontré productos para "${texto}". Probá con menos palabras (ej: solo "pimienta"). ${AYUDA_MENU}`
    );
    return;
  }

  if (totalCoincidencias === 1) {
    const [articulo] = articulos;
    await mostrarDetalleArticulo(telefono, sesion, articulo.codigo, articulo.descripcion, articulo.tieneVariantes);
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
            // El id admite 200 caracteres: se recorta el texto del cliente
            id: `REFINAR|${p.palabra}|${texto.slice(0, 150)}`,
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
    // Sesiones de antes de las variantes no guardaban la clave del ítem.
    const clave = (sesion.contexto.claveItemPendiente as string | undefined) ?? claveDesdeId(codigoPendiente);
    await cambiarCantidadItem(telefono, sesion, clave, cantidad);
    return;
  }

  const variante = sesion.contexto.variantePendiente as VarianteElegida | undefined;
  await agregarItemAlCarrito(
    telefono,
    sesion,
    codigoPendiente,
    descripcionPendiente ?? codigoPendiente,
    cantidad,
    variante
  );
}

/**
 * Agrega un item al carrito de la sesión y confirma. Si el artículo (en la
 * misma variante) ya estaba, suma la cantidad en vez de duplicar la línea:
 * así cada línea se puede identificar por su clave al modificarla. Otra
 * variante del mismo artículo es otra línea.
 */
async function agregarItemAlCarrito(
  telefono: string,
  sesion: Sesion,
  codigo: string,
  descripcion: string,
  cantidad: number,
  variante?: VarianteElegida
) {
  const nuevo: CarritoItem = {
    codigoArticulo: codigo,
    descripcion,
    cantidad,
    precioUnitario: 0,
    codEle1: variante?.codEle1 ?? "",
    codEle2: variante?.codEle2 ?? "",
    codEle3: variante?.codEle3 ?? "",
    descVariante: variante?.descVariante ?? "",
  };
  const clave = claveItem(nuevo);
  const existente = sesion.carritoActual.find((it) => claveItem(it) === clave);

  let carritoActualizado: CarritoItem[];
  if (existente) {
    carritoActualizado = sesion.carritoActual.map((it) =>
      claveItem(it) === clave ? { ...it, cantidad: it.cantidad + cantidad } : it
    );
  } else {
    // La variante ya trae su precio (el suyo o, si no tiene, el del artículo).
    nuevo.precioUnitario = (variante ? variante.precio : await consultarPrecio(codigo)) ?? 0;
    carritoActualizado = [...sesion.carritoActual, nuevo];
  }

  await actualizarSesion(telefono, {
    estadoActual: "ARMANDO_PEDIDO",
    carritoActual: carritoActualizado,
    contexto: contextoBase(sesion),
  });

  const nombre = descripcionItem(nuevo);
  const linea = existente
    ? `Sumé ${formatearCantidad(cantidad)} más de ${nombre} — ahora llevás ${formatearCantidad(existente.cantidad + cantidad)}.`
    : `Agregado: ${formatearCantidad(cantidad)} x ${nombre}`;

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
 *
 * Si el artículo tiene variantes (medida, talle, color), antes hay que elegir
 * cuál: el stock y la nota de pedido van por variante. `tieneVariantes` viene
 * de la búsqueda; si no se sabe (ej. ART_), se consultan las variantes.
 */
async function mostrarDetalleArticulo(
  telefono: string,
  sesion: Sesion,
  codigo: string,
  descripcion: string,
  tieneVariantes?: boolean
) {
  try {
    const variantes = tieneVariantes === false ? [] : await obtenerVariantes(codigo);
    if (variantes.length > 0) {
      const datos = await cargarDatosVariantes(codigo, descripcion, variantes);
      await mostrarPasoVariante(telefono, sesion, datos);
      return;
    }
    await mostrarFicha(telefono, sesion, codigo, descripcion, null);
  } catch (err) {
    await avisarErrorConsulta(telefono, codigo, err);
  }
}

async function avisarErrorConsulta(telefono: string, codigo: string, err: unknown) {
  console.error(`Error consultando detalle de ${codigo}:`, err);
  await sendTextMessage(
    telefono,
    "Tuve un problema consultando ese producto en el sistema. Probá de nuevo en un momento."
  );
}

/**
 * Ficha con precio, stock y la lista de cantidades de un artículo sin
 * variantes (`variante` null) o de una variante puntual. Deja la sesión en
 * ESPERANDO_CANTIDAD con el artículo (y la variante) pendientes.
 */
async function mostrarFicha(
  telefono: string,
  sesion: Sesion,
  codigo: string,
  descripcion: string,
  variante: VarianteElegida | null
) {
  // Sin variante, consultarStock va a la fila sin elementos (CodEle vacíos).
  const [precio, stock] = await Promise.all([
    variante ? Promise.resolve(variante.precio) : consultarPrecio(codigo),
    consultarStock(codigo, variante ?? undefined),
  ]);

  // No mostramos la cantidad exacta: al cliente le alcanza con saber si hay.
  const stockTexto = stock.disponible > 0 ? "✅ Hay stock" : "⚠️ Sin stock por el momento";

  // Los ids llevan la variante para que un toque en un mensaje viejo agregue
  // lo que el cliente vio, aunque después haya mirado otra cosa.
  const sufijo = variante ? `|${variante.codEle1}|${variante.codEle2}|${variante.codEle3}` : "";

  const filasCantidad = Array.from({ length: MAX_CANTIDAD_RAPIDA }, (_, i) => ({
    id: `CANT|${i + 1}|${codigo}${sufijo}`,
    title: String(i + 1),
  }));

  const otrasOpciones: { id: string; title: string; description?: string }[] = [
    { id: `MASCANT|${codigo}${sufijo}`, title: "Otra cantidad", description: "Escribir la cantidad exacta" },
  ];
  if (variante) {
    // ART_ vuelve a la elección de variante del mismo artículo.
    otrasOpciones.push({ id: `ART_${codigo}`, title: `Elegir ${esTalle(variante) ? "otro talle" : "otra medida"}` });
  }
  otrasOpciones.push({ id: "BUSCAR_OTRO", title: "Buscar otro producto" });
  if (sesion.carritoActual.length > 0) {
    otrasOpciones.push({ id: "VER_CARRITO", title: "Ver mi pedido" });
  }

  await actualizarSesion(telefono, {
    estadoActual: "ESPERANDO_CANTIDAD",
    contexto: {
      ...contextoBase(sesion),
      codigoPendiente: codigo,
      descripcionPendiente: descripcion,
      ...(variante && { variantePendiente: variante }),
    },
  });

  const titulo = variante ? `${descripcion} — ${variante.descVariante}` : descripcion;
  await sendList(
    telefono,
    `*${titulo}*\nPrecio: ${formatearPrecio(precio)}\n${stockTexto}\nCódigo: ${codigo}\n\n` +
      `¿Cuánto querés? Escribí la cantidad (ej: 12) o tocá "Elegir cantidad".`,
    "Elegir cantidad",
    [
      { title: "Cantidad", rows: filasCantidad },
      { title: "Otras opciones", rows: otrasOpciones },
    ]
  );
}

// ---- Variantes (medida, talle, color) ----
//
// En Bejerman algunos artículos se venden por variante: una fila por
// CodGen+CodEle1+CodEle2+CodEle3 (HOJ/DIS/VAI: CodEle1 = medida; ROP:
// CodEle1 = talle y CodEle2 = color). Con un solo eje se elige la variante
// de una lista; con dos, primero el talle (VE1|) y después el color (VAR|).
// Ids: VAR|<codigo>|<e1>|<e2>|<e3>, VE1|<codigo>|<e1>, VARTXT|<codigo>[|<e1>].

/** Variante elegida, tal como se guarda en el contexto y llega al carrito. */
interface VarianteElegida {
  codEle1: string;
  codEle2: string;
  codEle3: string;
  descVariante: string;
  /** Precio FIN de la variante o, si no tiene, el del artículo. null = a confirmar. */
  precio: number | null;
}

/** Todo lo necesario para mostrar y matchear las variantes de un artículo. */
interface DatosVariantes {
  codigo: string;
  descripcion: string;
  variantes: VarianteArticulo[];
  /** Stock por claveVariante (una sola consulta a Bejerman). */
  stock: Map<string, number>;
  precioArticulo: number | null;
  /** true si hay un segundo eje (CodEle2, ej. color en ROP). */
  dosEjes: boolean;
}

/** Valores distintos del primer eje (ej. talles) cuando hay dos ejes. */
interface GrupoEje1 {
  codEle1: string;
  desc1: string;
  variantes: VarianteArticulo[];
  hayStock: boolean;
}

interface NombreEje {
  singular: string;
  plural: string;
  femenino: boolean;
}

const EJE_MEDIDA: NombreEje = { singular: "medida", plural: "medidas", femenino: true };
const EJE_TALLE: NombreEje = { singular: "talle", plural: "talles", femenino: false };
const EJE_COLOR: NombreEje = { singular: "color", plural: "colores", femenino: false };
const EJE_OPCION: NombreEje = { singular: "opción", plural: "opciones", femenino: true };

// Máximo de filas de una lista de WhatsApp (entre todas las secciones).
const MAX_FILAS_LISTA = 10;

const esTalle = (v: { codEle2: string; desc1?: string }) => v.codEle2 !== "" || /^talle\b/i.test(v.desc1 ?? "");

function nombreEje1(datos: DatosVariantes): NombreEje {
  return datos.variantes.some(esTalle) ? EJE_TALLE : EJE_MEDIDA;
}

const laDel = (eje: NombreEje) => `${eje.femenino ? "la" : "el"} ${eje.singular}`;

function claveDe(v: Pick<VarianteArticulo, "codEle1" | "codEle2" | "codEle3">): string {
  return claveVariante(v.codEle1, v.codEle2, v.codEle3);
}

/** "2.40", "TALLE 46 / BLANCO": las descripciones (o el código si falta) de cada eje. */
function textoVariante(v: VarianteArticulo, desdeEje = 1): string {
  const partes: [string, string][] = [
    [v.desc1, v.codEle1],
    [v.desc2, v.codEle2],
    [v.desc3, v.codEle3],
  ];
  return partes
    .slice(desdeEje - 1)
    .map(([desc, cod]) => desc || cod)
    .filter(Boolean)
    .join(" / ");
}

function aVarianteElegida(v: VarianteArticulo, precioArticulo: number | null): VarianteElegida {
  return {
    codEle1: v.codEle1,
    codEle2: v.codEle2,
    codEle3: v.codEle3,
    descVariante: textoVariante(v),
    precio: v.precioFin ?? precioArticulo,
  };
}

async function cargarDatosVariantes(
  codigo: string,
  descripcion: string,
  variantesYaLeidas?: VarianteArticulo[]
): Promise<DatosVariantes> {
  const [variantes, stock, precioArticulo] = await Promise.all([
    variantesYaLeidas ?? obtenerVariantes(codigo),
    consultarStockVariantes(codigo),
    consultarPrecio(codigo),
  ]);
  return {
    codigo,
    descripcion,
    variantes,
    stock,
    precioArticulo,
    dosEjes: variantes.some((v) => v.codEle2 !== ""),
  };
}

const hayStockDe = (datos: DatosVariantes, v: VarianteArticulo) => (datos.stock.get(claveDe(v)) ?? 0) > 0;

/** Orden estable con las que tienen stock primero. */
function conStockPrimero<T>(items: T[], tieneStock: (x: T) => boolean): T[] {
  return [...items.filter(tieneStock), ...items.filter((x) => !tieneStock(x))];
}

function agruparEje1(datos: DatosVariantes): GrupoEje1[] {
  const grupos = new Map<string, GrupoEje1>();
  for (const v of datos.variantes) {
    let g = grupos.get(v.codEle1);
    if (!g) {
      g = { codEle1: v.codEle1, desc1: v.desc1 || v.codEle1, variantes: [], hayStock: false };
      grupos.set(v.codEle1, g);
    }
    g.variantes.push(v);
    if (hayStockDe(datos, v)) g.hayStock = true;
  }
  return [...grupos.values()];
}

/** "$ 1.234,00" o "desde $ 1.234,00" si las variantes del grupo tienen precios distintos. */
function textoPrecioGrupo(datos: DatosVariantes, variantes: VarianteArticulo[]): string {
  const precios = variantes.map((v) => v.precioFin ?? datos.precioArticulo).filter((p): p is number => !!p);
  if (precios.length === 0) return formatearPrecio(null);
  const minimo = Math.min(...precios);
  return (precios.some((p) => p !== minimo) ? "desde " : "") + formatearPrecio(minimo);
}

/** Ejemplo para "escribí la medida, por ejemplo 2.40" ("TALLE 52" → "52"). */
function ejemploEje(texto: string): string {
  return texto.replace(/^talle\s+/i, "");
}

/** Cuerpo de las listas de variantes: cuántas hay y, si no entran todas, que la escriba. */
function cuerpoListaVariantes(
  encabezado: string,
  eje: NombreEje,
  total: number,
  mostradas: number,
  ejemplo: string | undefined
): string {
  const { singular, plural, femenino } = eje;
  let cuerpo = `${encabezado}\n\nElegí ${laDel(eje)} (hay ${total} ${total === 1 ? singular : plural}).`;
  if (total > mostradas) {
    cuerpo +=
      ` Te muestro ${mostradas}, primero ${femenino ? "las" : "los"} que hay en stock. ` +
      `Si no está ${femenino ? "la" : "el"} que buscás, escribil${femenino ? "a" : "o"}` +
      (ejemplo ? `, por ejemplo ${ejemplo}.` : ".");
  } else {
    cuerpo += ` Tocá "Elegir ${singular}" o escribil${femenino ? "a" : "o"}.`;
  }
  return truncar(cuerpo, LARGO_CUERPO_INTERACTIVO);
}

/** Deja la sesión esperando la variante del artículo (y el primer eje, si ya se eligió). */
async function guardarEsperandoVariante(telefono: string, sesion: Sesion, datos: DatosVariantes, ele1?: string) {
  await actualizarSesion(telefono, {
    estadoActual: "ESPERANDO_VARIANTE",
    contexto: {
      ...contextoBase(sesion),
      codigoPendiente: datos.codigo,
      descripcionPendiente: datos.descripcion,
      ...(ele1 !== undefined && { ele1Pendiente: ele1 }),
    },
  });
}

/**
 * Paso actual de la elección de variante con la lista completa: con un eje,
 * todas las variantes; con dos, los talles (o los colores del talle elegido).
 * `aviso` va antes (ej. "No encontré la medida…").
 */
async function mostrarPasoVariante(
  telefono: string,
  sesion: Sesion,
  datos: DatosVariantes,
  ele1?: string,
  aviso?: string
) {
  const encabezado = (aviso ? `${aviso}\n\n` : "") + `*${datos.descripcion}*`;
  if (!datos.dosEjes) {
    await enviarListaVariantes(telefono, sesion, datos, datos.variantes, encabezado);
    return;
  }
  const grupo = ele1 !== undefined ? agruparEje1(datos).find((g) => g.codEle1 === ele1) : undefined;
  if (grupo) {
    await enviarListaVariantes(telefono, sesion, datos, grupo.variantes, `${encabezado} — ${grupo.desc1}`, grupo.codEle1);
    return;
  }
  await enviarListaEje1(telefono, sesion, datos, agruparEje1(datos), encabezado);
}

/**
 * Lista de variantes completas (VAR|). Con `ele1` se está eligiendo el
 * segundo eje (color) de ese talle; sin `ele1`, las filas muestran la
 * variante entera.
 */
async function enviarListaVariantes(
  telefono: string,
  sesion: Sesion,
  datos: DatosVariantes,
  variantes: VarianteArticulo[],
  encabezado: string,
  ele1?: string
) {
  // Con dos ejes y sin talle elegido, las filas son talle y color juntos
  // (ej. escribió "azul"): se habla de "opciones", pero se escribe el talle.
  const combinada = ele1 === undefined && datos.dosEjes;
  const ejeEscribir = ele1 !== undefined ? EJE_COLOR : nombreEje1(datos);
  const eje = combinada ? EJE_OPCION : ejeEscribir;

  const extras: { id: string; title: string; description?: string }[] = [
    {
      id: ele1 !== undefined ? `VARTXT|${datos.codigo}|${ele1}` : `VARTXT|${datos.codigo}`,
      title: `Escribir ${laDel(ejeEscribir)}`,
    },
  ];
  if (ele1 !== undefined) extras.push({ id: `ART_${datos.codigo}`, title: "Elegir otro talle" });
  extras.push({ id: "BUSCAR_OTRO", title: "Buscar otro producto" });

  const ordenadas = conStockPrimero(variantes, (v) => hayStockDe(datos, v));
  const visibles = ordenadas.slice(0, MAX_FILAS_LISTA - extras.length);
  // "Ver mi pedido" solo si queda lugar después de las variantes.
  if (sesion.carritoActual.length > 0 && visibles.length + extras.length < MAX_FILAS_LISTA) {
    extras.push({ id: "VER_CARRITO", title: "Ver mi pedido" });
  }
  const ocultas = ordenadas.slice(visibles.length);

  const filas = visibles.map((v) => {
    const etiqueta = textoVariante(v, ele1 !== undefined ? 2 : 1);
    const detalle = [
      etiqueta.length > LARGO_TITULO_FILA ? etiqueta : null,
      formatearPrecio(v.precioFin ?? datos.precioArticulo),
      hayStockDe(datos, v) ? "Hay stock" : "Sin stock",
    ].filter(Boolean);
    return {
      id: `VAR|${datos.codigo}|${v.codEle1}|${v.codEle2}|${v.codEle3}`,
      title: truncar(etiqueta, LARGO_TITULO_FILA),
      description: truncar(detalle.join(" · "), LARGO_DESCRIPCION_FILA),
    };
  });

  await guardarEsperandoVariante(telefono, sesion, datos, ele1);
  const ejemplo = ocultas[0] ?? visibles[0];
  await sendList(
    telefono,
    cuerpoListaVariantes(
      encabezado,
      eje,
      variantes.length,
      visibles.length,
      ejemplo ? ejemploEje(textoVariante(ejemplo, ele1 !== undefined ? 2 : 1)).replace(" / ", " ") : undefined
    ),
    `Elegir ${eje.singular}`,
    [
      { title: truncar(eje.plural[0].toUpperCase() + eje.plural.slice(1), LARGO_TITULO_FILA), rows: filas },
      { title: "Otras opciones", rows: extras },
    ]
  );
}

/** Lista del primer eje (talles) cuando el artículo tiene dos: VE1|<codigo>|<e1>. */
async function enviarListaEje1(
  telefono: string,
  sesion: Sesion,
  datos: DatosVariantes,
  grupos: GrupoEje1[],
  encabezado: string
) {
  const eje = nombreEje1(datos);
  const extras = [
    { id: `VARTXT|${datos.codigo}`, title: `Escribir ${laDel(eje)}` },
    { id: "BUSCAR_OTRO", title: "Buscar otro producto" },
  ];
  const ordenados = conStockPrimero(grupos, (g) => g.hayStock);
  const visibles = ordenados.slice(0, MAX_FILAS_LISTA - extras.length);
  const ocultos = ordenados.slice(visibles.length);

  const filas = visibles.map((g) => {
    const colores = g.variantes.length > 1 ? `${g.variantes.length} ${EJE_COLOR.plural}` : textoVariante(g.variantes[0], 2);
    const detalle = [colores, textoPrecioGrupo(datos, g.variantes), g.hayStock ? "Hay stock" : "Sin stock"].filter(Boolean);
    return {
      id: `VE1|${datos.codigo}|${g.codEle1}`,
      title: truncar(g.desc1, LARGO_TITULO_FILA),
      description: truncar(detalle.join(" · "), LARGO_DESCRIPCION_FILA),
    };
  });

  await guardarEsperandoVariante(telefono, sesion, datos);
  const ejemplo = ocultos[0] ?? visibles[0];
  await sendList(
    telefono,
    cuerpoListaVariantes(encabezado, eje, grupos.length, visibles.length, ejemplo ? ejemploEje(ejemplo.desc1) : undefined),
    `Elegir ${eje.singular}`,
    [
      { title: truncar(eje.plural[0].toUpperCase() + eje.plural.slice(1), LARGO_TITULO_FILA), rows: filas },
      { title: "Otras opciones", rows: extras },
    ]
  );
}

/** Elegido el talle: si tiene un solo color va directo a la ficha; si no, lista de colores. */
async function elegirEje1(telefono: string, sesion: Sesion, datos: DatosVariantes, grupo: GrupoEje1) {
  if (grupo.variantes.length === 1) {
    await mostrarFicha(telefono, sesion, datos.codigo, datos.descripcion, aVarianteElegida(grupo.variantes[0], datos.precioArticulo));
    return;
  }
  await enviarListaVariantes(
    telefono,
    sesion,
    datos,
    grupo.variantes,
    `*${datos.descripcion} — ${grupo.desc1}*`,
    grupo.codEle1
  );
}

// ---- Matching de lo que escribe el cliente contra las variantes ----

const sinAcentosMayus = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** "2.40" → "2.40", "N 8" → "N8": mayúsculas, sin acentos ni espacios. */
const compacto = (t: string) => sinAcentosMayus(t).replace(/\s+/g, "");

/** Además sin puntuación: "2,40" → "240", 'N-8"' → "N8", "talle 46" → "TALLE46". */
const soloAlfanumerico = (t: string) => sinAcentosMayus(t).replace(/[^A-Z0-9]/g, "");

/** Números de un texto ("N-6.5\"" → [6.5], "12,5 CM" → [12.5]). */
const numerosDe = (t: string) => (t.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", ".")));

/**
 * Palabras de un texto sin puntos/comas internos y sin ceros a la izquierda:
 * 'N-8"' → ["N","8"], "TALLE 046" → ["TALLE","46"], "2.40" → ["240"].
 */
const palabrasDe = (t: string) =>
  sinAcentosMayus(t)
    .replace(/[.,]/g, "")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p));

interface Etiquetas {
  /** Descripciones de los ejes que se están eligiendo (desc1, o desc2 para el color). */
  descs: string[];
  /** Códigos (CodEle) de esos ejes. */
  cods: string[];
}

/**
 * Qué opciones coinciden con lo que escribió el cliente, de la comparación
 * más estricta a la más laxa (se usa el primer nivel que encuentre algo):
 * 1. igual sin espacios ("2.40", "n-8\"")
 * 2. igual sin puntuación ("240", "2,40", "n-8", "N 8", "talle 46")
 * 3. mismo número ("2.4" = "2.40", "8" = 'N-8"', "46" = "TALLE 46")
 * 4. todas sus palabras están en la opción ("ovalado", "blanco", "46 blanco")
 * 5. todas sus palabras son el comienzo de alguna de la opción ("verd" → VERDE)
 *
 * `soloPalabras` usa solo los niveles 4 y 5: para talle y color juntos, donde
 * el número solo ("46") matchearía todos los colores de ese talle.
 */
function matchearOpciones<T>(
  texto: string,
  opciones: T[],
  etiquetas: (o: T) => Etiquetas,
  soloPalabras = false
): T[] {
  const buscado = compacto(texto);
  const buscadoAlfa = soloAlfanumerico(texto);
  const numeros = numerosDe(texto);
  const palabras = palabrasDe(texto);
  if (!buscadoAlfa) return [];

  const niveles: ((e: Etiquetas) => boolean)[] = [
    (e) => [...e.descs, ...e.cods].some((x) => x && compacto(x) === buscado),
    (e) => [...e.descs, ...e.cods].some((x) => x && soloAlfanumerico(x) === buscadoAlfa),
    // Solo si lo escrito es un número (con prefijo/unidad a lo sumo: "n 8", "10 cm").
    (e) =>
      numeros.length === 1 &&
      palabras.length <= 2 &&
      e.descs.some((x) => numerosDe(x).some((n) => n === numeros[0])),
    (e) => {
      const disponibles = new Set(e.descs.flatMap(palabrasDe));
      return palabras.every((p) => disponibles.has(p));
    },
    // Prefijos solo de 3+ letras, para no matchear cualquier cosa con "a".
    (e) => {
      const disponibles = e.descs.flatMap(palabrasDe);
      return palabras.every((p) => /^[A-Z]{3,}$/.test(p) && disponibles.some((d) => d.startsWith(p)));
    },
  ];

  for (const nivel of soloPalabras ? niveles.slice(3) : niveles) {
    const encontradas = opciones.filter((o) => nivel(etiquetas(o)));
    if (encontradas.length > 0) return encontradas;
  }
  return [];
}

/** ¿Lo escrito parece una medida/talle ("2.40", "n-8", "46", "xl") y no el nombre de otro producto? */
function pareceMedida(texto: string): boolean {
  return /\d/.test(texto) || soloAlfanumerico(texto).length <= 3;
}

/**
 * Texto escrito mientras se elige la variante: se busca entre las medidas
 * (o talles/colores) del artículo pendiente. Si no coincide con ninguna y no
 * parece una medida, puede ser otro producto: se busca como producto nuevo.
 */
async function procesarTextoVariante(telefono: string, texto: string, sesion: Sesion) {
  const codigo = sesion.contexto.codigoPendiente as string | undefined;
  const descripcion = (sesion.contexto.descripcionPendiente as string | undefined) ?? codigo;
  const ele1 = sesion.contexto.ele1Pendiente as string | undefined;

  if (!codigo || !descripcion) {
    await actualizarSesion(telefono, { estadoActual: "ARMANDO_PEDIDO", contexto: contextoBase(sesion) });
    await sendTextMessage(telefono, "Se me perdió a qué producto te referías, ¿podés escribirlo de nuevo?");
    return;
  }

  try {
    const datos = await cargarDatosVariantes(codigo, descripcion);
    if (datos.variantes.length === 0) {
      // Ya no tiene variantes (cambió en Bejerman): ficha normal.
      await mostrarFicha(telefono, sesion, codigo, descripcion, null);
      return;
    }

    const elegir = (v: VarianteArticulo) =>
      mostrarFicha(telefono, sesion, codigo, descripcion, aVarianteElegida(v, datos.precioArticulo));
    const encabezado = (n: number, eje: NombreEje) => `Encontré ${n} ${eje.plural} para "${texto}" en *${descripcion}*.`;

    if (!datos.dosEjes) {
      const encontradas = matchearOpciones(texto, datos.variantes, (v) => ({
        descs: [v.desc1, v.desc2, v.desc3],
        cods: [v.codEle1, v.codEle2, v.codEle3],
      }));
      if (encontradas.length === 1) return await elegir(encontradas[0]);
      if (encontradas.length > 1) {
        return await enviarListaVariantes(telefono, sesion, datos, encontradas, encabezado(encontradas.length, nombreEje1(datos)));
      }
    } else if (ele1 === undefined) {
      // Talle y color juntos ("46 blanco"): si identifica una sola variante, directo a la ficha.
      const completas = matchearOpciones(texto, datos.variantes, (v) => ({ descs: [textoVariante(v)], cods: [] }), true);
      if (completas.length === 1) return await elegir(completas[0]);

      const grupos = agruparEje1(datos);
      const encontrados = matchearOpciones(texto, grupos, (g) => ({ descs: [g.desc1], cods: [g.codEle1] }));
      if (encontrados.length === 1) return await elegirEje1(telefono, sesion, datos, encontrados[0]);
      if (encontrados.length > 1) {
        return await enviarListaEje1(telefono, sesion, datos, encontrados, encabezado(encontrados.length, nombreEje1(datos)));
      }
      // Solo el color ("blanco"): todas las variantes de ese color.
      if (completas.length > 1) {
        return await enviarListaVariantes(
          telefono,
          sesion,
          datos,
          completas,
          `Encontré ${completas.length} opciones para "${texto}" en *${descripcion}*.`
        );
      }
    } else {
      const delTalle = datos.variantes.filter((v) => v.codEle1 === ele1);
      let encontradas = matchearOpciones(texto, delTalle, (v) => ({
        descs: [v.desc2, v.desc3],
        cods: [v.codEle2, v.codEle3],
      }));
      // Repitió el talle con el color ("46 blanco").
      if (encontradas.length === 0) {
        encontradas = matchearOpciones(texto, delTalle, (v) => ({ descs: [textoVariante(v)], cods: [] }), true);
      }
      if (encontradas.length === 1) return await elegir(encontradas[0]);
      if (encontradas.length > 1) {
        return await enviarListaVariantes(telefono, sesion, datos, encontradas, encabezado(encontradas.length, EJE_COLOR), ele1);
      }
    }

    // Nada coincide. Si no parece una medida y es un producto, es una búsqueda nueva.
    if (!pareceMedida(texto)) {
      const { totalCoincidencias } = await buscarArticulos(texto, 1);
      if (totalCoincidencias > 0) {
        const contexto = contextoBase(sesion);
        await actualizarSesion(telefono, { estadoActual: "ARMANDO_PEDIDO", contexto });
        await realizarBusquedaArticulo(telefono, { ...sesion, estadoActual: "ARMANDO_PEDIDO", contexto }, texto);
        return;
      }
    }

    const eje = datos.dosEjes && ele1 !== undefined ? EJE_COLOR : nombreEje1(datos);
    await mostrarPasoVariante(telefono, sesion, datos, ele1, `No encontré ${laDel(eje)} "${texto}".`);
  } catch (err) {
    await avisarErrorConsulta(telefono, codigo, err);
  }
}

/** Busca una variante puntual del artículo (ej. la de un id VAR|/CANT|). null si ya no existe. */
async function resolverVariante(codigo: string, e1: string, e2: string, e3: string): Promise<VarianteElegida | null> {
  const clave = claveVariante(e1, e2, e3);
  const variante = (await obtenerVariantes(codigo)).find((v) => claveDe(v) === clave);
  if (!variante) return null;
  return aVarianteElegida(variante, variante.precioFin ?? (await consultarPrecio(codigo)));
}

/** La variante pendiente del contexto si es la misma; si no, se resuelve de nuevo. */
async function varianteDeId(sesion: Sesion, codigo: string, e1: string, e2: string, e3: string) {
  const pendiente = sesion.contexto.variantePendiente as VarianteElegida | undefined;
  if (
    pendiente &&
    sesion.contexto.codigoPendiente === codigo &&
    claveVariante(pendiente.codEle1, pendiente.codEle2, pendiente.codEle3) === claveVariante(e1, e2, e3)
  ) {
    return pendiente;
  }
  return resolverVariante(codigo, e1, e2, e3);
}

/** Descripción del artículo: la del contexto si es el pendiente, si no de la base. */
async function descripcionDe(sesion: Sesion, codigo: string): Promise<string> {
  if (sesion.contexto.codigoPendiente === codigo && typeof sesion.contexto.descripcionPendiente === "string") {
    return sesion.contexto.descripcionPendiente;
  }
  return (await obtenerArticulo(codigo))?.descripcion ?? codigo;
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

  // Cantidad rápida elegida directo de la lista: "CANT|<n>|<codigo>" o, para
  // una variante, "CANT|<n>|<codigo>|<e1>|<e2>|<e3>".
  if (idOpcion.startsWith("CANT|")) {
    const [, cantidadStr, codigo, ...eles] = idOpcion.split("|");
    const cantidad = Number(cantidadStr);
    const descripcion = await descripcionDe(sesion, codigo);
    if (eles.length === 0) {
      await agregarItemAlCarrito(telefono, sesion, codigo, descripcion, cantidad);
      return;
    }
    const [e1 = "", e2 = "", e3 = ""] = eles;
    const variante = await varianteDeId(sesion, codigo, e1, e2, e3);
    if (!variante) {
      // Mensaje viejo de una variante que ya no se vende: que elija de nuevo.
      await mostrarDetalleArticulo(telefono, sesion, codigo, descripcion);
      return;
    }
    await agregarItemAlCarrito(telefono, sesion, codigo, descripcion, cantidad, variante);
    return;
  }

  // "Otra cantidad": pedimos la cantidad exacta por texto.
  // "MASCANT|<codigo>" o "MASCANT|<codigo>|<e1>|<e2>|<e3>".
  if (idOpcion.startsWith("MASCANT|")) {
    const [, codigo, ...eles] = idOpcion.split("|");
    const descripcion = await descripcionDe(sesion, codigo);
    let variante: VarianteElegida | null = null;
    if (eles.length > 0) {
      const [e1 = "", e2 = "", e3 = ""] = eles;
      variante = await varianteDeId(sesion, codigo, e1, e2, e3);
      if (!variante) {
        await mostrarDetalleArticulo(telefono, sesion, codigo, descripcion);
        return;
      }
    }
    await actualizarSesion(telefono, {
      estadoActual: "ESPERANDO_CANTIDAD",
      contexto: {
        ...contextoBase(sesion),
        codigoPendiente: codigo,
        descripcionPendiente: descripcion,
        ...(variante && { variantePendiente: variante }),
      },
    });
    const nombre = descripcionItem({ descripcion, descVariante: variante?.descVariante ?? "" });
    await sendTextMessage(telefono, `Escribí la cantidad de ${nombre} que querés (ej: 12).`);
    return;
  }

  // Variante elegida de la lista: "VAR|<codigo>|<e1>|<e2>|<e3>"
  if (idOpcion.startsWith("VAR|")) {
    const [, codigo, e1 = "", e2 = "", e3 = ""] = idOpcion.split("|");
    const descripcion = await descripcionDe(sesion, codigo);
    try {
      const variante = await resolverVariante(codigo, e1, e2, e3);
      if (!variante) {
        await mostrarDetalleArticulo(telefono, sesion, codigo, descripcion);
        return;
      }
      await mostrarFicha(telefono, sesion, codigo, descripcion, variante);
    } catch (err) {
      await avisarErrorConsulta(telefono, codigo, err);
    }
    return;
  }

  // Primer eje elegido (talle) de un artículo con dos: "VE1|<codigo>|<e1>"
  if (idOpcion.startsWith("VE1|")) {
    const [, codigo, e1 = ""] = idOpcion.split("|");
    const descripcion = await descripcionDe(sesion, codigo);
    try {
      const datos = await cargarDatosVariantes(codigo, descripcion);
      const grupo = agruparEje1(datos).find((g) => g.codEle1 === e1);
      if (!grupo) {
        await mostrarDetalleArticulo(telefono, sesion, codigo, descripcion);
        return;
      }
      await elegirEje1(telefono, sesion, datos, grupo);
    } catch (err) {
      await avisarErrorConsulta(telefono, codigo, err);
    }
    return;
  }

  // "Escribir la medida/talle/color": "VARTXT|<codigo>" o "VARTXT|<codigo>|<e1>"
  if (idOpcion.startsWith("VARTXT|")) {
    const [, codigo, e1] = idOpcion.split("|");
    const descripcion = await descripcionDe(sesion, codigo);
    const variantes = await obtenerVariantes(codigo);
    const delPaso = e1 !== undefined ? variantes.filter((v) => v.codEle1 === e1) : variantes;
    if (delPaso.length === 0) {
      await mostrarDetalleArticulo(telefono, sesion, codigo, descripcion);
      return;
    }
    const eje = e1 !== undefined ? EJE_COLOR : variantes.some(esTalle) ? EJE_TALLE : EJE_MEDIDA;
    const ejemplo = ejemploEje(e1 !== undefined ? textoVariante(delPaso[0], 2) : delPaso[0].desc1 || delPaso[0].codEle1);
    await actualizarSesion(telefono, {
      estadoActual: "ESPERANDO_VARIANTE",
      contexto: {
        ...contextoBase(sesion),
        codigoPendiente: codigo,
        descripcionPendiente: descripcion,
        ...(e1 !== undefined && { ele1Pendiente: e1 }),
      },
    });
    await sendTextMessage(telefono, `Escribí ${laDel(eje)} de ${descripcion} que buscás (por ejemplo ${ejemplo}).`);
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

  // Línea del carrito elegida en "Ver mi pedido": "ITEM|<codigo>~<e1>~<e2>~<e3>"
  if (idOpcion.startsWith("ITEM|")) {
    await mostrarOpcionesItem(telefono, sesion, claveDesdeId(idOpcion.replace("ITEM|", "")));
    return;
  }

  if (idOpcion.startsWith("CAMBIAR|")) {
    const clave = claveDesdeId(idOpcion.replace("CAMBIAR|", ""));
    const item = sesion.carritoActual.find((it) => claveItem(it) === clave);
    if (!item) {
      await mostrarCarrito(telefono, sesion);
      return;
    }
    await actualizarSesion(telefono, {
      estadoActual: "ESPERANDO_CANTIDAD",
      contexto: {
        ...contextoBase(sesion),
        codigoPendiente: item.codigoArticulo,
        descripcionPendiente: item.descripcion,
        claveItemPendiente: clave,
        editando: true,
      },
    });
    await sendTextMessage(
      telefono,
      `Escribí la nueva cantidad de ${descripcionItem(item)} (ahora tenés ${formatearCantidad(item.cantidad)}).`
    );
    return;
  }

  if (idOpcion.startsWith("QUITAR|")) {
    const clave = claveDesdeId(idOpcion.replace("QUITAR|", ""));
    const item = sesion.carritoActual.find((it) => claveItem(it) === clave);
    const carrito = sesion.carritoActual.filter((it) => claveItem(it) !== clave);
    await actualizarSesion(telefono, { carritoActual: carrito });
    if (item) await sendTextMessage(telefono, `Quité ${descripcionItem(item)} del pedido.`);
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
        id: `ITEM|${claveItem(it)}`,
        title: truncar(it.descripcion, LARGO_TITULO_FILA),
        // La variante va abajo: en el título (24 caracteres) se perdería.
        description: truncar(
          (it.descVariante ? `${it.descVariante} · ` : "") + `Cantidad: ${formatearCantidad(it.cantidad)}`,
          LARGO_DESCRIPCION_FILA
        ),
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

async function mostrarOpcionesItem(telefono: string, sesion: Sesion, clave: string) {
  const item = sesion.carritoActual.find((it) => claveItem(it) === clave);
  if (!item) {
    await mostrarCarrito(telefono, sesion); // mensaje viejo de un artículo que ya no está
    return;
  }

  const subtotal = item.precioUnitario ? formatoPrecio.format(item.cantidad * item.precioUnitario) : "precio a confirmar";
  await sendButtons(
    telefono,
    `*${descripcionItem(item)}*\nCantidad: ${formatearCantidad(item.cantidad)}\nSubtotal: ${subtotal}\n\n¿Qué querés hacer?`,
    [
      { id: `CAMBIAR|${clave}`, title: "Cambiar cantidad" },
      { id: `QUITAR|${clave}`, title: "Quitar del pedido" },
      { id: "VER_CARRITO", title: "Volver al pedido" },
    ]
  );
}

async function cambiarCantidadItem(telefono: string, sesion: Sesion, clave: string, cantidad: number) {
  const carrito = sesion.carritoActual.map((it) => (claveItem(it) === clave ? { ...it, cantidad } : it));
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
