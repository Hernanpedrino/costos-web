# costos-web — Distribuidora El Chilo SRL (Rosario)

Sistema interno: costos, dashboards, producción e integración con Bejerman. Hablar en español rioplatense, directo y técnico.

## Stack
- Next.js 16 App Router; **proxy.ts** (no middleware.ts). TypeScript, React 19.
- Prisma 7 + MySQL. Cliente generado en `generated/prisma` (import desde `@/generated/prisma`). La URL del datasource está en `prisma.config.ts`, no en el schema.
- NextAuth v5: `auth/config.ts` edge-safe (lo usa proxy.ts) + `auth/index.ts` con Credentials/bcrypt.
- shadcn/ui, TanStack Table, recharts, react-hook-form + Zod v4.
- Deploy: PM2 (`ecosystem.config.cjs`: `costos-web` en :3000 + `costos-web-https` = Caddy `tls internal`) en 192.168.1.191 (Windows). Tareas programadas: `baja-np-runner.bat` (6:30) y `scripts/etl-runner.bat`. Logs en `logs/` (gitignored).
- Ojo: `C:/Users/Usuario` también es un repo git. Trabajar siempre con el `.git` de este directorio.
- PM2 tiene que seguir en **una sola instancia** (fork): la cola de OP (`lib/cola-op.ts`) es en memoria.
- Variables de entorno: la app lee `.env.local` (pisa a `.env`); los scripts con `dotenv/config` leen solo `.env`.
- Mail (`lib/mail.ts`, Google Workspace): `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS` (contraseña de aplicación), `MAIL_ATENCION`. Probar con `npx tsx scripts/probar-mail.ts`.

## Sesión
- JWT con `maxAge` 30 min; `proxy.ts` renueva la cookie en cada request (incluidos refrescos automáticos).
- La inactividad real la mide `components/CierreInactividad.tsx` (eventos del usuario, compartidos entre pestañas por localStorage) y hace signOut a los 30 min. No medir inactividad con `getSession()` ni `refetchInterval`: renuevan la sesión.

## Bejerman (SQL Server 2012, paquete mssql)
- SBDACANE = PRODUCCIÓN. SBDALILI = otra empresa (ETL de lili). SBDPCANE (prueba) tiene otra estructura: NO sirve para testear.
- Pool compartido: `getBejermanPool()` en `lib/bejerman-op.ts`. Credenciales `BEJERMAN_*` en `.env`. (El BP, `actions/produccion-bejerman.ts` y los `scripts/explorar-*` todavía arman su propia config.)

### Reglas de escritura (NO negociables)
- Todo en una transacción; todo script con `--dry-run`. **Nunca ejecutar contra SBDACANE sin confirmación explícita de Hernán.** Las pruebas en producción las corre él.
- CodEle1/2/3 = `' '` (espacio), nunca NULL: si no, Crystal Reports sale vacío.
- `art_StockPart` llega como 'true'/'false' → siempre `esFlagSi()`.
- Stock y StockPar no se actualizan solos: al insertar MovStock hay que actualizar ambos (UM1 y UM2). Clave: art_CodGen+CodEle1+CodEle2+CodEle3+dep_Cod comparando con LTRIM(RTRIM(ISNULL(x,''))).
- Desde el 16/09/2026, CabMovS y MovStock tienen triggers de auditoría STA_AUDIT_*: usar `OUTPUT INSERTED.x INTO @tabla` + SELECT, nunca `OUTPUT` a secas.
- UM2 = proporción de la fila origen (sdv_CantUM2/sdv_CantUM1), no el factor del maestro.
- FIFO de partidas por stp_FechVtoIng; lote de producción DDMMAAAA.
- Listas de precios: FIN = venta a clientes, SIV = costo interno. **Nunca exponer SIV a clientes** (chatbot incluido).

