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
}

function resaltarTexto(color) {
  document.querySelector('#documento-a4 .cuerpo').focus();
  document.execCommand('styleWithCSS', false, true);
  const ok = document.execCommand('hiliteColor', false, color);
  if (!ok) document.execCommand('backColor', false, color);
}

// Tamaño de letra a pura fuerza de botones (nada de <select> para scrollear)
let tamanoActual = 3; // escala legacy de execCommand('fontSize'): 1 (chico) a 7 (enorme)
function ajustarTamano(delta) {
  tamanoActual = Math.min(7, Math.max(1, tamanoActual + delta));
  formatoTexto('fontSize', String(tamanoActual));
}

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
