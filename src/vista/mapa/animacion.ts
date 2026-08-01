/**
 * Bucle de titileo del Mapa_Estelar.
 *
 * Requisito 7.8: un unico bucle `requestAnimationFrame` anima solo el titileo.
 * Las capas estaticas (fondo, disco, reticula, lineas de constelacion) se
 * dibujan una vez en un `OffscreenCanvas` y se copian con `drawImage`; por
 * fotograma este modulo solo recalcula la opacidad de las estrellas visibles y
 * llama al pintor. El trabajo por fotograma es proporcional a la cantidad de
 * estrellas sobre el horizonte y no reserva memoria: las opacidades viven en un
 * `Float64Array` reutilizado. Nunca hay mas de una solicitud de fotograma
 * pendiente, jamas una por estrella.
 *
 * Requisito 7.5: con la preferencia de movimiento reducido el bucle no se
 * inicia; se pinta un unico fotograma estatico con las estrellas en su estado
 * final. Si la preferencia cambia mientras el bucle corre, el bucle se detiene
 * y se asienta en ese mismo fotograma estatico; si vuelve a desactivarse, el
 * bucle se reanuda desde el principio de su ciclo.
 *
 * Requisito 3.6 (determinismo, aplicado a lo visual): la fase de cada estrella
 * es una funcion pura de su nombre y de la semilla derivada del
 * Instante_Graduacion, sin reloj ni `Math.random`. Dos ejecuciones con el mismo
 * Instante_Graduacion y la misma linea de tiempo de fotogramas producen la
 * misma animacion. Se reutilizan `fuentePseudoaleatoria` y `semillaDesdeTexto`
 * del cielo del Portal_Acceso en lugar de introducir una segunda fuente de
 * numeros pseudoaleatorios.
 *
 * Requisito 6.1: la opacidad de titileo se mantiene en [0.55, 1], dentro del
 * intervalo [0.05, 1] que autoriza la Paleta_Regalo y bien lejos del extremo
 * inferior, para que ninguna estrella llegue a desaparecer.
 */

import {
  observarMovimientoReducido,
  prefiereMovimientoReducido,
  type ConsultaMedios,
} from '../../infra/movimiento-reducido.js';
import type { Estrella } from '../../nucleo/catalogo/modelo.js';
import type { CieloCalculado, InstanteGraduacion } from '../../nucleo/astronomia/modelo.js';
import { fuentePseudoaleatoria, semillaDesdeTexto } from '../portal/cielo-fondo.js';

/**
 * Duracion minima del ciclo de titileo, en milisegundos. Coincide con
 * `--duracion-titileo-min` del sistema de diseno.
 */
export const CICLO_MINIMO_MS = 4000;

/**
 * Duracion maxima del ciclo de titileo, en milisegundos. Coincide con
 * `--duracion-titileo-max` del sistema de diseno.
 */
export const CICLO_MAXIMO_MS = 12000;

/** Opacidad minima que puede alcanzar una estrella al titilar (Requisito 6.1). */
export const OPACIDAD_MINIMA = 0.55;

/** Opacidad maxima de una estrella: el pico del ciclo. */
export const OPACIDAD_MAXIMA = 1;

/**
 * Opacidad del fotograma estatico. Es el estado final de la estrella: se dibuja
 * a plena luz, sin movimiento (Requisito 7.5).
 */
export const OPACIDAD_ESTATICA = OPACIDAD_MAXIMA;

/** Semiamplitud minima de la oscilacion: un titileo apenas perceptible. */
export const AMPLITUD_MINIMA = 0.05;

/**
 * Semiamplitud maxima de la oscilacion. El valle de una estrella es
 * `1 - 2 * amplitud`, asi que este tope es justo el que mantiene toda opacidad
 * en [OPACIDAD_MINIMA, OPACIDAD_MAXIMA].
 */
export const AMPLITUD_MAXIMA = (OPACIDAD_MAXIMA - OPACIDAD_MINIMA) / 2;

/** Tasa de dibujo minima exigida, en fotogramas por segundo (Requisito 7.8). */
export const FOTOGRAMAS_POR_SEGUNDO_MINIMOS = 30;

/** Presupuesto de dibujo por fotograma, en milisegundos (Requisito 7.8). */
export const PRESUPUESTO_FOTOGRAMA_MS = 33;

