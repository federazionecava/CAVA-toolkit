// ============================================================
// MEDIAKIT: todas las versiones del logo se arman EN VIVO a partir de los vectores de
// js/logo-vectores.js (no hay un archivo por versión en img/). El SVG se genera como texto,
// el PNG/JPG se rasteriza desde ese SVG (data: URL, así el canvas no queda "tainteado"
// ni bajo file://) y el PDF se dibuja vectorial con jsPDF. Ver README, decisión de diseño #10.
// ============================================================

const C = {
  verde: '#196D4A',
  azul: '#09A3E0',
  rojo: '#EA2A30',
  naranja: '#D56F3C',
  blanco: '#FFFFFF',
  negro: '#000000',
};

const FONDOS = {
  transparente: { nombre: 'Sin fondo', color: null },
  blanco: { nombre: 'Blanco', color: '#FFFFFF' },
  verde: { nombre: 'Verde', color: C.verde },
  negro: { nombre: 'Negro', color: '#111111' },
};

// "fondos" = fondos donde esa versión se ve bien (el primero sólido es el que usa el JPG).
// "claro" = el logo es claro, así que el damero de "transparente" se muestra oscuro.
const TIPOS = {
  color: {
    etiqueta: 'Color', ayuda: 'La versión oficial, para fondos claros.',
    capas: { leon: C.naranja, letras: C.verde, azul: C.azul, rojo: C.rojo, texto: C.verde },
    fondos: ['transparente', 'blanco'], muestra: 'blanco', claro: false,
  },
  blanco: {
    etiqueta: 'Blanco', ayuda: 'Una tinta, sobre fotos o colores.',
    capas: { leon: C.blanco, letras: C.blanco, azul: C.blanco, rojo: C.blanco, texto: C.blanco },
    fondos: ['transparente', 'verde', 'negro'], muestra: 'negro', claro: true,
  },
  negro: {
    etiqueta: 'Negro', ayuda: 'Una tinta: sellos, fotocopias, grabados.',
    capas: { leon: C.negro, letras: C.negro, azul: C.negro, rojo: C.negro, texto: C.negro },
    fondos: ['transparente', 'blanco'], muestra: 'blanco', claro: false,
  },
};

const PIEZAS = {
  completo: { nombre: 'Logo completo', capas: ['leon', 'letras', 'azul', 'rojo', 'texto'], caja: 'cajaCompleto' },
  isotipo: { nombre: 'Isotipo', capas: ['leon', 'letras', 'azul', 'rojo'], caja: 'cajaIsotipo' },
};

const VERSIONES = [];
Object.keys(PIEZAS).forEach((pieza) => {
  Object.keys(TIPOS).forEach((tipo) => {
    VERSIONES.push({ id: `${pieza === 'completo' ? 'logo' : 'isotipo'}-${tipo}`, pieza, tipo, ...TIPOS[tipo] });
  });
});

const FORMATOS = {
  svg: { nombre: 'SVG', vector: true, mime: 'image/svg+xml', ayuda: 'Vectorial, para diseñadores y web.' },
  png: { nombre: 'PNG', vector: false, mime: 'image/png', ayuda: 'Sin fondo, para pegar sobre fotos o flyers.' },
  jpg: { nombre: 'JPG', vector: false, mime: 'image/jpeg', ayuda: 'Con fondo, para WhatsApp o mails.' },
  pdf: { nombre: 'PDF', vector: true, mime: 'application/pdf', ayuda: 'Vectorial, para imprenta.' },
};

const TAMANOS = [
  // Sin tamaño "chico" a propósito: la gente terminaba usando logos pixelados
  { lado: 2500, nombre: 'Mediano', uso: 'Redes, WhatsApp y presentaciones' },
  { lado: 5000, nombre: 'Grande', uso: 'Impresión y cartelería' },
];

const mk = { version: 'logo-color', formato: 'png', lado: 2500, fondo: 'transparente', forma: 'ajustado' };

// ---------- Geometría y armado del SVG ----------

