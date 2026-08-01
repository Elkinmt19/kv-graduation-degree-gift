import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { aEcuatoriales, aHorizontales } from '../../src/nucleo/astronomia/horizontales.js';
import type { Ecuatorial } from '../../src/nucleo/astronomia/modelo.js';
import { genEstrella, genLatitud, genTiempoSidereo } from '../generadores.js';

/**
 * Propiedad 11: Ida y vuelta ecuatorial a horizontal y de vuelta a ecuatorial.
 *
 * *Para toda* Estrella, *para toda* latitud valida y *para todo* tiempo sidereo
 * local, convertir sus coordenadas ecuatoriales a Coordenadas_Horizontales y
 * aplicar la conversion inversa con el mismo instante y el mismo lugar
 * reproduce la ascension recta y la declinacion originales con un error angular
 * maximo de 0.01 grados.
 *
 * **Validates: Requirements 3.3**
 *
 * Dos decisiones de comparacion, ambas exigidas por la seccion de comparaciones
 * angulares del diseno:
 *
 * 1. **Distancia angular con envolvente.** La ascension recta es circular: 0 h
 *    y 24 h son el mismo meridiano, asi que una resta bruta se rompe en la
 *    costura. La ascension recta se compara con {@link distanciaEnvolvente} y la
 *    posicion completa con {@link distanciaEsferica}, que es la magnitud de la
 *    que habla el requisito ("error angular").
 * 2. **El punto degenerado se excluye, no se tolera.** En el polo celeste la
 *    ascension recta no esta definida (todos los meridianos se cruzan alli), y
 *    en el cenit exacto tampoco lo esta el azimut por el que pasa la vuelta.
 *    Esos dos casos se descartan con `fc.pre` **solo** para la comparacion de la
 *    ascension recta; relajar el margen de 0.01 grados en su lugar debilitaria
 *    la propiedad en todo el resto del espacio, que es donde tiene sentido.
 *
 * La declinacion y la distancia sobre la esfera se comprueban **siempre**,
 * incluidos el polo y el cenit: por eso las llamadas a `fc.pre` van despues de
 * esas dos aserciones y no al principio del cuerpo. Un caso descartado ya paso
 * por la parte de la propiedad que si esta definida en el.
 *
 * `horizontales.ts` documenta que `asin` pierde del orden de 1e-6 grados cuando
 * su argumento roza 1 (vecindad del cenit y de los polos). Es cuatro ordenes de
 * magnitud menos que el margen del requisito, de modo que la propiedad se
 * verifica al valor exacto de 0.01 grados que pide el Requisito 3.3.
 *
 * La ida y vuelta con ejemplos fijos vive en
 * `pruebas/unitarias/nucleo/astronomia/horizontales.test.ts`; aqui se cubre el
 * espacio completo de entrada.
 */

/** Margen del Requisito 3.3, en grados. */
const TOLERANCIA_GRADOS = 0.01;

/** Grados de angulo horario por hora de ascension recta. */
const GRADOS_POR_HORA = 15;

/**
 * Distancia al polo celeste, en grados, por debajo de la cual la ascension
 * recta esta mal condicionada: un residuo de 1e-6 grados en la posicion se
 * amplifica por `1 / cos(dec)` al leerlo como ascension recta. Con 0.1 grados de
 * margen el factor de amplificacion queda acotado por 573, es decir un error
 * maximo del orden de 6e-4 grados, muy por debajo de la tolerancia. La posicion
 * en si misma se sigue comparando en esos casos con {@link distanciaEsferica}.
 */
const MARGEN_POLAR_GRADOS = 0.1;

const GRADOS_A_RADIANES = Math.PI / 180;
const RADIANES_A_GRADOS = 180 / Math.PI;

/**
 * Distancia angular minima entre dos angulos circulares, en grados: el camino
 * corto, en [0, 180]. Es la formula `((a - b + 180) mod 360) - 180` del diseno,
 * con el resto llevado al intervalo positivo porque el `%` de JavaScript
 * conserva el signo del dividendo.
 */
