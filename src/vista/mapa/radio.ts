/**
 * Radio de dibujo de una estrella en funcion de su magnitud aparente.
 *
 * Modulo puro: sin DOM, sin reloj y sin azar, de modo que el mismo valor de
 * magnitud siempre produce el mismo radio y las pruebas pueden ejercitarlo sin
 * montar un lienzo.
 *
 * Requisito 4.2: el radio decrece de forma monotona al crecer la magnitud
 * aparente, vale 3.5 px en magnitud -1.5 (y en toda magnitud menor) y 0.6 px en
 * magnitud 6.0 (y en toda magnitud mayor).
 */

/** Magnitud aparente mas brillante del intervalo util: por debajo el radio se estanca. */
export const MAGNITUD_MINIMA = -1.5;

/** Magnitud aparente mas debil del intervalo util: por encima el radio se estanca. */
export const MAGNITUD_MAXIMA = 6.0;

/** Radio en pixeles que corresponde a `MAGNITUD_MINIMA` y a toda magnitud menor. */
export const RADIO_MAXIMO = 3.5;

/** Radio en pixeles que corresponde a `MAGNITUD_MAXIMA` y a toda magnitud mayor. */
export const RADIO_MINIMO = 0.6;

/** Amplitud del intervalo de magnitudes utiles, 7.5 magnitudes. */
const RANGO_MAGNITUD = MAGNITUD_MAXIMA - MAGNITUD_MINIMA;

/** Amplitud del intervalo de radios, 2.9 px. */
const RANGO_RADIO = RADIO_MAXIMO - RADIO_MINIMO;

/**
 * Exponente de la curva. Al ser mayor que 1 concentra el tamano en las
 * estrellas brillantes, lo que da sensacion de cielo real en lugar de un campo
 * uniforme de puntos. Cualquier exponente positivo conserva la monotonia.
 */
const EXPONENTE = 1.6;

/**
 * Devuelve el radio de dibujo, en pixeles, para una magnitud aparente.
 *
 * Por que decrece de forma monotona dentro del intervalo: el recorte deja `m`
 * en [-1.5, 6.0]; el parametro `t = (6.0 - m) / 7.5` es una recta de pendiente
 * negativa, asi que decrece de forma estricta al crecer `m` y recorre [0, 1];
 * y `t -> 0.6 + 2.9 * t^1.6` crece de forma estricta en [0, 1] porque `t^1.6`
 * es creciente para exponente positivo y el coeficiente 2.9 es positivo. La
 * composicion de una funcion estrictamente decreciente con una estrictamente
 * creciente decrece de forma estricta.
 *
 * Por que es constante fuera del intervalo: `Math.min`/`Math.max` aplastan toda
 * magnitud menor que -1.5 a -1.5 (t = 1, radio 3.5 px) y toda magnitud mayor
 * que 6.0 a 6.0 (t = 0, radio 0.6 px), incluidos los infinitos.
 *
 * @param magnitud Magnitud aparente de la estrella.
 * @returns Radio en pixeles, siempre en [0.6, 3.5].
 */
export function radioPorMagnitud(magnitud: number): number {
  // Recorte a los extremos del intervalo util (Requisito 4.2).
  const m = Math.min(MAGNITUD_MAXIMA, Math.max(MAGNITUD_MINIMA, magnitud));
  // 0 en magnitud 6.0, 1 en magnitud -1.5.
  const t = (MAGNITUD_MAXIMA - m) / RANGO_MAGNITUD;
  return RADIO_MINIMO + RANGO_RADIO * Math.pow(t, EXPONENTE);
}