function buscarVersion(id) { return VERSIONES.find((v) => v.id === id); }

// Recuadro (en coordenadas de los vectores) que va a ocupar el archivo final
function geometria(version, forma) {
  const [x0, y0, x1, y1] = LOGO_CAVA_VECTORES[PIEZAS[version.pieza].caja];
  const w = x1 - x0, h = y1 - y0;
  if (forma === 'cuadrado') {
    const lado = Math.max(w, h) * 1.3;
    return { x: x0 + w / 2 - lado / 2, y: y0 + h / 2 - lado / 2, w: lado, h: lado };
  }
  const m = Math.max(w, h) * 0.05;
  return { x: x0 - m, y: y0 - m, w: w + 2 * m, h: h + 2 * m };
}

function medidasPx(version, forma, lado) {
  const g = geometria(version, forma);
  const k = lado / Math.max(g.w, g.h);
  return { ancho: Math.round(g.w * k), alto: Math.round(g.h * k) };
}

function capasDe(version) {
  return PIEZAS[version.pieza].capas.map((n) => ({ d: LOGO_CAVA_VECTORES[n], color: version.capas[n] }));
}

function armarSVG(version, fondo, forma, px) {
  const g = geometria(version, forma);
  const vb = [g.x, g.y, g.w, g.h].map((n) => n.toFixed(1)).join(' ');
  const tam = px ? ` width="${px.ancho}" height="${px.alto}"` : '';
  const colorFondo = FONDOS[fondo].color;
  const rect = colorFondo ? `<rect x="${g.x.toFixed(1)}" y="${g.y.toFixed(1)}" width="${g.w.toFixed(1)}" height="${g.h.toFixed(1)}" fill="${colorFondo}"/>` : '';
  const paths = capasDe(version).map((c) => `<path fill="${c.color}" d="${c.d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${tam} fill-rule="evenodd">` +
    `<title>Federazione CAVA — ${PIEZAS[version.pieza].nombre} (${version.etiqueta})</title>${rect}${paths}</svg>`;
}

function svgADataURL(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }

// ---------- Generación de cada formato ----------

async function rasterizar(version, fondo, forma, lado, mime) {
  const px = medidasPx(version, forma, lado);
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = svgADataURL(armarSVG(version, fondo, forma, px));
  });
  const canvas = document.createElement('canvas');
  canvas.width = px.ancho;
  canvas.height = px.alto;
  canvas.getContext('2d').drawImage(img, 0, 0, px.ancho, px.alto);
  // toDataURL en vez de toBlob: toBlob a veces nunca llama al callback (Chrome headless)
  return dataURLABlob(canvas.toDataURL(mime, 0.92));
}

function dataURLABlob(dataURL) {
  const [cabecera, base64] = dataURL.split(',');
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: cabecera.slice(5, cabecera.indexOf(';')) });
}

// Dibuja los paths (solo traen M/L/C/Z absolutos, así los genera herramientas/vectorizar-logo.py)
// con el API de trazado de jsPDF: queda un PDF 100% vectorial, no una imagen pegada.
function trazarEnPDF(pdf, d, aMM) {
  const t = d.match(/[MLCZ]|-?\d+(?:\.\d+)?/g);
  let i = 0, cmd = 'M';
  while (i < t.length) {
    if (/[MLCZ]/.test(t[i])) {
      cmd = t[i++];
      if (cmd === 'Z') { pdf.close(); continue; }
    }
    const n = cmd === 'C' ? 6 : 2;
    const p = aMM(t.slice(i, i + n).map(Number));
    i += n;
    if (cmd === 'M') pdf.moveTo(p[0], p[1]);
    else if (cmd === 'L') pdf.lineTo(p[0], p[1]);
    else pdf.curveTo(p[0], p[1], p[2], p[3], p[4], p[5]);
  }
}