function distanciaEnvolvente(a: number, b: number): number {
  const bruta = (((a - b + 180) % 360) + 360) % 360 - 180;
  return Math.abs(bruta);
}

/** Vector unitario de unas coordenadas ecuatoriales. */
function aVectorUnitario(eq: Ecuatorial): readonly [number, number, number] {
  const dec = eq.dec * GRADOS_A_RADIANES;
  const ar = eq.ar * GRADOS_POR_HORA * GRADOS_A_RADIANES;
  const cosDec = Math.cos(dec);
  return [cosDec * Math.cos(ar), cosDec * Math.sin(ar), Math.sin(dec)];
}

/**
 * Separacion angular sobre la esfera celeste, en grados.
 *
 * Se obtiene de la cuerda (`2 asin(|v1 - v2| / 2)`) y no de `acos(v1 · v2)`,
 * porque el arcocoseno pierde casi toda su precision relativa para angulos
 * pequenos, que son justamente los que esta propiedad mide. Al ser una
 * distancia sobre la esfera, absorbe por construccion tanto el paso de 24 h a
 * 0 h como la indeterminacion de la ascension recta en los polos.
 */
function distanciaEsferica(a: Ecuatorial, b: Ecuatorial): number {
  const [ax, ay, az] = aVectorUnitario(a);
  const [bx, by, bz] = aVectorUnitario(b);
  const cuerda = Math.hypot(ax - bx, ay - by, az - bz);
  return 2 * Math.asin(Math.min(1, cuerda / 2)) * RADIANES_A_GRADOS;
}

/** Coordenadas ecuatoriales de una Estrella generada. */
const genEcuatorial: fc.Arbitrary<Ecuatorial> = genEstrella.map(({ ar, dec }) => ({ ar, dec }));

describe('Propiedad 11: ida y vuelta ecuatorial <-> horizontal', () => {
  // Feature: kawavalen-graduation-gift, Property 11: Para toda Estrella, para toda latitud valida
  // y para todo tiempo sidereo local, convertir sus coordenadas ecuatoriales a Coordenadas_Horizontales
  // y aplicar la conversion inversa reproduce la ascension recta y la declinacion originales con un
  // error angular maximo de 0.01 grados.
  it('reproduce ascension recta y declinacion con error angular maximo de 0.01 grados', () => {
    fc.assert(
      fc.property(genEcuatorial, genLatitud, genTiempoSidereo, (eq, lat, tsl) => {
        const horizontal = aHorizontales(eq, lat, tsl);
        const vuelta = aEcuatoriales(horizontal, lat, tsl);

        // La declinacion no es circular: la diferencia bruta ya es el error.
        expect(Math.abs(vuelta.dec - eq.dec)).toBeLessThanOrEqual(TOLERANCIA_GRADOS);

        // El error angular del requisito, medido sobre la esfera. Vale en todo
        // el espacio de entrada, polo y cenit incluidos.
        expect(distanciaEsferica(eq, vuelta)).toBeLessThanOrEqual(TOLERANCIA_GRADOS);

        // A partir de aqui, solo los casos donde la ascension recta existe como
        // magnitud propia. En el polo celeste todos los meridianos coinciden, y
        // en el cenit exacto el azimut por el que la vuelta reconstruye el
        // angulo horario es geometricamente indeterminado: en ninguno de los dos
        // se puede exigir que la ascension recta se reproduzca, y en ambos la
        // asercion de la distancia esferica ya cubrio la parte que si aplica.
        fc.pre(Math.abs(eq.dec) <= 90 - MARGEN_POLAR_GRADOS);
        fc.pre(Math.abs(horizontal.altitud) !== 90);

        expect(
          distanciaEnvolvente(vuelta.ar * GRADOS_POR_HORA, eq.ar * GRADOS_POR_HORA),
        ).toBeLessThanOrEqual(TOLERANCIA_GRADOS);
      }),
      // Ida y vuelta del Motor_Astronomico: barata y de alto valor, 1000 casos.
      { numRuns: 1000 },
    );
  });
});
