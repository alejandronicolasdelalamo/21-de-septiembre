/**
 * La galaxia-girasol: decenas de miles de estrellas colocadas como un girasol.
 *
 *  - El disco central sigue la filotaxis real de las pipas: la semilla n se
 *    coloca a un radio proporcional a √n y girada n veces el ángulo áureo
 *    (≈137,5°), el mismo patrón que produce las espirales de un girasol.
 *  - Alrededor hay 21 pétalos en dos capas: 21 por el 21 de septiembre, y
 *    porque es un número de Fibonacci, como los pétalos de los girasoles.
 *  - Más allá, cinco brazos de polvo estelar que se disuelven en violeta.
 *
 * Cada estrella conoce su posición final y una posición inicial dispersa;
 * el sombreador de vértices interpola entre ambas durante la entrada.
 */
import * as THREE from 'three';
import { crearRng, lerp } from './util.js';

const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5));
export const PETALOS = 21;
export const RADIO_DISCO = 4.6;

const VERTICES = /* glsl */ `
  uniform float uTiempo;
  uniform float uProgreso;
  uniform float uEscala;
  uniform float uGiro;
  uniform float uTamMax;
  attribute vec3 aInicio;
  attribute vec3 aColor;
  attribute float aTam;
  attribute float aFase;
  attribute float aGiro;
  varying vec3 vColor;

  mat2 rotar(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
  }

  void main() {
    // Cada estrella llega con un pequeño retraso propio.
    float p = clamp((uProgreso - aFase * 0.3) / 0.7, 0.0, 1.0);
    p = 1.0 - pow(1.0 - p, 3.0);

    vec3 destino = position;
    destino.xz = rotar(uTiempo * uGiro * aGiro) * destino.xz;
    vec3 inicio = aInicio;
    inicio.xz = rotar((1.0 - p) * 2.6) * inicio.xz;
    vec3 pos = mix(inicio, destino, p);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float centelleo = 0.78 + 0.22 * sin(uTiempo * 1.7 + aFase * 40.0);
    // El tope evita manchas enormes cuando la cámara atraviesa los brazos.
    gl_PointSize = clamp(aTam * uEscala * centelleo / -mv.z, 1.0, uTamMax);
    gl_Position = projectionMatrix * mv;
    vColor = aColor * mix(0.35, 1.0, p);
  }
`;

const FRAGMENTOS = /* glsl */ `
  uniform float uBrillo;
  varying vec3 vColor;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * uBrillo, a * a);
  }
`;

/**
 * @param {{densidad?: number, semilla?: number}} opciones
 * @returns {THREE.Points}
 */
