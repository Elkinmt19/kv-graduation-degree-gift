import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  MAX_ESTRELLAS,
  MAX_LONGITUD_TEXTO,
  MAX_SEGMENTOS,
  MIN_ESTRELLAS,
  leerCatalogo,
} from '../../src/nucleo/catalogo/lector.js';
import type { CatalogoEstelar } from '../../src/nucleo/catalogo/modelo.js';
import { genCatalogoValido } from '../generadores.js';

/**
 * Propiedad 5: La lectura de un catalogo valido conserva todas las entradas y
 * todos los campos.
 *
 * Para todo documento JSON valido del Catalogo_Estelar, el Lector_Catalogo
 * entrega una coleccion de Estrella con la misma cantidad de entradas, los
 * mismos nombres y constelaciones, y valores de ascension recta, declinacion y
 * magnitud iguales a los declarados, y una coleccion de Segmento con la misma
 * cantidad de pares y los mismos nombres de extremos.
 *
 * **Validates: Requirements 2.1**
 *
 * El documento se arma con `JSON.stringify` a partir del catalogo generado, de
 * modo que ningun valor se altera antes de la lectura: la ida y vuelta a traves
 * del Serializador_Catalogo, que redondea a seis decimales, es asunto de las
 * Propiedades 8 y 9, no de esta.
 */

/** Sangrias con las que se emite el documento; ninguna altera los valores. */
const SANGRIAS = [0, 2, '\t'] as const;

/**
 * Normaliza el cero negativo. La gramatica JSON no distingue -0 de 0, asi que
 * un `-0` generado se declara en el documento como `0` y la lectura devuelve
 * `0`. La diferencia es del formato, no del Lector_Catalogo.
 */
function sinCeroNegativo(valor: number): number {
  return valor + 0;
}

/** Emite el catalogo como documento JSON, sin tocar ningun valor. */
function documentoDe(catalogo: CatalogoEstelar, sangria: number | string): string {
  return JSON.stringify(catalogo, null, sangria);
}

describe('Propiedad 5: la lectura de un catalogo valido conserva todas las entradas y todos los campos', () => {
  it('para todo documento JSON valido del Catalogo_Estelar', () => {
    fc.assert(
      fc.property(genCatalogoValido, fc.constantFrom(...SANGRIAS), (esperado, sangria) => {
        // El catalogo generado respeta los limites de cantidad del Requisito 2.1.
        expect(esperado.estrellas.length).toBeGreaterThanOrEqual(MIN_ESTRELLAS);
        expect(esperado.estrellas.length).toBeLessThanOrEqual(MAX_ESTRELLAS);
        expect(esperado.segmentos.length).toBeLessThanOrEqual(MAX_SEGMENTOS);

        const resultado = leerCatalogo(documentoDe(esperado, sangria));
        if (!resultado.ok) {
          throw new Error(`documento valido rechazado: ${JSON.stringify(resultado.error)}`);
        }
        const leido = resultado.catalogo;

        // 1. Encabezado del documento.
        expect(leido.version).toBe(1);
        expect(leido.epoca).toBe('J2000.0');
        expect(leido.atribucion).toBe(esperado.atribucion);

        // 2. Misma cantidad de entradas en las dos colecciones.
        expect(leido.estrellas).toHaveLength(esperado.estrellas.length);
        expect(leido.segmentos).toHaveLength(esperado.segmentos.length);

        // 3. Los cinco campos de cada Estrella, exactos y en el orden declarado.
        for (let indice = 0; indice < esperado.estrellas.length; indice += 1) {
          const declarada = esperado.estrellas[indice];
          const obtenida = leido.estrellas[indice];
          if (declarada === undefined || obtenida === undefined) {
            throw new Error(`falta la estrella de indice ${String(indice)}`);
          }

          expect(obtenida.nombre).toBe(declarada.nombre);
          expect(obtenida.constelacion).toBe(declarada.constelacion);
          expect(obtenida.ar).toBe(sinCeroNegativo(declarada.ar));
          expect(obtenida.dec).toBe(sinCeroNegativo(declarada.dec));
          expect(obtenida.magnitud).toBe(sinCeroNegativo(declarada.magnitud));

          // Ni un campo de mas ni uno de menos.
          expect(Object.keys(obtenida).sort()).toEqual(
            ['ar', 'constelacion', 'dec', 'magnitud', 'nombre'],
          );
          expect(obtenida.nombre.length).toBeGreaterThan(0);
          expect(obtenida.nombre.length).toBeLessThanOrEqual(MAX_LONGITUD_TEXTO);
          expect(obtenida.constelacion.length).toBeGreaterThan(0);
          expect(obtenida.constelacion.length).toBeLessThanOrEqual(MAX_LONGITUD_TEXTO);
        }

        // 4. Los dos extremos de cada Segmento, en el orden declarado.
        for (let posicion = 0; posicion < esperado.segmentos.length; posicion += 1) {
          const declarado = esperado.segmentos[posicion];
          const obtenido = leido.segmentos[posicion];
          if (declarado === undefined || obtenido === undefined) {
            throw new Error(`falta el segmento de posicion ${String(posicion)}`);
          }

          expect(obtenido.desde).toBe(declarado.desde);
          expect(obtenido.hasta).toBe(declarado.hasta);
          expect(Object.keys(obtenido).sort()).toEqual(['desde', 'hasta']);
        }
      }),
      { numRuns: 200 },
    );
  });
});
