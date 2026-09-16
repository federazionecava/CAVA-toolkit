# Portal CAVA

Herramienta web (HTML/CSS/JS puro, sin build ni backend) para que la Federazione CAVA genere
dos piezas oficiales y las descargue en PDF con un clic:

1. **Comunicados A4** — una hoja membretada editable (tipo carta institucional).
2. **Tarjetas Personales** — una tarjeta de presentación (frente + dorso con QR) con datos que
   se completan en un formulario.

No requiere instalación: se abre `index.html` directamente en el navegador (doble clic) y funciona
tanto en `file://` como servido desde cualquier hosting estático — con una excepción conocida hoy
(Tarjetas Personales), ver "Pendientes" al final.

## Cómo se usa (resumen para gente, no solo para IAs)

El botón **"¿Cómo funciona esto?"** del menú izquierdo abre un modal con la explicación completa
para el usuario final, en español rioplatense. Si vas a tocar ese texto, mantené ese tono — es
un pedido explícito de la Federazione, no un descuido.

## Estructura de archivos

```
index.html   → estructura de la página (sidebar, hoja, tarjetas, panel derecho, modal)

css/
  style.css  → todo el CSS

js/
  script.js              → lógica de UI (sin frameworks, DOM API + execCommand) — NO incluye la
                            exportación del comunicado a PDF, ver pdf-comunicado.js
  pdf-comunicado.js       → arma el PDF del comunicado a mano con jsPDF, con texto real (no
                            rasteriza el DOM). Ver "La exportación a PDF" más abajo.
  fonts-zt-nature.js      → los 4 pesos de ZT Nature (Regular/Bold/Italic/BoldItalic) embebidos en
                            base64, para incrustarlos como fuente real dentro del PDF. Ver por qué
                            está embebido y no vía fetch() más abajo.
  imagenes-comunicado.js  → el logo y la franja de bandera del membrete, pre-rasterizados y
                            embebidos en base64, para incrustarlos en el PDF sin leerlos con
                            canvas.toDataURL() (mismo motivo que fonts-zt-nature.js, ver abajo).

img/         → todas las imágenes de la app:
              - logo.png, bandera.svg → arte del membrete del comunicado (logo y franja de
                bandera) y favicon de la web (`<link rel="icon">` apunta a img/logo.png)
              - qr.png → QR fijo del dorso de la Tarjeta Personal
              - iconoweb.png → banderita redonda, ya no se usa como favicon (ver logo.png);
                sigue en la carpeta sin uso por si hace falta más adelante
              - logo_doc.svg → NO está referenciado en ningún lado del código (ni index.html, ni
                css/, ni js/) — quedó ahí de alguna iteración anterior; antes de borrarlo,
                confirmar con el usuario que de verdad no hace falta

fonts/       → ZTNature-{Regular,Bold,SemiBold,ExtraBold}.woff2, los únicos 4 pesos que carga
              @font-face en css/style.css (tipografía única de toda la app — interfaz Y
              documento). Los .ttf de Regular/Bold/Italic/BoldItalic que vivían acá se borraron:
              no los carga nada en tiempo de ejecución (el PDF usa los que ya están embebidos en
              base64 en js/fonts-zt-nature.js, no lee estos archivos). Si hace falta regenerar
              ese base64 en el futuro, los .ttf originales siguen en la carpeta "ZT Nature/" de
              la raíz.

ZT Nature/   → paquete completo de la tipografía (formatos OT/TT/Variable/WEB OT/WEB TT, todos
              los pesos e itálicas — ~8MB, 128 archivos). NO se sirve a la web, es material de
              referencia/respaldo del diseñador — la app entera usa solo 4 pesos, ya copiados a
              fonts/*.woff2. Se decidió dejarla intacta a pedido explícito del usuario aunque no
              la use la app: es probable que sea la entrega original con licencia de la
              fundidora, no algo trivial de recuperar si se borra por error.
```

No hay `package.json`, ni bundler, ni dependencias locales. Las únicas dependencias externas son
dos `<script>` por CDN (cdnjs), cargados en `index.html` antes de los scripts propios de `js/`:

- `html2canvas` — todavía se usa para las Tarjetas Personales (`descargarTarjetasPDF`/`PNG` en
  `js/script.js`), que son básicamente una imagen (logo + QR + datos), no un documento de texto.
- `jspdf` (UMD) — arma los PDF de comunicado y tarjetas.

No se usa Google Fonts: toda la tipografía (interfaz y documento) es `ZT Nature`, self-hosted.

Si esto se despliega sin internet, hay que vendorizar esos dos scripts (jsPDF y html2canvas).

## Decisiones de diseño que no son obvias mirando el código

Estas son las partes donde, si las "arreglás" sin saber por qué están así, vas a reintroducir
bugs que ya se resolvieron a lo largo de varias iteraciones con el usuario:

### 1. La exportación del comunicado a PDF dibuja texto real, NO rasteriza el DOM

