import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { EstrellaCalculada, Punto } from '../../src/nucleo/astronomia/modelo.js';
import {
  RADIO_DETECCION,
  construirRejilla,
  describirEstrella,
  resolverImpacto,
} from '../../src/vista/mapa/interaccion.js';
import { genEstrella } from '../generadores.js';

/**
 * Propiedad 20: La deteccion de la Estrella señalada devuelve siempre la mas
 * cercana dentro del radio.
 *
 * *Para todo* conjunto de Estrellas dibujadas y *para todo* punto señalado, si
 * existe alguna Estrella a 12 pixeles o menos del punto, el Mapa_Estelar
 * devuelve una Estrella cuya distancia al punto no es mayor que la de ninguna
 * otra, y su informacion se presenta con el nombre, la constelacion y la
 * magnitud aparente expresada con exactamente un decimal; si no existe
 * ninguna, no devuelve Estrella alguna.
 *
 * **Validates: Requirements 4.5, 4.14**
 *
 * Si la Estrella mas cercana a todo el conjunto (sin filtrar por radio) queda
 * a 12 px o menos, es tambien la mas cercana entre las que si caen dentro del
 * radio, porque el radio solo puede excluir candidatas, nunca acercarlas. Por
 * eso la prueba compara contra el minimo global: `resolverImpacto` devuelve
 * `null` exactamente cuando ese minimo supera los 12 px, y en caso contrario
 * la Estrella con esa distancia minima.
 */

/** Coordenada de pantalla, con sesgo hacia la frontera del radio de deteccion. */
const genCoordenada: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }) },
  { weight: 1, arbitrary: fc.constantFrom(-RADIO_DETECCION, 0, RADIO_DETECCION) },
);

const genPunto: fc.Arbitrary<Punto> = fc.record({ x: genCoordenada, y: genCoordenada });

/** Estrella calculada visible, con posicion de pantalla arbitraria. */
const genEstrellaCalculada: fc.Arbitrary<EstrellaCalculada> = fc
  .tuple(genEstrella, genPunto)
  .map(([estrella, pantalla]) => ({
    estrella,
    horizontal: { altitud: 45, azimut: 0 },
    visible: true,
    pantalla,
    radio: 1.5,
  }));

const genConjunto: fc.Arbitrary<readonly EstrellaCalculada[]> = fc.array(genEstrellaCalculada, {
  maxLength: 40,
});

function distancia(a: Punto, b: Punto): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('Propiedad 20: la deteccion de la Estrella senalada devuelve siempre la mas cercana dentro del radio', () => {
  it('para todo conjunto de Estrellas dibujadas y todo punto senalado', () => {
    fc.assert(
      fc.property(genConjunto, genPunto, (estrellas, punto) => {
        const rejilla = construirRejilla(estrellas);
        const impacto = resolverImpacto(rejilla, punto);

        const distancias = estrellas.map((e) => distancia(e.pantalla as Punto, punto));
        const minima = distancias.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...distancias);

        if (minima > RADIO_DETECCION) {
          expect(impacto).toBeNull();
          return;
        }

        expect(impacto).not.toBeNull();
        expect(impacto?.distancia).toBeCloseTo(minima, 6);
        for (const d of distancias) {
          expect(impacto?.distancia).toBeLessThanOrEqual(d + 1e-9);
        }

        const senalada = impacto?.senalable.calculada.estrella;
        const info = describirEstrella(senalada!);
        expect(info.nombre).toBe(senalada?.nombre);
        expect(info.constelacion).toBe(senalada?.constelacion);
        expect(info.magnitud).toMatch(/^-?\d+\.\d$/);
      }),
      { numRuns: 500 },
    );
  });
});
