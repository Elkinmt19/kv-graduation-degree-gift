import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  MAGNITUD_MAXIMA,
  MAGNITUD_MINIMA,
  RADIO_MAXIMO,
  RADIO_MINIMO,
  radioPorMagnitud,
} from '../../src/vista/mapa/radio.js';
import { genMagnitud } from '../generadores.js';

/**
 * Propiedad 18: El radio de dibujo decrece de forma monotona con la magnitud.
 *
 * *Para todo* par de magnitudes aparentes tal que la primera es menor o igual
 * que la segunda, el radio de dibujo de la primera es mayor o igual que el de
 * la segunda; el radio vale 3.5 pixeles para magnitud -1.5 y para toda magnitud
 * menor, y 0.6 pixeles para magnitud 6.0 y para toda magnitud mayor.
 *
 * **Validates: Requirements 4.2**
 *
 * La prueba unitaria de `radio.test.ts` fija ejemplos concretos de la curva;
 * aqui se ejercita la relacion de orden sobre pares generados, incluidas
 * magnitudes fuera del intervalo util, que es donde vive el recorte.
 */

/**
 * Margen minimo entre dos magnitudes para exigir decrecimiento **estricto**.
 *
 * La curva es estrictamente decreciente en el continuo, pero su pendiente se
 * anula al acercarse a la magnitud 6.0 (`t^1.6` con `t -> 0`), de modo que dos
 * magnitudes separadas por menos que la resolucion del punto flotante pueden
 * producir el mismo `number`. Con una separacion de 1e-6 magnitudes la
 * diferencia de radios es del orden de 1e-11 px en el peor punto, muy por
 * encima del ulp de 0.6 (~1e-16), asi que la comparacion estricta es legitima.
 */
const SEPARACION_ESTRICTA = 1e-6;

/** Magnitudes por debajo del intervalo util, donde el radio se estanca en 3.5 px. */
const genMagnitudMuyBrillante: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({
      min: -40,
      max: MAGNITUD_MINIMA,
      maxExcluded: true,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      MAGNITUD_MINIMA - 1e-9,
      -1.500001,
      -1.51,
      -4,
      -12.6,
      -26.7,
      Number.NEGATIVE_INFINITY,
    ),
  },
);

/** Magnitudes por encima del intervalo util, donde el radio se estanca en 0.6 px. */
const genMagnitudMuyDebil: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({
      min: MAGNITUD_MAXIMA,
      max: 40,
      minExcluded: true,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      MAGNITUD_MAXIMA + 1e-9,
      6.000001,
      6.01,
      9,
      15.4,
      100,
      Number.POSITIVE_INFINITY,
    ),
  },
);

/**
 * Magnitud cualquiera: dentro del intervalo util (con el sesgo a las fronteras
 * del generador compartido) o fuera de el por cualquiera de los dos extremos.
 */
const genMagnitudCualquiera: fc.Arbitrary<number> = fc.oneof(
  { weight: 4, arbitrary: genMagnitud },
  { weight: 2, arbitrary: genMagnitudMuyBrillante },
  { weight: 2, arbitrary: genMagnitudMuyDebil },
);

/** Par de magnitudes ya ordenado: `m1 <= m2`. */
function ordenado(gen: fc.Arbitrary<number>): fc.Arbitrary<readonly [number, number]> {
  return fc
    .tuple(gen, gen)
    .map(([a, b]): readonly [number, number] => (a <= b ? [a, b] : [b, a]));
}

const dentro = (magnitud: number): boolean =>
  magnitud >= MAGNITUD_MINIMA && magnitud <= MAGNITUD_MAXIMA;

describe('Propiedad 18: el radio de dibujo decrece de forma monotona con la magnitud', () => {
  it('para todo par m1 <= m2, radio(m1) >= radio(m2) y ambos caen en [0.6, 3.5]', () => {
    fc.assert(
      fc.property(ordenado(genMagnitudCualquiera), ([m1, m2]) => {
        const r1 = radioPorMagnitud(m1);
        const r2 = radioPorMagnitud(m2);

        expect(r1).toBeGreaterThanOrEqual(r2);

        for (const radio of [r1, r2]) {
          expect(Number.isFinite(radio)).toBe(true);
          expect(radio).toBeGreaterThanOrEqual(RADIO_MINIMO);
          expect(radio).toBeLessThanOrEqual(RADIO_MAXIMO);
        }
      }),
      { numRuns: 600 },
    );
  });

  it('decrece de forma estricta cuando las dos magnitudes estan dentro de [-1.5, 6.0]', () => {
    fc.assert(
      fc.property(ordenado(genMagnitud), ([m1, m2]) => {
        // Se descartan los pares mas cercanos que la resolucion util del punto
        // flotante: en ellos el requisito solo obliga a no crecer.
        fc.pre(m2 - m1 >= SEPARACION_ESTRICTA);
        expect(radioPorMagnitud(m2)).toBeLessThan(radioPorMagnitud(m1));
      }),
      { numRuns: 600 },
    );
  });

  it('vale exactamente 3.5 px en la magnitud -1.5 y en toda magnitud menor', () => {
    expect(radioPorMagnitud(MAGNITUD_MINIMA)).toBe(RADIO_MAXIMO);
    fc.assert(
      fc.property(genMagnitudMuyBrillante, (magnitud) => {
        expect(radioPorMagnitud(magnitud)).toBe(RADIO_MAXIMO);
      }),
      { numRuns: 400 },
    );
  });

  it('vale exactamente 0.6 px en la magnitud 6.0 y en toda magnitud mayor', () => {
    expect(radioPorMagnitud(MAGNITUD_MAXIMA)).toBe(RADIO_MINIMO);
    fc.assert(
      fc.property(genMagnitudMuyDebil, (magnitud) => {
        expect(radioPorMagnitud(magnitud)).toBe(RADIO_MINIMO);
      }),
      { numRuns: 400 },
    );
  });

  it('el radio de una magnitud fuera del intervalo coincide con el de su frontera', () => {
    fc.assert(
      fc.property(genMagnitudCualquiera, (magnitud) => {
        const radio = radioPorMagnitud(magnitud);
        if (dentro(magnitud)) {
          return;
        }
        const frontera = magnitud < MAGNITUD_MINIMA ? MAGNITUD_MINIMA : MAGNITUD_MAXIMA;
        expect(radio).toBe(radioPorMagnitud(frontera));
      }),
      { numRuns: 400 },
    );
  });
});
