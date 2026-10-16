// Mismo corte que el @media "CELULAR" del CSS (angosto, o apaisado y muy bajo). En el celular solo
// se puede usar el Mediakit: el comunicado A4 y las tarjetas no entran en una pantalla así, así que
// sus botones se muestran bloqueados y abren un aviso (ver README, decisión de diseño #6).
const MEDIA_CELULAR = '(max-width: 600px), (max-width: 960px) and (max-height: 500px)';
function esCelular() { return window.matchMedia(MEDIA_CELULAR).matches; }

function mostrarVista(nombre, btn) {
  if (nombre !== 'mediakit' && esCelular()) { abrirAvisoCelular(nombre); return; }

  document.querySelectorAll('.vista').forEach(v => v.classList.remove('activa'));
  document.getElementById('vista-' + nombre).classList.add('activa');
  document.querySelectorAll('.sidebar-btn[data-vista]').forEach(b => b.classList.remove('activo'));
  if (btn) btn.classList.add('activo');

  document.querySelectorAll('.panel-derecho-seccion').forEach(s => s.classList.remove('activa'));
  const secciones = { comunicados: 'seccion-herramientas', tarjetas: 'seccion-tarjeta', mediakit: 'seccion-mediakit' };
  document.getElementById(secciones[nombre]).classList.add('activa');

  document.querySelector('.main-panel').classList.toggle('centro-vertical', nombre === 'tarjetas');

  // La barra de direcciones refleja la sección (/logos para el Mediakit, ver vercel.json), así el
  // link que se copia lleva directo ahí. Solo servida por http(s): bajo file:// no hay rutas.
  if (location.protocol.startsWith('http')) {
    const ruta = nombre === 'mediakit' ? '/logos' : '/';
    if (location.pathname !== ruta) history.replaceState(null, '', ruta + location.search);
  }
}

// En tablet, tocar un botón de la toolbar (o abrir el selector de color) le saca el foco a la
// hoja y la selección se pierde: el comando se aplicaba "a nada". Por eso se guarda el último
// rango seleccionado DENTRO de la hoja y, si al aplicar un formato la selección ya no está ahí,
// se restaura antes del execCommand. En compu no cambia nada (la selección sigue en la hoja).
let ultimoRangoCuerpo = null;
function enfocarCuerpo() {
  const cuerpo = document.querySelector('#documento-a4 .cuerpo');
  const sel = document.getSelection();
  const dentro = !!(sel && sel.rangeCount && cuerpo.contains(sel.anchorNode));
  cuerpo.focus({ preventScroll: true });
  if (!dentro && ultimoRangoCuerpo && cuerpo.contains(ultimoRangoCuerpo.startContainer)) {
    sel.removeAllRanges();
    sel.addRange(ultimoRangoCuerpo);
  }
}
// Que tocar/clickear un botón de formato no le robe el foco a la hoja
document.querySelectorAll('#seccion-herramientas button.icono').forEach((btn) => {
  btn.addEventListener('mousedown', (e) => e.preventDefault());
});

function formatoTexto(comando, valor) {
  enfocarCuerpo();
  document.execCommand(comando, false, valor || null);
  actualizarEstadoToolbar();
}

function resaltarTexto(color) {
  enfocarCuerpo();
  document.execCommand('styleWithCSS', false, true);
  const ok = document.execCommand('hiliteColor', false, color);
  if (!ok) document.execCommand('backColor', false, color);
  actualizarEstadoToolbar();
}

// Tamaño de letra a pura fuerza de botones (nada de <select> para scrollear)
let tamanoActual = 3; // escala legacy de execCommand('fontSize'): 1 (chico) a 7 (enorme)
function ajustarTamano(delta) {
  tamanoActual = Math.min(7, Math.max(1, tamanoActual + delta));
  formatoTexto('fontSize', String(tamanoActual));
}

