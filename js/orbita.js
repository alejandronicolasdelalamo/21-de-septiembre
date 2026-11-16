/**
 * Cámara orbital con amortiguación, sin dependencias.
 *
 * La cámara se describe en coordenadas esféricas alrededor de un centro
 * (azimut, ángulo polar y radio). Los gestos solo cambian los valores
 * objetivo; en cada fotograma los valores reales se acercan a ellos, de modo
 * que orbitar, hacer zoom y volar hasta una foto comparten el mismo
 * movimiento continuo y nunca hay saltos.
 */
import * as THREE from 'three';
import { amortiguar, clamp } from './util.js';

const UMBRAL_TOQUE = 7; // px que puede moverse el dedo y seguir siendo un toque
const UMBRAL_DESLIZ = 55;
const PAUSA_AUTOGIRO = 5; // s sin tocar antes de que la escena vuelva a girar sola

export class Orbita {
  /**
   * @param {THREE.PerspectiveCamera} camara
   * @param {HTMLElement} dom elemento que recibe los gestos
   * @param {{alTocar?: (x: number, y: number) => void, alDeslizar?: (sentido: 1 | -1) => void, alInteractuar?: () => void}} avisos
   */
  constructor(camara, dom, { alTocar = () => {}, alDeslizar = () => {}, alInteractuar = () => {} } = {}) {
    this.camara = camara;
    this.dom = dom;
    this.alTocar = alTocar;
    this.alDeslizar = alDeslizar;
    this.alInteractuar = alInteractuar;

    this.az = 0;
    this.pol = 1.0;
    this.radio = 36;
    this.objetivo = { az: 0, pol: 1.0, radio: 36 };
    this.centro = new THREE.Vector3();
    this.centroObjetivo = new THREE.Vector3();
    this.limites = { radioMin: 13, radioMax: 95, polMin: 0.3, polMax: 2.3 };

    this.enfocada = false;
    this.instantanea = false; // con movimiento reducido no hay transiciones
    this.haInteractuado = false;
    this._guardado = null;
    this._punteros = new Map();
    this._gesto = null;
    this._pellizco = 0;
    this._reposo = PAUSA_AUTOGIRO;

    dom.addEventListener('pointerdown', (e) => this._abajo(e));
    dom.addEventListener('pointermove', (e) => this._mover(e));
    dom.addEventListener('pointerup', (e) => this._arriba(e));
    dom.addEventListener('pointercancel', (e) => this._punteros.delete(e.pointerId));
    dom.addEventListener('wheel', (e) => this._rueda(e), { passive: false });
  }

  /** Gira (rad) y acerca (factor) desde fuera: lo usa el teclado. */
  empujar(deltaAz, factorRadio = 1) {
    if (this.enfocada) return;
    this._marcarInteraccion();
    this.objetivo.az += deltaAz;
    this._fijarRadio(this.objetivo.radio * factorRadio);
  }

  /** Vuela hasta colocarse frente a `punto`, a `distancia` de él. */
  enfocar(punto, distancia) {
    if (!this.enfocada) this._guardado = { pol: this.objetivo.pol, radio: this.objetivo.radio };
    this.enfocada = true;
    this.centroObjetivo.copy(punto);
    this.objetivo.radio = distancia;
    this.objetivo.pol = 1.5;
    // Azimut que deja la cámara por fuera, mirando hacia el centro, tomando
    // el camino angular más corto desde donde está ahora.
    const destino = Math.atan2(punto.x, punto.z);
    const delta = THREE.MathUtils.euclideanModulo(destino - this.az + Math.PI, Math.PI * 2) - Math.PI;
    this.objetivo.az = this.az + delta;
  }

  /** Vuelve a la órbita general desde donde esté. */
  soltar() {
    if (!this.enfocada) return;
    this.enfocada = false;
    this.centroObjetivo.set(0, 0, 0);
    if (this._guardado) {
      this.objetivo.pol = this._guardado.pol;
      this.objetivo.radio = this._guardado.radio;
    }
    this._reposo = 0;
  }

  /** Coloca la cámara de golpe, sin transición. */
  saltar() {
    this.az = this.objetivo.az;
    this.pol = this.objetivo.pol;
    this.radio = this.objetivo.radio;
    this.centro.copy(this.centroObjetivo);
    this._colocar();
  }

