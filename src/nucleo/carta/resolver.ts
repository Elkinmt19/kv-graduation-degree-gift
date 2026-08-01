/**
 * Resolucion de la Carta: convierte la `CartaConfigurada` del
 * Archivo_Configuracion en la `CartaResuelta` que el Lienzo_Carta dibuja sin
 * calcular nada (Requisitos 5.1, 5.5, 5.6, 5.7).
 *
 * Modulo puro: no toca el DOM, no consulta el reloj y no usa azar. El tipo
 * `CartaResuelta` vive aqui, en el nucleo, y no en `src/vista/carta/lienzo.ts`,
 * porque el nucleo no puede depender de la vista; el Lienzo_Carta lo reexporta.
 *
 * Interpretacion del tope de 6000 caracteres (Requisito 5.1). El requisito fija
 * un total maximo para el texto de la Carta, no un recorte por parrafo, asi que
 * el tope se aplica **sobre la seleccion de parrafos, en el orden declarado**:
 *
 * 1. Se descartan los parrafos sin ningun caracter visible; los que quedan
 *    conservan su texto **tal cual se declaro**, sin recortar espacios, para
 *    que el Lienzo_Carta muestre exactamente el texto del autor.
 * 2. De los restantes se toman a lo sumo los primeros 20 (Requisito 5.1).
 * 3. Se acumula la longitud en unidades de codigo UTF-16 y se conserva el
 *    prefijo mas largo cuyo total no excede 6000. El primer parrafo que no
 *    cabe detiene la seleccion: no se salta para probar con los siguientes,
 *    porque saltarlo rompería la continuidad del texto de la Carta.
 * 4. Caso degenerado: si el primer parrafo util ya excede por si solo el tope,
 *    se recorta a 6000 unidades de codigo sin partir un par suplente, en lugar
 *    de dejar la Carta vacia. Asi `disponible` es falso **exactamente** cuando
 *    no hay ningun parrafo con caracteres visibles, que es la condicion del
 *    Requisito 5.7, y nunca por efecto del tope.
 *
 * El saludo y la firma se limitan a 120 unidades de codigo (Requisitos 5.5 y
 * 5.6) y tampoco se recortan de espacios. En la practica el validador de
 * construccion ya rechaza toda configuracion que exceda esos limites
 * (Requisito 8.1); los topes de este modulo son la red de seguridad que
 * garantiza los invariantes de `CartaResuelta` en tiempo de ejecucion.
 */

import type { CartaConfigurada } from '../configuracion/modelo.js';

/** Maximo de parrafos que el Lienzo_Carta muestra (Requisito 5.1). */
export const MAX_PARRAFOS_CARTA = 20;

/** Total maximo de caracteres del texto de la Carta (Requisito 5.1). */
export const MAX_CARACTERES_CARTA = 6000;

/** Maximo de caracteres del saludo y de la firma (Requisitos 5.5, 5.6). */
export const MAX_CARACTERES_ROTULO = 120;

/**
 * Carta lista para dibujar. El Lienzo_Carta solo la recorre: todo descarte,
 * recorte y decision de disponibilidad ya ocurrio en `resolverCarta`.
 */
export interface CartaResuelta {
  /** Saludo dirigido a KawaValen, de a lo sumo 120 caracteres (Requisito 5.5). */
  readonly saludo: string;
  /**
   * Parrafos con caracteres visibles, en el orden declarado: de 1 a 20
   * elementos y a lo sumo 6000 caracteres en total cuando `disponible` es
   * verdadero; vacio cuando es falso (Requisito 5.1).
   */
  readonly parrafos: readonly string[];
  /** Firma del autor, de a lo sumo 120 caracteres (Requisito 5.6). */
  readonly firma: string;
  /**
   * Falso exactamente cuando ningun parrafo declarado tiene caracteres
   * visibles; el Lienzo_Carta muestra entonces el mensaje de respaldo y
   * conserva visible el Mapa_Estelar (Requisito 5.7).
   */
  readonly disponible: boolean;
}

/** Verdadero si el texto tiene al menos un caracter que no es espacio en blanco. */
function tieneContenido(texto: string): boolean {
  return texto.trim().length > 0;
}

/**
 * Recorta un texto a lo sumo a `maximo` unidades de codigo UTF-16 sin partir un
 * par suplente, de modo que un emoji nunca queda a medias.
 */
function recortarA(texto: string, maximo: number): string {
  if (texto.length <= maximo) {
    return texto;
  }
  let resultado = '';
  for (const punto of texto) {
    if (resultado.length + punto.length > maximo) {
      break;
    }
    resultado += punto;
  }
  return resultado;
}

/**
 * Resuelve la Carta del Archivo_Configuracion para el Lienzo_Carta.
 *
 * @param carta Saludo, parrafos y firma tal como los declara el
 *   Archivo_Configuracion.
 * @returns La Carta con los parrafos utiles en su orden declarado, dentro del
 *   tope de 6000 caracteres, y `disponible` en falso cuando no queda ninguno.
 */
export function resolverCarta(carta: CartaConfigurada): CartaResuelta {
  const saludo = recortarA(carta.saludo, MAX_CARACTERES_ROTULO);
  const firma = recortarA(carta.firma, MAX_CARACTERES_ROTULO);

  const utiles = carta.parrafos.filter(tieneContenido).slice(0, MAX_PARRAFOS_CARTA);

  const seleccionados: string[] = [];
  let total = 0;
  for (const parrafo of utiles) {
    if (total + parrafo.length <= MAX_CARACTERES_CARTA) {
      seleccionados.push(parrafo);
      total += parrafo.length;
      continue;
    }
    if (seleccionados.length === 0) {
      // Caso degenerado: el primer parrafo util no cabe entero. Se recorta en
      // lugar de dejar la Carta sin texto.
      seleccionados.push(recortarA(parrafo, MAX_CARACTERES_CARTA));
    }
    break;
  }

  return {
    saludo,
    parrafos: seleccionados,
    firma,
    disponible: seleccionados.length > 0,
  };
}