// Resalta en la toolbar el formato que tiene el texto donde está parado el cursor
// (negrita/cursiva/subrayado/tachado/listas/alineación), usando queryCommandState —
// así el usuario ve de un vistazo si lo que va a escribir sale en negrita, sin tener
// que seleccionar el texto y mirarlo. Se llama tanto al mover el cursor/seleccionar
// (selectionchange, keyup, mouseup) como después de aplicar un comando desde la
// toolbar (formatoTexto/resaltarTexto), porque no todos los navegadores disparan
// selectionchange de forma confiable al ejecutar execCommand.
function actualizarEstadoToolbar() {
  const cuerpo = document.querySelector('#documento-a4 .cuerpo');
  const sel = document.getSelection();
  const dentro = !!(sel && sel.anchorNode && cuerpo.contains(sel.anchorNode));
  if (dentro && sel.rangeCount) ultimoRangoCuerpo = sel.getRangeAt(0).cloneRange();

  document.querySelectorAll('.icono[data-comando]').forEach((btn) => {
    const comando = btn.dataset.comando;
    let activo = false;
    if (dentro) {
      try { activo = document.queryCommandState(comando); } catch (e) { activo = false; }
    }
    btn.classList.toggle('activo', activo);
  });

  // queryCommandState('justifyLeft') da false en párrafos nuevos que nunca tuvieron
  // un comando de alineación aplicado explícitamente, aunque se vean alineados a la
  // izquierda (es el default del navegador) — por eso se marca "activo" también
  // cuando ni centrado ni derecha están activos, no solo cuando justifyLeft lo está.
  const btnIzquierda = document.querySelector('.icono[data-comando="justifyLeft"]');
  if (btnIzquierda) {
    const centro = dentro && document.queryCommandState('justifyCenter');
    const derecha = dentro && document.queryCommandState('justifyRight');
    btnIzquierda.classList.toggle('activo', dentro && !centro && !derecha);
  }
}

document.addEventListener('selectionchange', actualizarEstadoToolbar);
document.querySelector('#documento-a4 .cuerpo').addEventListener('keyup', actualizarEstadoToolbar);
document.querySelector('#documento-a4 .cuerpo').addEventListener('mouseup', actualizarEstadoToolbar);

// Plantilla original del comunicado, capturada al cargar la página (antes de que el usuario
// escriba nada), para poder volver a ella con "Nuevo comunicado" sin tener que recargar F5.
const PLANTILLA_COMUNICADO = document.querySelector('#documento-a4 .cuerpo').innerHTML;

function nuevoComunicado() {
  if (!confirm('¿Empezar un comunicado nuevo? Se va a borrar todo el texto actual.')) return;
  const cuerpo = document.querySelector('#documento-a4 .cuerpo');
  cuerpo.innerHTML = PLANTILLA_COMUNICADO;
  ultimoRangoCuerpo = null;
  actualizarEstadoToolbar();
  programarActualizacionSaltos();
}

// Marca en pantalla dónde corta cada hoja al exportar a PDF (ver calcularSaltosDePaginaComunicado
// en pdf-comunicado.js). Se recalcula con debounce en cada tecleo: el cálculo arma un PDF de
// mentira solo para medir, así que no conviene correrlo en cada tecla suelta.
let saltosPaginaTimeout = null;
async function actualizarSaltosDePagina() {
  const documento = document.getElementById('documento-a4');
  documento.querySelectorAll('.marca-salto-pagina').forEach((el) => el.remove());
  const saltos = await calcularSaltosDePaginaComunicado();
  saltos.forEach((mm) => {
    const marca = document.createElement('div');
    marca.className = 'marca-salto-pagina';
    marca.style.top = mm + 'mm';
    documento.appendChild(marca);
  });
}

function programarActualizacionSaltos() {
  clearTimeout(saltosPaginaTimeout);
  saltosPaginaTimeout = setTimeout(actualizarSaltosDePagina, 400);
}

document.querySelector('#documento-a4 .cuerpo').addEventListener('input', programarActualizacionSaltos);
programarActualizacionSaltos();

