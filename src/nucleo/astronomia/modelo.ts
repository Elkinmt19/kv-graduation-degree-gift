/**
 * Modelos de datos del Motor_Astronomico.
 *
 * Igual que en el Catalogo_Estelar, los invariantes documentados aqui los
 * garantiza el motor (`motor.ts`, tarea 5.11) y los verifican las pruebas de
 * propiedades; el sistema de tipos solo describe la forma.
 *
 * Requisitos: 3.1, 3.2, 3.5, 3.9, 3.10.
 */

import type { Estrella, GradosDec, HorasAr } from '../catalogo/modelo';

/**
 * Coordenadas ecuatoriales de una direccion del cielo.
 *
 * Invariantes: `ar` en [0, 24) horas, `dec` en [-90, 90] grados.
 */
export interface Ecuatorial {
  readonly ar: HorasAr;
  readonly dec: GradosDec;
}

/**
 * Coordenadas horizontales vistas desde el Lugar_Graduacion, en grados
 * decimales.
 *
 * Invariantes (Requisito 3.2):
 * - `altitud` en [-90, 90]; 0 es el horizonte y 90 el cenit.
 * - `azimut` en [0, 360), medido desde el norte geografico y creciente hacia
 *   el este.
 */
export interface Horizontal {
  readonly altitud: number;
  readonly azimut: number;
}

/** Punto en coordenadas de pantalla, en pixeles. */
export interface Punto {
  readonly x: number;
  readonly y: number;
}

/**
 * Circulo que delimita el area dibujable del Mapa_Estelar y representa el
 * horizonte local.
 *
 * Invariantes (Requisitos 3.5, 4.12): `radio >= 140` pixeles, de modo que el
 * diametro nunca baja de los 280 px exigidos; `(cx, cy)` es el cenit del
 * dibujo y toda estrella visible cae a una distancia menor o igual a `radio`
 * de ese centro.
 */
export interface CirculoHorizonte {
  readonly cx: number;
  readonly cy: number;
  readonly radio: number;
}

/**
 * Instante exacto de la ceremonia de grado.
 *
 * Invariantes (Requisitos 8.1, 8.4): `iso` cumple el formato ISO 8601 con
 * desplazamiento horario `-05:00`; `msUtc` es su valor derivado en
 * milisegundos desde la epoca Unix en UTC, precalculado para que el motor no
 * vuelva a analizar la cadena en cada estrella.
 */
export interface InstanteGraduacion {
  readonly iso: string;
  readonly msUtc: number;
}

/**
 * Coordenadas geograficas de la ceremonia.
 *
 * Invariantes (Requisitos 3.9, 8.9): `latitud` en [-90, 90] grados;
 * `longitud` en (-180, 180] grados, positiva al este; `nombre` es el rotulo
 * que muestra el Mapa_Estelar.
 */
export interface LugarGraduacion {
  readonly nombre: string;
  readonly latitud: number;
  readonly longitud: number;
}

/**
 * Resultado del calculo para una Estrella del Catalogo_Estelar.
 *
 * Invariantes (Requisitos 3.10, 4.2):
 * - `visible === (horizontal.altitud >= 0)`.
 * - `pantalla === null` exactamente cuando `visible === false`: las estrellas
 *   bajo el horizonte no reciben coordenadas de pantalla.
 * - cuando `pantalla !== null`, su distancia al centro del Circulo_Horizonte
 *   es menor o igual al radio de este.
 * - `radio` en [0.6, 3.5] pixeles, resultado de `radioPorMagnitud`.
 */
export interface EstrellaCalculada {
  readonly estrella: Estrella;
  readonly horizontal: Horizontal;
  readonly visible: boolean;
  readonly pantalla: Punto | null;
  readonly radio: number;
}

/** Extremos de pantalla de una linea de constelacion dibujable. */
export interface SegmentoVisible {
  readonly a: Punto;
  readonly b: Punto;
}

/** Marca cardinal rotulada sobre el borde del Circulo_Horizonte. */
export interface Cardinal {
  readonly rotulo: 'N' | 'E' | 'S' | 'O';
  readonly punto: Punto;
}

/**
 * Cielo completo listo para dibujar. El Mapa_Estelar no calcula: recibe esta
 * estructura y solo dibuja.
 *
 * Invariantes (Requisitos 3.6, 4.7, 4.15):
 * - `estrellas` conserva el orden de `catalogo.estrellas`, para que dos
 *   invocaciones con las mismas entradas produzcan resultados identicos.
 * - `segmentosVisibles` incluye solo los Segmentos cuyos dos extremos tienen
 *   altitud mayor o igual a 0.
 * - `constelacionesDibujadas` no tiene repeticiones y alimenta el texto
 *   alternativo del mapa.
 * - `cardinales` tiene exactamente cuatro entradas, en los azimuts 0, 90, 180
 *   y 270 grados con altitud 0, es decir sobre el borde del circulo.
 */
export interface CieloCalculado {
  readonly instante: InstanteGraduacion;
  readonly lugar: LugarGraduacion;
  readonly circulo: CirculoHorizonte;
  readonly estrellas: readonly EstrellaCalculada[];
  readonly segmentosVisibles: readonly SegmentoVisible[];
  readonly constelacionesDibujadas: readonly string[];
  readonly cardinales: readonly Cardinal[];
}
