import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { CirculoHorizonte } from '../../src/nucleo/astronomia/modelo.js';
import { desproyectar, proyectar } from '../../src/nucleo/astronomia/proyeccion.js';
import { genAltitud, genAnchoVentana, genTiempoSidereo } from '../generadores.js';

/**
 * Propiedad 12: Ida y vuelta de la Proyeccion_Estereografica.
 *
 * *Para toda* altitud mayor o igual a 0 grados, *para todo* azimut y *para
 * todo* Circulo_Horizonte, aplicar la Proyeccion_Estereografica y luego su
 * inversa reproduce la altitud y el azimut originales con un error maximo de
 * 0.01 grados.
 *
 * **Validates: Requirements 3.4**
 *
 * La ida y vuelta con ejemplos fijos y un unico circulo ya vive en
 * `pruebas/unitarias/nucleo/astronomia/proyeccion.test.ts`. Esta propiedad
 * amplia esa cobertura en las dos direcciones donde se esconden los errores de
 * escala y de signo: barre el dominio completo de altitudes visibles y de
 * azimutes, y varia el Circulo_Horizonte, tanto los que salen de un tamano de
 * ventana real como otros descentrados de radio arbitrario.
 *
 * Junto con la ida y vuelta se comprueba la direccion util que senala el diseno
 * (seccion 4, apartado (g)): `alt = 0` cae sobre el borde del circulo y
 * `alt > 0` cae dentro. Es la otra mitad de la geometria; sin ella una
 * proyeccion con la escala del radio equivocada seguiria siendo invertible.
 */

/** Tolerancia del Requisito 3.4, en grados. */
const TOLERANCIA_GRADOS = 0.01;

/** Margen minusculo para acercarse a una frontera sin tocarla. */
const EPSILON = 1e-9;

/**
 * Distancia cenital, en grados, por debajo de la cual no se compara el azimut.
 *
 * En el cenit exacto (`altitud = 90`) el azimut es indeterminado: la proyeccion
 * lleva todos los azimutes al centro del circulo y la inversa no puede
 * devolver mas que el valor convenido 0. En su vecindad el azimut tampoco es
 * recuperable, y no por culpa de la formula: el punto proyectado dista del
 * centro `r = radio * tan(z / 2)`, de modo que con `z = 1e-9` grados y
 * `radio = 140` px ese desplazamiento vale 1.2e-9 px; sumarlo a una coordenada
 * del orden de 1e3 px y restarla despues deja un residuo comparable al propio
 * desplazamiento. Medido sobre este modulo, el error de azimut es de 6e-9
 * grados con `z = 1e-3`, de 6.4e-6 con `z = 1e-6` y ya de 6e-3 con `z = 1e-9`:
 * crece un orden de magnitud por cada orden que se acerca al cenit, asi que la
 * tolerancia de 0.01 grados se pierde en cuanto `z` baja de 1e-10.
 *
 * El umbral se fija en 1e-6 grados, cuatro ordenes de magnitud por encima de
 * donde empieza el problema. Se excluye esa vecindad del azimut en lugar de
 * aflojar la tolerancia porque la tolerancia es la del requisito: la altitud se
 * sigue comprobando en todos los casos, cenit exacto incluido, donde la ida y
 * vuelta es exacta.
 */
const UMBRAL_CENIT_GRADOS = 1e-6;

/**
 * Altitud, en grados, por encima de la cual se exige que el punto proyectado
 * caiga *estrictamente* dentro del circulo.
 *
 * `r = radio * tan((90 - alt) / 2)` es menor que `radio` para toda altitud
 * positiva, pero solo cuando la resta `90 - alt` es distinguible de 90 en
 * doble precision: con `alt = 1e-16`, `90 - alt` es exactamente 90 y el punto
 * cae sobre el borde, no dentro. La frontera medida esta en 1e-13 grados; el
 * umbral se pone en 1e-12 para no depender de un margen de un solo ULP. Por
 * debajo de el sigue valiendo la cota no estricta, que es lo que el
 * Requisito 3.5 pide de verdad (distancia menor o igual al radio).
 */
const UMBRAL_INTERIOR_GRADOS = 1e-12;

