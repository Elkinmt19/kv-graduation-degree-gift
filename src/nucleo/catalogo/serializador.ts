/**
 * Serializador_Catalogo: convierte un `CatalogoEstelar` ya validado en el
 * documento JSON del Catalogo_Estelar.
 *
 * `JSON.stringify` no puede forzar la cantidad de decimales de un numero
 * (`6.75` se emite como `6.75`), asi que el texto se compone campo por campo y
 * los numericos se insertan con `valor.toFixed(6)`, que sigue siendo un literal
 * numerico JSON valido (`6.750000`). Redondear a 6 decimales introduce un error
 * maximo de 5e-7, por debajo de la tolerancia de 1e-6 de los Requisitos 2.6 y
 * 2.7. El escape de cadenas se delega a `JSON.stringify`.
 *
 * Funcion pura: sin reloj, sin azar, sin E/S. La misma entrada produce siempre
 * el mismo texto, con las estrellas y los segmentos en el orden recibido.
 *
 * Requisitos: 2.5 (y sostiene 2.6 y 2.7).
 */

import type { CatalogoEstelar, Estrella, Segmento } from './modelo.js';

/** Decimales exigidos por el Requisito 2.5 en `ar`, `dec` y `magnitud`. */
const DECIMALES = 6;

/** Frontera excluida de la ascension recta, en horas (Requisito 2.3). */
const HORAS_POR_VUELTA = 24;

/** Cadena JSON con el escape estandar, delegado a `JSON.stringify`. */
function cadena(valor: string): string {
  return JSON.stringify(valor);
}

/**
 * Literal numerico JSON con exactamente seis decimales.
 *
 * `toFixed` produciria notacion exponencial (invalida en JSON) para magnitudes
 * >= 1e21, y `NaN` o `Infinity` para valores no finitos. Los invariantes del
 * `CatalogoEstelar` excluyen ambos casos; el respaldo evita emitir un documento
 * roto si alguien construye un catalogo fuera del Lector_Catalogo.
 */
function numero(valor: number): string {
  if (!Number.isFinite(valor) || Math.abs(valor) >= 1e21) {
    return (0).toFixed(DECIMALES);
  }
  return valor.toFixed(DECIMALES);
}

/**
 * Decimales maximos del respaldo de la ascension recta. Quince bastan para
 * cualquier doble menor que 24 (el mayor de ellos es 24 - 1.8e-15, y redondear
 * a 15 decimales solo alcanza 24 si el valor dista menos de 5e-16 de 24); el
 * margen hasta 20 evita depender de esa cuenta.
 */
const DECIMALES_MAX = 20;

/**
 * Literal de la ascension recta, con mas decimales cuando el redondeo a seis
 * cruzaria la frontera excluida de 24 horas.
 *
 * `toFixed(6)` redondea, de modo que una ascension recta valida a menos de
 * 5e-7 de 24 (por ejemplo 23.999999999) se emitiria como `24.000000`, valor
 * **fuera** del intervalo `[0, 24)` del Requisito 2.3: el Lector_Catalogo
 * rechazaria el documento y la ida y vuelta del Requisito 2.6 se romperia.
 *
 * En ese caso se amplian los decimales hasta que el literal vuelve a caer por
 * debajo de 24 (`23.999999999`). El Requisito 2.5 pide **al menos** seis
 * decimales, asi que el literal mas largo sigue siendo conforme, y a diferencia
 * de truncar a seis decimales (que costaria casi 1e-6, el limite mismo de la
 * tolerancia de los Requisitos 2.6 y 2.7) conserva el valor con el error del
 * redondeo ampliado, del orden de 1e-15.
 *
 * `dec` y `magnitud` no necesitan este cuidado: sus intervalos son cerrados,
 * asi que redondear hasta el extremo sigue produciendo un valor admisible.
 *
 * Una ascension recta que ya venga fuera de rango se emite tal cual, para que
 * la relectura la rechace en lugar de quedar disimulada.
 */
function numeroAscensionRecta(valor: number): string {
  const redondeado = numero(valor);
  if (!(valor < HORAS_POR_VUELTA) || Number.parseFloat(redondeado) < HORAS_POR_VUELTA) {
    return redondeado;
  }

  for (let decimales = DECIMALES + 1; decimales <= DECIMALES_MAX; decimales += 1) {
    const literal = valor.toFixed(decimales);
    if (Number.parseFloat(literal) < HORAS_POR_VUELTA) {
      return literal;
    }
  }

  // Inalcanzable para un doble menor que 24; ultimo recurso, el mayor literal
  // de seis decimales por debajo de la frontera.
  const escala = 10 ** DECIMALES;
  return (Math.floor(valor * escala) / escala).toFixed(DECIMALES);
}

/** Una Estrella con sus cinco campos, en el orden del modelo. */
function estrellaJson(estrella: Estrella): string {
  return (
    `{"nombre": ${cadena(estrella.nombre)}` +
    `, "ar": ${numeroAscensionRecta(estrella.ar)}` +
    `, "dec": ${numero(estrella.dec)}` +
    `, "magnitud": ${numero(estrella.magnitud)}` +
    `, "constelacion": ${cadena(estrella.constelacion)}}`
  );
}

/** Un Segmento con los nombres de sus dos extremos. */
function segmentoJson(segmento: Segmento): string {
  return `{"desde": ${cadena(segmento.desde)}, "hasta": ${cadena(segmento.hasta)}}`;
}

/**
 * Arreglo JSON con un elemento por linea, o `[]` cuando esta vacio.
 * Una linea por entrada mantiene el archivo legible y comparable por diff sin
 * el costo de tamano de la sangria completa.
 */
function arregloJson(elementos: readonly string[]): string {
  if (elementos.length === 0) return '[]';
  return `[\n    ${elementos.join(',\n    ')}\n  ]`;
}

/**
 * Requisito 2.5: JSON con los cinco campos por Estrella, los dos nombres por
 * Segmento y seis decimales en los numericos.
 */
export function serializarCatalogo(catalogo: CatalogoEstelar): string {
  const estrellas = arregloJson(catalogo.estrellas.map(estrellaJson));
  const segmentos = arregloJson(catalogo.segmentos.map(segmentoJson));

  return (
    '{\n' +
    `  "version": ${String(catalogo.version)},\n` +
    `  "epoca": ${cadena(catalogo.epoca)},\n` +
    `  "atribucion": ${cadena(catalogo.atribucion)},\n` +
    `  "estrellas": ${estrellas},\n` +
    `  "segmentos": ${segmentos}\n` +
    '}\n'
  );
}
