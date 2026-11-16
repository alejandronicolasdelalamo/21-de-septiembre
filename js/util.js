/** Utilidades compartidas. Sin dependencias ni estado global. */

export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/** Factor de suavizado independiente de los fotogramas por segundo. */
export const amortiguar = (rapidez, dt) => 1 - Math.exp(-rapidez * dt);

/**
 * Generador pseudoaleatorio determinista (mulberry32): la misma semilla da
 * siempre el mismo universo.
 * @param {number} semilla
 * @returns {() => number} valores en [0, 1)
 */
export function crearRng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Consulta viva de la preferencia «reducir movimiento». */
export const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)');

/** `true` en pantallas táctiles, donde conviene aligerar la escena. */
export const esTactil = window.matchMedia('(pointer: coarse)').matches;
