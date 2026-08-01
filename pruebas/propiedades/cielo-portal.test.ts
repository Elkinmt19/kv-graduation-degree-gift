import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  DIAMETRO_MAXIMO,
  DIAMETRO_MINIMO,
  DURACION_CICLO_MAXIMA,
  DURACION_CICLO_MINIMA,
  OPACIDAD_MAXIMA_PUNTO,
  OPACIDAD_MINIMA_PUNTO,
  PUNTOS_MAXIMOS,
  PUNTOS_MINIMOS,
  fuentePseudoaleatoria,
  generarPuntos,
  semillaDesdeTexto,
  type PuntoLuminoso,
} from '../../src/vista/portal/cielo-fondo.js';

/**
 * Propiedad 28: El cielo animado del Portal_Acceso respeta sus rangos para
 * cualquier semilla.
 *
 * *Para toda* semilla, el fondo del Portal_Acceso genera entre 80 y 200 puntos
 * luminosos y asigna a cada uno un ciclo de animacion de duracion entre 4000 y
 * 12000 milisegundos.
 *
 * **Validates: Requirements 6.3**
 *
 * `generarPuntos` es una funcion pura de la semilla: no toca el DOM, no
 * consulta el reloj y no usa `Math.random`, asi que la propiedad vive en el
 * proyecto `node` y no necesita `jsdom`. El montaje en el DOM y la preferencia
 * de movimiento reducido se cubren en las pruebas unitarias de la vista.
 *
 * Ademas de los rangos del requisito se comprueban los invariantes que el
 * modulo documenta para el resto de los campos y el determinismo de la
 * generacion (Requisito 3.6 aplicado a lo visual), junto con una prueba de
 * variedad que descarta una implementacion degenerada que devolviera siempre
 * el mismo cielo.
 */

/** Fronteras exactas de la normalizacion a entero sin signo de 32 bits. */
const SEMILLAS_LIMITE = [
  0,
  -0,
  1,
  -1,
  2,
  -2,
  0.5,
  -0.5,
  0.999999,
  -0.999999,
  123.456,
  -123.456,
  2 ** 31,
  2 ** 31 - 1,
  -(2 ** 31),
  2 ** 32 - 1,
  2 ** 32,
  2 ** 32 + 1,
  -(2 ** 32),
  2 ** 53,
  -(2 ** 53),
  Number.MAX_SAFE_INTEGER,
  Number.MIN_SAFE_INTEGER,
  Number.MAX_VALUE,
  Number.MIN_VALUE,
  Number.EPSILON,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
] as const;

/**
 * Semilla hostil: enteros de 32 bits, decimales, negativos, magnitudes
 * enormes, `NaN` e infinitos. El modulo declara que reduce cualquier numero a
 * uint32, con `NaN` e infinitos cayendo en 0, de modo que ninguna de estas
 * entradas debe poder romper la generacion.
 */
const genSemilla: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 2 ** 32 - 1 }) },
  { weight: 2, arbitrary: fc.integer() },
  { weight: 2, arbitrary: fc.constantFrom(...SEMILLAS_LIMITE) },
  { weight: 2, arbitrary: fc.double({ min: -1e12, max: 1e12, noNaN: true }) },
  { weight: 1, arbitrary: fc.double() },
  { weight: 1, arbitrary: fc.string({ maxLength: 24 }).map(semillaDesdeTexto) },
);

/**
 * Tiempo maximo por prueba de esta suite, holgado respecto de lo que cuesta
 * cada propiedad una vez que los invariantes se comprueban con predicados
 * (decenas de milisegundos). No sustituye a esa mejora: solo evita que la
 * suite se caiga por contencion cuando el equipo corre varios proyectos de
 * Vitest en paralelo.
 */
const TIEMPO_MAXIMO_MS = 15_000;

/** Un valor real finito dentro del intervalo cerrado `[minimo, maximo]`. */
function esRealEn(valor: number, minimo: number, maximo: number): boolean {
  return Number.isFinite(valor) && valor >= minimo && valor <= maximo;
}

/** Un entero dentro del intervalo cerrado `[minimo, maximo]`. */
function esEnteroEn(valor: number, minimo: number, maximo: number): boolean {
  return Number.isInteger(valor) && valor >= minimo && valor <= maximo;
}

/**
 * Todos los invariantes de un punto, como un unico predicado.
 *
 * Se comprueba con aritmetica plana y no con `expect` porque cada semilla
 * produce hasta 200 puntos y cada propiedad recorre cientos de semillas: el
 * coste de la prueba estaba en la cantidad de aserciones, no en la logica
 * medida. Quien recorre los puntos junta las violaciones y asierta una sola
 * vez por semilla, como ya hace `contraste-texto.test.ts`.
 */
function puntoValido(punto: PuntoLuminoso): boolean {
  return (
    // Requisito 6.3: el ciclo de animacion es un entero de [4000, 12000] ms.
    esEnteroEn(punto.duracionCiclo, DURACION_CICLO_MINIMA, DURACION_CICLO_MAXIMA) &&
    esRealEn(punto.x, 0, 100) &&
    esRealEn(punto.y, 0, 100) &&
    esRealEn(punto.diametro, DIAMETRO_MINIMO, DIAMETRO_MAXIMO) &&
    esRealEn(punto.opacidad, OPACIDAD_MINIMA_PUNTO, OPACIDAD_MAXIMA_PUNTO) &&
    // El desfase se aplica como retardo negativo: debe quedar estrictamente
    // por debajo del ciclo para no adelantar la animacion mas de una vuelta.
    esEnteroEn(punto.desfase, 0, punto.duracionCiclo - 1)
  );
}

