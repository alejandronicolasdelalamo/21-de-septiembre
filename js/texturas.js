/**
 * Texturas dibujadas en <canvas> en tiempo de ejecución: no hay ninguna
 * imagen decorativa que descargar, solo las fotos.
 */

const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5));
const FUENTE_PIE = 'Fraunces, Georgia, "Times New Roman", serif';

function lienzo(ancho, alto = ancho) {
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  return c;
}

/** Halo radial blanco para resplandores y nebulosas (se tiñe con el material). */
export function dibujarBrillo(px = 128) {
  const c = lienzo(px);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.3, 'rgba(255, 255, 255, 0.35)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  return c;
}

/** Un girasol visto de frente: dos coronas de pétalos y el disco de pipas. */
export function dibujarGirasol(px = 256) {
  const c = lienzo(px);
  const ctx = c.getContext('2d');
  const u = px / 256;
  ctx.translate(px / 2, px / 2);

  const coronas = [
    { n: 17, largo: 120, ancho: 21, base: '#e58a00', punta: '#ffc21f', giro: Math.PI / 17 },
    { n: 17, largo: 110, ancho: 23, base: '#ffab00', punta: '#ffe45c', giro: 0 },
  ];
  for (const { n, largo, ancho, base, punta, giro } of coronas) {
    const color = ctx.createLinearGradient(0, -34 * u, 0, -largo * u);
    color.addColorStop(0, base);
    color.addColorStop(1, punta);
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.rotate((i / n) * Math.PI * 2 + giro);
      ctx.beginPath();
      ctx.moveTo(0, -30 * u);
      ctx.quadraticCurveTo(ancho * u, -largo * 0.55 * u, 0, -largo * u);
      ctx.quadraticCurveTo(-ancho * u, -largo * 0.55 * u, 0, -30 * u);
      ctx.fill();
      ctx.restore();
    }
  }

  const disco = ctx.createRadialGradient(0, 0, 0, 0, 0, 42 * u);
  disco.addColorStop(0, '#4a2508');
  disco.addColorStop(0.7, '#6e3a10');
  disco.addColorStop(1, '#3b1d07');
  ctx.fillStyle = disco;
  ctx.beginPath();
  ctx.arc(0, 0, 42 * u, 0, Math.PI * 2);
  ctx.fill();

  // Pipas con la misma filotaxis que la galaxia.
  ctx.fillStyle = 'rgba(255, 196, 96, 0.55)';
  for (let i = 1; i < 150; i++) {
    const r = 39 * u * Math.sqrt(i / 150);
    const a = i * ANGULO_AUREO;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, (0.9 + (i / 150) * 0.9) * u, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

/** Parte un texto en líneas que quepan en `anchoMax`. */
function partirEnLineas(ctx, texto, anchoMax) {
  const lineas = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && ctx.measureText(prueba).width > anchoMax) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Proporciones de la polaroid, en unidades de un lienzo de 512 px de ancho. */
export const POLAROID = Object.freeze({ ancho: 512, alto: 640, margen: 20 });

/**
 * Dibuja una foto con marco de polaroid y el pie escrito debajo.
 * @param {HTMLImageElement} imagen
 * @param {string} pie
 * @param {number} ancho  resolución horizontal del lienzo
 */
export function dibujarPolaroid(imagen, pie, ancho = 1024) {
  const u = ancho / POLAROID.ancho;
  const c = lienzo(ancho, POLAROID.alto * u);
  const ctx = c.getContext('2d');
  const m = POLAROID.margen * u; // margen transparente: suaviza el borde y aloja la sombra
  const papelAncho = c.width - m * 2;
  const papelAlto = c.height - m * 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 14 * u;
  ctx.shadowOffsetY = 4 * u;
  const papel = ctx.createLinearGradient(0, m, 0, m + papelAlto);
  papel.addColorStop(0, '#fdf8ee');
  papel.addColorStop(1, '#f0e5d0');
  ctx.fillStyle = papel;
  ctx.beginPath();
  ctx.roundRect(m, m, papelAncho, papelAlto, 8 * u);
  ctx.fill();
  ctx.restore();

  // Foto cuadrada, recortada al centro si la original no lo es.
  const borde = 26 * u;
  const lado = papelAncho - borde * 2;
  const fx = m + borde;
  const fy = m + borde;
  const origen = Math.min(imagen.naturalWidth, imagen.naturalHeight);
  ctx.drawImage(
    imagen,
    (imagen.naturalWidth - origen) / 2,
    (imagen.naturalHeight - origen) / 2,
    origen,
    origen,
    fx,
    fy,
    lado,
    lado,
  );
  ctx.strokeStyle = 'rgba(58, 36, 18, 0.22)';
  ctx.lineWidth = Math.max(1, u);
  ctx.strokeRect(fx, fy, lado, lado);

  // Pie: como mucho dos líneas; si no cabe, se reduce el cuerpo de letra.
  const zonaY = fy + lado;
  const zonaAlto = m + papelAlto - zonaY;
  ctx.fillStyle = '#3a2412';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let cuerpo = 30 * u;
  let lineas = [];
  for (let intento = 0; intento < 4; intento++) {
    ctx.font = `italic 500 ${cuerpo}px ${FUENTE_PIE}`;
    lineas = partirEnLineas(ctx, pie, lado);
    if (lineas.length <= 2) break;
    cuerpo *= 0.88;
  }
  if (lineas.length > 2) {
    lineas = [lineas[0], `${lineas[1]}…`];
  }
  const interlinea = cuerpo * 1.25;
  const inicioY = zonaY + zonaAlto / 2 - ((lineas.length - 1) * interlinea) / 2;
  lineas.forEach((linea, i) => ctx.fillText(linea, c.width / 2, inicioY + i * interlinea));

  return c;
}
