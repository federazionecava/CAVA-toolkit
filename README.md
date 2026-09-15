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
inpiracion.jpg, error.png → capturas de referencia de diseño usadas durante el desarrollo
              (no las borres sin preguntar; no son necesarias para que la web funcione)
```

No hay `package.json`, ni bundler, ni dependencias locales. Las únicas dependencias externas son
tres `<script>` por CDN (cdnjs), cargados en `index.html` antes de `script.js`:

- `html2canvas` — rasteriza el DOM a un `<canvas>`.
- `jspdf` (UMD) — arma el PDF a partir de esas imágenes.
- Google Fonts (Poppins) — tipografía de toda la interfaz (los documentos/tarjetas usan
  `Segoe UI` a propósito, ver más abajo).

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

### 2. `.documento` y `.tarjeta` tienen que quedar intactos

El CSS de `.documento`, `.bandera-lateral`, `.header`, `.cuerpo`, `.footer`, `.tarjeta*` es el
diseño "oficial" de la Federazione (colores de la bandera italiana, tipografía `Segoe UI`,
medidas en `mm` reales para que impriman exacto en A4 / 90×50mm). Todo lo demás (sidebar, panel
derecho, modal, botones) es "la interfaz" y usa `Poppins` — esa separación de tipografías es
intencional, no un olvido.

### 3. El `@media print` es un respaldo, no el camino principal

El botón verde "Descargar PDF" genera el archivo por JS (ver punto 1) y no dispara el diálogo de
impresión del navegador. El bloque `@media print` en `style.css` sigue existiendo por si alguien
hace `Ctrl+P` manualmente; tiene su propio arreglo para el bug de la doble hoja (fuerza
`height: 297mm` + `overflow: hidden` en `.documento`, y pasa `.bandera-lateral` de `fixed` a
`absolute` para que no se duplique en una hipotética segunda página).

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
