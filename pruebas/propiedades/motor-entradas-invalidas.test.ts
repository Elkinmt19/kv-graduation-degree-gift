import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type {
  CirculoHorizonte,
  InstanteGraduacion,
  LugarGraduacion,
} from '../../src/nucleo/astronomia/modelo.js';
import { calcularCielo, type ResultadoCielo } from '../../src/nucleo/astronomia/motor.js';
import type { CatalogoEstelar } from '../../src/nucleo/catalogo/modelo.js';
import { genCatalogoValido, genInstante, genLatitud, genLongitud } from '../generadores.js';

/**
 * Propiedad 16: Un lugar o un instante invalidos impiden todo calculo.
 *
 * *Para toda* latitud fuera de [-90, 90] grados, *para toda* longitud fuera de
 * (-180, 180] grados y *para toda* cadena de instante no interpretable como
 * fecha y hora con desplazamiento horario, el Motor_Astronomico devuelve un
 * error que identifica el campo invalido y el valor recibido, y no produce
 * Coordenadas_Horizontales para ninguna Estrella.
 *
 * **Validates: Requirements 3.9**
 *
 * ## Que se comprueba, y en las dos direcciones
 *
 * El requisito es un condicional, pero solo tiene contenido si tambien se
 * comprueba su contrario: un motor que rechazara *todo* satisfaria la mitad
 * literal del enunciado. Asi que la propiedad se asierta como bicondicional:
 *
 * - **Hacia el rechazo.** Toda entrada con un defecto se rechaza nombrando un
 *   campo que de verdad esta defectuoso, con el valor recibido tal cual llego.
 * - **Hacia la aceptacion.** Toda entrada sin defecto se acepta y produce
 *   Coordenadas_Horizontales para cada Estrella del catalogo.
 *
 * La segunda mitad usa los generadores validos compartidos (`genInstante`,
 * `genLatitud`, `genLongitud`), de modo que si el motor y los generadores
 * dejaran de estar de acuerdo sobre que es valido, la prueba lo dice.
 *
 * ## "No producir Coordenadas_Horizontales"
 *
 * En la rama de fallo no basta con que `cielo` sea nulo o este vacio: la union
 * discriminada de `ResultadoCielo` no debe **llevar** la propiedad `cielo` en
 * absoluto. Eso se comprueba con `not.toHaveProperty('cielo')` y, mas estricto,
 * comparando el conjunto exacto de claves del resultado con `['ok', 'error']`:
 * asi tampoco se cuela una coordenada parcial bajo otro nombre.
 *
 * ## Por que los generadores invalidos se definen aqui
 *
 * `pruebas/generadores.ts` solo exporta valores **validos** de latitud, longitud
 * e instante, que es lo que necesitan las demas propiedades. Los generadores de
 * valores fuera de rango y de cadenas malformadas viven solo en esta prueba,
 * sesgados a las fronteras: apenas pasado ±90 en la latitud, el -180 exacto en
 * la longitud (que debe **rechazarse**, porque el intervalo es abierto por la
 * izquierda) y apenas pasado ±180, mas `NaN` e infinitos en ambos casos.
 *
 * ## Coste
 *
 * Cada iteracion de la mitad de rechazo es baratisima: el motor se detiene antes
 * de tocar el catalogo. En la mitad de aceptacion se calcula el cielo completo,
 * y las estrellas se recorren juntando violaciones en un arreglo para aserfar
 * **una sola vez** por iteracion, en lugar de llamar a `expect` por estrella.
 */

/**
 * Tiempo maximo por prueba de esta suite. Holgado respecto de lo medido, para
 * que la suite no se caiga por contencion cuando el equipo corre varios
 * proyectos de Vitest a la vez.
 */
const TIEMPO_MAXIMO_MS = 20_000;

/** Circulo_Horizonte descentrado, para que un error de signo no pase inadvertido. */
const CIRCULO: CirculoHorizonte = { cx: 320, cy: 240, radio: 180 };

/** Nombres de lugar; no entran en el calculo, pero viajan en el resultado. */
const NOMBRES_LUGAR = ['Neiva, Huila', 'Polo Norte', 'Ushuaia', ''] as const;

/** Margen minusculo para pisar la frontera de un intervalo por fuera. */
const EPSILON = 1e-9;

// --- Generadores de valores invalidos ---------------------------------------