// En pantallas angostas (tablet) la hoja A4 (794px) y las tarjetas no entran en el centro: se
// achican SOLO a la vista con transform: scale, y con márgenes negativos se les descuenta el
// espacio que dejan de ocupar (transform no cambia el lugar que algo ocupa en el layout). El
// tamaño real en mm queda intacto, así que el PDF (que lee getComputedStyle, no medidas en
// pantalla) y las marcas de "Fin de hoja" no se enteran. En compu la escala da 1 y no se toca nada.
// La hoja solo se ajusta al ancho (es más alta que la pantalla y scrollea); las tarjetas también
// al alto, porque tienen que verse enteras sin scroll (ver .centro-vertical).
function ajustarEscalaCentro() {
  const panel = document.querySelector('.main-panel');
  const cs = getComputedStyle(panel);
  const anchoDisponible = panel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const altoDisponible = panel.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  [
    { el: document.getElementById('documento-a4'), ajustarAlto: false },
    { el: document.getElementById('tarjetas-preview'), ajustarAlto: true },
  ].forEach(({ el, ajustarAlto }) => {
    const ancho = el.offsetWidth;
    const alto = el.offsetHeight;
    if (!ancho) return; // vista oculta
    let escala = Math.min(1, anchoDisponible / ancho);
    if (ajustarAlto && altoDisponible > 0) escala = Math.min(escala, altoDisponible / alto);
    const achicar = escala < 0.999;
    el.style.transformOrigin = achicar ? 'top left' : '';
    el.style.transform = achicar ? `scale(${escala})` : '';
    el.style.marginRight = achicar ? `${-(1 - escala) * ancho}px` : '';
    el.style.marginBottom = achicar ? `${-(1 - escala) * alto}px` : '';
  });
}
// Se recalcula si cambia el ancho del centro (rotar la tablet, achicar la ventana), el alto de la
// hoja (al escribir crece) o cuando una vista oculta se vuelve a mostrar.
const observadorEscala = new ResizeObserver(() => requestAnimationFrame(ajustarEscalaCentro));
['.main-panel', '#documento-a4', '#tarjetas-preview'].forEach((sel) => observadorEscala.observe(document.querySelector(sel)));

// La ayuda abre directamente en la pestaña de la herramienta que se está usando
function abrirAyuda() {
  const vistaActiva = document.querySelector('.sidebar-btn.activo[data-vista]');
  mostrarAyuda(vistaActiva ? vistaActiva.dataset.vista : 'comunicados');
  document.getElementById('modal-ayuda').classList.add('activo');
}
function mostrarAyuda(nombre) {
  document.querySelectorAll('.ayuda-tab, .ayuda-panel').forEach((el) => el.classList.toggle('activo', el.dataset.ayuda === nombre));
}
function cerrarAyuda() { document.getElementById('modal-ayuda').classList.remove('activo'); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarAyuda(); cerrarAvisoCelular(); } });

// Aviso de celular: "esto se usa desde una compu o tablet; acá podés bajar el logo"
const TITULOS_AVISO_CELULAR = {
  bienvenida: 'Esto se usa desde una compu o una tablet',
  comunicados: 'Los comunicados se arman desde una compu o una tablet',
  tarjetas: 'Las tarjetas se arman desde una compu o una tablet',
};
function abrirAvisoCelular(motivo) {
  document.getElementById('aviso-celular-titulo').textContent = TITULOS_AVISO_CELULAR[motivo] || TITULOS_AVISO_CELULAR.bienvenida;
  document.getElementById('modal-celular').classList.add('activo');
}
function cerrarAvisoCelular() { document.getElementById('modal-celular').classList.remove('activo'); }

// "Mandarme el link": el menú de compartir del teléfono (WhatsApp, mail…) si existe; si no,
// copiar al portapapeles; y si tampoco se puede, WhatsApp directo.
async function mandarmeElLink() {
  const url = location.protocol.startsWith('http') ? location.origin + '/' : location.href;
  const texto = 'Generador CAVA: comunicados, tarjetas y logos de la Federazione';
  if (navigator.share) {
    try { await navigator.share({ title: 'Generador CAVA', text: texto, url }); return; }
    catch (e) { if (e.name === 'AbortError') return; } // lo cerró el usuario
  }
  try {
    await navigator.clipboard.writeText(url);
    const btn = document.getElementById('btn-mandar-link');
    btn.textContent = '✅ Link copiado';
    setTimeout(() => { btn.textContent = '📲 Mandarme el link'; }, 2500);
  } catch (e) {
    window.open('https://wa.me/?text=' + encodeURIComponent(texto + ' ' + url), '_blank');
  }
}

// Si la pantalla pasa a ser "de celular" (rotar, achicar la ventana) parado en Comunicados o
// Tarjetas, se vuelve al Mediakit: esas vistas no se pueden usar ahí.
window.matchMedia(MEDIA_CELULAR).addEventListener('change', (e) => {
  if (e.matches && !document.getElementById('vista-mediakit').classList.contains('activa')) {
    mostrarVista('mediakit', document.querySelector('.sidebar-btn[data-vista="mediakit"]'));
  }
});

