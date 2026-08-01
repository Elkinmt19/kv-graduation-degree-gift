/**
 * Cielo nocturno animado del fondo del Portal_Acceso.
 *
 * Requisito 6.3: el fondo muestra entre 80 y 200 puntos luminosos animados,
 * cada uno con un ciclo de animacion de duracion entre 4000 y 12000
 * milisegundos. El degradado de negro profundo a azul noche, el borde dorado
 * del campo y el fondo dorado del boton viven en `src/estilos/portal.css`.
 *
 * Requisito 7.5: con la preferencia de movimiento reducido no se inicia ninguna
 * animacion. Los puntos se dibujan igual, en su estado final, y la clase que
 * activa los `@keyframes` no se aplica. Si la preferencia cambia durante la
 * vida de la vista, la clase se agrega o se quita sin volver a generar el cielo.
 *
 * Requisito 3.6 (determinismo, aplicado a lo visual): la generacion de los
 * puntos es una funcion pura de la semilla. No consulta el reloj ni
 * `Math.random`, de modo que la misma semilla siempre produce el mismo cielo y
 * `generarPuntos` puede ejercitarse sin navegador. Quien monte la vista deriva
 * la semilla del Instante_Graduacion con `semillaDesdeTexto`.
 *
 * El movimiento corre en el compositor mediante `@keyframes` sobre `opacity` y
 * `transform`: este modulo solo escribe propiedades personalizadas en cada
 * punto (`--duracion-punto`, `--duracion-retardo-punto`, `--punto-x`,
 * `--punto-y`, `--punto-diametro`, `--punto-opacidad`) y nunca anima desde
 * JavaScript.
 */

import {
  observarMovimientoReducido,
  prefiereMovimientoReducido,
  type ConsultaMedios,
} from '../../infra/movimiento-reducido.js';

/** Cantidad minima de puntos luminosos (Requisito 6.3). */
export const PUNTOS_MINIMOS = 80;

/** Cantidad maxima de puntos luminosos (Requisito 6.3). */
export const PUNTOS_MAXIMOS = 200;

/** Duracion minima del ciclo de animacion, en milisegundos (Requisito 6.3). */
export const DURACION_CICLO_MINIMA = 4000;

/** Duracion maxima del ciclo de animacion, en milisegundos (Requisito 6.3). */
export const DURACION_CICLO_MAXIMA = 12000;

/** Diametro minimo de un punto luminoso, en pixeles. */
export const DIAMETRO_MINIMO = 1;

/** Diametro maximo de un punto luminoso, en pixeles. */
export const DIAMETRO_MAXIMO = 3;

/**
 * Opacidad minima de un punto en su estado final. Se mantiene bien por encima
 * del 0.05 que autoriza el Requisito 6.1, incluso despues de multiplicarse por
 * la opacidad del token `--estrella` y por el minimo del ciclo de titileo.
 */
export const OPACIDAD_MINIMA_PUNTO = 0.4;

/** Opacidad maxima de un punto en su estado final. */
export const OPACIDAD_MAXIMA_PUNTO = 1;

/** Clase del contenedor del cielo; `portal.css` la posiciona y la degrada. */
export const CLASE_CIELO = 'cielo-fondo';

/** Clase de cada punto luminoso. */
export const CLASE_PUNTO = 'cielo-fondo__punto';

/** Clase que activa los `@keyframes`; ausente con movimiento reducido. */
export const CLASE_ANIMADO = 'cielo-fondo--animado';

/**
 * Punto luminoso del fondo, ya resuelto. Las posiciones son porcentajes del
 * contenedor, para que el cielo se adapte a cualquier tamano de ventana sin
 * recalcularse (Requisito 7.1).
 */
export interface PuntoLuminoso {
  /** Posicion horizontal, en porcentaje del ancho del contenedor: [0, 100]. */
  readonly x: number;
  /** Posicion vertical, en porcentaje del alto del contenedor: [0, 100]. */
  readonly y: number;
  /** Diametro en pixeles, en [DIAMETRO_MINIMO, DIAMETRO_MAXIMO]. */
  readonly diametro: number;
  /** Opacidad del estado final, en [OPACIDAD_MINIMA_PUNTO, OPACIDAD_MAXIMA_PUNTO]. */
  readonly opacidad: number;
  /**
   * Duracion del ciclo de animacion en milisegundos enteros, en
   * [DURACION_CICLO_MINIMA, DURACION_CICLO_MAXIMA] (Requisito 6.3).
   */
  readonly duracionCiclo: number;
  /**
   * Desplazamiento de fase del ciclo, en milisegundos enteros de [0, ciclo).
   * Se aplica como retardo negativo para que los puntos no titilen al unisono
   * sin que ninguno espere para empezar.
   */
  readonly desfase: number;
}