  actualizar(dt) {
    this._reposo += dt;
    const arrastrando = this._punteros.size > 0;
    if (!this.enfocada && !arrastrando && !this.instantanea && this._reposo > PAUSA_AUTOGIRO) {
      this.objetivo.az += dt * 0.045;
    }
    const k = this.instantanea ? 1 : amortiguar(this.enfocada ? 3.2 : 5.5, dt);
    this.az += (this.objetivo.az - this.az) * k;
    this.pol += (this.objetivo.pol - this.pol) * k;
    this.radio += (this.objetivo.radio - this.radio) * k;
    this.centro.lerp(this.centroObjetivo, k);
    this._colocar();
  }

  _colocar() {
    const senPol = Math.sin(this.pol);
    this.camara.position.set(
      this.centro.x + this.radio * senPol * Math.sin(this.az),
      this.centro.y + this.radio * Math.cos(this.pol),
      this.centro.z + this.radio * senPol * Math.cos(this.az),
    );
    this.camara.lookAt(this.centro);
  }

  _fijarRadio(radio) {
    this.objetivo.radio = clamp(radio, this.limites.radioMin, this.limites.radioMax);
  }

  _marcarInteraccion() {
    this._reposo = 0;
    if (!this.haInteractuado) {
      this.haInteractuado = true;
      this.alInteractuar();
    }
  }

  _separacion() {
    const [a, b] = [...this._punteros.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  _abajo(e) {
    this.dom.setPointerCapture?.(e.pointerId);
    this._punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._punteros.size === 1) {
      this._gesto = { x0: e.clientX, y0: e.clientY, t0: performance.now(), movido: false, ultimoDx: 0 };
    } else if (this._punteros.size === 2) {
      this._pellizco = this._separacion();
      if (this._gesto) this._gesto.movido = true; // dos dedos nunca son un toque
    }
  }

  _mover(e) {
    const puntero = this._punteros.get(e.pointerId);
    if (!puntero) return;
    const dx = e.clientX - puntero.x;
    const dy = e.clientY - puntero.y;
    puntero.x = e.clientX;
    puntero.y = e.clientY;

    if (this._punteros.size === 2) {
      const separacion = this._separacion();
      if (!this.enfocada && this._pellizco > 0 && separacion > 0) {
        this._marcarInteraccion();
        this._fijarRadio(this.objetivo.radio * (this._pellizco / separacion));
      }
      this._pellizco = separacion;
      return;
    }

    const gesto = this._gesto;
    if (!gesto) return;
    if (Math.hypot(e.clientX - gesto.x0, e.clientY - gesto.y0) > UMBRAL_TOQUE) gesto.movido = true;
    if (!gesto.movido || this.enfocada) return;
    this._marcarInteraccion();
    gesto.ultimoDx = dx;
    this.objetivo.az -= dx * 0.0052;
    this.objetivo.pol = clamp(this.objetivo.pol - dy * 0.0052, this.limites.polMin, this.limites.polMax);
  }

  _arriba(e) {
    const estaba = this._punteros.delete(e.pointerId);
    const gesto = this._gesto;
    if (!estaba || !gesto || this._punteros.size > 0) return;
    this._gesto = null;
    const dx = e.clientX - gesto.x0;
    const dy = e.clientY - gesto.y0;

    if (!gesto.movido) {
      if (performance.now() - gesto.t0 < 500) this.alTocar(e.clientX, e.clientY);
    } else if (this.enfocada) {
      if (Math.abs(dx) > UMBRAL_DESLIZ && Math.abs(dx) > Math.abs(dy) * 1.2) this.alDeslizar(dx < 0 ? 1 : -1);
    } else {
      // Inercia: la órbita sigue un poco en la dirección del último gesto.
      this.objetivo.az -= clamp(gesto.ultimoDx, -40, 40) * 0.0052 * 6;
    }
  }

  _rueda(e) {
    e.preventDefault();
    if (this.enfocada) return;
    this._marcarInteraccion();
    const paso = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    this._fijarRadio(this.objetivo.radio * Math.exp(clamp(paso, -240, 240) * 0.0011));
  }
}