`pdf-comunicado.js` arma el PDF del comunicado a mano con jsPDF, dibujando texto (seleccionable,
copiable, con links nativos) en vez de convertir el DOM en una imagen. Es la segunda vuelta de
esta función: la primera versión usaba `html2canvas` + `jsPDF` (rasterizaba `#documento-a4` a una
imagen y pegaba rectángulos de `pdf.link()` encima para simular los links del footer) — se
reemplazó porque el texto no era seleccionable/copiable, algo que la Federazione pidió
explícitamente recuperar. Antes de esa, se probó `window.print()` (impresión nativa) y se volvió
atrás porque el logo y la franja de bandera no salían en impresión real y porque cambiaba la
descarga de un clic a tener que pasar por el diálogo de impresión.

Cómo funciona ahora (todo en `pdf-comunicado.js`):

- Recorre el DOM de `.cuerpo` (el `contenteditable`) y arma una lista de "bloques" (uno por `<p>`,
  `<div>` o `<li>`), cada uno con una lista de "runs" de texto con su estilo. El estilo de cada
  fragmento (negrita, cursiva, subrayado, tachado, color, resaltado, tamaño) se lee con
  `getComputedStyle()` del nodo real en pantalla — NO se intenta detectar a mano combinaciones de
  `<b>`/`<font size>`/`<span style>`, porque `execCommand` genera markup distinto según el
  navegador para el mismo resultado visual, y `getComputedStyle()` ya resuelve esa variación.
- Con esos bloques arma líneas a mano (word-wrap real, midiendo cada palabra con
  `pdf.getTextWidth()`), respetando alineación, viñetas/numeración y salto de página.
- El encabezado (logo + título) sale solo en la página 1. La franja de bandera sale al pie de
  TODAS las páginas. El pie de contacto (dirección/whatsapp/mail/web/instagram) se dibuja pegado
  al fondo de la ÚLTIMA página. Para lograr esto sin tener que adivinar cuál va a ser la última
  página, se mide el alto del pie una sola vez al principio (`medirAltura()`, un layout "en seco"
  que no dibuja nada) y ese espacio queda reservado —y nunca disponible para el cuerpo— en todas
  las páginas por igual.
- Los links del footer (`<a href>`) se detectan con `el.closest('a[href]')` en cada run de texto y
  se agregan como `pdf.link()` real, en la posición exacta donde se dibujó ese texto — no hay
  estimación por porcentaje del tamaño de la hoja como en la versión vieja.
- Los emojis del footer (📍📞✉️🌐📱) se descartan antes de dibujar (regex de
  `Extended_Pictographic`): la fuente ZT Nature no trae esos glifos y jsPDF no rendriza emoji a
  color. Las etiquetas en negrita (Tel:/Email:/Web:/Instagram:) ya alcanzan sin el ícono.
- La tipografía ZT Nature (Regular/Bold/Italic/BoldItalic) se incrusta en el PDF vía
  `pdf.addFileToVFS()` + `pdf.addFont()`, usando los base64 de `js/fonts-zt-nature.js`. Están
  embebidos como constante en vez de cargados con `fetch()` a unos `.ttf` en `fonts/` porque la
  app tiene que poder abrirse con doble clic vía `file://` (ver el README más arriba), y `fetch()`
  a archivos locales falla por CORS en Chrome bajo `file://` (esos `.ttf` fuente ya no están en
  `fonts/` — se usaron una sola vez para generar el base64 y se borraron; si hace falta
  regenerarlo, están en `ZT Nature/ZT Nature - TT/` en la raíz). Si en algún momento se agrega un
  build/servidor y ya no hace falta soportar `file://`, se podría volver a `fetch()` + cache y
  borrar `js/fonts-zt-nature.js`, pero no lo hagas sin confirmar que `file://` dejó de ser un
  requisito.
- El logo y la franja de bandera están pre-rasterizados y embebidos en base64 en
  `js/imagenes-comunicado.js`, igual que las fuentes. La primera versión de esto intentaba leerlos
  en el momento con `new Image()` + `<canvas>` + `toDataURL()` (mismo mecanismo que usa
  `html2canvas` puertas adentro) — funciona en `file://` para MOSTRAR la imagen en pantalla, pero
  Chrome tainea el canvas apenas tratás de leer sus píxeles de vuelta con `toDataURL()` sobre una
  imagen cargada desde `file://`, aunque esté en la misma carpeta (`SecurityError: Tainted
  canvases may not be exported`). Por eso están precalculados: `img/logo.png` bajado a 1000px de
  ancho (de sobra para imprimir a 32.2mm) y `img/bandera.svg` rasterizado una vez a ~300dpi
  (2480×104px, porque jsPDF no soporta SVG vectorial sin un plugin aparte), los dos convertidos a
  base64 a mano. Si algún día cambia el arte (`img/logo.png` o `img/bandera.svg`), hay que repetir
  ese proceso y regenerar `js/imagenes-comunicado.js` — no alcanza con reemplazar el archivo de
  imagen.