function armarPDF(version, fondo, forma) {
  const g = geometria(version, forma);
  const anchoMM = 200;
  const k = anchoMM / g.w;
  const altoMM = g.h * k;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: [anchoMM, altoMM], orientation: anchoMM >= altoMM ? 'landscape' : 'portrait' });
  pdf.setProperties({ title: `Federazione CAVA — ${PIEZAS[version.pieza].nombre} (${version.etiqueta})` });
  if (FONDOS[fondo].color) {
    pdf.setFillColor(FONDOS[fondo].color);
    pdf.rect(0, 0, anchoMM, altoMM, 'F');
  }
  const aMM = (nums) => nums.map((n, j) => (j % 2 === 0 ? (n - g.x) : (n - g.y)) * k);
  capasDe(version).forEach((c) => {
    pdf.setFillColor(c.color);
    trazarEnPDF(pdf, c.d, aMM);
    pdf.fillEvenOdd();
  });
  return pdf.output('blob');
}

function nombreArchivo(version, o) {
  let nombre = `cava-${version.id}`;
  if (o.forma === 'cuadrado') nombre += '-cuadrado';
  if (!FORMATOS[o.formato].vector) {
    const px = medidasPx(version, o.forma, o.lado);
    nombre += `-${px.ancho}x${px.alto}`;
  }
  if (FONDOS[o.fondo].color) nombre += `-fondo-${o.fondo}`;
  return `${nombre}.${o.formato}`;
}

async function generarArchivo(version, o) {
  let blob;
  if (o.formato === 'svg') blob = new Blob([armarSVG(version, o.fondo, o.forma)], { type: 'image/svg+xml' });
  else if (o.formato === 'pdf') blob = armarPDF(version, o.fondo, o.forma);
  else blob = await rasterizar(version, o.fondo, o.forma, o.lado, FORMATOS[o.formato].mime);
  return { blob, nombre: nombreArchivo(version, o) };
}

function bajarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Fondo efectivo: JPG no tiene transparencia, así que cae al primer fondo sólido de la versión
function fondoEfectivo(version, formato, fondo) {
  if (formato === 'jpg' && fondo === 'transparente') return version.fondos.find((f) => f !== 'transparente');
  return fondo;
}

function opcionesActuales() {
  const version = buscarVersion(mk.version);
  return { version, o: { formato: mk.formato, lado: mk.lado, forma: mk.forma, fondo: fondoEfectivo(version, mk.formato, mk.fondo) } };
}