// descargarComunicadoPDF() vive en pdf-comunicado.js: arma el PDF a mano con texto
// real (no rasteriza el DOM), para que salga seleccionable y con links nativos.

function actualizarTarjeta() {
  document.getElementById('tj-out-nombre').textContent = document.getElementById('tj-nombre').value || 'Nombre Apellido';
  document.getElementById('tj-out-cargo').textContent = document.getElementById('tj-cargo').value || 'Cargo';
  document.getElementById('tj-out-celular').textContent = document.getElementById('tj-celular').value || 'Celular';
}

// Formatea el celular en tiempo real a medida que se escribe (código de país variable:
// en Argentina el código de área va de 2 a 4 dígitos). Si el usuario escribe un "+" con
// otro código de país (ej: +39 para Italia), AsYouType lo detecta solo y reformatea con
// ese país en vez de Argentina. Se crea un formateador nuevo en cada tecleo (en vez de uno
// persistente) para que funcione bien con backspace/borrado/pegado: siempre reformatea
// desde cero a partir del valor actual del input, no arrastra estado de tecleos previos.
document.getElementById('tj-celular').addEventListener('input', (e) => {
  e.target.value = new libphonenumber.AsYouType('AR').input(e.target.value);
  actualizarTarjeta();
});

// Las imágenes de las tarjetas se cambian por sus versiones embebidas en base64 (logo y bandera de
// imagenes-comunicado.js, QR de imagenes-tarjeta.js): si html2canvas las lee desde img/ bajo file://,
// Chrome tainea el canvas y la descarga falla con "SecurityError: Tainted canvases".
document.querySelectorAll('#tarjetas-preview .logo-tarjeta, #tarjetas-preview .logo-tarjeta-mini').forEach((img) => { img.src = PDF_IMAGENES.logo; });
document.querySelectorAll('#tarjetas-preview .bandera-tarjeta img').forEach((img) => { img.src = PDF_IMAGENES.bandera; });
document.querySelector('#tarjetas-preview .qr').src = TARJETA_QR;

async function capturarTarjetas() {
  const opciones = {
    scale: 4, useCORS: true, backgroundColor: '#ffffff',
    // En tablet la vista previa está achicada con transform (ver ajustarEscalaCentro): en la copia
    // que captura html2canvas se le saca, así la imagen sale siempre al tamaño real.
    onclone: (doc) => {
      const preview = doc.getElementById('tarjetas-preview');
      preview.style.transform = 'none';
      preview.style.margin = '0';
    },
  };
  const frente = await html2canvas(document.getElementById('tarjeta-frente'), opciones);
  const dorso = await html2canvas(document.getElementById('tarjeta-dorso'), opciones);
  return { frente, dorso };
}

async function descargarTarjetasPDF() {
  const { frente, dorso } = await capturarTarjetas();
  const { jsPDF } = window.jspdf;
  // La página del PDF mide EXACTAMENTE 90x50mm: la tarjeta ocupa el 100% de la hoja, sin fondos ni márgenes de más
  const pdf = new jsPDF({ unit: 'mm', format: [90, 50], orientation: 'landscape' });
  pdf.addImage(frente.toDataURL('image/jpeg', 1), 'JPEG', 0, 0, 90, 50);
  pdf.addPage([90, 50], 'landscape');
  pdf.addImage(dorso.toDataURL('image/jpeg', 1), 'JPEG', 0, 0, 90, 50);
  pdf.save('tarjeta-cava.pdf');
}

async function descargarTarjetasPNG() {
  const { frente, dorso } = await capturarTarjetas();
  const gap = 30;
  const final = document.createElement('canvas');
  final.width = frente.width + dorso.width + gap;
  final.height = Math.max(frente.height, dorso.height);
  const ctx = final.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, final.width, final.height);
  ctx.drawImage(frente, 0, 0);
  ctx.drawImage(dorso, frente.width + gap, 0);
  const link = document.createElement('a');
  link.download = 'tarjeta-cava.png';
  link.href = final.toDataURL('image/png');
  link.click();
}
