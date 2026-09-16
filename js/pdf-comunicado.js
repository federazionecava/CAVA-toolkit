/* ============================================================
   EXPORTACIÓN DEL COMUNICADO A PDF — TEXTO REAL, NO IMAGEN
   ============================================================
   Arma el PDF a mano con jsPDF, dibujando texto de verdad (seleccionable,
   copiable, con links nativos) en vez de rasterizar el DOM con html2canvas.

   Por qué existe este archivo aparte de script.js: es un motor chico de
   "texto enriquecido a PDF" (recorre el DOM del comunicado, arma líneas con
   word-wrap, respeta negrita/cursiva/subrayado/tachado/color/resaltado,
   viñetas, alineación y paginación) — es un problema bien distinto del resto
   de la lógica de UI en script.js.

   Reglas de diseño que no son obvias mirando el código:

   - La tipografía ZT Nature se embebe en base64 en fonts-zt-nature.js (NO se
     hace fetch() a los .ttf), y el logo + la franja de bandera se embeben en
     base64 en imagenes-comunicado.js (NO se leen con canvas.toDataURL() de
     los <img> de la página). Los dos casos son el mismo problema: la app
     tiene que poder abrirse con doble clic vía file://, donde tanto fetch()
     a archivos locales como canvas.toDataURL() sobre una imagen cargada
     desde file:// fallan en Chrome (CORS y "tainted canvas" respectivamente,
     aunque el archivo esté en la misma carpeta que la página).

   - Los estilos de cada fragmento de texto (negrita, color, resaltado,
     tamaño) se leen con getComputedStyle() del nodo real en pantalla, en vez
     de andar detectando a mano combinaciones de <b>/<font size>/<span
     style>. execCommand con distintos navegadores genera markup distinto
     para el mismo resultado visual — getComputedStyle ya resuelve toda esa
     variación por nosotros.

   - El encabezado (logo + título) sale solo en la página 1, la franja de
     bandera sale al pie de TODAS las páginas, y el pie de contacto
     (dirección/whatsapp/mail/web/instagram) se dibuja siempre pegado al
     fondo de la ÚLTIMA página. Para lograr eso se reserva el mismo espacio
     inferior fijo en todas las páginas (se mide el alto del pie una sola vez
     al principio) y el cuerpo nunca puede escribir ahí — así no hace falta
     saber de antemano cuál va a ser la última página.

   - Los emojis del pie (📍📞✉️🌐📱) se descartan antes de dibujar: la fuente
     ZT Nature no trae esos glifos y jsPDF no rendriza emoji a color. Las
     etiquetas en negrita (Tel:/Email:/Web:/Instagram:) ya alcanzan sin el
     ícono.
   ============================================================ */

