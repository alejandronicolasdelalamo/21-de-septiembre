/**
 * Punto de entrada. Lee los recuerdos del HTML, arranca la escena 3D y lleva
 * la interfaz: el visor de fotos, el teclado y la vuelta a la galería si
 * WebGL no está disponible.
 */
import { Universo } from './universo.js';
import { esTactil } from './util.js';

const raiz = document.documentElement;
const $ = (id) => document.getElementById(id);

const ui = {
  titulo: $('titulo'),
  pista: $('pista'),
  verRecuerdos: $('verRecuerdos'),
  visor: $('visor'),
  cuenta: $('cuenta'),
  anuncio: $('anuncio'),
};

/** Los recuerdos se definen una sola vez, en el HTML. */
const recuerdos = [...document.querySelectorAll('#recuerdos .recuerdo')].map((figura) => {
  const imagen = figura.querySelector('img');
  return {
    src: imagen.getAttribute('src'),
    alt: imagen.alt,
    texto: figura.querySelector('figcaption').textContent.trim(),
  };
});

let universo = null;
let orden = []; // índices de las fotos disponibles en la escena
let actual = -1; // posición dentro de `orden`, -1 si no hay foto ampliada

/** Envuelve cada letra del título para animarlas por separado. */
function prepararTitulo() {
  const texto = ui.titulo.textContent;
  ui.titulo.setAttribute('aria-label', texto);
  ui.titulo.replaceChildren(
    ...[...texto].map((caracter, i) => {
      const letra = document.createElement('span');
      letra.className = 'titulo__letra';
      letra.setAttribute('aria-hidden', 'true');
      letra.style.setProperty('--i', String(i));
      letra.textContent = caracter;
      return letra;
    }),
  );
}

// -------------------------------------------------------------------- visor

function abrir(posicion) {
  if (!orden.length) return;
  const eraNuevo = actual < 0;
  actual = (posicion + orden.length) % orden.length;
  const recuerdo = recuerdos[orden[actual]];

  universo.enfocar(orden[actual]);
  raiz.classList.add('viendo');
  ui.visor.hidden = false;
  ui.cuenta.textContent = `${actual + 1} de ${orden.length}`;
  ui.anuncio.textContent = `Recuerdo ${actual + 1} de ${orden.length}. ${recuerdo.alt}. ${recuerdo.texto}`;
  if (eraNuevo) ui.visor.focus({ preventScroll: true });
}

function cerrar() {
  if (actual < 0) return;
  actual = -1;
  universo.soltar();
  raiz.classList.remove('viendo');
  ui.visor.hidden = true;
  ui.anuncio.textContent = '';
  ui.verRecuerdos.focus({ preventScroll: true });
}

const mover = (paso) => abrir(actual + paso);

function alTeclear(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const viendo = actual >= 0;
  switch (e.key) {
    case 'Escape':
      if (viendo) cerrar();
      break;
    case 'ArrowRight':
      viendo ? mover(1) : universo.empujar(-0.25, 1);
      break;
    case 'ArrowLeft':
      viendo ? mover(-1) : universo.empujar(0.25, 1);
      break;
    case '+':
    case '=':
      universo.empujar(0, 0.85);
      break;
    case '-':
      universo.empujar(0, 1.18);
      break;
    default:
      return;
  }
  e.preventDefault();
}

// ------------------------------------------------------------------ arranque

function volverAGaleria(motivo) {
  console.warn(`[universo] se muestra la galería: ${motivo}`);
  universo?.detener();
  raiz.classList.remove('con-universo', 'viendo');
  raiz.classList.add('sin-webgl');
  ui.visor.hidden = true;
}

/** Comprueba WebGL en un lienzo desechable, sin ensuciar la consola. */
function hayWebGL() {
  try {
    const prueba = document.createElement('canvas');
    return Boolean(prueba.getContext('webgl2') || prueba.getContext('webgl'));
  } catch {
    return false;
  }
}

async function arrancar() {
  if (!hayWebGL()) {
    volverAGaleria('WebGL no disponible');
    return;
  }
  try {
    universo = new Universo($('universo'), {
      alTocarRecuerdo: (indice) => abrir(orden.indexOf(indice)),
      alTocarVacio: cerrar,
      alDeslizar: mover,
      alInteractuar: () => ui.pista.classList.add('oculta'),
      alPerderContexto: () => volverAGaleria('se perdió el contexto WebGL'),
    });
  } catch (error) {
    volverAGaleria(`no se pudo crear la escena (${error.message})`);
    return;
  }

  prepararTitulo();
  raiz.classList.add('con-universo');
  ui.pista.textContent = esTactil
    ? 'Desliza para girar y toca una foto'
    : 'Arrastra para girar y pulsa una foto';

  await universo.cargar(recuerdos);
  orden = universo.disponibles;
  ui.verRecuerdos.hidden = orden.length === 0;

  ui.verRecuerdos.addEventListener('click', () => abrir(0));
  $('anterior').addEventListener('click', () => mover(-1));
  $('siguiente').addEventListener('click', () => mover(1));
  $('cerrar').addEventListener('click', cerrar);
  window.addEventListener('keydown', alTeclear);

  raiz.classList.add('listo');
  universo.comenzar();
}

arrancar().catch((error) => {
  console.error(error);
  volverAGaleria('error inesperado al arrancar');
});