/**
 * Describe campo por campo lo que incumple un punto. Solo se llama cuando
 * `puntoValido` ya dijo que hay algo roto, asi que el coste de armar los
 * textos no entra en el camino feliz.
 */
function describirViolaciones(punto: PuntoLuminoso, indice: number): string[] {
  const fallos: string[] = [];
  const anotar = (campo: string, valor: number, esperado: string): void => {
    fallos.push(`punto ${String(indice)}: ${campo} = ${String(valor)}, se esperaba ${esperado}`);
  };

  if (!esEnteroEn(punto.duracionCiclo, DURACION_CICLO_MINIMA, DURACION_CICLO_MAXIMA)) {
    anotar(
      'duracionCiclo',
      punto.duracionCiclo,
      `entero de [${String(DURACION_CICLO_MINIMA)}, ${String(DURACION_CICLO_MAXIMA)}]`,
    );
  }
  if (!esRealEn(punto.x, 0, 100)) anotar('x', punto.x, 'real de [0, 100]');
  if (!esRealEn(punto.y, 0, 100)) anotar('y', punto.y, 'real de [0, 100]');
  if (!esRealEn(punto.diametro, DIAMETRO_MINIMO, DIAMETRO_MAXIMO)) {
    anotar(
      'diametro',
      punto.diametro,
      `real de [${String(DIAMETRO_MINIMO)}, ${String(DIAMETRO_MAXIMO)}]`,
    );
  }
  if (!esRealEn(punto.opacidad, OPACIDAD_MINIMA_PUNTO, OPACIDAD_MAXIMA_PUNTO)) {
    anotar(
      'opacidad',
      punto.opacidad,
      `real de [${String(OPACIDAD_MINIMA_PUNTO)}, ${String(OPACIDAD_MAXIMA_PUNTO)}]`,
    );
  }
  if (!esEnteroEn(punto.desfase, 0, punto.duracionCiclo - 1)) {
    anotar('desfase', punto.desfase, `entero de [0, ${String(punto.duracionCiclo)})`);
  }

  return fallos;
}

/**
 * Violaciones del cielo generado por una semilla: cantidad de puntos fuera de
 * [80, 200] y campos fuera de rango, con el indice del punto culpable. La lista
 * vacia significa que la semilla cumple la Propiedad 28 por completo.
 */
function violacionesDelCielo(semilla: number): string[] {
  const puntos = generarPuntos(semilla);
  const fallos: string[] = [];

  if (puntos.length < PUNTOS_MINIMOS || puntos.length > PUNTOS_MAXIMOS) {
    fallos.push(
      `cantidad = ${String(puntos.length)}, se esperaba [${String(PUNTOS_MINIMOS)}, ${String(PUNTOS_MAXIMOS)}]`,
    );
  }

  for (let indice = 0; indice < puntos.length; indice += 1) {
    const punto = puntos[indice];
    if (punto !== undefined && !puntoValido(punto)) {
      fallos.push(...describirViolaciones(punto, indice));
    }
  }

  return fallos;
}

describe('Propiedad 28: el cielo animado del Portal_Acceso respeta sus rangos para cualquier semilla', () => {
  it('genera entre 80 y 200 puntos para toda semilla', () => {
    fc.assert(
      fc.property(genSemilla, (semilla) => {
        const puntos = generarPuntos(semilla);

        expect(puntos.length).toBeGreaterThanOrEqual(PUNTOS_MINIMOS);
        expect(puntos.length).toBeLessThanOrEqual(PUNTOS_MAXIMOS);
      }),
      { numRuns: 500 },
    );
  });

  it(
    'asigna a cada punto un ciclo entero de 4000 a 12000 ms y respeta el resto de los rangos',
    () => {
      fc.assert(
        fc.property(genSemilla, (semilla) => {
          expect(violacionesDelCielo(semilla), `semilla ${String(semilla)}`).toEqual([]);
        }),
        { numRuns: 300 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );

  it(
    'cumple los rangos en las semillas limite de la normalizacion a uint32',
    () => {
      for (const semilla of SEMILLAS_LIMITE) {
        expect(violacionesDelCielo(semilla), `semilla ${String(semilla)}`).toEqual([]);
      }
    },
    TIEMPO_MAXIMO_MS,
  );

  it('es determinista: la misma semilla produce el mismo cielo (Requisito 3.6)', () => {
    fc.assert(
      fc.property(genSemilla, (semilla) => {
        expect(generarPuntos(semilla)).toStrictEqual(generarPuntos(semilla));
      }),
      { numRuns: 300 },
    );
  });

  it('trata `NaN` y los infinitos como la semilla 0, sin romper la generacion', () => {
    const cero = generarPuntos(0);

    for (const semilla of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(generarPuntos(semilla)).toStrictEqual(cero);
    }
  });

  it('produce cielos distintos para semillas distintas, asi que no es constante', () => {
    const distintos = new Set<string>();
    for (let semilla = 0; semilla < 12; semilla += 1) {
      distintos.add(JSON.stringify(generarPuntos(semilla)));
    }

    expect(distintos.size).toBeGreaterThan(1);
  });

  it('la fuente pseudoaleatoria devuelve valores de [0, 1) para toda semilla', () => {
    fc.assert(
      fc.property(genSemilla, (semilla) => {
        const siguiente = fuentePseudoaleatoria(semilla);

        for (let extraccion = 0; extraccion < 32; extraccion += 1) {
          const valor = siguiente();
          expect(Number.isFinite(valor)).toBe(true);
          expect(valor).toBeGreaterThanOrEqual(0);
          expect(valor).toBeLessThan(1);
        }
      }),
      { numRuns: 200 },
    );
  });
});
