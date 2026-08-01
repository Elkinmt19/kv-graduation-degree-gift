import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { leerCatalogo, type ResultadoLectura } from '../../src/nucleo/catalogo/lector.js';
import type { CatalogoEstelar } from '../../src/nucleo/catalogo/modelo.js';
import { serializarCatalogo } from '../../src/nucleo/catalogo/serializador.js';
import { genCatalogoValido } from '../generadores.js';

/**
 * Propiedad 9: Ida y vuelta de documento a objetos, a documento y de vuelta a
 * objetos.
 *
 * Para todo documento JSON valido del Catalogo_Estelar, leerlo, serializarlo y
 * volver a leerlo produce colecciones equivalentes entre la primera y la
 * segunda lectura, con el mismo criterio de equivalencia y la misma tolerancia
 * de 0.000001 del Requisito 2.6.
 *
 * **Validates: Requirements 2.7**
 *
 * El documento de partida se compone con `JSON.stringify` sobre un catalogo
 * generado: asi el texto es JSON valido y sus literales numericos conservan los
 * valores generados sin redondeo alguno, de modo que la unica perdida de
 * precision del ciclo es la del Serializador_Catalogo.
 */

/** Tolerancia del criterio de equivalencia (Requisitos 2.6 y 2.7). */
const TOLERANCIA = 0.000001;

/** Documento JSON del Catalogo_Estelar con los valores exactos del catalogo. */
function documentoDe(catalogo: CatalogoEstelar): string {
  return JSON.stringify(
    {
      version: catalogo.version,
      epoca: catalogo.epoca,
      atribucion: catalogo.atribucion,
      estrellas: catalogo.estrellas.map((estrella) => ({
        nombre: estrella.nombre,
        ar: estrella.ar,
        dec: estrella.dec,
        magnitud: estrella.magnitud,
        constelacion: estrella.constelacion,
      })),
      segmentos: catalogo.segmentos.map((segmento) => ({
        desde: segmento.desde,
        hasta: segmento.hasta,
      })),
    },
    null,
    2,
  );
}

/** Clave de un Segmento como par ordenado de nombres, sin ambiguedad posible. */
function claveSegmento(desde: string, hasta: string): string {
  return `${desde}\u0000${hasta}`;
}

/** Descripcion legible de un fallo de lectura, para el mensaje de la propiedad. */
function detalle(resultado: ResultadoLectura): string {
  return resultado.ok ? 'ok' : JSON.stringify(resultado.error);
}

describe('Propiedad 9: ida y vuelta de documento a objetos, a documento y de vuelta a objetos', () => {
  it('para todo documento JSON valido del Catalogo_Estelar', () => {
    fc.assert(
      fc.property(genCatalogoValido, (generado) => {
        const documento = documentoDe(generado);

        const primera = leerCatalogo(documento);
        expect(primera.ok, `la primera lectura fallo: ${detalle(primera)}`).toBe(true);
        if (!primera.ok) return;

        const segunda = leerCatalogo(serializarCatalogo(primera.catalogo));
        expect(segunda.ok, `la segunda lectura fallo: ${detalle(segunda)}`).toBe(true);
        if (!segunda.ok) return;

        const uno = primera.catalogo;
        const dos = segunda.catalogo;

        // 1. Misma cantidad de elementos en ambas colecciones.
        expect(dos.estrellas).toHaveLength(uno.estrellas.length);
        expect(dos.segmentos).toHaveLength(uno.segmentos.length);

        // 2. Mismo conjunto de nombres de estrella.
        const nombresUno = new Set(uno.estrellas.map((estrella) => estrella.nombre));
        const nombresDos = new Set(dos.estrellas.map((estrella) => estrella.nombre));
        expect(nombresDos).toEqual(nombresUno);

        // 3. Mismo conjunto de pares de nombres de segmento.
        const paresUno = new Set(
          uno.segmentos.map((segmento) => claveSegmento(segmento.desde, segmento.hasta)),
        );
        const paresDos = new Set(
          dos.segmentos.map((segmento) => claveSegmento(segmento.desde, segmento.hasta)),
        );
        expect(paresDos).toEqual(paresUno);

        // 4. Diferencia absoluta acotada por la tolerancia en los tres campos
        //    numericos, comparando estrella por estrella segun su nombre, que
        //    el punto 2 ya probo unico y compartido por las dos lecturas.
        const porNombre = new Map(dos.estrellas.map((estrella) => [estrella.nombre, estrella]));
        for (const estrella of uno.estrellas) {
          const relectura = porNombre.get(estrella.nombre);
          expect(relectura, `la relectura no contiene ${estrella.nombre}`).toBeDefined();
          if (relectura === undefined) return;

          expect(Math.abs(relectura.ar - estrella.ar)).toBeLessThanOrEqual(TOLERANCIA);
          expect(Math.abs(relectura.dec - estrella.dec)).toBeLessThanOrEqual(TOLERANCIA);
          expect(Math.abs(relectura.magnitud - estrella.magnitud)).toBeLessThanOrEqual(TOLERANCIA);
          expect(relectura.constelacion).toBe(estrella.constelacion);
        }

        // 5. La cabecera del documento sobrevive el ciclo completo.
        expect(dos.version).toBe(uno.version);
        expect(dos.epoca).toBe(uno.epoca);
        expect(dos.atribucion).toBe(uno.atribucion);
      }),
      { numRuns: 200 },
    );
  });
});
