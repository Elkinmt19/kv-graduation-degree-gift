import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { leerCatalogo } from '../../src/nucleo/catalogo/lector.js';
import type { CatalogoEstelar, Estrella, Segmento } from '../../src/nucleo/catalogo/modelo.js';
import { serializarCatalogo } from '../../src/nucleo/catalogo/serializador.js';
import { genCatalogoValido } from '../generadores.js';

/**
 * Propiedad 8: Ida y vuelta de objetos a documento y de vuelta a objetos.
 *
 * Para toda coleccion valida de objetos Estrella y Segmento, serializarla y
 * volver a leerla produce colecciones equivalentes a las originales: misma
 * cantidad de elementos, mismo conjunto de nombres de estrella, mismo conjunto
 * de pares de nombres de segmento y diferencia absoluta en ascension recta,
 * declinacion y magnitud aparente menor o igual a 0.000001.
 *
 * **Validates: Requirements 2.6**
 *
 * El generador compartido `genCatalogoValido` vive en `pruebas/generadores.ts`
 * y sesga la ascension recta hacia la frontera excluida de 24 h, que es donde
 * el redondeo a seis decimales del Serializador_Catalogo se roza con el
 * intervalo `[0, 24)` del Requisito 2.3.
 */

/** Tolerancia exacta del Requisito 2.6 para los campos numericos. */
const TOLERANCIA = 0.000001;

/** Clave textual de un Segmento, para comparar conjuntos de pares. */
function clavePar(segmento: Segmento): string {
  return `${JSON.stringify(segmento.desde)}->${JSON.stringify(segmento.hasta)}`;
}

/** Conjunto de claves, ordenado para que la comparacion no dependa del orden. */
function conjuntoOrdenado(claves: readonly string[]): readonly string[] {
  return [...new Set(claves)].sort();
}

/** Indexa las estrellas por nombre; los nombres son unicos (Requisito 2.10). */
function porNombre(estrellas: readonly Estrella[]): ReadonlyMap<string, Estrella> {
  return new Map(estrellas.map((estrella) => [estrella.nombre, estrella]));
}

/**
 * Comprueba la equivalencia tal como la define el Requisito 2.6, sin
 * relajaciones: cantidades, conjuntos de nombres, conjuntos de pares y los
 * tres campos numericos dentro de la tolerancia.
 */
function verificarEquivalencia(original: CatalogoEstelar, releido: CatalogoEstelar): void {
  // 1. Misma cantidad de elementos en ambas colecciones.
  expect(releido.estrellas).toHaveLength(original.estrellas.length);
  expect(releido.segmentos).toHaveLength(original.segmentos.length);

  // 2. Mismo conjunto de nombres de estrella.
  const nombresOriginales = conjuntoOrdenado(original.estrellas.map((e) => e.nombre));
  const nombresReleidos = conjuntoOrdenado(releido.estrellas.map((e) => e.nombre));
  expect(nombresReleidos).toEqual(nombresOriginales);

  // 3. Mismo conjunto de pares de nombres de segmento.
  expect(conjuntoOrdenado(releido.segmentos.map(clavePar))).toEqual(
    conjuntoOrdenado(original.segmentos.map(clavePar)),
  );

  // 4. Diferencia absoluta en ar, dec y magnitud menor o igual a 0.000001,
  //    emparejando por nombre, que es la identidad de la Estrella.
  const indice = porNombre(releido.estrellas);
  for (const estrella of original.estrellas) {
    const par = indice.get(estrella.nombre);
    expect(par, `falta la estrella ${estrella.nombre} tras la ida y vuelta`).toBeDefined();
    if (par === undefined) {
      continue;
    }
    for (const campo of ['ar', 'dec', 'magnitud'] as const) {
      const diferencia = Math.abs(par[campo] - estrella[campo]);
      expect(
        diferencia,
        `${campo} de ${estrella.nombre}: ${String(estrella[campo])} -> ${String(par[campo])}`,
      ).toBeLessThanOrEqual(TOLERANCIA);
    }
    // La constelacion es texto: se conserva sin perdida.
    expect(par.constelacion).toBe(estrella.constelacion);
  }
}

describe('Propiedad 8: ida y vuelta de objetos a documento y de vuelta a objetos', () => {
  it('para toda coleccion valida de Estrella y Segmento', () => {
    fc.assert(
      fc.property(genCatalogoValido, (catalogo) => {
        const documento = serializarCatalogo(catalogo);
        const resultado = leerCatalogo(documento);

        // El documento serializado de un catalogo valido siempre se relee: si
        // no, no hay equivalencia posible y el fallo debe nombrar el error.
        expect(
          resultado.ok,
          resultado.ok ? '' : `el documento serializado no se relee: ${JSON.stringify(resultado.error)}`,
        ).toBe(true);
        if (!resultado.ok) {
          return;
        }

        expect(resultado.catalogo.version).toBe(catalogo.version);
        expect(resultado.catalogo.epoca).toBe(catalogo.epoca);
        expect(resultado.catalogo.atribucion).toBe(catalogo.atribucion);

        verificarEquivalencia(catalogo, resultado.catalogo);
      }),
      { numRuns: 200 },
    );
  });
});
