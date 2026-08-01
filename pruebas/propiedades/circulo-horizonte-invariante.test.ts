import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { CirculoHorizonte, Horizontal } from '../../src/nucleo/astronomia/modelo.js';
import { proyectar } from '../../src/nucleo/astronomia/proyeccion.js';
import { genAltitud, genAnchoVentana } from '../generadores.js';

/**
 * Propiedad 13: Invariante del Circulo_Horizonte.
 *
 * *Para toda* altitud mayor o igual a 0 grados, *para todo* azimut y *para
 * todo* Circulo_Horizonte, la distancia entre las coordenadas de pantalla
 * producidas y el centro del circulo es menor o igual al radio con una
 * tolerancia de 0.5 pixeles, y cuando la altitud es exactamente 0 grados esa
 * distancia iguala el radio con un error maximo de 0.5 pixeles.
 *
 * **Validates: Requirements 3.5**
 *
 * El contrato del requisito es la tolerancia de 0.5 px y es lo primero que se
 * afirma aqui. Como `proyeccion.ts` resuelve el cenit y el horizonte aparte
 * (`tangenteMitad` devuelve 0 y 1 exactos), el invariante se cumple con una
 * holgura muchisimo menor: las dos ultimas pruebas registran ese
 * comportamiento mas fuerte por separado, de modo que si alguna vez se degrada
 * a "solo dentro de 0.5 px" el fallo lo diga con claridad en lugar de pasar
 * inadvertido.
 *
 * Las pruebas unitarias de `pruebas/unitarias/.../proyeccion.test.ts` ya cubren
 * casos fijos con un unico circulo; esta propiedad los generaliza a cualquier
 * Circulo_Horizonte admisible.
 */

/** Tolerancia del Requisito 3.5, en pixeles. */
const TOLERANCIA_PX = 0.5;

/**
 * Holgura relativa del comportamiento fuerte: el unico error admitido es el de
 * la aritmetica de doble precision al descomponer el radio en (x, y) y volver
 * a componerlo con `hypot`, del orden de 1e-16 relativo. 1e-12 deja margen de
 * sobra sin dar por bueno un error de dibujo real.
 */
const HOLGURA_RELATIVA = 1e-12;

const EPSILON = 1e-9;

/** Radio minimo que exige el modelo, en pixeles (Requisitos 3.5, 4.12). */
const RADIO_MIN = 140;

/** Margen total del Mapa_Estelar, 8 px por lado (Requisito 4.12). */
const MARGEN_PX = 16;

/**
 * Radio del Circulo_Horizonte que produce la vista para una ventana dada:
 * `R = max(140, (min(ancho, alto) - 16) / 2)` (design.md, seccion 4, apartado
 * de cambio de tamano). Se define aqui a proposito en lugar de importarlo del
 * modulo del mapa, que todavia no existe: esta propiedad solo necesita radios
 * realistas, no la implementacion de la vista.
 */
function radioDelCirculo(ancho: number, alto: number): number {
  return Math.max(RADIO_MIN, (Math.min(ancho, alto) - MARGEN_PX) / 2);
}

/**
 * Radio del Circulo_Horizonte en pixeles. El modelo exige `radio >= 140`
 * (Requisitos 3.5, 4.12) y la vista lo calcula con {@link radioDelCirculo},
 * que con la ventana minima de 320 px da 152 y con la maxima de 1920 px llega
 * a 952. Las tres ramas cubren, en este orden, radios arbitrarios admisibles,
 * el 140 exacto y sus vecinos, y los radios que realmente puede pedir la
 * disposicion.
 */
const genRadio: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({ min: RADIO_MIN, max: 960, noNaN: true, noDefaultInfinity: true }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(140, 140 + EPSILON, 140.5, 152, 240.25, 476, 951.5, 952, 960),
  },
  {
    weight: 2,
    arbitrary: fc
      .tuple(genAnchoVentana, genAnchoVentana)
      .map(([ancho, alto]) => radioDelCirculo(ancho, alto)),
  },
);

/**
 * Coordenada del centro del circulo, en pixeles. Se admiten valores negativos
 * y muy alejados del origen: un centro descentrado delata los errores de signo
 * que un circulo centrado en (0, 0) esconde.
 */
const genCoordenadaCentro: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({ min: -2000, max: 2000, noNaN: true, noDefaultInfinity: true }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(0, 0.5, -0.5, 160, 320.5, 480, 960.75, 1920, -140),
  },
);

/** Circulo_Horizonte admisible cualquiera. */
const genCirculoHorizonte: fc.Arbitrary<CirculoHorizonte> = fc.record({
  cx: genCoordenadaCentro,
  cy: genCoordenadaCentro,
  radio: genRadio,
});

/**
 * Azimut en grados, en [0, 360), con sesgo hacia los cuatro angulos rectos
 * (donde el seno y el coseno son exactos) y hacia el paso por 0 y 360.
 */