/**
 * Holgura en pixeles con la que se comparan las distancias al centro.
 *
 * La formula lleva `alt = 0` a `r = radio` exactamente, pero la distancia se
 * recupera de dos coordenadas de pantalla: `x = cx - r * sin(Az)` redondea, y
 * restarle `cx` despues deja un residuo del orden del ULP de `cx`. Medido sobre
 * este modulo con centros de hasta 2000 px, el residuo maximo es de 7e-13 px.
 * La holgura de 1e-9 px lo cubre con seis ordenes de magnitud de margen y sigue
 * siendo ocho ordenes mas estricta que los 0.5 px que admite el Requisito 3.5,
 * de modo que un error de escala real no pasaria por aqui.
 */
const HOLGURA_PIXELES = 1e-9;

/**
 * Radio del Circulo_Horizonte para una ventana dada, en pixeles.
 *
 * Es la formula del diseno (seccion 5, cambio de tamano): deja 8 px de margen
 * por lado y nunca baja de 140 px de radio, es decir de los 280 px de diametro
 * minimo del Requisito 4.12. Se define aqui, y no se importa del modulo de
 * mapa, porque ese modulo todavia no existe: esta prueba solo necesita la
 * relacion entre ventana y radio, no la implementacion de la vista.
 */
function radioCirculo(ancho: number, alto: number): number {
  return Math.max(140, (Math.min(ancho, alto) - 16) / 2);
}

/**
 * Altitud visible: el Requisito 3.4 acota la ida y vuelta a las altitudes
 * mayores o iguales a 0. Se filtra `genAltitud` en vez de escribir un rango
 * nuevo para conservar su sesgo hacia el horizonte y hacia el cenit, los dos
 * extremos delicados de la proyeccion.
 */
const genAltitudVisible: fc.Arbitrary<number> = genAltitud.filter((altitud) => altitud >= 0);

/**
 * Azimut en grados, en [0, 360). `genTiempoSidereo` genera exactamente ese
 * intervalo con sesgo hacia el paso por 0 y por 360 grados, que es donde se
 * rompe una resta ingenua de angulos; se le anaden los cuatro puntos
 * cardinales y las diagonales, donde `proyeccion.ts` resuelve el seno y el
 * coseno aparte para que las marcas del Requisito 4.7 caigan sin desviacion.
 */
const genAzimut: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: genTiempoSidereo },
  { weight: 2, arbitrary: fc.constantFrom(0, 45, 90, 135, 180, 225, 270, 315, 360 - EPSILON) },
);

/**
 * Circulo_Horizonte tal como lo construye el Mapa_Estelar: centrado en una
 * ventana real y con el radio que le corresponde por la formula del diseno.
 */
const genCirculoDeVentana: fc.Arbitrary<CirculoHorizonte> = fc
  .tuple(genAnchoVentana, genAnchoVentana)
  .map(([ancho, alto]) => ({
    cx: ancho / 2,
    cy: alto / 2,
    radio: radioCirculo(ancho, alto),
  }));

/**
 * Circulo_Horizonte descentrado y de radio arbitrario, siempre con
 * `radio >= 140` como exige el modelo. Los centros no enteros y alejados del
 * origen entran a proposito: con el centro en el origen un error de signo o de
 * escala en `x` o en `y` podria pasar inadvertido.
 */
const genCirculoLibre: fc.Arbitrary<CirculoHorizonte> = fc.record({
  cx: fc.oneof(
    { weight: 3, arbitrary: fc.double({ min: 0, max: 2000, noNaN: true, noDefaultInfinity: true }) },
    { weight: 2, arbitrary: fc.constantFrom(0, EPSILON, 240.5, 640.125, 2000) },
  ),
  cy: fc.oneof(
    { weight: 3, arbitrary: fc.double({ min: 0, max: 2000, noNaN: true, noDefaultInfinity: true }) },
    { weight: 2, arbitrary: fc.constantFrom(0, EPSILON, 320, 1000.75, 2000) },
  ),
  radio: fc.oneof(
    {
      weight: 3,
      arbitrary: fc.double({ min: 140, max: 2000, noNaN: true, noDefaultInfinity: true }),
    },
    { weight: 2, arbitrary: fc.constantFrom(140, 140 + EPSILON, 140.5, 360.75, 2000) },
  ),
});