export function crearGalaxia({ densidad = 1, semilla = 21092025 } = {}) {
  const rng = crearRng(semilla);
  const posiciones = [];
  const inicios = [];
  const colores = [];
  const tamanos = [];
  const fases = [];
  const giros = [];
  const color = new THREE.Color();

  const anadir = (x, y, z, tam, giro) => {
    posiciones.push(x, y, z);
    // Punto de partida: disperso en una cáscara alrededor de la escena.
    const r = 45 + rng() * 85;
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    inicios.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) * 0.6, r * Math.sin(phi) * Math.sin(theta));
    colores.push(color.r, color.g, color.b);
    tamanos.push(tam);
    fases.push(rng());
    giros.push(giro);
  };

  const NUCLEO = new THREE.Color('#fff3c4');
  const AMBAR = new THREE.Color('#ffab2e');
  const TOSTADO = new THREE.Color('#b5490a');
  const NARANJA = new THREE.Color('#ff9a1f');
  const AMARILLO = new THREE.Color('#ffd43b');
  const PUNTA = new THREE.Color('#fff2b0');
  const ORO = new THREE.Color('#ffcf70');
  const VIOLETA = new THREE.Color('#8a6cff');
  const ROSA = new THREE.Color('#ff7ac8');

  // --- Disco de pipas: filotaxis de Vogel --------------------------------
  const pipas = Math.round(2400 * densidad);
  for (let n = 0; n < pipas; n++) {
    const f = n / pipas;
    const r = RADIO_DISCO * Math.sqrt(f);
    const a = n * ANGULO_AUREO;
    if (f < 0.12) color.lerpColors(NUCLEO, AMBAR, f / 0.12);
    else color.lerpColors(AMBAR, TOSTADO, (f - 0.12) / 0.88);
    color.multiplyScalar(0.6);
    anadir(Math.cos(a) * r, 0.55 * (1 - f), Math.sin(a) * r, 0.17 + 0.13 * f, 1);
  }

  // --- Pétalos: dos capas de 21, la trasera más corta y oscura -----------
  const porPetalo = Math.round(270 * densidad);
  for (let capa = 0; capa < 2; capa++) {
    const largo = capa ? 4.3 : 5.6;
    const ancho = capa ? 0.8 : 0.95;
    const desfase = capa ? Math.PI / PETALOS : 0;
    for (let j = 0; j < PETALOS; j++) {
      const angulo = (j / PETALOS) * Math.PI * 2 + desfase;
      const cos = Math.cos(angulo);
      const sen = Math.sin(angulo);
      for (let i = 0; i < porPetalo; i++) {
        const s = Math.pow(rng(), 0.85);
        const enBorde = rng() < 0.3;
        const v = enBorde ? (rng() < 0.5 ? -1 : 1) * (0.93 + rng() * 0.07) : rng() * 2 - 1;
        const semiancho = ancho * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.72)), 0.85);
        const radial = RADIO_DISCO * 0.96 + s * largo;
        const lateral = v * semiancho;
        const y = (capa ? -0.35 : 0) + 0.5 * Math.sin(Math.PI * s) - 1.1 * s * s + (rng() - 0.5) * 0.08;
        if (s < 0.5) color.lerpColors(NARANJA, AMARILLO, s * 2);
        else color.lerpColors(AMARILLO, PUNTA, (s - 0.5) * 2);
        color.multiplyScalar((capa ? 0.5 : 0.72) * (enBorde ? 1.25 : 1));
        anadir(
          cos * radial - sen * lateral,
          y,
          sen * radial + cos * lateral,
          enBorde ? 0.2 : 0.15 + rng() * 0.1,
          1,
        );
      }
    }
  }

  // --- Brazos espirales de polvo estelar ---------------------------------
  const polvo = Math.round(7000 * densidad);
  for (let i = 0; i < polvo; i++) {
    const f = Math.pow(rng(), 0.75);
    const r = 11.5 + f * 27;
    const angulo = ((i % 5) / 5) * Math.PI * 2 + Math.log(r / 11.5) * 2.4;
    const dispersion = () => (rng() + rng() + rng() - 1.5) * r * 0.1;
    if (rng() < 0.16) color.copy(ROSA);
    else color.lerpColors(ORO, VIOLETA, Math.min(1, f * 1.6));
    color.multiplyScalar(lerp(0.8, 0.4, f));
    anadir(
      Math.cos(angulo) * r + dispersion(),
      (rng() - 0.5) * (1.2 + f * 3.5) * rng(),
      Math.sin(angulo) * r + dispersion(),
      0.1 + rng() * 0.15,
      0.6,
    );
  }

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geometria.setAttribute('aInicio', new THREE.Float32BufferAttribute(inicios, 3));
  geometria.setAttribute('aColor', new THREE.Float32BufferAttribute(colores, 3));
  geometria.setAttribute('aTam', new THREE.Float32BufferAttribute(tamanos, 1));
  geometria.setAttribute('aFase', new THREE.Float32BufferAttribute(fases, 1));
  geometria.setAttribute('aGiro', new THREE.Float32BufferAttribute(giros, 1));
  // Las estrellas se mueven en el sombreador: la esfera envolvente calculada
  // con las posiciones finales no sirve para descartar por visibilidad.
  geometria.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 140);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTiempo: { value: 0 },
      uProgreso: { value: 0 },
      uEscala: { value: 1 },
      uGiro: { value: 0.03 },
      uTamMax: { value: 24 },
      uBrillo: { value: 1 },
    },
    vertexShader: VERTICES,
    fragmentShader: FRAGMENTOS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometria, material);
}

/**
 * Fondo de estrellas lejanas con un centelleo suave.
 * @param {{cantidad?: number, semilla?: number}} opciones
 * @returns {THREE.Points}
 */
export function crearEstrellas({ cantidad = 3500, semilla = 2109 } = {}) {
  const rng = crearRng(semilla);
  const posiciones = new Float32Array(cantidad * 3);
  const colores = new Float32Array(cantidad * 3);
  const datos = new Float32Array(cantidad * 2); // tamaño, fase
  const tintes = [new THREE.Color('#ffffff'), new THREE.Color('#cfd8ff'), new THREE.Color('#ffe9b8')];
  for (let i = 0; i < cantidad; i++) {
    const r = 130 + rng() * 280;
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    posiciones.set([r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)], i * 3);
    const tinte = tintes[Math.floor(rng() * tintes.length)];
    const brillo = 0.35 + rng() * 0.65;
    colores.set([tinte.r * brillo, tinte.g * brillo, tinte.b * brillo], i * 3);
    datos.set([0.5 + rng() * 1.1, rng() * Math.PI * 2], i * 2);
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  geometria.setAttribute('aColor', new THREE.BufferAttribute(colores, 3));
  geometria.setAttribute('aDatos', new THREE.BufferAttribute(datos, 2));

  const material = new THREE.ShaderMaterial({
    uniforms: { uTiempo: { value: 0 }, uEscala: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTiempo;
      uniform float uEscala;
      attribute vec3 aColor;
      attribute vec2 aDatos;
      varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aDatos.x * uEscala / -mv.z);
        gl_Position = projectionMatrix * mv;
        vColor = aColor * (0.6 + 0.4 * sin(uTiempo * 1.3 + aDatos.y));
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometria, material);
}