## Convenciones de código
- Decimal: `.toNumber()` al serializar, `new Prisma.Decimal()` al persistir. Date → ISO string antes de pasarla a Client Components.
- `export const dynamic = "force-dynamic"` en páginas que usan `auth()`. Fechas con `Date.UTC`.
- `registrarAccion({ usuarioId, ... })`: el usuarioId se pasa por parámetro (sale de `auth()` en la action).
- Precio de fórmula con subfórmulas: Σ(precio×cant)/Σ(cant) (`lib/calcularPrecioFormula.ts`).
- Server actions en `actions/`, UI cliente en `components/<módulo>/*Client.tsx`.

## Módulos
1. **ETL** Bejerman/LILI → MySQL (`scripts/etl-bejerman.ts`, `etl-lili.ts`): artículos, ventas, compras, NP, fórmulas (bej_prod_formulas/_comp/_producidos), listas de precios.
2. **Dashboards**: ranking con prorrateo de costos operativos, costos, planificación 12 meses + Excel, detalle de artículo, usuarios.
3. **BP automático**: `scripts/baja-np-automatico.ts` → `crearBPparaNP` en `scripts/baja-np-prueba.ts` (el cron de producción depende de este archivo). Orden: CabMovS → SegCabV → SegTiposV → SegTotV → MovStock+SegDetV → UPDATE pendientes NP → Stock/StockPar. Una transacción por NP, ventana de 3 días, numeración en la franja 74874856–74999999.
4. **OP desde la planilla**: `lib/bejerman-op.ts#crearOPparaLinea`, disparada por `actions/produccion.ts#procesarPlanillaAction` (botón en `ProduccionClient`) o `scripts/crear-op.ts`. Orden: ProdOrdenes → Procesos → Producidos → Componentes → Programa → CabMovS ENT+MovStock → CabMovS SAL(s)+MovStock → ProdDecl_Producidos → ProdDecl_Componentes (índice incremental por partida) → Stock/StockPar → estado=4. Numeración MAX+1, usuario MARIA, pasos tomados de ProdFrm_*. Una planilla por día.
   - Concurrencia: la web procesa en cola serial (`encolarOP`, relee pendientes al tomar el turno) y `crearOPparaLinea` toma `sp_getapplock 'costos-web:crear-op'` dentro de la transacción (cubre también el script). Timeout del lock < 15 s (requestTimeout de mssql). No cubre OP cargadas a mano desde el Bejerman de escritorio.
5. **Chatbot WhatsApp** (Meta Cloud API): `app/api/webhook/whatsapp/route.ts` (bypass en proxy.ts, HMAC X-Hub-Signature-256) + `lib/whatsapp/*`. Sesión en `whatsapp_conversaciones`. Envío con `normalizarNumeroDestino` (549→54). Primero se elige la entrega (reparto/transporte/retiro), después el producto. Filtro inteligente (`REFINAR|palabra|texto`). Stock en vivo (`bejerman-live.ts`), precios lista FIN desde MySQL.
   - Reparto L-V con corte 9:30. Retiro L-V 8-16 y sábados 8-13 en Constitución 2398 esq. Viamonte.
   - Zona de reparto: solo Rosario, Funes, Roldán, Granadero Baigorria, Villa Gobernador Gálvez, Pérez y Zavalla (`ZONA_REPARTO`). Ubicación del mapa → validada por distancia al centro de cada localidad; dirección escrita → por el nombre de la localidad o se pregunta (`ESPERANDO_LOCALIDAD`). Fuera de zona → transporte o retiro.
   - Búsqueda con muchos resultados de rubros distintos → primero elegir rubro (`RUBRO|`), después palabras (`FILTRO|`). El rubro es el prefijo del código (`RUBROS` en bejerman-lookup.ts; Bejerman no tiene rubro por artículo).
   - "Hablar con persona" → estado `ATENCION_PERSONAL`: el bot no contesta y reenvía cada mensaje por mail a `MAIL_ATENCION` (provisorio hasta definir número y responsable).
   - Carrito identificado por `CodGen~E1~E2~E3` (misma variante se suma). `CONFIRMAR_PEDIDO` solo vale en `ESPERANDO_CONFIRMACION` con carrito no vacío.
   - Webhook: responde 200 y procesa con `after()`, descarta `message.id` repetidos, cola serial por teléfono (`lib/whatsapp/cola.ts`), registra entrantes/salientes en `whatsapp_mensajes`. Meta entra por ngrok → localhost:3000 (no pasa por Caddy); el inspector de ngrok (127.0.0.1:4040) muestra los últimos requests.
   - `client.ts` valida los límites de Meta y lanza error (no trunca): el handler trunca.
   - Probar sin mandar nada a Meta: `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/simular-chat.ts "hola" "#HACER_PEDIDO" ...` (`#ID` = botón/fila; usa el teléfono 5490000000000 y borra su sesión).
   - Saludo: solo resetea si el mensaje entero es un saludo; "Hola, necesito X" busca X.