/** Vuelta completa de la circunferencia, en radianes. */
const TAU = 2 * Math.PI;

/**
 * Fase de titileo de una estrella: todo lo que hace falta para conocer su
 * opacidad en cualquier instante, sin volver a consultar la fuente
 * pseudoaleatoria.
 *
 * Invariantes que garantiza {@link faseDe} para toda estrella y toda semilla:
 * - `periodoMs` es un entero de [CICLO_MINIMO_MS, CICLO_MAXIMO_MS].
 * - `desfaseMs` es un entero de [0, periodoMs).
 * - `amplitud` cae en [AMPLITUD_MINIMA, AMPLITUD_MAXIMA].
 * - `centro - amplitud >= OPACIDAD_MINIMA` y `centro + amplitud <= OPACIDAD_MAXIMA`.
 */
export interface FaseTitileo {
  /** Duracion del ciclo completo, en milisegundos enteros. */
  readonly periodoMs: number;
  /** Desplazamiento del ciclo, en milisegundos enteros de [0, periodoMs). */
  readonly desfaseMs: number;
  /** Opacidad alrededor de la cual oscila la estrella. */
  readonly centro: number;
  /** Semiamplitud de la oscilacion. */
  readonly amplitud: number;
}

/**
 * Lo que el bucle necesita del lado del dibujo (tarea 11.3, `capas.ts`): una
 * sola llamada que copie las capas estaticas ya cacheadas y vuelva a dibujar
 * las estrellas con las opacidades recibidas.
 *
 * `opacidades` esta indexado igual que `cielo.estrellas`: la posicion `i` es el
 * factor de opacidad de la estrella `i`, en [OPACIDAD_MINIMA, OPACIDAD_MAXIMA].
 * Las estrellas bajo el horizonte conservan {@link OPACIDAD_ESTATICA} y no se
 * dibujan. El arreglo es propiedad del bucle y se reutiliza en cada fotograma:
 * el pintor debe leerlo, no guardarlo ni modificarlo.
 *
 * `tiempoMs` son los milisegundos transcurridos desde el primer fotograma del
 * bucle; vale 0 en el fotograma estatico.
 */
export type PintorTitileo = (opacidades: ArrayLike<number>, tiempoMs: number) => void;

/**
 * Fuente de fotogramas minima, con la forma de `requestAnimationFrame`. Se
 * inyecta para que las pruebas puedan avanzar la animacion paso a paso: la
 * implementacion de jsdom no es fiable y el bucle debe ser controlable.
 */
export interface FuenteFotogramas {
  /** Pide un fotograma; recibe el instante en milisegundos. */
  solicitar(accion: (tiempoMs: number) => void): unknown;
  /** Cancela una solicitud pendiente. */
  cancelar(identificador: unknown): void;
}

/**
 * Fuente de fotogramas del entorno, o `null` cuando no hay
 * `requestAnimationFrame`. Sin fuente el mapa no anima: dibuja un unico
 * fotograma estatico, igual que con movimiento reducido.
 */
export function fuenteDelEntorno(): FuenteFotogramas | null {
  const entorno = globalThis as {
    requestAnimationFrame?: unknown;
    cancelAnimationFrame?: unknown;
  };
  const solicitar = entorno.requestAnimationFrame;
  const cancelar = entorno.cancelAnimationFrame;

  if (typeof solicitar !== 'function' || typeof cancelar !== 'function') {
    return null;
  }

  return {
    solicitar: (accion) => (solicitar as typeof requestAnimationFrame).call(globalThis, accion),
    cancelar: (identificador) => {
      (cancelar as typeof cancelAnimationFrame).call(globalThis, identificador as number);
    },
  };
}

/** Opciones del bucle de titileo. */
export interface OpcionesTitileo {
  /** Cielo ya resuelto; el bucle no calcula, solo lee. */
  readonly cielo: CieloCalculado;
  /** Pintor del fotograma, provisto por las capas de dibujo. */
  readonly pintar: PintorTitileo;
  /**
   * Semilla de las fases; por omision la derivada del Instante_Graduacion con
   * {@link semillaDeInstante}.
   */
  readonly semilla?: number;
  /**
   * Fuente de fotogramas. Por omision la del entorno; `null` significa "sin
   * fuente disponible" y deja el mapa en su fotograma estatico.
   */
  readonly fuente?: FuenteFotogramas | null;
  /**
   * Consulta de movimiento reducido a observar. Por omision la del navegador;
   * en pruebas se sustituye por un objeto simple.
   */
  readonly consulta?: ConsultaMedios | null;
}