Las Tarjetas Personales (`descargarTarjetasPDF`/`descargarTarjetasPNG` en `js/script.js`) siguen
usando `html2canvas` sin este tratamiento — y por eso están rotas bajo `file://` ahora mismo
(mismo `SecurityError` de canvas tainteado, ver "Pendientes" al final). Se dejaron así a propósito
en esta ronda porque arreglarlas no estaba pedido; el mismo enfoque de `js/imagenes-comunicado.js`
(pre-embeber `img/logo.png`, `img/bandera.svg` y `img/qr.png` en base64 en vez de leerlos con
`<img src>`+canvas) resolvería esto, pero falta hacerlo.

### 2. `.documento` y `.tarjeta` tienen que quedar intactos

El CSS de `.documento`, `.header-membrete`, `.cuerpo`, `.footer`, `.bandera-inferior`, `.tarjeta*`
es el diseño "oficial" de la Federazione (logo y franja de bandera de `img/logo.png`/
`img/bandera.svg`, tipografía `ZT Nature`, medidas en `mm` reales para que impriman exacto en A4 /
90×50mm). Toda la demás interfaz (sidebar, panel derecho, modal, botones) usa esa misma tipografía
`ZT Nature` — antes había una separación deliberada donde la interfaz usaba `Poppins` de Google
Fonts, mientras que solo el documento usaba `ZT Nature`; se eliminó esa separación a pedido de la
Federazione para que toda la app use una sola tipografía.

### 3. El `@media print` es un respaldo, no el camino principal

El botón verde "Descargar PDF" genera el archivo por JS (ver punto 1) y no dispara el diálogo de
impresión del navegador. El bloque `@media print` en `css/style.css` sigue existiendo por si
alguien hace `Ctrl+P` manualmente; tiene su propio arreglo para el bug de la doble hoja (fuerza
`height: 297mm` + `overflow: hidden` en `.documento`).

### 4. El layout de 3 columnas usa 4 columnas `1fr` iguales, no `calc()`

`.app-shell` es un grid: `1fr | sidebar | 1fr | (auto) | 1fr | panel-derecho | 1fr`. Las cuatro
columnas `1fr` son idénticas a propósito, para que el espacio entre pantalla↔sidebar,
sidebar↔hoja, hoja↔panel y panel↔pantalla sea **siempre igual entre sí**, sin importar el ancho
de ventana. La columna central es `auto` porque tiene que adaptarse tanto a la hoja A4 (794px)
como a la vista previa de tarjetas (mucho más angosta) sin que nadie tenga que recalcular nada.

Si volvés a esto con `calc()` a mano asumiendo un ancho fijo del centro, se rompe apenas cambie
el contenido (ya pasó dos veces).

### 5. La página en sí no scrollea — solo `.main-panel`

`body` tiene `height: 100vh; overflow: hidden`. El sidebar y el panel derecho quedan clavados en
pantalla (nunca se mueven) porque no hay scroll de página que se los lleve; el único que scrollea
es `.main-panel` (la hoja o las tarjetas), con su propio `overflow-y: auto`. Es un pedido explícito
del usuario ("que se mueva solo la hoja").

`.main-panel` alinea el contenido arriba por defecto (para que la hoja, más alta que la pantalla,
scrollee bien desde el principio) y solo se centra verticalmente cuando el JS agrega la clase
`.centro-vertical` (en el modo Tarjetas, que siempre entra entero en pantalla). No le pongas
`justify-content: center` fijo a `.main-panel` — reintroduce un bug de recorte de contenido con
overflow.

### 6. Responsive: `--panel-w` por breakpoint, "desktop first"

`--panel-w` (ancho del sidebar y el panel derecho) se achica en `@media (max-width: 1400px)` y
`@media (max-width: 1250px)`. El proyecto es explícitamente "desktop first": no está pensado para
celular/tablet, solo para que no se rompa entre distintas resoluciones de PC/notebook.

## Pendientes / cosas a resolver con el cliente

- **Bug conocido: Tarjetas Personales rota bajo `file://`.** `descargarTarjetasPDF()` y
  `descargarTarjetasPNG()` (en `js/script.js`) tiran `SecurityError: Tainted canvases may not be
  exported` apenas se abre `index.html` con doble clic (no en un servidor). Es el mismo problema
  de canvas tainteado que se resolvió para el comunicado (ver decisión de diseño #1) pero nunca se
  aplicó acá porque no estaba pedido. Se detectó probando la app de punta a punta, no es algo que
  el cliente haya reportado todavía — avisarle. El arreglo es el mismo enfoque: pre-embeber
  `img/logo.png`, `img/bandera.svg` y `img/qr.png` en base64 en vez de leerlos con `<img src>` +
  canvas en el momento de exportar.
- **`img/logo_doc.svg` no se usa en ningún lado.** No está referenciado ni en `index.html`, ni en
  `css/style.css`, ni en ningún archivo de `js/`. Puede ser un archivo de una iteración vieja del
  diseño que quedó dando vueltas — confirmar con el cliente si todavía hace falta antes de
  borrarlo (no se borró por las dudas).