async function descargarLogo() {
  const btn = document.getElementById('mk-btn-descargar');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparando…';
  try {
    const { version, o } = opcionesActuales();
    const { blob, nombre } = await generarArchivo(version, o);
    bajarBlob(blob, nombre);
  } catch (e) {
    console.error(e);
    alert('No se pudo generar el archivo. Probá con otro formato o recargá la página.');
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

async function descargarMediakitZIP() {
  const btn = document.getElementById('mk-btn-zip');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  try {
    const zip = new JSZip();
    const raiz = zip.folder('CAVA-mediakit');
    const pedidos = [];
    VERSIONES.forEach((v, idx) => {
      const carpeta = raiz.folder(`${String(idx + 1).padStart(2, '0')}-${v.id}`);
      const solido = v.fondos.find((f) => f !== 'transparente');
      pedidos.push(
        [carpeta, v, { formato: 'svg', fondo: 'transparente', forma: 'ajustado' }],
        [carpeta, v, { formato: 'pdf', fondo: 'transparente', forma: 'ajustado' }],
        [carpeta, v, { formato: 'png', fondo: 'transparente', forma: 'ajustado', lado: 2500 }],
        [carpeta, v, { formato: 'jpg', fondo: solido, forma: 'ajustado', lado: 2500 }],
        [carpeta, v, { formato: 'png', fondo: solido, forma: 'cuadrado', lado: 2500 }],
      );
    });
    for (let i = 0; i < pedidos.length; i++) {
      btn.textContent = `Armando ZIP… ${i + 1}/${pedidos.length}`;
      const [carpeta, v, o] = pedidos[i];
      const { blob, nombre } = await generarArchivo(v, o);
      carpeta.file(nombre, blob);
    }
    raiz.file('LEEME.txt', textoLeeme());
    btn.textContent = 'Comprimiendo…';
    bajarBlob(await zip.generateAsync({ type: 'blob' }), 'CAVA-mediakit.zip');
  } catch (e) {
    console.error(e);
    alert('No se pudo armar el ZIP. Revisá tu conexión a internet y recargá la página.');
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

function textoLeeme() {
  return [
    'MEDIAKIT — FEDERAZIONE CAVA',
    'Comitato delle Associazioni Venete dell\'Argentina',
    '',
    'Cada carpeta es una versión del logo, en estos formatos:',
    '  .svg  vectorial (diseño, web, imprenta)',
    '  .pdf  vectorial (imprenta; sirve si piden .AI o .EPS)',
    '  .png  2500 px con fondo transparente',
    '  .jpg  2500 px con fondo de color',
    '  -cuadrado-2500x2500.png  para foto de perfil en redes',
    '',
    'Qué versión usar:',
    '  logo-color       la oficial, sobre fondos claros',
    '  logo-blanco      una sola tinta, sobre fotos o colores',
    '  logo-negro       una sola tinta: sellos, fotocopias, grabados',
    '  isotipo-*        lo mismo, sin la leyenda: para espacios chicos',
    '',
    'No deformar, rotar ni cambiar los colores del logo.',
    '',
  ].join('\r\n');
}

// ---------- Interfaz ----------

function armarGaleria() {
  ['completo', 'isotipo'].forEach((pieza) => {
    const cont = document.getElementById('mk-galeria-' + pieza);
    VERSIONES.filter((v) => v.pieza === pieza).forEach((v) => {
      const card = document.createElement('button');
      card.className = 'mk-card';
      card.dataset.version = v.id;
      card.title = `Elegir ${PIEZAS[pieza].nombre} — ${v.etiqueta}`;
      card.onclick = () => {
        elegirVersion(v.id);
        // En el celular el panel de descarga queda abajo de la galería: lo traemos a la vista
        if (esCelular()) document.querySelector('.panel-derecho').scrollIntoView({ behavior: 'smooth' });
      };
      const prev = document.createElement('div');
      prev.className = 'mk-card-preview';
      prev.style.background = FONDOS[v.muestra].color;
      const img = document.createElement('img');
      img.alt = `${PIEZAS[pieza].nombre} ${v.etiqueta}`;
      img.src = svgADataURL(armarSVG(v, 'transparente', 'ajustado'));
      prev.appendChild(img);
      const texto = document.createElement('div');
      texto.className = 'mk-card-texto';
      texto.innerHTML = `<b>${v.etiqueta}</b><span>${v.ayuda}</span>`;
      card.append(prev, texto);
      cont.appendChild(card);
    });
  });
}

function armarControles() {
  const formatos = document.getElementById('mk-formatos');
  Object.entries(FORMATOS).forEach(([id, f]) => {
    const b = document.createElement('button');
    b.className = 'mk-seg-btn';
    b.dataset.formato = id;
    b.textContent = f.nombre;
    b.onclick = () => { mk.formato = id; actualizarMediakit(); };
    formatos.appendChild(b);
  });

  const tamanos = document.getElementById('mk-tamanos');
  TAMANOS.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'mk-seg-btn mk-seg-doble';
    b.dataset.lado = t.lado;
    b.title = t.uso;
    b.innerHTML = `${t.nombre}<span class="mk-seg-px"></span>`;
    b.onclick = () => { mk.lado = t.lado; actualizarMediakit(); };
    tamanos.appendChild(b);
  });

  const fondos = document.getElementById('mk-fondos');
  Object.entries(FONDOS).forEach(([id, f]) => {
    const b = document.createElement('button');
    b.className = 'mk-fondo';
    b.dataset.fondo = id;
    b.title = f.nombre;
    b.innerHTML = `<span class="mk-fondo-chip ${f.color ? '' : 'fondo-transparente'}" style="${f.color ? 'background:' + f.color : ''}"></span><span>${f.nombre}</span>`;
    b.onclick = () => { mk.fondo = id; actualizarMediakit(); };
    fondos.appendChild(b);
  });

  document.querySelectorAll('#mk-formas .mk-seg-btn').forEach((b) => {
    b.onclick = () => { mk.forma = b.dataset.forma; actualizarMediakit(); };
  });
}

function elegirVersion(id) {
  mk.version = id;
  if (!buscarVersion(id).fondos.includes(mk.fondo)) mk.fondo = 'transparente';
  actualizarMediakit();
}

function actualizarMediakit() {
  const { version, o } = opcionesActuales();
  const formato = FORMATOS[mk.formato];

  document.querySelectorAll('.mk-card').forEach((c) => c.classList.toggle('activo', c.dataset.version === mk.version));
  document.querySelectorAll('#mk-formatos .mk-seg-btn').forEach((b) => b.classList.toggle('activo', b.dataset.formato === mk.formato));
  document.querySelectorAll('#mk-formas .mk-seg-btn').forEach((b) => b.classList.toggle('activo', b.dataset.forma === mk.forma));
  document.getElementById('mk-ayuda-formato').textContent = formato.ayuda;

  // Tamaño: solo para imágenes (los vectoriales no tienen tamaño en píxeles)
  document.getElementById('mk-grupo-tamano').style.display = formato.vector ? 'none' : '';
  document.querySelectorAll('#mk-tamanos .mk-seg-btn').forEach((b) => {
    const px = medidasPx(version, mk.forma, Number(b.dataset.lado));
    b.querySelector('.mk-seg-px').textContent = `${px.ancho} × ${px.alto}`;
    b.classList.toggle('activo', Number(b.dataset.lado) === mk.lado);
  });

  // Fondos: solo los que tienen sentido para esta versión (nada de logo blanco sobre blanco)
  document.querySelectorAll('#mk-fondos .mk-fondo').forEach((b) => {
    const id = b.dataset.fondo;
    const valido = version.fondos.includes(id) && !(id === 'transparente' && mk.formato === 'jpg');
    b.style.display = valido ? '' : 'none';
    b.classList.toggle('activo', id === o.fondo);
  });

  // Vista previa: es exactamente el archivo que se va a bajar (el damero = transparente)
  const img = document.getElementById('mk-preview-img');
  img.src = svgADataURL(armarSVG(version, o.fondo, o.forma));
  img.className = FONDOS[o.fondo].color ? '' : ('fondo-transparente' + (version.claro ? ' oscuro' : ''));

  const medida = formato.vector ? 'Cualquier tamaño' : (() => { const px = medidasPx(version, o.forma, o.lado); return `${px.ancho} × ${px.alto}`; })();
  document.getElementById('mk-resumen-nombre').textContent = `${PIEZAS[version.pieza].nombre} · ${version.etiqueta}`;
  document.getElementById('mk-resumen-detalle').textContent = `${medida} · ${FONDOS[o.fondo].color ? 'Fondo ' + FONDOS[o.fondo].nombre.toLowerCase() : 'Sin fondo'}`;
  document.getElementById('mk-btn-descargar').textContent = `⬇️ Descargar ${formato.nombre}`;
}

// Mismo corte que el @media del CSS. En el celular solo se ofrece el Mediakit: el comunicado A4
// y las tarjetas no entran en una pantalla así (ver README, decisión de diseño #6).
function esCelular() { return window.matchMedia('(max-width: 820px)').matches; }

armarGaleria();
armarControles();
actualizarMediakit();
// /logos abre directo el Mediakit (Vercel sirve index.html en esa ruta, ver vercel.json)
const entroPorLogos = /\/logos\/?$/.test(location.pathname);
if (esCelular() || entroPorLogos) mostrarVista('mediakit', document.querySelector('.sidebar-btn[data-vista="mediakit"]'));
