# Portal CAVA

Herramienta web (HTML/CSS/JS puro, sin build ni backend) para que la Federazione CAVA genere
dos piezas oficiales y las descargue en PDF con un clic:

1. **Comunicados A4** — una hoja membretada editable (tipo carta institucional).
2. **Tarjetas Personales** — una tarjeta de presentación (frente + dorso con QR) con datos que
   se completan en un formulario.

No requiere instalación: se abre `index.html` directamente en el navegador (doble clic) y funciona
tanto en `file://` como servido desde cualquier hosting estático.

## Cómo se usa (resumen para gente, no solo para IAs)

El botón **"¿Cómo funciona esto?"** del menú izquierdo abre un modal con la explicación completa
para el usuario final, en español rioplatense. Si vas a tocar ese texto, mantené ese tono — es
un pedido explícito de la Federazione, no un descuido.

## Estructura de archivos

```
index.html   → estructura de la página (sidebar, hoja, tarjetas, panel derecho, modal)
style.css    → todo el CSS
script.js    → toda la lógica JS (sin frameworks, DOM API + execCommand)
iconoweb.png → favicon / logo redondo del sidebar
logo.png, bandera.svg → arte del membrete del comunicado (logo y franja de bandera)
fonts/       → ZTNature-Regular.woff2 y ZTNature-Bold.woff2, la tipografía oficial del comunicado
              (cargada vía @font-face en style.css; el resto de los pesos de la fuente están
              sin usar en la carpeta "ZT Nature/" en la raíz — es material de referencia, no se
              sirve a la web)
inpiracion.jpg, error.png → capturas de referencia de diseño usadas durante el desarrollo
              (no las borres sin preguntar; no son necesarias para que la web funcione)
```

No hay `package.json`, ni bundler, ni dependencias locales. Las únicas dependencias externas son
tres `<script>` por CDN (cdnjs), cargados en `index.html` antes de `script.js`:

- `html2canvas` — rasteriza el DOM a un `<canvas>`.
- `jspdf` (UMD) — arma el PDF a partir de esas imágenes.
- Google Fonts (Poppins) — tipografía de toda la interfaz (sidebar, panel, modal). El comunicado
  en sí usa `ZT Nature` (self-hosted, ver `fonts/` arriba), no Poppins ni Google Fonts — esa
  separación de tipografías entre "el documento oficial" y "la interfaz" es intencional.

Si esto se despliega sin internet, hay que vendorizar esos tres scripts.

## Decisiones de diseño que no son obvias mirando el código

Estas son las partes donde, si las "arreglás" sin saber por qué están así, vas a reintroducir
bugs que ya se resolvieron a lo largo de varias iteraciones con el usuario:

### 1. La exportación a PDF NO usa `html2pdf.js`, y es a propósito

`html2pdf.js` tiene un bug conocido: cuando el contenido mide casi exactamente una página, genera
una segunda hoja casi en blanco por errores de redondeo en su paginado automático. Por eso
`descargarComunicadoPDF()` en `script.js` arma el PDF a mano con `html2canvas` + `jsPDF`:

- Si el contenido entra en una sola A4 (con 1mm de tolerancia), se estira la imagen exacto a
  210×297mm y se corta ahí — nunca hay una segunda página.
- Si es más largo, ahí sí pagina manualmente, restando `pageHeight` hasta cubrir todo el alto.

No reintroduzcas `html2pdf.js` para esto sin volver a probar ese caso límite.

El PDF que arma `html2canvas` es, en el fondo, una imagen — no tiene texto seleccionable. Para que
los links del footer (Whatsapp, mail, mapa, web, Instagram) igual queden cliqueables arriba de esa
imagen, `descargarComunicadoPDF()` mide con `getBoundingClientRect()` la posición de cada `<a>`
DENTRO de `#documento-a4` **antes** de rasterizar, la guarda como % del ancho/alto de la hoja, y
después de pegar la imagen le agrega encima esos rectángulos como links reales con `pdf.link()`.
Si cambiás el layout del footer (o agregás/sacás links), no hay que tocar nada de esto — se recalcula
solo porque mide el DOM en cada exportación. Si el comunicado pagina a varias hojas, cada link se
agrega solo en la página donde su rectángulo realmente cae.

Se probó en su momento cambiar todo esto por `window.print()` (impresión nativa del navegador) para que
el PDF saliera con texto seleccionable y links cliqueables. Se volvió atrás: en la práctica el logo
y la franja de bandera no salían en la impresión real (aunque en capturas automatizadas sí), y de
paso cambiaba la descarga de un click a tener que pasar por el diálogo de impresión — dos motivos
por los que el usuario pidió revertirlo. Si se retoma esa idea alguna vez, hay que probarla a fondo
en un navegador real (no headless) antes de asumir que quedó bien.

### 2. `.documento` y `.tarjeta` tienen que quedar intactos

El CSS de `.documento`, `.header-membrete`, `.cuerpo`, `.footer`, `.bandera-inferior`, `.tarjeta*`
es el diseño "oficial" de la Federazione (logo y franja de bandera de `logo.png`/`bandera.svg`,
tipografía `ZT Nature`, medidas en `mm` reales para que impriman exacto en A4 / 90×50mm). Todo lo
demás (sidebar, panel derecho, modal, botones) es "la interfaz" y usa `Poppins` — esa separación de
tipografías es intencional, no un olvido.

### 3. El `@media print` es un respaldo, no el camino principal

El botón verde "Descargar PDF" genera el archivo por JS (ver punto 1) y no dispara el diálogo de
impresión del navegador. El bloque `@media print` en `style.css` sigue existiendo por si alguien
hace `Ctrl+P` manualmente; tiene su propio arreglo para el bug de la doble hoja (fuerza
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

- Los `<img src="https://PEGAR-AQUI-EL-LINK-AL-LOGO.png">` (en el header del comunicado y en el
  frente de la tarjeta) y `https://PEGAR-AQUI-EL-LINK-AL-QR.png` (dorso de la tarjeta) son
  placeholders. Hay que reemplazarlos por las URLs reales del logo y del QR de la Federazione.
- El favicon usa `iconoweb.png` (el archivo que hay en la carpeta). Si en algún momento piden
  `iconitoweb.png` u otro nombre, es probable que sea el mismo archivo con otro nombre esperado —
  confirmar con el usuario antes de asumir.