/** Opciones de montaje del cielo del portal. */
export interface OpcionesCieloFondo {
  /** Semilla de la fuente pseudoaleatoria; cualquier numero es admisible. */
  readonly semilla?: number;
  /**
   * Consulta de movimiento reducido a observar. Por omision la del navegador;
   * en pruebas se sustituye por un objeto simple.
   */
  readonly consulta?: ConsultaMedios | null;
}

/** Control del cielo montado. */
export interface ControlCieloFondo {
  /** Puntos generados, en el orden en que se insertaron en el DOM. */
  readonly puntos: readonly PuntoLuminoso[];
  /** Verdadero mientras los `@keyframes` estan activos. */
  animado(): boolean;
  /** Retira el cielo del DOM y deja de observar la preferencia de movimiento. */
  destruir(): void;
}

/** Divisor de la fuente pseudoaleatoria: 2^32. */
const RANGO_UINT32 = 4294967296;

/** Base del hash FNV-1a de 32 bits. */
const FNV_BASE = 2166136261;

/** Primo del hash FNV-1a de 32 bits. */
const FNV_PRIMO = 16777619;

/**
 * Lleva cualquier numero a un entero sin signo de 32 bits. `NaN` y los
 * infinitos caen en 0, de modo que ninguna semilla puede romper la generacion.
 */
function normalizarSemilla(semilla: number): number {
  return Number.isFinite(semilla) ? Math.trunc(semilla) >>> 0 : 0;
}

/**
 * Fuente pseudoaleatoria determinista (mulberry32): sin estado global, sin
 * reloj y reproducible a partir de la semilla.
 *
 * @param semilla Cualquier numero; se reduce a 32 bits sin signo.
 * @returns Funcion que devuelve valores en [0, 1).
 */
export function fuentePseudoaleatoria(semilla: number): () => number {
  let estado = normalizarSemilla(semilla);

  return (): number => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let mezcla = estado;
    mezcla = Math.imul(mezcla ^ (mezcla >>> 15), mezcla | 1);
    mezcla ^= mezcla + Math.imul(mezcla ^ (mezcla >>> 7), mezcla | 61);
    return ((mezcla ^ (mezcla >>> 14)) >>> 0) / RANGO_UINT32;
  };
}

/**
 * Deriva una semilla de 32 bits de un texto con FNV-1a. Permite sembrar el
 * cielo con el Instante_Graduacion sin introducir azar (Requisito 3.6).
 */
export function semillaDesdeTexto(texto: string): number {
  let hash = FNV_BASE;
  for (let indice = 0; indice < texto.length; indice += 1) {
    hash ^= texto.charCodeAt(indice);
    hash = Math.imul(hash, FNV_PRIMO);
  }
  return hash >>> 0;
}

/** Limita un valor al intervalo cerrado `[minimo, maximo]`. */
function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), maximo);
}

/** Lleva un valor de [0, 1) al intervalo continuo `[minimo, maximo]`. */
function entre(u: number, minimo: number, maximo: number): number {
  return limitar(minimo + u * (maximo - minimo), minimo, maximo);
}

/** Lleva un valor de [0, 1) al intervalo entero cerrado `[minimo, maximo]`. */
function enteroEntre(u: number, minimo: number, maximo: number): number {
  const ancho = maximo - minimo + 1;
  return minimo + Math.min(ancho - 1, Math.max(0, Math.floor(u * ancho)));
}

/** Redondea a la cantidad de decimales indicada, para no escribir ruido al DOM. */
function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

/**
 * Genera el cielo del portal a partir de una semilla. Funcion pura: no toca el
 * DOM, no consulta el reloj y no usa `Math.random`.
 *
 * Garantias para toda semilla (Propiedad 28, Requisito 6.3):
 * - La cantidad de puntos cae en [80, 200].
 * - Cada `duracionCiclo` es un entero de [4000, 12000] milisegundos.
 * - Cada `x` y cada `y` caen en [0, 100]; cada `diametro` en [1, 3]; cada
 *   `opacidad` en [0.4, 1]; cada `desfase` en [0, duracionCiclo).
 *
 * @param semilla Cualquier numero, incluidos negativos, decimales, `NaN` e
 *                infinitos: todos se reducen a un entero de 32 bits.
 */
