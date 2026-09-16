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

async function descargarComunicadoPDF() {
  const el = document.getElementById('documento-a4');

  // Guardamos dónde está cada link ANTES de rasterizar, como % del tamaño de la hoja,
  // para poder dibujar encima de la imagen final un área cliqueable real en el PDF.
  const elRect = el.getBoundingClientRect();
  const links = Array.from(el.querySelectorAll('a[href]')).map(a => {
    const r = a.getBoundingClientRect();
    return {
      href: a.href,
      xRatio: (r.left - elRect.left) / elRect.width,
      yRatio: (r.top - elRect.top) / elRect.height,
      wRatio: r.width / elRect.width,
      hRatio: r.height / elRect.height,
    };
  });

  const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = 210;
  const pageHeight = 297;
  const imgData = canvas.toDataURL('image/jpeg', 0.98);
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  // Agrega, sobre la página actual, un área cliqueable real por cada link cuyo rectángulo
  // caiga (aunque sea parcialmente) dentro de esta hoja.
  const agregarLinksEnPagina = (yOffsetMm) => {
    links.forEach(l => {
      const y = yOffsetMm + l.yRatio * imgHeight;
      const h = l.hRatio * imgHeight;
      if (y + h < 0 || y > pageHeight) return;
      pdf.link(l.xRatio * pageWidth, y, l.wRatio * pageWidth, h, { url: l.href });
    });
  };

  if (imgHeight <= pageHeight + 1) {
    // Entra en una sola hoja: la estiramos exacto a 297mm para que NUNCA se genere una 2da página en blanco
    pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
    agregarLinksEnPagina(0);
  } else {
    // Comunicado largo: paginamos a mano, sin dejar páginas casi vacías al final
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight);
    agregarLinksEnPagina(position);
    heightLeft -= pageHeight;
    while (heightLeft > 0.5) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight);
      agregarLinksEnPagina(position);
      heightLeft -= pageHeight;
    }
  }
  pdf.save('comunicado-cava.pdf');
}

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