/** Circulo_Horizonte valido, de una de las dos procedencias anteriores. */
const genCirculoHorizonte: fc.Arbitrary<CirculoHorizonte> = fc.oneof(
  { weight: 2, arbitrary: genCirculoDeVentana },
  { weight: 3, arbitrary: genCirculoLibre },
);

/**
 * Distancia angular entre dos azimutes en grados, con envoltura: 359.999 y
 * 0.001 distan 0.002 grados, no 359.998.
 */
function distanciaAngular(a: number, b: number): number {
  const bruta = Math.abs(a - b) % 360;
  return Math.min(bruta, 360 - bruta);
}

/** Distancia de un punto proyectado al centro de su Circulo_Horizonte. */
function distanciaAlCentro(altitud: number, azimut: number, circulo: CirculoHorizonte): number {
  const punto = proyectar({ altitud, azimut }, circulo);
  return Math.hypot(punto.x - circulo.cx, punto.y - circulo.cy);
}

describe('Propiedad 12: ida y vuelta de la Proyeccion_Estereografica', () => {
  // Feature: kawavalen-graduation-gift, Property 12: Para toda altitud mayor o igual a 0 grados,
  // para todo azimut y para todo Circulo_Horizonte, aplicar la Proyeccion_Estereografica y luego su
  // inversa reproduce la altitud y el azimut originales con un error maximo de 0.01 grados.
  it('reproduce altitud y azimut con un error maximo de 0.01 grados', () => {
    fc.assert(
      fc.property(genAltitudVisible, genAzimut, genCirculoHorizonte, (altitud, azimut, circulo) => {
        const vuelta = desproyectar(proyectar({ altitud, azimut }, circulo), circulo);

        expect(Number.isFinite(vuelta.altitud)).toBe(true);
        expect(Math.abs(vuelta.altitud - altitud)).toBeLessThanOrEqual(TOLERANCIA_GRADOS);

        // El azimut solo se compara fuera de la vecindad del cenit, donde la
        // proyeccion lo colapsa al centro del circulo (ver UMBRAL_CENIT_GRADOS).
        if (90 - altitud >= UMBRAL_CENIT_GRADOS) {
          expect(Number.isFinite(vuelta.azimut)).toBe(true);
          expect(vuelta.azimut).toBeGreaterThanOrEqual(0);
          expect(vuelta.azimut).toBeLessThan(360);
          expect(distanciaAngular(vuelta.azimut, azimut)).toBeLessThanOrEqual(TOLERANCIA_GRADOS);
        }
      }),
      // Ida y vuelta del Motor_Astronomico: barata y de alto valor, 1000 casos.
      { numRuns: 1000 },
    );
  });

  it('lleva el horizonte al borde del circulo y toda altitud positiva a su interior', () => {
    fc.assert(
      fc.property(genAltitudVisible, genAzimut, genCirculoHorizonte, (altitud, azimut, circulo) => {
        const distancia = distanciaAlCentro(altitud, azimut, circulo);

        // Toda altitud visible cae dentro del circulo, borde incluido.
        expect(distancia).toBeLessThanOrEqual(circulo.radio + HOLGURA_PIXELES);

        if (altitud === 0) {
          // El horizonte cae sobre el borde: r = radio por construccion.
          expect(Math.abs(distancia - circulo.radio)).toBeLessThanOrEqual(HOLGURA_PIXELES);
        } else if (altitud >= UMBRAL_INTERIOR_GRADOS) {
          // Por encima del horizonte, estrictamente dentro.
          expect(distancia).toBeLessThan(circulo.radio);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('coloca el cenit en el centro exacto del circulo', () => {
    fc.assert(
      fc.property(genAzimut, genCirculoHorizonte, (azimut, circulo) => {
        const punto = proyectar({ altitud: 90, azimut }, circulo);
        expect(punto.x).toBe(circulo.cx);
        expect(punto.y).toBe(circulo.cy);
        expect(desproyectar(punto, circulo).altitud).toBe(90);
      }),
      { numRuns: 200 },
    );
  });
});
