/**
 * La escena 3D: galaxia-girasol, girasoles a la deriva, polaroids en órbita,
 * estrellas fugaces y el resplandor (bloom) que lo envuelve todo.
 *
 * Se renderiza en dos pasadas:
 *   1. Todo lo luminoso (capa 0) pasa por el compositor con bloom.
 *   2. Las fotos y los girasoles (capa 1) se pintan encima, directamente en
 *      pantalla, para que el bloom no queme las caras ni emborrone el dibujo.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { crearGalaxia, crearEstrellas } from './galaxia.js';
import { dibujarBrillo, dibujarGirasol, dibujarPolaroid, POLAROID } from './texturas.js';
import { Orbita } from './orbita.js';
import {
  amortiguar,
  clamp,
  crearRng,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  esTactil,
  lerp,
  movimientoReducido,
} from './util.js';

const CAPA_NITIDA = 1;
const FOV = 52;
const DURACION_ENTRADA = 4.6;
const FONDO = 0x05030f;
const ALTO_FOTO = 5;
const ANCHO_FOTO = (ALTO_FOTO * POLAROID.ancho) / POLAROID.alto;
const BLOOM = 0.85;

export class Universo {
  /**
   * @param {HTMLCanvasElement} lienzo
   * @param {{alTocarRecuerdo?: (i: number) => void, alTocarVacio?: () => void, alDeslizar?: (s: 1 | -1) => void, alInteractuar?: () => void, alPerderContexto?: () => void}} avisos
   * @throws si el navegador no puede crear un contexto WebGL
   */
  constructor(lienzo, avisos = {}) {
    this.lienzo = lienzo;
    this.avisos = avisos;
    this.reducido = movimientoReducido.matches;
    this.densidad = esTactil ? 0.6 : 1;
    this.rng = crearRng(21092025);

    this.renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(FONDO);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.pixeles = Math.min(window.devicePixelRatio || 1, esTactil ? 1.5 : 2);

    this.escena = new THREE.Scene();
    this.camara = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1200);
    this.orbita = new Orbita(this.camara, lienzo, {
      alTocar: (x, y) => this._tocar(x, y),
      alDeslizar: (sentido) => this.avisos.alDeslizar?.(sentido),
      alInteractuar: () => this.avisos.alInteractuar?.(),
    });
    this.orbita.instantanea = this.reducido;

    this.rayo = new THREE.Raycaster();
    this.rayo.layers.set(CAPA_NITIDA);
    this.puntero = new THREE.Vector2();

    this.tiempo = 0;
    this.progreso = 0; // 0..1 de la animación de entrada
    this.iniciado = false;
    this.foco = -1; // índice de la foto enfocada, -1 si ninguna
    this.mezclaFoco = 0;
    this.sobre = -1; // foto bajo el cursor
    this.tarjetas = [];
    this.radioAnillo = 16;
    this.conBloom = true;
    this._muestras = { suma: 0, n: 0, rebajas: 0 };
    this._previo = 0;

    this._crearFondo();
    this._crearFlor();
    this._crearGirasoles();
    this._crearFugaz();
    this._crearCompositor();
    this._ajustar();
    this._escuchar();
  }

  // ------------------------------------------------------------ construcción

  _crearFondo() {
    this.estrellas = crearEstrellas({ cantidad: Math.round(3600 * this.densidad) });
    this.escena.add(this.estrellas);

    this.texBrillo = new THREE.CanvasTexture(dibujarBrillo());
    this.texBrillo.colorSpace = THREE.SRGBColorSpace;
    const nebulosas = [
      ['#7b4dff', [95, 30, -125], 120, 0.05],
      ['#ff5fae', [-130, -24, -55], 100, 0.035],
      ['#3aa0ff', [40, -40, 140], 110, 0.03],
      ['#ffb347', [-80, 45, 120], 85, 0.022],
    ];
    for (const [color, posicion, escala, opacidad] of nebulosas) {
      const nube = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.texBrillo,
          color,
          opacity: opacidad,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      nube.position.set(...posicion);
      nube.scale.setScalar(escala);
      this.escena.add(nube);
    }
  }

  _crearFlor() {
    // La flor se inclina hacia la cámara inicial para verse casi de frente.
    this.flor = new THREE.Group();
    this.flor.rotation.set(0.42, 0, 0.1);
    this.galaxia = crearGalaxia({ densidad: this.densidad });
    this.flor.add(this.galaxia);

    this.nucleo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.texBrillo,
        color: '#ffd27a',
        opacity: 0,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.nucleo.scale.setScalar(6);
    this.nucleo.position.y = 0.4;
    this.flor.add(this.nucleo);
    this.escena.add(this.flor);
  }

  _crearGirasoles() {
    const textura = new THREE.CanvasTexture(dibujarGirasol());
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    // Seis materiales para que no todos los girasoles giren al unísono.
    this.materialesGirasol = Array.from({ length: 6 }, (_, i) => {
      const material = new THREE.SpriteMaterial({
        map: textura,
        color: 0xe4e4e4,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      material.userData.velocidad = (i % 2 ? -1 : 1) * (0.08 + i * 0.035);
      return material;
    });

    this.girasoles = [];
    const cantidad = Math.round(110 * this.densidad);
    for (let i = 0; i < cantidad; i++) {
      const sprite = new THREE.Sprite(this.materialesGirasol[i % this.materialesGirasol.length]);
      const radio = 14 + this.rng() * 44;
      const angulo = this.rng() * Math.PI * 2;
      sprite.userData = {
        base: new THREE.Vector3(Math.cos(angulo) * radio, (this.rng() - 0.5) * 30, Math.sin(angulo) * radio),
        fase: this.rng() * Math.PI * 2,
        escala: 0.7 + this.rng() * 1.2,
        orden: this.rng(),
      };
      sprite.position.copy(sprite.userData.base);
      sprite.scale.setScalar(0);
      sprite.layers.set(CAPA_NITIDA);
      this.girasoles.push(sprite);
      this.escena.add(sprite);
    }
  }

  _crearFugaz() {
    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    geometria.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 0.95, 0.8, 0, 0, 0]), 3));
    this.fugaz = new THREE.Line(
      geometria,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.fugaz.frustumCulled = false;
    this.fugaz.userData = { vida: 1, espera: 6, origen: new THREE.Vector3(), direccion: new THREE.Vector3() };
    this.escena.add(this.fugaz);
  }

  _crearCompositor() {
    this.compositor = new EffectComposer(this.renderer);
    this.compositor.addPass(new RenderPass(this.escena, this.camara));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM, 0.42, 0.34);
    this.compositor.addPass(this.bloom);
    this.compositor.addPass(new OutputPass());
  }

  /**
   * Carga las fotos y crea una polaroid flotante por cada una.
   * Una foto que no cargue se omite sin romper el resto.
   * @param {{src: string, texto: string}[]} recuerdos
   */
  async cargar(recuerdos) {
    await Promise.race([
      document.fonts.load('italic 500 30px Fraunces'),
      new Promise((resolver) => setTimeout(resolver, 2500)),
    ]).catch(() => {});

    const imagenes = await Promise.all(
      recuerdos.map(
        ({ src }) =>
          new Promise((resolver) => {
            const imagen = new Image();
            imagen.onload = () => resolver(imagen);
            imagen.onerror = () => {
              console.warn(`[universo] no se pudo cargar la foto ${src}`);
              resolver(null);
            };
            imagen.src = src;
          }),
      ),
    );

    const geometria = new THREE.PlaneGeometry(ANCHO_FOTO, ALTO_FOTO);
    const anisotropia = this.renderer.capabilities.getMaxAnisotropy();
    const resolucion = esTactil ? 512 : 1024;
    const total = recuerdos.length;
    // El anillo crece con el número de fotos para que quepan sin amontonarse.
    this.radioAnillo = Math.max(16, (total * 5.6) / (Math.PI * 2));

    recuerdos.forEach((recuerdo, i) => {
      const imagen = imagenes[i];
      if (!imagen) return;
      const textura = new THREE.CanvasTexture(dibujarPolaroid(imagen, recuerdo.texto, resolucion));
      textura.colorSpace = THREE.SRGBColorSpace;
      textura.anisotropy = anisotropia;
      const tarjeta = new THREE.Mesh(
        geometria,
        new THREE.MeshBasicMaterial({ map: textura, transparent: true, toneMapped: false, depthWrite: false }),
      );
      // El ángulo decrece con el índice: así, vista desde fuera, la foto
      // siguiente queda siempre a la derecha de la actual.
      const angulo = 0.35 - (i / total) * Math.PI * 2;
      const radio = this.radioAnillo + this.rng() * 3;
      // Dos alturas alternas para que las vecinas no se tapen entre sí.
      const altura = (i % 2 ? 4.6 : 0.4) + this.rng() * 1.6;
      tarjeta.userData = {
        indice: i,
        base: new THREE.Vector3(Math.cos(angulo) * radio, altura, Math.sin(angulo) * radio),
        fase: this.rng() * Math.PI * 2,
        ladeo: (this.rng() - 0.5) * 0.16,
        escala: 0,
        foco: 0,
      };
      tarjeta.position.copy(tarjeta.userData.base);
      tarjeta.scale.setScalar(0);
      tarjeta.layers.set(CAPA_NITIDA);
      this.tarjetas.push(tarjeta);
      this.escena.add(tarjeta);
    });
  }

  /** Índices de las fotos que se han podido cargar, en orden. */
  get disponibles() {
    return this.tarjetas.map((t) => t.userData.indice);
  }

  /** Lanza la animación de entrada y el bucle de dibujo. */
  comenzar() {
    this.iniciado = true;
    if (this.reducido) this.progreso = 1;
    this.orbita.objetivo.radio = this._radioBase();
    this.orbita.objetivo.az = this.reducido ? 0 : -0.9;
    this.orbita.saltar();
    this._previo = performance.now();
    this.renderer.setAnimationLoop((ahora) => this._cuadro(ahora));
  }

  /** Detiene el dibujo (se usa al caer al modo sin WebGL). */
  detener() {
    this.renderer.setAnimationLoop(null);
  }

  /** Vuela hasta la foto `indice`. */
  enfocar(indice) {
    const tarjeta = this.tarjetas.find((t) => t.userData.indice === indice);
    if (!tarjeta) return;
    this.foco = indice;
    this.orbita.enfocar(this._puntoDeMira(tarjeta), this._distanciaFoco());
  }

  /** Suelta la foto enfocada y vuelve a la vista general. */
  soltar() {
    this.foco = -1;
    this.orbita.soltar();
  }

  /** Gira o acerca la vista general (teclado). */
  empujar(deltaAz, factorRadio) {
    this.orbita.empujar(deltaAz, factorRadio);
  }

  // ------------------------------------------------------------------ medida

  _escuchar() {
    window.addEventListener('resize', () => this._ajustar());
    this.lienzo.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this._ultimoRaton = { x: e.clientX, y: e.clientY };
    });
    this.lienzo.addEventListener('pointerleave', () => (this._ultimoRaton = null));
    this.lienzo.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.detener();
      this.avisos.alPerderContexto?.();
    });
    movimientoReducido.addEventListener('change', (e) => {
      this.reducido = e.matches;
      this.orbita.instantanea = e.matches;
      if (e.matches) this.progreso = 1;
    });
  }

  /** Distancia desde la que la flor entera cabe en pantalla. */
  _radioBase() {
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const minimo = Math.max(38, this.radioAnillo + 22);
    return clamp(Math.max(minimo, 12.5 / (tan * this.camara.aspect)), minimo, 70);
  }

  /** Distancia a la que una polaroid llena la pantalla dejando sitio a los controles. */
  _distanciaFoco() {
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    return Math.max(ALTO_FOTO / 0.66, ANCHO_FOTO / (0.9 * this.camara.aspect)) / (2 * tan);
  }

  /** La cámara mira un poco por debajo de la foto para que quede sobre los controles. */
  _puntoDeMira(tarjeta) {
    return tarjeta.position.clone().setY(tarjeta.position.y - 0.38);
  }

  _ajustar() {
    const ancho = window.innerWidth;
    const alto = window.innerHeight;
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.pixeles);
    this.renderer.setSize(ancho, alto, false);
    this.compositor.setPixelRatio(this.pixeles);
    this.compositor.setSize(ancho, alto);

    // Convierte tamaños en unidades de mundo a píxeles del búfer.
    const escala = (alto * this.pixeles) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    this.galaxia.material.uniforms.uEscala.value = escala;
    this.galaxia.material.uniforms.uTamMax.value = 24 * this.pixeles;
    this.estrellas.material.uniforms.uEscala.value = escala;

    if (!this.orbita.haInteractuado && !this.orbita.enfocada) this.orbita.objetivo.radio = this._radioBase();
    if (this.foco >= 0) this.enfocar(this.foco);
  }

  // -------------------------------------------------------------- interacción

  _tarjetaEn(x, y) {
    this.puntero.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.rayo.setFromCamera(this.puntero, this.camara);
    const impacto = this.rayo.intersectObjects(this.tarjetas, false).find((h) => h.object.userData.escala > 0.6);
    return impacto ? impacto.object.userData.indice : -1;
  }

  _tocar(x, y) {
    const indice = this._tarjetaEn(x, y);
    if (indice >= 0) this.avisos.alTocarRecuerdo?.(indice);
    else this.avisos.alTocarVacio?.();
  }

  // ------------------------------------------------------------------- bucle

  _cuadro(ahora) {
    const dt = clamp((ahora - this._previo) / 1000, 0, 0.05);
    this._previo = ahora;
    if (!this.reducido) this.tiempo += dt;
    const t = this.tiempo;

    if (this.iniciado && this.progreso < 1) this.progreso = Math.min(1, this.progreso + dt / DURACION_ENTRADA);
    const entrada = easeInOutCubic(this.progreso);

    this.mezclaFoco += ((this.foco >= 0 ? 1 : 0) - this.mezclaFoco) * (this.reducido ? 1 : amortiguar(4, dt));
    const atenuado = 1 - this.mezclaFoco * 0.62;

    // --- cámara ---
    if (this.progreso < 1 && !this.orbita.haInteractuado && !this.orbita.enfocada) {
      // Durante la entrada la cámara se acerca girando alrededor de la flor.
      const base = this._radioBase();
      const viaje = easeOutCubic(this.progreso);
      this.orbita.objetivo.radio = this.orbita.radio = lerp(base * 2.1, base, viaje);
      this.orbita.objetivo.az = this.orbita.az = lerp(-0.9, 0, viaje);
    }
    if (this.foco >= 0) {
      const enfocada = this.tarjetas.find((c) => c.userData.indice === this.foco);
      if (enfocada) this.orbita.centroObjetivo.copy(this._puntoDeMira(enfocada));
    }
    this.orbita.actualizar(dt);

    // --- galaxia y fondo ---
    const uniformes = this.galaxia.material.uniforms;
    uniformes.uTiempo.value = t;
    uniformes.uProgreso.value = entrada;
    uniformes.uBrillo.value = atenuado;
    this.estrellas.material.uniforms.uTiempo.value = t;
    this.nucleo.material.opacity = 0.22 * entrada * atenuado * (1 + 0.12 * Math.sin(t * 1.4));
    this.bloom.strength = BLOOM * (1 - this.mezclaFoco * 0.45);

    // --- girasoles a la deriva ---
    for (const material of this.materialesGirasol) {
      material.rotation = t * material.userData.velocidad;
      material.opacity = atenuado;
    }
    for (const girasol of this.girasoles) {
      const d = girasol.userData;
      const brote = clamp((this.progreso - 0.45 - d.orden * 0.35) / 0.2);
      girasol.scale.setScalar(d.escala * (brote >= 1 ? 1 : easeOutBack(brote)));
      girasol.position.set(
        d.base.x + Math.sin(t * 0.15 + d.fase) * 0.5,
        d.base.y + Math.sin(t * 0.4 + d.fase) * 0.8,
        d.base.z,
      );
    }

    this._actualizarTarjetas(dt, t);
    this._actualizarFugaz(dt);
    this._actualizarCursor();
    this._dibujar();
    this._medirRendimiento(dt);
  }

  _actualizarTarjetas(dt, t) {
    const total = Math.max(1, this.tarjetas.length);
    const k = this.reducido ? 1 : amortiguar(6, dt);
    for (const tarjeta of this.tarjetas) {
      const d = tarjeta.userData;
      const esFoco = d.indice === this.foco;
      d.foco += ((esFoco ? 1 : 0) - d.foco) * k;

      // Aparecen de una en una al final de la entrada.
      const brote = clamp((this.progreso - 0.62 - (d.indice / total) * 0.26) / 0.12);
      const objetivo = (brote >= 1 ? 1 : easeOutBack(brote)) * (d.indice === this.sobre && !esFoco ? 1.08 : 1);
      d.escala += (objetivo - d.escala) * k;
      tarjeta.scale.setScalar(Math.max(0.0001, d.escala));

      tarjeta.position.y = d.base.y + Math.sin(t * 0.6 + d.fase) * 0.5 * (1 - d.foco);
      // Siempre paralelas a la pantalla, con un ladeo que se endereza al enfocar.
      tarjeta.quaternion.copy(this.camara.quaternion);
      tarjeta.rotateZ(d.ladeo * (1 - d.foco) + Math.sin(t * 0.5 + d.fase) * 0.02 * (1 - d.foco));

      // Las del lado lejano se desvanecen; al enfocar una, el resto se apaga.
      const distancia = tarjeta.position.distanceTo(this.camara.position);
      const cercania = clamp((this.orbita.radio + this.radioAnillo + 3 - distancia) / (this.radioAnillo * 2 + 6));
      const base = lerp(0.3, 1, cercania);
      tarjeta.material.opacity = lerp(base * (1 - this.mezclaFoco * 0.8), 1, d.foco);
      tarjeta.renderOrder = esFoco ? 1 : 0;
    }
  }

  _actualizarFugaz(dt) {
    const d = this.fugaz.userData;
    if (this.reducido || this.progreso < 1) return;
    if (d.vida >= 1) {
      d.espera -= dt;
      this.fugaz.material.opacity = 0;
      if (d.espera > 0) return;
      // Nueva estrella fugaz: nace en lo alto y cruza en una dirección al azar.
      const angulo = this.rng() * Math.PI * 2;
      d.origen.set(Math.cos(angulo) * 60, 18 + this.rng() * 30, Math.sin(angulo) * 60);
      d.direccion.set(this.rng() - 0.5, -0.25 - this.rng() * 0.3, this.rng() - 0.5).normalize();
      d.vida = 0;
      d.espera = 5 + this.rng() * 8;
    }
    d.vida = Math.min(1, d.vida + dt / 1.1);
    const posiciones = this.fugaz.geometry.attributes.position;
    const cabeza = d.vida * 75;
    const cola = Math.max(0, cabeza - 11);
    posiciones.setXYZ(0, d.origen.x + d.direccion.x * cabeza, d.origen.y + d.direccion.y * cabeza, d.origen.z + d.direccion.z * cabeza);
    posiciones.setXYZ(1, d.origen.x + d.direccion.x * cola, d.origen.y + d.direccion.y * cola, d.origen.z + d.direccion.z * cola);
    posiciones.needsUpdate = true;
    this.fugaz.material.opacity = Math.sin(d.vida * Math.PI);
  }

  _actualizarCursor() {
    const sobre = this._ultimoRaton ? this._tarjetaEn(this._ultimoRaton.x, this._ultimoRaton.y) : -1;
    if (sobre === this.sobre) return;
    this.sobre = sobre;
    this.lienzo.style.cursor = sobre >= 0 && sobre !== this.foco ? 'pointer' : '';
  }

  _dibujar() {
    if (!this.conBloom) {
      this.camara.layers.enableAll();
      this.renderer.autoClear = true;
      this.renderer.render(this.escena, this.camara);
      return;
    }
    this.camara.layers.set(0);
    this.compositor.render();

    this.camara.layers.set(CAPA_NITIDA);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.escena, this.camara);
    this.renderer.autoClear = true;
  }

  /**
   * Calidad adaptativa: si tras la entrada el equipo no llega a ~40 fps, se
   * baja la resolución interna y, como último recurso, se desactiva el bloom.
   */
  _medirRendimiento(dt) {
    const m = this._muestras;
    if (this.progreso < 1 || m.rebajas >= 3 || dt <= 0) return;
    m.suma += dt;
    if (++m.n < 90) return;
    const media = m.suma / m.n;
    m.suma = 0;
    m.n = 0;
    if (media < 0.025) return;
    m.rebajas++;
    if (this.pixeles > 1) {
      this.pixeles = Math.max(1, this.pixeles - 0.5);
      this._ajustar();
    } else {
      this.conBloom = false;
    }
  }
}
