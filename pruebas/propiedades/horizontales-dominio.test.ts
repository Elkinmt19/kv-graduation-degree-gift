import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { aHorizontales } from '../../src/nucleo/astronomia/horizontales.js';
import type { Ecuatorial } from '../../src/nucleo/astronomia/modelo.js';
import type { Estrella } from '../../src/nucleo/catalogo/modelo.js';
import { genDeclinacion, genEstrella, genLatitud, genTiempoSidereo } from '../generadores.js';

/**
 * Propiedad 10: Las Coordenadas_Horizontales caen siempre en su dominio.
 *
 * *Para toda* Estrella, *para toda* latitud valida y *para todo* tiempo sidereo
 * local, `aHorizontales` produce una altitud dentro de [-90, 90] grados y un
 * azimut dentro de [0, 360) grados, ambos finitos y sin valores no numericos.
 *
 * **Validates: Requirements 3.1, 3.2**
 *
 * Detalles que la prueba vigila mas alla del enunciado literal:
 *
 * - El intervalo del azimut es **abierto por la derecha**: 360 grados es el
 *   mismo rumbo que 0 y admitirlo daria dos representaciones del norte, con lo
 *   que una comparacion de azimuts dejaria de ser fiable.
 * - El cero negativo se rechaza por la misma razon: `-0` y `0` se ven iguales
 *   al imprimirlos y son iguales con `===`, pero `Object.is` los distingue, y
 *   `atan2` devuelve `-0` sobre el eje norte. `horizontales.ts` lo colapsa a
 *   `0` a proposito y esta propiedad es la que lo sostiene.
 * - `NaN` se descarta de forma explicita: no basta con las comparaciones de
 *   intervalo, porque toda comparacion con `NaN` es falsa y un `toBeLessThan`
 *   sobre `NaN` fallaria por el motivo equivocado, sin nombrar la causa real
 *   (un `asin` cuyo argumento se salio de [-1, 1] por redondeo).
 *
 * Los casos degenerados no se dejan al azar. Los generadores ya estan sesgados
 * hacia ellos (`genLatitud` y `genDeclinacion` incluyen ±90 exactos y
 * `genTiempoSidereo` el paso por 0 y por 360), pero ademas se fijan como
 * `examples` de fast-check, que se ejecutan siempre y antes de las iteraciones
 * aleatorias: polos del observador y de la estrella, cenit y nadir exactos
 * (donde el azimut no esta definido geometricamente) y el cruce del tiempo
 * sidereo por 0 y 360 grados.
 */

/** Grados de angulo horario por hora de ascension recta. */
const GRADOS_POR_HORA = 15;

/** Latitud de Neiva, el Lugar_Graduacion por omision (Requisito 3.9). */
const LATITUD_NEIVA = 2.9273;

/** Margen minusculo para acercarse a una frontera sin tocarla. */
const EPSILON = 1e-9;

/** Estrella minima con las coordenadas pedidas; el resto de campos no influye. */
function estrella(ar: number, dec: number): Estrella {
  return { nombre: 'Caso limite', ar, dec, magnitud: 0, constelacion: 'Prueba' };
}

/**
 * Tiempo sidereo local que pone a la estrella en el meridiano superior
 * (`H = 0`). Con `dec === lat` la estrella queda en el cenit exacto y con
 * `dec === -lat` en el nadir.
 */
function tsEnMeridiano(ar: number): number {
  return (ar * GRADOS_POR_HORA) % 360;
}

/**
 * Casos degenerados obligatorios, en el orden de los generadores:
 * `[estrella, latitud, tiempo sidereo local]`.
 */