const genAzimut: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({
      min: 0,
      max: 360,
      maxExcluded: true,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(0, EPSILON, 45, 90, 135, 180, 225, 270, 315, 359.999999, 360 - EPSILON),
  },
);

/** Los cuatro azimuts cardinales, donde la descomposicion en (x, y) es exacta. */
const genAzimutCardinal: fc.Arbitrary<number> = fc.constantFrom(0, 90, 180, 270);

/**
 * Altitud visible: la mitad no negativa de `genAltitud`, que ya esta sesgada
 * hacia el horizonte, mas peso extra para el 0 exacto, que es donde vive la
 * segunda mitad del Requisito 3.5.
 */
const genAltitudVisible: fc.Arbitrary<number> = fc.oneof(
  { weight: 4, arbitrary: genAltitud.filter((altitud) => altitud >= 0) },
  { weight: 1, arbitrary: fc.constant(0) },
);

/** Distancia entre el punto proyectado y el centro del Circulo_Horizonte. */
function distanciaAlCentro(h: Horizontal, c: CirculoHorizonte): number {
  const p = proyectar(h, c);
  return Math.hypot(p.x - c.cx, p.y - c.cy);
}

/**
 * Indica si la altitud generada sigue siendo distinguible de 0 tras la resta
 * `90 - altitud`. Una altitud positiva pero minuscula (por ejemplo 1e-300) se
 * pierde en el redondeo y produce exactamente el mismo punto que el horizonte,
 * asi que exigirle desigualdad estricta seria exigirle a IEEE-754 algo que no
 * puede dar.
 */
function distinguibleDelHorizonte(altitud: number): boolean {
  return 90 - altitud !== 90;
}

describe('Propiedad 13: invariante del Circulo_Horizonte', () => {
  it('toda altitud mayor o igual a 0 cae dentro del circulo con tolerancia de 0.5 px', () => {
    fc.assert(
      fc.property(genAltitudVisible, genAzimut, genCirculoHorizonte, (altitud, azimut, circulo) => {
        const distancia = distanciaAlCentro({ altitud, azimut }, circulo);

        expect(Number.isFinite(distancia)).toBe(true);
        expect(distancia).toBeLessThanOrEqual(circulo.radio + TOLERANCIA_PX);

        if (altitud === 0) {
          expect(Math.abs(distancia - circulo.radio)).toBeLessThanOrEqual(TOLERANCIA_PX);
        }
      }),
      { numRuns: 600 },
    );
  });

  it('la holgura real es de orden 1e-12 relativo, muy por debajo de la tolerancia', () => {
    // Comportamiento mas fuerte que el contrato: `tangenteMitad` devuelve 1
    // exacto en el horizonte y 0 exacto en el cenit, de modo que el unico error
    // que queda es el de descomponer el radio en (x, y) y recomponerlo.
    fc.assert(
      fc.property(genAltitudVisible, genAzimut, genCirculoHorizonte, (altitud, azimut, circulo) => {
        const distancia = distanciaAlCentro({ altitud, azimut }, circulo);
        const holgura = circulo.radio * HOLGURA_RELATIVA;

        expect(distancia).toBeLessThanOrEqual(circulo.radio + holgura);

        if (altitud === 0) {
          expect(Math.abs(distancia - circulo.radio)).toBeLessThanOrEqual(holgura);
        }
      }),
      { numRuns: 600 },
    );
  });

  it('con el centro en el origen y azimut cardinal el invariante es exacto', () => {
    // El centro en el origen y un azimut multiplo de 90 aislan la formula de la
    // proyeccion: el seno y el coseno son exactos y `hypot` recupera el radio
    // proyectado sin ningun redondeo intermedio. Ahi se ve el comportamiento
    // fuerte de `tangenteMitad`: el horizonte iguala el radio bit a bit y toda
    // altitud positiva queda estrictamente dentro.
    //
    // Con el centro fuera del origen esta igualdad exacta no se puede exigir, y
    // no por la proyeccion: `cy + r` y la resta posterior introducen un
    // redondeo propio del punto flotante (con cy = 160 y r = 140.00000000000009
    // la vuelta da 140.0000000000001). Ese caso lo cubren las dos pruebas
    // anteriores, cuya holgura relativa de 1e-12 lo absorbe de sobra.
    const genCirculoEnOrigen: fc.Arbitrary<CirculoHorizonte> = genRadio.map((radio) => ({
      cx: 0,
      cy: 0,
      radio,
    }));

    fc.assert(
      fc.property(
        genAltitudVisible,
        genAzimutCardinal,
        genCirculoEnOrigen,
        (altitud, azimut, circulo) => {
          const distancia = distanciaAlCentro({ altitud, azimut }, circulo);

          if (altitud === 0 || !distinguibleDelHorizonte(altitud)) {
            // La segunda rama es una altitud positiva tan pequena que el
            // redondeo de `90 - altitud` la confunde con el horizonte.
            expect(distancia).toBe(circulo.radio);
            return;
          }
          expect(distancia).toBeLessThan(circulo.radio);
        },
      ),
      { numRuns: 600 },
    );
  });
});