/**
 * Latitud inadmisible: fuera de [-90, 90], o no numerica. Las constantes cubren
 * la vecindad inmediata de las dos fronteras, que es donde vive el error de
 * escribir `>` donde va `>=`; las ramas continuas barren el resto del eje.
 */
const genLatitudInvalida: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.constantFrom(
      90 + EPSILON,
      90.000001,
      90.5,
      91,
      180,
      1000,
      -90 - EPSILON,
      -90.000001,
      -90.5,
      -91,
      -1000,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ),
  },
  {
    weight: 2,
    arbitrary: fc.double({
      min: 90,
      max: 1e6,
      minExcluded: true,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.double({
      min: -1e6,
      max: -90,
      maxExcluded: true,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  },
);

/**
 * Longitud inadmisible: fuera de (-180, 180], o no numerica. El -180 exacto
 * entra a proposito y con peso propio: el intervalo del Requisito 3.9 es abierto
 * por la izquierda, de modo que ese meridiano se escribe como 180 y su copia
 * negativa debe rechazarse.
 */
const genLongitudInvalida: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.constantFrom(
      -180,
      -180 - EPSILON,
      -180.000001,
      -180.5,
      -181,
      -360,
      180 + EPSILON,
      180.000001,
      180.5,
      181,
      360,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ),
  },
  {
    weight: 2,
    arbitrary: fc.double({
      min: 180,
      max: 1e6,
      minExcluded: true,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.double({
      min: -1e6,
      max: -180,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  },
);

/**
 * Cadenas de instante no interpretables: sin desplazamiento horario, con un
 * espacio en lugar de la `T`, con fecha imposible en el calendario, vacias y en
 * prosa. Todas se sostienen por si mismas, sin depender de un instante valido.
 */
const INSTANTES_MALFORMADOS = [
  '',
  ' ',
  'manana',
  'no es una fecha',
  'ayer a las diez',
  '2025-12-12',
  '2025-12-12T10:00',
  '2025-12-12T10:00:00',
  '2025-12-12 10:00:00-05:00',
  '2025-12-12T10:00:00-5:00',
  '2025-12-12T10:00:00-0500',
  '2025-12-12T10:00:00 -05:00',
  '2025-13-12T10:00:00-05:00',
  '2025-12-32T10:00:00-05:00',
  '2025-00-12T10:00:00-05:00',
  '2025-12-00T10:00:00-05:00',
  '2025-12-12T25:00:00-05:00',
  '2025-12-12T10:99:00-05:00',
  '12/12/2025 10:00 -05:00',
  '12 de diciembre de 2025, 10:00',
  '1765551600000',
  'T10:00:00Z',
] as const;

/**
 * Mutaciones que estropean un instante valido de una sola forma. Cada una
 * produce una cadena que el patron del motor rechaza, o que `Date.parse`
 * declara imposible.
 */
const MUTACIONES_INSTANTE = [
  'sin-desplazamiento',
  'desplazamiento-truncado',
  'espacio-en-vez-de-T',
  'solo-fecha',
  'mes-imposible',
  'dia-imposible',
  'hora-imposible',
  'espacio-al-inicio',
  'basura-al-final',
] as const;

type MutacionInstante = (typeof MUTACIONES_INSTANTE)[number];

/** Aplica a un ISO valido con desplazamiento `-05:00` la mutacion indicada. */
function estropear(iso: string, mutacion: MutacionInstante): string {
  switch (mutacion) {
    case 'sin-desplazamiento':
      // Quita el `-05:00`: sin desplazamiento la cadena no designa un instante.
      return iso.slice(0, -6);
    case 'desplazamiento-truncado':
      return iso.slice(0, -3);
    case 'espacio-en-vez-de-T':
      return iso.replace('T', ' ');
    case 'solo-fecha':
      return iso.slice(0, 10);
    case 'mes-imposible':
      return `${iso.slice(0, 5)}13${iso.slice(7)}`;
    case 'dia-imposible':
      return `${iso.slice(0, 8)}32${iso.slice(10)}`;
    case 'hora-imposible':
      return `${iso.slice(0, 11)}25${iso.slice(13)}`;
    case 'espacio-al-inicio':
      return ` ${iso}`;
    case 'basura-al-final':
      return `${iso} (hora de Colombia)`;
  }
}

/**
 * Instante_Graduacion cuya cadena no se puede interpretar. Los milisegundos que
 * lo acompanan se varian a proposito: el motor no debe fiarse de ellos cuando la
 * cadena es invalida.
 */
const genInstanteInvalido: fc.Arbitrary<InstanteGraduacion> = fc
  .tuple(
    fc.oneof(
      { weight: 3, arbitrary: fc.constantFrom(...INSTANTES_MALFORMADOS) },
      {
        weight: 3,
        arbitrary: fc
          .tuple(genInstante, fc.constantFrom(...MUTACIONES_INSTANTE))
          .map(([valido, mutacion]) => estropear(valido.iso, mutacion)),
      },
    ),
    fc.constantFrom(0, -0, 1_765_551_600_000, Number.NaN, Number.POSITIVE_INFINITY),
  )
  .map(([iso, msUtc]): InstanteGraduacion => ({ iso, msUtc }));

// --- Generadores de entradas -------------------------------------------------

/** Lugar_Graduacion valido: latitud en [-90, 90] y longitud en (-180, 180]. */
const genLugarValido: fc.Arbitrary<LugarGraduacion> = fc.record({
  nombre: fc.constantFrom(...NOMBRES_LUGAR),
  latitud: genLatitud,
  longitud: genLongitud,
});

/** Catalogos pequenos: la validacion no depende del tamano y esto abarata la suite. */
const genCatalogo: fc.Arbitrary<CatalogoEstelar> = genCatalogoValido;

// --- Utilidades de asercion --------------------------------------------------

/**
 * Comprueba la mitad "impiden todo calculo" del enunciado: el resultado es un
 * fallo y no acarrea coordenada alguna, ni completa ni parcial.
 *
 * @returns Lista de violaciones; vacia cuando el resultado es un rechazo limpio.
 */
function violacionesDeRechazo(resultado: ResultadoCielo): string[] {
  const fallos: string[] = [];
  if (resultado.ok) {
    fallos.push('se acepto una entrada con un defecto');
    return fallos;
  }
  if (Object.prototype.hasOwnProperty.call(resultado, 'cielo')) {
    fallos.push('la rama de fallo lleva la propiedad `cielo`');
  }
  const claves = Object.keys(resultado).sort();
  if (claves.join(',') !== 'error,ok') {
    fallos.push(`claves inesperadas en la rama de fallo: ${claves.join(', ')}`);
  }
  return fallos;
}

/** Texto de un numero que distingue `-0` de `0`, para los mensajes de fallo. */
function mostrar(valor: number): string {
  return Object.is(valor, -0) ? '-0' : String(valor);
}

describe('Propiedad 16: un lugar o un instante invalidos impiden todo calculo', () => {
  it(
    'rechaza toda latitud fuera de [-90, 90] nombrando el campo y el valor recibido',
    () => {
      fc.assert(
        fc.property(
          genCatalogo,
          genInstante,
          fc.constantFrom(...NOMBRES_LUGAR),
          genLatitudInvalida,
          genLongitud,
          (catalogo, instante, nombre, latitud, longitud) => {
            const resultado = calcularCielo(
              catalogo,
              instante,
              { nombre, latitud, longitud },
              CIRCULO,
            );

            const fallos = violacionesDeRechazo(resultado);
            if (!resultado.ok) {
              expect(resultado.error).toEqual({
                clase: 'lugar-invalido',
                campo: 'latitud',
                recibido: latitud,
              });
            }
            expect(fallos, `latitud ${mostrar(latitud)}`).toEqual([]);
          },
        ),
        { numRuns: 300 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );

  it(
    'rechaza toda longitud fuera de (-180, 180], incluido el -180 exacto',
    () => {
      fc.assert(
        fc.property(
          genCatalogo,
          genInstante,
          fc.constantFrom(...NOMBRES_LUGAR),
          genLatitud,
          genLongitudInvalida,
          (catalogo, instante, nombre, latitud, longitud) => {
            const resultado = calcularCielo(
              catalogo,
              instante,
              { nombre, latitud, longitud },
              CIRCULO,
            );

            const fallos = violacionesDeRechazo(resultado);
            if (!resultado.ok) {
              expect(resultado.error).toEqual({
                clase: 'lugar-invalido',
                campo: 'longitud',
                recibido: longitud,
              });
            }
            expect(fallos, `longitud ${mostrar(longitud)}`).toEqual([]);
          },
        ),
        { numRuns: 300 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );

  it(
    'rechaza toda cadena de instante no interpretable como fecha y hora con desplazamiento',
    () => {
      fc.assert(
        fc.property(
          genCatalogo,
          genInstanteInvalido,
          genLugarValido,
          (catalogo, instante, lugar) => {
            const resultado = calcularCielo(catalogo, instante, lugar, CIRCULO);

            const fallos = violacionesDeRechazo(resultado);
            if (!resultado.ok) {
              expect(resultado.error).toEqual({
                clase: 'instante-invalido',
                recibido: instante.iso,
              });
            }
            expect(fallos, `instante ${JSON.stringify(instante.iso)}`).toEqual([]);
          },
        ),
        { numRuns: 300 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );

  it(
    'con varios defectos a la vez sigue nombrando un campo realmente defectuoso',
    () => {
      // La precedencia documentada del motor es instante -> latitud -> longitud.
      // Cualquiera de los tres nombres identificaria un campo invalido real; se
      // fija el orden para que la prueba detecte tambien un cambio silencioso de
      // criterio.
      fc.assert(
        fc.property(
          genCatalogo,
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          genInstante,
          genInstanteInvalido,
          genLatitud,
          genLatitudInvalida,
          genLongitud,
          genLongitudInvalida,
          (
            catalogo,
            instanteRoto,
            latitudRota,
            longitudRota,
            instanteBueno,
            instanteMalo,
            latitudBuena,
            latitudMala,
            longitudBuena,
            longitudMala,
          ) => {
            // Al menos un defecto: si el sorteo no dio ninguno, se rompe el
            // instante, de modo que la propiedad siempre habla de la rama de
            // fallo. La rama de aceptacion la cubre la prueba siguiente.
            const conInstanteRoto = instanteRoto || (!latitudRota && !longitudRota);
            const instante = conInstanteRoto ? instanteMalo : instanteBueno;
            const latitud = latitudRota ? latitudMala : latitudBuena;
            const longitud = longitudRota ? longitudMala : longitudBuena;

            const resultado = calcularCielo(
              catalogo,
              instante,
              { nombre: 'Lugar mixto', latitud, longitud },
              CIRCULO,
            );

            const fallos = violacionesDeRechazo(resultado);
            if (!resultado.ok) {
              const esperado = conInstanteRoto
                ? { clase: 'instante-invalido', recibido: instante.iso }
                : latitudRota
                  ? { clase: 'lugar-invalido', campo: 'latitud', recibido: latitud }
                  : { clase: 'lugar-invalido', campo: 'longitud', recibido: longitud };
              expect(resultado.error).toEqual(esperado);
            }
            expect(
              fallos,
              `instante ${JSON.stringify(instante.iso)} · lat ${mostrar(latitud)} · lon ${mostrar(longitud)}`,
            ).toEqual([]);
          },
        ),
        { numRuns: 300 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );

  it(
    'la otra mitad del bicondicional: sin defecto alguno, el calculo se hace completo',
    () => {
      fc.assert(
        fc.property(genCatalogo, genInstante, genLugarValido, (catalogo, instante, lugar) => {
          const resultado = calcularCielo(catalogo, instante, lugar, CIRCULO);
          const contexto = `${instante.iso} · lat ${mostrar(lugar.latitud)} · lon ${mostrar(lugar.longitud)}`;

          if (!resultado.ok) {
            expect(
              [`entradas validas rechazadas con ${resultado.error.clase}`],
              contexto,
            ).toEqual([]);
            return;
          }

          // Coordenadas_Horizontales para cada Estrella, en el orden del
          // catalogo. Se juntan las violaciones y se asierta una sola vez.
          const fallos: string[] = [];
          if (resultado.cielo.estrellas.length !== catalogo.estrellas.length) {
            fallos.push(
              `estrellas calculadas: ${String(resultado.cielo.estrellas.length)} != ${String(catalogo.estrellas.length)}`,
            );
          }
          for (let indice = 0; indice < resultado.cielo.estrellas.length; indice += 1) {
            const calculada = resultado.cielo.estrellas[indice];
            if (calculada === undefined) {
              fallos.push(`estrella ${String(indice)}: ausente`);
              continue;
            }
            if (
              !Number.isFinite(calculada.horizontal.altitud) ||
              !Number.isFinite(calculada.horizontal.azimut)
            ) {
              fallos.push(
                `estrella ${String(indice)}: coordenada no finita (${String(calculada.horizontal.altitud)}, ${String(calculada.horizontal.azimut)})`,
              );
            }
          }
          expect(fallos, contexto).toEqual([]);
        }),
        { numRuns: 200 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );
});