const CASOS_DEGENERADOS: [Estrella, number, number][] = [
  // Observador en los polos geograficos: cos(lat) = 0 y el azimut se degenera.
  [estrella(0, 0), 90, 0],
  [estrella(0, 0), -90, 0],
  [estrella(12, 45), 90, 180],
  [estrella(12, 45), -90, 180],
  // Estrella en los polos celestes: cos(dec) = 0, el angulo horario no importa.
  [estrella(0, 90), LATITUD_NEIVA, 123.456],
  [estrella(0, -90), LATITUD_NEIVA, 123.456],
  [estrella(23.999999, 90), 89.999999, 359.999999],
  // Polo sobre polo: las dos degeneraciones a la vez.
  [estrella(0, 90), 90, 0],
  [estrella(0, 90), -90, 0],
  [estrella(0, -90), 90, 0],
  [estrella(0, -90), -90, 0],
  // Cenit exacto: dec = lat con la estrella en el meridiano superior.
  [estrella(0, LATITUD_NEIVA), LATITUD_NEIVA, tsEnMeridiano(0)],
  [estrella(6, LATITUD_NEIVA), LATITUD_NEIVA, tsEnMeridiano(6)],
  [estrella(18, -45), -45, tsEnMeridiano(18)],
  // Nadir exacto: dec = -lat en el meridiano superior.
  [estrella(0, -LATITUD_NEIVA), LATITUD_NEIVA, tsEnMeridiano(0)],
  [estrella(12, -45), 45, tsEnMeridiano(12)],
  // Estrella justo en el meridiano inferior (H = 180).
  [estrella(0, LATITUD_NEIVA), LATITUD_NEIVA, 180],
  // Cruce del tiempo sidereo por 0 y por 360 grados.
  [estrella(0, 0), LATITUD_NEIVA, 0],
  [estrella(0, 0), LATITUD_NEIVA, EPSILON],
  [estrella(0, 0), LATITUD_NEIVA, 360 - EPSILON],
  [estrella(23.999999, 0), LATITUD_NEIVA, 0],
  [estrella(24 - EPSILON, 0), LATITUD_NEIVA, 360 - EPSILON],
  [estrella(0, 0), LATITUD_NEIVA, 359.999999],
];

/** Comprueba el dominio del Requisito 3.2 sobre un solo resultado. */
function verificarDominio(eq: Ecuatorial, lat: number, tsLocal: number): void {
  const { altitud, azimut } = aHorizontales(eq, lat, tsLocal);
  const contexto = `ar=${String(eq.ar)} dec=${String(eq.dec)} lat=${String(lat)} tsl=${String(tsLocal)}`;

  // Primero la finitud: sin esto, un NaN haria fallar las comparaciones de
  // intervalo sin decir por que.
  expect(Number.isFinite(altitud), `altitud no finita (${contexto})`).toBe(true);
  expect(Number.isFinite(azimut), `azimut no finito (${contexto})`).toBe(true);

  // Altitud en [-90, 90], ambos extremos incluidos: el cenit y el nadir son
  // direcciones legitimas.
  expect(altitud, `altitud fuera de [-90, 90] (${contexto})`).toBeGreaterThanOrEqual(-90);
  expect(altitud, `altitud fuera de [-90, 90] (${contexto})`).toBeLessThanOrEqual(90);

  // Azimut en [0, 360), con el 360 excluido.
  expect(azimut, `azimut menor que 0 (${contexto})`).toBeGreaterThanOrEqual(0);
  expect(azimut, `azimut mayor o igual a 360 (${contexto})`).toBeLessThan(360);
  expect(Object.is(azimut, -0), `azimut igual a -0 (${contexto})`).toBe(false);
}

describe('Propiedad 10: las Coordenadas_Horizontales caen siempre en su dominio', () => {
  it('para toda Estrella, toda latitud valida y todo tiempo sidereo local', () => {
    fc.assert(
      fc.property(genEstrella, genLatitud, genTiempoSidereo, (estrellaGenerada, lat, tsLocal) => {
        verificarDominio({ ar: estrellaGenerada.ar, dec: estrellaGenerada.dec }, lat, tsLocal);
      }),
      { numRuns: 1000, examples: CASOS_DEGENERADOS },
    );

    // El cenit y el nadir exactos merecen su propia rama generada: exigen la
    // coincidencia de tres valores (dec = ±lat y H = 0), una combinacion que el
    // muestreo independiente de los tres generadores no alcanza casi nunca.
    fc.assert(
      fc.property(
        genDeclinacion,
        genTiempoSidereo,
        fc.constantFrom(1, -1),
        (dec, tsLocal, signo) => {
          const ar = tsLocal / GRADOS_POR_HORA;
          verificarDominio({ ar, dec }, signo * dec, tsLocal);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
