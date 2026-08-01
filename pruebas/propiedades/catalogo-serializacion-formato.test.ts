import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CatalogoEstelar } from '../../src/nucleo/catalogo/modelo.js';
import { serializarCatalogo } from '../../src/nucleo/catalogo/serializador.js';
import { genCatalogoValido } from '../generadores.js';

/**
 * Propiedad 7: La serializacion emite los cinco campos con al menos seis
 * decimales.
 *
 * **Validates: Requirements 2.5**
 *
 * La prueba mira el documento de dos maneras complementarias:
 *
 * 1. Como estructura, con `JSON.parse`: la forma del Catalogo_Estelar, los
 *    cinco campos de cada Estrella y los dos nombres de cada Segmento.
 * 2. Como texto crudo: `JSON.parse` normaliza `6.750000` a `6.75`, asi que la
 *    cantidad de decimales solo se puede verificar sobre los literales tal como
 *    quedaron escritos. Ese mismo examen descarta la notacion exponencial, que
 *    no es un literal numerico JSON valido.
 *
 * El generador `genCatalogoValido` vive en `pruebas/generadores.ts`.
 */

/** Campos numericos que el Requisito 2.5 obliga a escribir con >= 6 decimales. */
const CAMPOS_NUMERICOS = ['ar', 'dec', 'magnitud'] as const;

/** Error maximo admisible al redondear a seis decimales. */
const TOLERANCIA_REDONDEO = 5e-7;

/**
 * Literal numerico decimal con al menos seis decimales y sin exponente.
 * Al exigir la forma `entero.decimales` se rechaza de paso `1e-9`, `NaN`,
 * `Infinity` y cualquier otro token que JSON no acepta como numero.
 */
const LITERAL_CON_SEIS_DECIMALES = /^-?\d+\.\d{6,}$/;

/**
 * Extrae, en orden de aparicion, el nombre y el texto crudo de cada campo
 * numerico del documento.
 *
 * El `(?<!\\)` delante de la comilla evita confundir una clave real con la
 * secuencia `\"ar\":` que quedaria dentro de una cadena escapada. El valor se
 * toma hasta el proximo `,`, `}` o fin de linea, de modo que se ve el literal
 * completo, incluido cualquier sufijo exponencial.
 */
function literalesNumericos(texto: string): readonly { campo: string; literal: string }[] {
  const patron = /(?<!\\)"(ar|dec|magnitud)": ([^,}\n]*)/g;
  return [...texto.matchAll(patron)].map((coincidencia) => ({
    campo: coincidencia[1] ?? '',
    literal: coincidencia[2] ?? '',
  }));
}

/** Documento ya interpretado, con la forma minima que la propiedad inspecciona. */
interface DocumentoLeido {
  readonly version: unknown;
  readonly epoca: unknown;
  readonly atribucion: unknown;
  readonly estrellas: readonly Record<string, unknown>[];
  readonly segmentos: readonly Record<string, unknown>[];
}

describe('Propiedad 7: la serializacion emite los cinco campos con al menos seis decimales', () => {
  it('para toda coleccion valida de objetos Estrella y Segmento', () => {
    fc.assert(
      fc.property(genCatalogoValido, (catalogo: CatalogoEstelar) => {
        const texto = serializarCatalogo(catalogo);
        const documento = JSON.parse(texto) as DocumentoLeido;

        // 1. El documento tiene la forma del Catalogo_Estelar.
        expect(Object.keys(documento)).toEqual([
          'version',
          'epoca',
          'atribucion',
          'estrellas',
          'segmentos',
        ]);
        expect(documento.version).toBe(1);
        expect(documento.epoca).toBe('J2000.0');
        expect(documento.atribucion).toBe(catalogo.atribucion);

        // 2. Cada Estrella declara sus cinco campos, en el orden del modelo, y
        //    conserva el valor recibido.
        expect(documento.estrellas).toHaveLength(catalogo.estrellas.length);
        catalogo.estrellas.forEach((original, indice) => {
          const emitida = documento.estrellas[indice];
          expect(emitida).toBeDefined();
          expect(Object.keys(emitida ?? {})).toEqual([
            'nombre',
            'ar',
            'dec',
            'magnitud',
            'constelacion',
          ]);
          expect(emitida?.['nombre']).toBe(original.nombre);
          expect(emitida?.['constelacion']).toBe(original.constelacion);
          for (const campo of CAMPOS_NUMERICOS) {
            const valor = emitida?.[campo];
            expect(typeof valor).toBe('number');
            expect(Math.abs((valor as number) - original[campo])).toBeLessThanOrEqual(
              TOLERANCIA_REDONDEO,
            );
          }
        });

        // 3. Cada Segmento declara los nombres de sus dos extremos.
        expect(documento.segmentos).toHaveLength(catalogo.segmentos.length);
        catalogo.segmentos.forEach((original, indice) => {
          const emitido = documento.segmentos[indice];
          expect(emitido).toBeDefined();
          expect(Object.keys(emitido ?? {})).toEqual(['desde', 'hasta']);
          expect(emitido?.['desde']).toBe(original.desde);
          expect(emitido?.['hasta']).toBe(original.hasta);
        });

        // 4. Los literales numericos: uno por campo y por Estrella, en el orden
        //    ar, dec, magnitud, cada uno con al menos seis decimales y sin
        //    notacion exponencial.
        const literales = literalesNumericos(texto);
        expect(literales).toHaveLength(3 * catalogo.estrellas.length);
        literales.forEach(({ campo, literal }, posicion) => {
          expect(campo).toBe(CAMPOS_NUMERICOS[posicion % 3]);
          expect(literal).toMatch(LITERAL_CON_SEIS_DECIMALES);
        });
      }),
      { numRuns: 150 },
    );
  });
});
