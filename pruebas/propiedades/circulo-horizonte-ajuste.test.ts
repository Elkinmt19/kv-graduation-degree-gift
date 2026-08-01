import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  DIAMETRO_MINIMO,
  MARGEN_MINIMO,
  RADIO_MINIMO,
  cabeConMargen,
  calcularCirculo,
} from '../../src/vista/mapa/circulo.js';

/**
 * Propiedad 22: El Circulo_Horizonte cabe en cualquier tamano de ventana
 * admitido.
 *
 * *Para todo* ancho de ventana entre 320 y 1920 pixeles y *para todo* alto
 * entre 400 y 1200 pixeles, el Circulo_Horizonte calculado queda completo
 * dentro del area visible con un margen minimo de 8 pixeles por lado y un
 * diametro mayor o igual a 280 pixeles.
 *
 * **Validates: Requirements 4.12**
 *
 * El lado menor de cualquier caja admitida por esta propiedad nunca baja de
 * 320 px (min(320, 400)), muy por encima de los 296 px en los que el piso de
 * 140 px de `radioCirculo` empieza a comerse el margen (ver el comentario de
 * cabecera de `circulo.ts`). Por eso, dentro del rango que exige el
 * Requisito 4.12, el margen de 8 px por lado se cumple siempre y no solo
 * "cuando el piso no manda": la prueba lo afirma sin condicionales.
 */

/** Ancho de ventana admitido por el Requisito 4.12, con sesgo hacia sus bordes. */
const genAnchoVentanaMapa: fc.Arbitrary<number> = fc.oneof(
  { weight: 2, arbitrary: fc.integer({ min: 320, max: 1920 }) },
  { weight: 1, arbitrary: fc.constantFrom(320, 321, 1919, 1920) },
);

/** Alto de ventana admitido por el Requisito 4.12, con sesgo hacia sus bordes. */
const genAltoVentanaMapa: fc.Arbitrary<number> = fc.oneof(
  { weight: 2, arbitrary: fc.integer({ min: 400, max: 1200 }) },
  { weight: 1, arbitrary: fc.constantFrom(400, 401, 1199, 1200) },
);

describe('Propiedad 22: el Circulo_Horizonte cabe en cualquier tamano de ventana admitido', () => {
  it('para todo ancho entre 320 y 1920 px y todo alto entre 400 y 1200 px', () => {
    fc.assert(
      fc.property(genAnchoVentanaMapa, genAltoVentanaMapa, (ancho, alto) => {
        const circulo = calcularCirculo(ancho, alto);

        // Diametro minimo de 280 px (radio minimo de 140 px).
        expect(circulo.radio).toBeGreaterThanOrEqual(RADIO_MINIMO);
        expect(2 * circulo.radio).toBeGreaterThanOrEqual(DIAMETRO_MINIMO);

        // El circulo, centrado, queda completo dentro del area visible con un
        // margen minimo de 8 px por lado.
        expect(circulo.cx - circulo.radio).toBeGreaterThanOrEqual(MARGEN_MINIMO);
        expect(circulo.cx + circulo.radio).toBeLessThanOrEqual(ancho - MARGEN_MINIMO);
        expect(circulo.cy - circulo.radio).toBeGreaterThanOrEqual(MARGEN_MINIMO);
        expect(circulo.cy + circulo.radio).toBeLessThanOrEqual(alto - MARGEN_MINIMO);

        // Dentro de este rango el piso de 140 px nunca manda sobre el margen.
        expect(cabeConMargen(ancho, alto)).toBe(true);
      }),
      { numRuns: 600 },
    );
  });
});