export function generarPuntos(semilla: number): readonly PuntoLuminoso[] {
  const siguiente = fuentePseudoaleatoria(semilla);
  const cantidad = enteroEntre(siguiente(), PUNTOS_MINIMOS, PUNTOS_MAXIMOS);
  const puntos: PuntoLuminoso[] = [];

  for (let indice = 0; indice < cantidad; indice += 1) {
    const duracionCiclo = enteroEntre(siguiente(), DURACION_CICLO_MINIMA, DURACION_CICLO_MAXIMA);

    puntos.push({
      x: redondear(entre(siguiente(), 0, 100), 3),
      y: redondear(entre(siguiente(), 0, 100), 3),
      diametro: redondear(entre(siguiente(), DIAMETRO_MINIMO, DIAMETRO_MAXIMO), 2),
      opacidad: redondear(entre(siguiente(), OPACIDAD_MINIMA_PUNTO, OPACIDAD_MAXIMA_PUNTO), 3),
      duracionCiclo,
      // `duracionCiclo - 1` como tope deja el desfase estrictamente por debajo
      // del ciclo, de modo que ningun punto repita la fase de su vecino exacto.
      desfase: enteroEntre(siguiente(), 0, duracionCiclo - 1),
    });
  }

  return puntos;
}

/** Crea el nodo de un punto con sus propiedades personalizadas. */
function crearPunto(documento: Document, punto: PuntoLuminoso): HTMLElement {
  const nodo = documento.createElement('span');
  nodo.className = CLASE_PUNTO;

  const estilo = nodo.style;
  estilo.setProperty('--punto-x', `${String(punto.x)}%`);
  estilo.setProperty('--punto-y', `${String(punto.y)}%`);
  estilo.setProperty('--punto-diametro', `${String(punto.diametro)}px`);
  estilo.setProperty('--punto-opacidad', String(punto.opacidad));
  estilo.setProperty('--duracion-punto', `${String(punto.duracionCiclo)}ms`);
  // Retardo negativo: el ciclo arranca ya avanzado, sin que nadie espere.
  estilo.setProperty('--duracion-retardo-punto', `-${String(punto.desfase)}ms`);

  return nodo;
}

/**
 * Monta el cielo animado como primer hijo decorativo de la raiz del portal.
 *
 * El contenedor lleva `aria-hidden="true"`: es decoracion, no contenido, y no
 * debe aparecer en el arbol accesible ni en el orden de tabulacion
 * (Requisitos 7.4 y 7.6).
 *
 * @param raiz Elemento del Portal_Acceso que aloja el fondo.
 * @param opciones Semilla y consulta de movimiento reducido.
 * @returns Control con los puntos generados, el estado de la animacion y la
 *          funcion de limpieza.
 */
export function montarCieloFondo(
  raiz: HTMLElement,
  opciones: OpcionesCieloFondo = {},
): ControlCieloFondo {
  const documento = raiz.ownerDocument;
  // `undefined` deja actuar el valor por omision del modulo de infraestructura
  // (la consulta del navegador); `null` significa "sin consulta disponible".
  const consulta = opciones.consulta;
  const puntos = generarPuntos(opciones.semilla ?? 0);

  const contenedor = documento.createElement('div');
  contenedor.className = CLASE_CIELO;
  contenedor.setAttribute('aria-hidden', 'true');

  for (const punto of puntos) {
    contenedor.appendChild(crearPunto(documento, punto));
  }

  // Requisito 7.5: con movimiento reducido no se activa ningun `@keyframes`;
  // los puntos quedan visibles en su estado final.
  const aplicar = (reducido: boolean): void => {
    contenedor.classList.toggle(CLASE_ANIMADO, !reducido);
  };

  aplicar(prefiereMovimientoReducido(consulta));

  // La raiz puede tener ya el formulario del portal: el cielo va al frente del
  // DOM para pintarse debajo del contenido sin depender del orden de montaje.
  raiz.insertBefore(contenedor, raiz.firstChild);

  const dejarDeObservar = observarMovimientoReducido(aplicar, consulta);

  return {
    puntos,
    animado: (): boolean => contenedor.classList.contains(CLASE_ANIMADO),
    destruir: (): void => {
      dejarDeObservar();
      contenedor.remove();
    },
  };
}