### Artículos con variantes
- En Bejerman, `Articulos` tiene una fila por variante (`art_CodEle1/2/3`, descripción en `artele_Desc1/2/3`); precio (`ListaPrec`) y stock (`Stock`/`StockPar`) también van por variante. `art_Gen = 1` marca una sola fila por CodGen.
- Vendibles con variantes: ROP (talle + color, Ele1+Ele2), HOJ (medida), DIS (número), VAI. ~779 variantes.
- MySQL: `bej_articulo_variantes` (ETL `etlVariantes`, reemplazo total, precio FIN por variante; CodEle trimmeados, '' si vacío → al escribir en Bejerman volver a `' '`).
- Bot: artículo con variantes → `ESPERANDO_VARIANTE` (un eje: lista de medidas con stock primero + escribir la medida; dos ejes: talle y después color). Stock de todas las variantes en una query (`consultarStockVariantes`).
- Si la búsqueda ya nombraba la variante ("hoja 2.95", "remera azul 5"), al elegir el artículo se preselecciona (`ultimaBusqueda` en el contexto + `intentarVariante`).
- Cantidad: la unidad de venta sale de `ClasArt.claume_Cod1` (UN 1714 arts, KG 186, MT, CJ, LT) vía `consultarStock`. Ficha con botones visibles (1/2/3 unidades o 1/5/10 kg), enteros para UN/CJ, aviso si lo pedido supera el stock (sin mostrar el número).
- Búsqueda (`buscarArticulos`): sin acentos, sin stopwords (conectores, "necesito/quiero/tenés…"), plural simple; matchea descripción del artículo o de sus variantes.
- Migraciones: las tablas `whatsapp_*` se crearon con `db push` → **nunca `prisma migrate dev`** (propondría reset). Escribir la migración a mano y aplicar con `prisma migrate deploy`.

## Pendientes
1. Chatbot: que CONFIRMAR_PEDIDO cree la NP real en Bejerman (SegCabV/SegDetV + asociadas). Primero mapear contra una NP cargada a mano y mostrar el plan de inserts.
2. Planilla: verificar en uso real que el botón crea la OP y muestra el resultado (el flujo ya está implementado).
3. BP (postergado): el join a Stock en `baja-np-prueba.ts` (~l.63) no usa ISNULL/LTRIM, y SegDetV copia `sdvart_CodEle*` de la NP. Si la NP tiene NULL → "sin items con stock disponible" repetido y el BP queda con NULL.
4. Chatbot: navegación del catálogo por categorías.
5. Chatbot: cuchillos/chairas/vainas → atención personal (diseñado en otro chat, sin implementar).
6. `createFormulaAction` falla con nombres de fórmula largos (P2000 `Formula.name`): validar largo en el form/Zod.

## Forma de trabajo
- De a un paso. Para escrituras en Bejerman, primero mapear contra un comprobante cargado a mano y mostrar el plan de inserts.
- Verificar con `npx tsc --noEmit` y `npm run lint`.