(function () {
  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN_L = 25.8;
  const MARGIN_R = 25.8;
  const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
  const BANDERA_H = 8.8;
  const CONTINUATION_TOP = 20;
  const BODY_LEADING = 1.6;
  const BLOCK_GAP = 2.645; // 10px de margin-bottom entre <p> del cuerpo, pasado a mm
  const LIST_INDENT = 6.5;
  const GAP_BODY_DIVISOR = 3;
  const GAP_DIVISOR_TEXT = 2.7;
  const GAP_TEXT_BANDERA = 3;
  const PT_TO_MM = 0.352778;

  function ptToMm(pt) {
    return pt * PT_TO_MM;
  }

  // ---------- Fuente embebida ----------
  let pdfListo = null;
  async function crearPdfConFuente() {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const fonts = window.ZT_NATURE_FONTS;
    pdf.addFileToVFS('ZTNature-Regular.ttf', fonts.normal);
    pdf.addFont('ZTNature-Regular.ttf', 'ZTNature', 'normal');
    pdf.addFileToVFS('ZTNature-Bold.ttf', fonts.bold);
    pdf.addFont('ZTNature-Bold.ttf', 'ZTNature', 'bold');
    pdf.addFileToVFS('ZTNature-Italic.ttf', fonts.italic);
    pdf.addFont('ZTNature-Italic.ttf', 'ZTNature', 'italic');
    pdf.addFileToVFS('ZTNature-BoldItalic.ttf', fonts.bolditalic);
    pdf.addFont('ZTNature-BoldItalic.ttf', 'ZTNature', 'bolditalic');
    pdf.setFont('ZTNature', 'normal');
    return pdf;
  }

  // ---------- Utilidades de color / texto ----------
  function parseColor(str) {
    if (!str) return [0, 0, 0];
    const m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
    const hex = str.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const n = parseInt(hex[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return [0, 0, 0];
  }

  function tieneFondoVisible(bg) {
    if (!bg) return false;
    const m = bg.match(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+))?\)/i);
    if (!m) return false;
    const alpha = m[1] === undefined ? 1 : parseFloat(m[1]);
    return alpha > 0;
  }

  const EMOJI_RE = /\p{Extended_Pictographic}|️|‍/gu;
  function limpiarTexto(text) {
    return text.replace(EMOJI_RE, '');
  }

  // ---------- DOM del comunicado -> bloques de texto enriquecido ----------
  function estiloDesdeNodo(el) {
    const cs = getComputedStyle(el);
    const a = el.closest('a[href]');
    return {
      bold: parseInt(cs.fontWeight, 10) >= 600,
      italic: cs.fontStyle === 'italic',
      underline: cs.textDecorationLine.includes('underline'),
      strike: cs.textDecorationLine.includes('line-through'),
      color: cs.color,
      highlight: tieneFondoVisible(cs.backgroundColor) ? cs.backgroundColor : null,
      fontSizePt: parseFloat(cs.fontSize) * 0.75,
      href: a ? a.href : null,
    };
  }

  function recolectarRuns(root) {
    const runs = [];
    function visitar(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = limpiarTexto(node.nodeValue || '');
        if (text) runs.push(Object.assign({ text }, estiloDesdeNodo(node.parentElement)));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === 'BR') {
        runs.push({ break: true });
        return;
      }
      Array.from(node.childNodes).forEach(visitar);
    }
    Array.from(root.childNodes).forEach(visitar);
    return runs;
  }

  function normalizarAlign(a) {
    return a === 'center' || a === 'right' ? a : 'left';
  }

  function domACuerpoBloques(cuerpo) {
    const bloques = [];
    function agregarBloque(node, extra) {
      extra = extra || {};
      const align = normalizarAlign(getComputedStyle(node).textAlign);
      bloques.push({
        align,
        listType: extra.listType || null,
        listIndex: extra.listIndex || null,
        runs: recolectarRuns(node),
      });
    }
    Array.from(cuerpo.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = limpiarTexto(node.nodeValue || '');
        if (text.trim()) {
          bloques.push({ align: 'left', listType: null, runs: [Object.assign({ text }, estiloDesdeNodo(cuerpo))] });
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === 'BR') {
        bloques.push({ align: 'left', listType: null, runs: [] });
        return;
      }
      if (node.tagName === 'UL' || node.tagName === 'OL') {
        let idx = 1;
        Array.from(node.children).forEach((li) => {
          if (li.tagName !== 'LI') return;
          agregarBloque(li, { listType: node.tagName === 'OL' ? 'ol' : 'ul', listIndex: idx });
          idx++;
        });
        return;
      }
      agregarBloque(node);
    });
    return bloques;
  }

  function footerABloques(el) {
    const runs = recolectarRuns(el);
    const lineas = [[]];
    runs.forEach((r) => {
      if (r.break) lineas.push([]);
      else lineas[lineas.length - 1].push(r);
    });
    return lineas.filter((l) => l.length).map((runs) => ({ align: 'center', listType: null, runs }));
  }

  // ---------- Bloques -> palabras (para el word-wrap) ----------
  function palabrasDeRuns(runs) {
    const palabras = [];
    runs.forEach((run) => {
      if (run.break) {
        palabras.push({ break: true });
        return;
      }
      const estilo = Object.assign({}, run);
      delete estilo.text;
      const partes = run.text.split(' ');
      partes.forEach((w, i) => {
        const esUltima = i === partes.length - 1;
        if (w === '') {
          if (palabras.length) palabras[palabras.length - 1].spaceAfter = true;
          return;
        }
        palabras.push(Object.assign({}, estilo, { text: w, spaceAfter: !esUltima }));
      });
    });
    return palabras;
  }

  function estiloFuente(word) {
    if (word.bold && word.italic) return 'bolditalic';
    if (word.bold) return 'bold';
    if (word.italic) return 'italic';
    return 'normal';
  }

  function aplicarFuente(pdf, word) {
    pdf.setFont('ZTNature', estiloFuente(word));
    pdf.setFontSize(word.fontSizePt || 12);
    const [r, g, b] = parseColor(word.color);
    pdf.setTextColor(r, g, b);
  }

  function anchoPalabra(pdf, word) {
    aplicarFuente(pdf, word);
    let w = pdf.getTextWidth(word.text);
    if (word.spaceAfter) w += pdf.getTextWidth(' ');
    return w;
  }

  // ---------- Dibujo de una línea ya armada ----------
  function dibujarLinea(pdf, palabras, ctx, align, indent, altura, marcador) {
    let total = 0;
    palabras.forEach((w) => {
      aplicarFuente(pdf, w);
      total += pdf.getTextWidth(w.text);
    });

    let inicioX = ctx.x + indent;
    if (align === 'center') inicioX = ctx.x + indent + (ctx.width - indent - total) / 2;
    else if (align === 'right') inicioX = ctx.x + ctx.width - total;

    if (marcador && marcador.listType) {
      const fs = (palabras[0] && palabras[0].fontSizePt) || 12;
      pdf.setFont('ZTNature', 'normal');
      pdf.setFontSize(fs);
      pdf.setTextColor(0, 0, 0);
      const texto = marcador.listType === 'ol' ? marcador.listIndex + '.' : '•';
      const anchoMarcador = pdf.getTextWidth(texto);
      pdf.text(texto, ctx.x + indent - anchoMarcador - 2, ctx.y + ptToMm(fs) * 0.8);
    }

    let cursorX = inicioX;
    palabras.forEach((w) => {
      aplicarFuente(pdf, w);
      const fs = w.fontSizePt || 12;
      const baseline = ctx.y + ptToMm(fs) * 0.8;
      const anchoTexto = pdf.getTextWidth(w.text);
      const anchoConEspacio = anchoTexto + (w.spaceAfter ? pdf.getTextWidth(' ') : 0);

      if (w.highlight) {
        const [hr, hg, hb] = parseColor(w.highlight);
        pdf.setFillColor(hr, hg, hb);
        pdf.rect(cursorX, ctx.y + altura * 0.08, anchoTexto, ptToMm(fs) * 1.1, 'F');
        aplicarFuente(pdf, w);
      }

      pdf.text(w.text, cursorX, baseline);

      if (w.underline || w.strike) {
        const [dr, dg, db] = parseColor(w.color);
        pdf.setDrawColor(dr, dg, db);
        pdf.setLineWidth(0.15);
        if (w.underline) pdf.line(cursorX, baseline + 0.6, cursorX + anchoTexto, baseline + 0.6);
        if (w.strike) pdf.line(cursorX, baseline - ptToMm(fs) * 0.32, cursorX + anchoTexto, baseline - ptToMm(fs) * 0.32);
      }

      if (w.href) {
        pdf.link(cursorX, ctx.y, anchoConEspacio, altura, { url: w.href });
      }

      cursorX += anchoConEspacio;
    });
  }

  function asegurarEspacio(pdf, ctx, altura) {
    if (ctx.y + altura > ctx.limiteInferior) {
      pdf.addPage();
      ctx.y = CONTINUATION_TOP;
    }
  }

  // ---------- Layout de un bloque (con word-wrap y salto de página) ----------
  function layoutBloque(pdf, bloque, ctx) {
    const indent = bloque.listType ? LIST_INDENT : 0;
    const anchoDisponible = ctx.width - indent;
    const palabras = bloque.runs.length
      ? palabrasDeRuns(bloque.runs)
      : [{ text: '', spaceAfter: false, fontSizePt: 12, color: 'rgb(0,0,0)' }];

    let lineaActual = [];
    let anchoLinea = 0;
    let primeraLinea = true;

    function alturaLinea() {
      const tamanos = lineaActual.filter((w) => !w.break).map((w) => w.fontSizePt || 12);
      const max = tamanos.length ? Math.max.apply(null, tamanos) : 12;
      return ptToMm(max) * BODY_LEADING;
    }

    function flush() {
      const altura = alturaLinea();
      if (ctx.draw !== false) {
        asegurarEspacio(pdf, ctx, altura);
        if (lineaActual.length) {
          dibujarLinea(pdf, lineaActual, ctx, bloque.align, indent, altura, primeraLinea ? bloque : null);
        }
      }
      ctx.y += altura;
      primeraLinea = false;
      lineaActual = [];
      anchoLinea = 0;
    }

    palabras.forEach((w) => {
      if (w.break) {
        flush();
        return;
      }
      const ancho = anchoPalabra(pdf, w);
      if (lineaActual.length && anchoLinea + ancho > anchoDisponible) flush();
      lineaActual.push(w);
      anchoLinea += ancho;
    });
    if (lineaActual.length || primeraLinea) flush();
  }

  function medirAltura(pdf, bloques, ancho) {
    const ctx = { x: MARGIN_L, y: 0, width: ancho, limiteInferior: Infinity, draw: false };
    bloques.forEach((b) => layoutBloque(pdf, b, ctx));
    return ctx.y;
  }

  // ---------- Encabezado (solo página 1) ----------
  // El logo y la franja de bandera van pre-rasterizados y embebidos en base64 en
  // imagenes-comunicado.js (ver ese archivo para el porqué: Chrome tainea el canvas
  // al leer imágenes cargadas desde file://, así que no se puede usar
  // canvas.toDataURL() en tiempo de ejecución sobre los <img> de la página).
  function dibujarEncabezado(pdf) {
    const logoData = window.PDF_IMAGENES.logo;
    const logoW = 32.2;
    const logoH = 23.3;
    const logoX = (PAGE_W - logoW) / 2;
    let y = 8.8;
    pdf.addImage(logoData, 'PNG', logoX, y, logoW, logoH);
    y += logoH + 2;

    pdf.setFont('ZTNature', 'bold');
    pdf.setFontSize(19.5);
    pdf.setTextColor(0, 0, 0);
    pdf.text('Federazione CAVA', PAGE_W / 2, y + ptToMm(19.5) * 0.78, { align: 'center' });
    y += ptToMm(19.5) * 1.3 + 1;

    pdf.setFont('ZTNature', 'normal');
    pdf.setFontSize(14.25);
    pdf.text("Comitato delle Associazioni Venete dell'Argentina", PAGE_W / 2, y + ptToMm(14.25) * 0.78, { align: 'center' });
    y += ptToMm(14.25) * 1.3 + 6;

    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN_L, y, PAGE_W - MARGIN_R, y);
    y += 8;
    return y;
  }

  // ---------- Pie de página + franja de bandera ----------
  function dibujarPiePagina(pdf, bloques, divisorY) {
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN_L, divisorY, PAGE_W - MARGIN_R, divisorY);
    const ctx = { x: MARGIN_L, y: divisorY + GAP_DIVISOR_TEXT, width: CONTENT_W, limiteInferior: Infinity, draw: true };
    bloques.forEach((b) => layoutBloque(pdf, b, ctx));
  }

  function dibujarBanderaEnTodasLasPaginas(pdf, totalPaginas) {
    const banderaData = window.PDF_IMAGENES.bandera;
    for (let p = 1; p <= totalPaginas; p++) {
      pdf.setPage(p);
      pdf.addImage(banderaData, 'PNG', 0, PAGE_H - BANDERA_H, PAGE_W, BANDERA_H);
    }
  }

  // ---------- Orquestación ----------
  window.descargarComunicadoPDF = async function descargarComunicadoPDF() {
    const boton = document.activeElement;
    const textoOriginal = boton && boton.tagName === 'BUTTON' ? boton.textContent : null;
    if (boton && boton.tagName === 'BUTTON') {
      boton.disabled = true;
      boton.textContent = 'Generando...';
    }
    try {
      const pdf = await crearPdfConFuente();

      const cuerpoEl = document.querySelector('#documento-a4 .cuerpo');
      const footerEl = document.querySelector('#documento-a4 .footer .footer-texto');
      const bloquesCuerpo = domACuerpoBloques(cuerpoEl);
      const bloquesFooter = footerABloques(footerEl);

      const alturaFooter = medirAltura(pdf, bloquesFooter, CONTENT_W);
      const reservadoInferior = BANDERA_H + alturaFooter + GAP_DIVISOR_TEXT + GAP_TEXT_BANDERA;
      const divisorY = PAGE_H - reservadoInferior;
      const limiteInferior = divisorY - GAP_BODY_DIVISOR;

      const yInicial = dibujarEncabezado(pdf);

      const ctx = { x: MARGIN_L, y: yInicial, width: CONTENT_W, limiteInferior, draw: true };
      bloquesCuerpo.forEach((bloque, i) => {
        layoutBloque(pdf, bloque, ctx);
        if (i < bloquesCuerpo.length - 1) ctx.y += BLOCK_GAP;
      });

      dibujarPiePagina(pdf, bloquesFooter, divisorY);

      const totalPaginas = pdf.internal.getNumberOfPages();
      dibujarBanderaEnTodasLasPaginas(pdf, totalPaginas);

      pdf.save('comunicado-cava.pdf');
    } catch (err) {
      console.error('Error al generar el PDF del comunicado:', err);
      alert('No se pudo generar el PDF. Probá de nuevo.');
    } finally {
      if (boton && boton.tagName === 'BUTTON') {
        boton.disabled = false;
        boton.textContent = textoOriginal;
      }
    }
  };
})();
