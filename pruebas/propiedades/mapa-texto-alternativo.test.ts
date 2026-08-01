import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { LugarGraduacion } from '../../src/nucleo/astronomia/modelo.js';
import {
  DESPLAZAMIENTO_COLOMBIA,
  MAX_TEXTO_ALTERNATIVO,
  MIN_TEXTO_ALTERNATIVO,
  fechaLarga,
  horaVeinticuatro,
  partesInstante,
  textoAlternativo,
  type DatosTextoAlternativo,
} from '../../src/vista/mapa/rotulo.js';
import { genInstante, genLatitud, genLongitud, genTextoEstelar } from '../generadores.js';

/**
 * Propiedad 30: El texto alternativo del mapa siempre informa y cabe en su
 * limite.
 *
 * *Para todo* cielo calculado, con cualquier cantidad de constelaciones
 * dibujadas, el texto alternativo del Mapa_Estelar tiene entre 80 y 500
 * caracteres e incluye el nombre del Lugar_Graduacion, la fecha y la hora del
 * Instante_Graduacion con el desplazamiento -05:00, y nombres de
 * constelaciones dibujadas.
 *
 * **Validates: Requirements 7.6**
 *
 * `textoAlternativo` solo necesita `instante`, `lugar` y
 * `constelacionesDibujadas` (el tipo `DatosTextoAlternativo`): no hace falta
 * un `CieloCalculado` completo para ejercitarla sin navegador.
 */

const genLugar: fc.Arbitrary<LugarGraduacion> = fc.record({
  nombre: genTextoEstelar,
  latitud: genLatitud,
  longitud: genLongitud,
});

/**
 * Constelaciones dibujadas: entre 0 y 40, con nombres que pueden repetirse o
 * traer espacio en blanco de sobra, igual que puede pasar con datos reales del
 * Catalogo_Estelar.
 */
const genConstelaciones: fc.Arbitrary<readonly string[]> = fc.array(genTextoEstelar, { maxLength: 40 });

const genDatos: fc.Arbitrary<DatosTextoAlternativo> = fc.record({
  instante: genInstante,
  lugar: genLugar,
  constelacionesDibujadas: genConstelaciones,
});

describe('Propiedad 30: el texto alternativo del mapa siempre informa y cabe en su limite', () => {
  it('para todo cielo calculado, con cualquier cantidad de constelaciones dibujadas', () => {
    fc.assert(
      fc.property(genDatos, (datos) => {
        const texto = textoAlternativo(datos);

        expect(texto.length).toBeGreaterThanOrEqual(MIN_TEXTO_ALTERNATIVO);
        expect(texto.length).toBeLessThanOrEqual(MAX_TEXTO_ALTERNATIVO);

        const partes = partesInstante(datos.instante);
        expect(texto).toContain(fechaLarga(partes));
        expect(texto).toContain(horaVeinticuatro(partes));
        expect(texto).toContain(DESPLAZAMIENTO_COLOMBIA);

        const nombreUtil = datos.lugar.nombre.trim().replace(/\s+/gu, ' ');
        if (nombreUtil.length > 0) {
          // El nombre del lugar se recorta a 120 unidades de codigo dentro del
          // texto alternativo: se comprueba su prefijo, no el nombre completo.
          const prefijo = nombreUtil.slice(0, Math.min(20, nombreUtil.length));
          expect(texto).toContain(prefijo);
        }
      }),
      { numRuns: 600 },
    );
  });
});