/** Control del bucle de titileo. */
export interface ControlTitileo {
  /** Fases de todas las estrellas, en el orden de `cielo.estrellas`. */
  readonly fases: readonly FaseTitileo[];
  /**
   * Arranca el bucle. Con movimiento reducido o sin fuente de fotogramas pinta
   * un unico fotograma estatico y no programa nada (Requisito 7.5). Llamarla
   * dos veces no crea un segundo bucle.
   */
  iniciar(): void;
  /** Detiene el bucle y cancela la solicitud pendiente. */
  detener(): void;
  /** Verdadero mientras haya un fotograma solicitado. */
  activo(): boolean;
  /** Pinta el fotograma estatico: estrellas a plena luz, sin movimiento. */
  dibujarEstatico(): void;
  /** Cantidad de estrellas que el bucle recalcula por fotograma. */
  estrellasAnimadas(): number;
  /** Cantidad de fotogramas animados pintados desde el ultimo `iniciar`. */
  fotogramas(): number;
  /** Detiene el bucle y deja de observar la preferencia de movimiento. */
  destruir(): void;
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

/**
 * Semilla del titileo derivada del Instante_Graduacion. Es la unica entrada de
 * azar del bucle y no es azar en absoluto: cambiar el instante cambia el cielo
 * y su titileo; repetirlo los repite (Requisito 3.6).
 */
export function semillaDeInstante(instante: InstanteGraduacion): number {
  return semillaDesdeTexto(instante.iso);
}

/**
 * Fase de titileo de una estrella. Funcion pura: no toca el DOM, no consulta el
 * reloj y no usa `Math.random`.
 *
 * La identidad de la estrella es su nombre, unico en el Catalogo_Estelar, de
 * modo que la fase no depende de su posicion en el arreglo ni del orden en que
 * se dibuje. El centro se fija en `OPACIDAD_MAXIMA - amplitud`, asi que el pico
 * del ciclo toca la plena luz y el valle nunca baja de `OPACIDAD_MINIMA`.
 *
 * @param estrella Estrella del catalogo; solo se lee su nombre.
 * @param semilla Semilla global, normalmente la de {@link semillaDeInstante}.
 */
export function faseDe(estrella: Estrella, semilla: number): FaseTitileo {
  const siguiente = fuentePseudoaleatoria(semilla ^ semillaDesdeTexto(estrella.nombre));
  const periodoMs = enteroEntre(siguiente(), CICLO_MINIMO_MS, CICLO_MAXIMO_MS);
  const desfaseMs = enteroEntre(siguiente(), 0, periodoMs - 1);
  const amplitud = entre(siguiente(), AMPLITUD_MINIMA, AMPLITUD_MAXIMA);

  return {
    periodoMs,
    desfaseMs,
    centro: OPACIDAD_MAXIMA - amplitud,
    amplitud,
  };
}

/**
 * Fases de todas las estrellas de un cielo, en el orden de `cielo.estrellas`.
 * Funcion pura; se calcula una sola vez al montar el bucle.
 *
 * @param cielo Cielo ya resuelto.
 * @param semilla Semilla global; por omision la del Instante_Graduacion.
 */
export function fasesDelCielo(
  cielo: CieloCalculado,
  semilla: number = semillaDeInstante(cielo.instante),
): readonly FaseTitileo[] {
  return cielo.estrellas.map((calculada) => faseDe(calculada.estrella, semilla));
}

/**
 * Opacidad de una estrella en un instante del bucle. Funcion pura y senoidal:
 * `centro + amplitud * sen(2π (t + desfase) / periodo)`.
 *
 * Un tiempo no finito no describe ningun fotograma y devuelve el centro del
 * ciclo, para que un mal dato del entorno no apague una estrella.
 *
 * @param fase Fase de la estrella, de {@link faseDe}.
 * @param tiempoMs Milisegundos transcurridos desde el primer fotograma.
 * @returns Opacidad en [OPACIDAD_MINIMA, OPACIDAD_MAXIMA].
 */
export function opacidadEn(fase: FaseTitileo, tiempoMs: number): number {
  if (!Number.isFinite(tiempoMs) || !(fase.periodoMs > 0)) {
    return limitar(fase.centro, OPACIDAD_MINIMA, OPACIDAD_MAXIMA);
  }

  const angulo = (TAU * (tiempoMs + fase.desfaseMs)) / fase.periodoMs;
  return limitar(fase.centro + fase.amplitud * Math.sin(angulo), OPACIDAD_MINIMA, OPACIDAD_MAXIMA);
}

/** Estrella que el bucle recalcula: su indice en `cielo.estrellas` y su fase. */
interface EstrellaAnimada {
  readonly indice: number;
  readonly fase: FaseTitileo;
}

/**
 * Crea el bucle de titileo del Mapa_Estelar. No dibuja nada hasta que se llama
 * a `iniciar` o a `dibujarEstatico`.
 *
 * @param opciones Cielo, pintor, semilla, fuente de fotogramas y consulta de
 *                 movimiento reducido.
 * @returns El control del bucle, con su funcion de limpieza.
 */
export function crearTitileo(opciones: OpcionesTitileo): ControlTitileo {
  const { cielo, pintar } = opciones;
  // `undefined` deja actuar el valor por omision; `null` significa "no hay".
  const consulta = opciones.consulta;
  const fuente = opciones.fuente === undefined ? fuenteDelEntorno() : opciones.fuente;
  const semilla = opciones.semilla ?? semillaDeInstante(cielo.instante);

  const fases = fasesDelCielo(cielo, semilla);
  // Solo las estrellas sobre el horizonte se dibujan, asi que solo ellas se
  // recalculan: es lo que mantiene acotado el trabajo por fotograma.
  const animadas: EstrellaAnimada[] = [];
  cielo.estrellas.forEach((calculada, indice) => {
    const fase = fases[indice];
    if (fase !== undefined && calculada.visible && calculada.pantalla !== null) {
      animadas.push({ indice, fase });
    }
  });

  // Reutilizado en cada fotograma: el bucle no reserva memoria mientras corre.
  const opacidades = new Float64Array(cielo.estrellas.length).fill(OPACIDAD_ESTATICA);

  let solicitud: unknown = null;
  let origenMs: number | null = null;
  let fotogramas = 0;
  // Verdadero cuando la vista quiere animacion, aunque la preferencia de
  // movimiento reducido la tenga detenida en este momento.
  let deseado = false;

  function pintarEstatico(): void {
    for (const animada of animadas) {
      opacidades[animada.indice] = OPACIDAD_ESTATICA;
    }
    pintar(opacidades, 0);
  }

  function programar(): void {
    if (fuente === null) {
      return;
    }
    solicitud = fuente.solicitar(paso);
  }

  function paso(tiempoMs: number): void {
    solicitud = null;

    if (origenMs === null && Number.isFinite(tiempoMs)) {
      origenMs = tiempoMs;
    }
    const transcurrido = Number.isFinite(tiempoMs) ? tiempoMs - (origenMs ?? tiempoMs) : 0;

    for (const animada of animadas) {
      opacidades[animada.indice] = opacidadEn(animada.fase, transcurrido);
    }

    fotogramas += 1;
    pintar(opacidades, transcurrido);
    programar();
  }

  function detenerBucle(): void {
    if (solicitud !== null && fuente !== null) {
      fuente.cancelar(solicitud);
    }
    solicitud = null;
    origenMs = null;
  }

  function iniciar(): void {
    deseado = true;

    // Requisito 7.5: con movimiento reducido no se inicia ningun bucle; las
    // estrellas quedan en su estado final de inmediato.
    if (prefiereMovimientoReducido(consulta) || fuente === null) {
      detenerBucle();
      pintarEstatico();
      return;
    }

    if (solicitud !== null) {
      return;
    }

    fotogramas = 0;
    programar();
  }

  const dejarDeObservar = observarMovimientoReducido((reducido) => {
    if (reducido) {
      detenerBucle();
      pintarEstatico();
    } else if (deseado) {
      iniciar();
    }
  }, consulta);

  return {
    fases,
    iniciar,
    detener: (): void => {
      deseado = false;
      detenerBucle();
    },
    activo: (): boolean => solicitud !== null,
    dibujarEstatico: pintarEstatico,
    estrellasAnimadas: (): number => animadas.length,
    fotogramas: (): number => fotogramas,
    destruir: (): void => {
      deseado = false;
      dejarDeObservar();
      detenerBucle();
    },
  };
}
