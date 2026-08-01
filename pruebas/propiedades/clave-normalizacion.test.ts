import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizarClave } from '../../src/nucleo/clave.js';
import {
  genClave,
  genEspacioInterno,
  genRelleno,
  genTrozoVisible,
} from '../generadores.js';

/**
 * Propiedad 1: La normalizacion de la clave recorta los extremos, conserva el
 * interior y es idempotente.
 *
 * **Validates: Requirements 1.2**
 *
 * Los generadores compartidos (`genClave`, `genRelleno`, `genEspacioInterno` y
 * `genTrozoVisible`) viven en `pruebas/generadores.ts`; aqui solo se compone el
 * nucleo de clave que sirve de oraculo independiente de la implementacion.
 */

interface NucleoClave {
  /** Texto que no empieza ni termina con espacio en blanco (puede ser vacio). */
  readonly texto: string;
  /** Corridas de espacio en blanco internas, en orden de aparicion. */
  readonly espaciosInternos: readonly string[];
}

/**
 * Genera un nucleo de clave con espacios internos conocidos por construccion:
 * trozos visibles unidos por corridas de espacio en blanco. Al no haber espacio
 * en los extremos, el recorte no puede tocar el interior, y la lista de
 * corridas generadas sirve de oraculo independiente de la implementacion.
 */
const genNucleo: fc.Arbitrary<NucleoClave> = fc
  .array(genTrozoVisible, { maxLength: 5 })
  .chain((trozos) =>
    fc
      .array(genEspacioInterno, {
        minLength: Math.max(0, trozos.length - 1),
        maxLength: Math.max(0, trozos.length - 1),
      })
      .map((espaciosInternos) => {
        const texto = trozos.reduce(
          (acumulado, trozo, indice) =>
            indice === 0 ? trozo : `${acumulado}${espaciosInternos[indice - 1] ?? ''}${trozo}`,
          '',
        );
        return { texto, espaciosInternos };
      }),
  );

/** Extrae las corridas de espacio en blanco de una cadena, en orden. */
function corridasDeEspacio(texto: string): readonly string[] {
  return texto.match(/\s+/gu) ?? [];
}

/** Reconoce si el primero o el ultimo caracter es espacio en blanco. */
function tieneEspacioEnLosExtremos(texto: string): boolean {
  return /^\s/u.test(texto) || /\s$/u.test(texto);
}

describe('Propiedad 1: la normalizacion de la clave recorta los extremos, conserva el interior y es idempotente', () => {
  it('para toda cadena y todo relleno de espacio en blanco en los extremos', () => {
    fc.assert(
      fc.property(genNucleo, genRelleno, genRelleno, genClave, (nucleo, izquierda, derecha, claveLibre) => {
        const rellenada = `${izquierda}${nucleo.texto}${derecha}`;
        const resultado = normalizarClave(rellenada);

        // 1. El relleno de los extremos no cambia el resultado.
        expect(resultado).toBe(normalizarClave(nucleo.texto));

        // 2. El resultado no empieza ni termina con espacio en blanco.
        expect(tieneEspacioEnLosExtremos(resultado)).toBe(false);

        // 3. Conserva los espacios internos de la cadena original, y todo el
        //    interior salvo el paso a minusculas.
        expect(corridasDeEspacio(resultado)).toEqual([...nucleo.espaciosInternos]);
        expect(resultado).toBe(nucleo.texto.toLowerCase());

        // 4. Volver a normalizar no cambia el resultado (idempotencia).
        expect(normalizarClave(resultado)).toBe(resultado);

        // Los puntos 1, 2 y 4 valen tambien para cadenas arbitrarias.
        const libre = normalizarClave(claveLibre);
        expect(normalizarClave(`${izquierda}${claveLibre}${derecha}`)).toBe(libre);
        expect(tieneEspacioEnLosExtremos(libre)).toBe(false);
        expect(normalizarClave(libre)).toBe(libre);
      }),
      { numRuns: 300 },
    );
  });
});
