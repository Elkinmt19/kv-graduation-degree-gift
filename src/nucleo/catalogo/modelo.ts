/**
 * Modelos de datos del Catalogo_Estelar.
 *
 * Estos tipos describen la forma de los datos; los invariantes documentados
 * aqui los verifica el Lector_Catalogo (`lector.ts`, tarea 3.1), nunca el
 * sistema de tipos. Toda construccion de un `CatalogoEstelar` fuera del
 * Lector_Catalogo debe respetarlos por su cuenta.
 *
 * Requisitos: 2.1, 2.3, 2.4, 2.9, 2.10.
 */

/**
 * Ascension recta en horas.
 *
 * Invariante: `ar` pertenece al intervalo [0, 24). El limite superior es
 * abierto: 24 h coincide con 0 h y se rechaza (Requisito 2.3).
 */
export type HorasAr = number;

/**
 * Declinacion en grados decimales.
 *
 * Invariante: `dec` pertenece al intervalo cerrado [-90, 90] (Requisito 2.3).
 */
export type GradosDec = number;

/**
 * Magnitud aparente.
 *
 * Invariante: `magnitud` pertenece al intervalo cerrado [-1.5, 6.0]. Valores
 * menores indican estrellas mas brillantes (Requisito 2.3).
 */
export type Magnitud = number;

/**
 * Entrada del Catalogo_Estelar.
 *
 * Invariantes (Requisitos 2.1, 2.3, 2.9, 2.10):
 * - `nombre`: cadena no vacia de a lo sumo 64 caracteres, unica en el catalogo.
 * - `ar`: en [0, 24) horas.
 * - `dec`: en [-90, 90] grados.
 * - `magnitud`: en [-1.5, 6.0].
 * - `constelacion`: cadena no vacia de a lo sumo 64 caracteres.
 *
 * Las coordenadas se expresan en la epoca J2000.0; el Motor_Astronomico las
 * precesa al Instante_Graduacion antes de convertirlas.
 */
export interface Estrella {
  readonly nombre: string;
  readonly ar: HorasAr;
  readonly dec: GradosDec;
  readonly magnitud: Magnitud;
  readonly constelacion: string;
}

/**
 * Linea de constelacion entre dos Estrellas.
 *
 * Invariantes (Requisito 2.4):
 * - `desde` y `hasta` son nombres de Estrella presentes en el mismo catalogo.
 * - `desde !== hasta`: un segmento degenerado se rechaza.
 *
 * El segmento no tiene direccion: `{ desde: a, hasta: b }` y
 * `{ desde: b, hasta: a }` describen la misma linea.
 */
export interface Segmento {
  readonly desde: string;
  readonly hasta: string;
}

/**
 * Catalogo_Estelar completo, ya validado.
 *
 * Invariantes (Requisitos 2.1, 2.10):
 * - `estrellas.length` pertenece a [1, 5000].
 * - `segmentos.length` pertenece a [0, 20000].
 * - los nombres de `estrellas` son unicos entre si.
 * - cada extremo de cada `Segmento` referencia un nombre presente en
 *   `estrellas`.
 * - `atribucion` es la cadena de creditos de las fuentes de datos; viaja con el
 *   catalogo para poder mostrarla en la Pagina_Regalo.
 */
export interface CatalogoEstelar {
  readonly version: 1;
  readonly epoca: 'J2000.0';
  readonly atribucion: string;
  readonly estrellas: readonly Estrella[];
  readonly segmentos: readonly Segmento[];
}
