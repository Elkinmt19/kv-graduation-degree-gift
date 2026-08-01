import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { leerCatalogo } from '../../src/nucleo/catalogo/lector.js';
import type { ResultadoLectura } from '../../src/nucleo/catalogo/lector.js';
import { genCatalogoValido, genMutacion } from '../generadores.js';
import type { DefectoCatalogo, MutacionCatalogo } from '../generadores.js';

/**
 * Propiedad 6: Todo documento invalido se rechaza sin colecciones parciales e
 * identificando la causa.
 *
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.9, 2.10**
 *
 * Se parte de un Catalogo_Estelar valido (`genCatalogoValido`) y se le
 * introduce **exactamente un** defecto con `genMutacion`, que entrega tanto el
 * documento mutado como el `ErrorCatalogo` esperado. La propiedad verifica tres
 * cosas por cada documento:
 *
 * 1. El desenlace es de fallo (`ok: false`).
 * 2. El resultado no lleva ninguna coleccion, ni completa ni parcial: en la
 *    rama de fallo no existe la propiedad `catalogo` (Requisitos 2.2, 2.8).
 * 3. El error identifica la causa: la clase corresponde al defecto aplicado y
 *    los campos que la acompanan nombran la posicion, el nombre o el campo
 *    afectado.
 *
 * Para el defecto `sintaxis` la posicion declarada por la mutacion es donde se
 * corrompio el texto; `JSON.parse` recorre de izquierda a derecha, de modo que
 * puede detectar el desajuste en ese punto o en uno posterior, nunca antes. Por
 * eso ahi la posicion se comprueba como cota inferior (Requisito 2.2). Para
 * todo defecto restante el error debe coincidir exactamente con el esperado.
 */

/** Documento con exactamente un defecto, sobre un catalogo valido cualquiera. */
const genDocumentoInvalido: fc.Arbitrary<MutacionCatalogo> = genCatalogoValido.chain((catalogo) =>
  genMutacion(catalogo),
);

/**
 * Clases de defecto que la propiedad debe ejercitar para cubrir los cinco
 * requisitos: sintaxis (2.2), rangos (2.3), segmentos (2.4), campos ausentes o
 * vacios (2.9) y nombres duplicados (2.10).
 */
const DEFECTOS_ESPERADOS: readonly DefectoCatalogo[] = [
  'sintaxis',
  'fuera-de-rango',
  'campo-ausente',
  'campo-vacio',
  'nombre-duplicado',
  'segmento-ausente',
  'segmento-repetido',
];

/**
 * Comprueba que el resultado no expone coleccion alguna. No basta con que
 * `catalogo` sea `undefined`: la propiedad no debe existir, de modo que ninguna
 * vista pueda leer una coleccion a medio construir.
 */
function sinColecciones(resultado: ResultadoLectura, contexto: string): void {
  expect(resultado, contexto).not.toHaveProperty('catalogo');
  expect(Object.keys(resultado).sort(), contexto).toEqual(['error', 'ok']);
}

describe('Propiedad 6: todo documento invalido se rechaza sin colecciones parciales e identificando la causa', () => {
  it('para todo catalogo valido y toda mutacion con exactamente un defecto', () => {
    const defectosVistos = new Set<DefectoCatalogo>();

    fc.assert(
      fc.property(genDocumentoInvalido, (mutacion) => {
        defectosVistos.add(mutacion.defecto);
        const contexto = `${mutacion.defecto}: ${mutacion.descripcion}`;
        const resultado = leerCatalogo(mutacion.documento);

        // 1. La lectura falla.
        expect(resultado.ok, contexto).toBe(false);
        if (resultado.ok) {
          return;
        }

        // 2. No viaja ninguna coleccion de Estrella ni de Segmento.
        sinColecciones(resultado, contexto);

        // 3. El error identifica la causa.
        expect(resultado.error.clase, contexto).toBe(mutacion.esperado.clase);

        if (mutacion.defecto === 'sintaxis') {
          // Requisito 2.2: se indica la posicion del caracter donde falla la
          // lectura. La corrupcion se detecta en el punto donde se introdujo o
          // mas adelante, nunca antes, y siempre dentro del documento.
          if (
            resultado.error.clase !== 'sintaxis-invalida' ||
            mutacion.esperado.clase !== 'sintaxis-invalida'
          ) {
            throw new Error(`clase inesperada para ${contexto}`);
          }
          expect(resultado.error.posicion, contexto).toBeGreaterThanOrEqual(
            mutacion.esperado.posicion,
          );
          expect(resultado.error.posicion, contexto).toBeLessThanOrEqual(
            mutacion.documento.length,
          );
          return;
        }

        // Requisitos 2.3, 2.4, 2.9 y 2.10: el error coincide campo por campo
        // con el esperado, de modo que nombra la entrada, el campo, el nombre o
        // la posicion del segmento segun el defecto aplicado.
        expect(resultado.error, contexto).toEqual(mutacion.esperado);
      }),
      { numRuns: 400 },
    );

    // Los cinco requisitos se cubren a traves de las clases de mutacion: si
    // alguna no aparecio, la propiedad no ejercito su requisito.
    for (const defecto of DEFECTOS_ESPERADOS) {
      expect(defectosVistos.has(defecto), `no se genero ningun defecto ${defecto}`).toBe(true);
    }
  });
});
