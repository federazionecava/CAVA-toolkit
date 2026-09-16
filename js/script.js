function mostrarVista(nombre, btn) {
  document.querySelectorAll('.vista').forEach(v => v.classList.remove('activa'));
  document.getElementById('vista-' + nombre).classList.add('activa');
  document.querySelectorAll('.sidebar-btn[data-vista]').forEach(b => b.classList.remove('activo'));
  if (btn) btn.classList.add('activo');

  document.querySelectorAll('.panel-derecho-seccion').forEach(s => s.classList.remove('activa'));
  const idSeccion = nombre === 'tarjetas' ? 'seccion-tarjeta' : 'seccion-herramientas';
  document.getElementById(idSeccion).classList.add('activa');

  document.querySelector('.main-panel').classList.toggle('centro-vertical', nombre === 'tarjetas');
}

function formatoTexto(comando, valor) {
  document.querySelector('#documento-a4 .cuerpo').focus();
  document.execCommand(comando, false, valor || null);
  actualizarEstadoToolbar();
}

function resaltarTexto(color) {
  document.querySelector('#documento-a4 .cuerpo').focus();
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

function abrirAyuda() { document.getElementById('modal-ayuda').classList.add('activo'); }
function cerrarAyuda() { document.getElementById('modal-ayuda').classList.remove('activo'); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarAyuda(); });

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

async function capturarTarjetas() {
  const opciones = { scale: 4, useCORS: true, backgroundColor: '#ffffff' };
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
