import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type {
  CieloCalculado,
  CirculoHorizonte,
  Horizontal,
  InstanteGraduacion,
  LugarGraduacion,
} from '../../src/nucleo/astronomia/modelo.js';
import { calcularCielo } from '../../src/nucleo/astronomia/motor.js';
import type { CatalogoEstelar, Estrella } from '../../src/nucleo/catalogo/modelo.js';
import { calcularCirculo } from '../../src/vista/mapa/circulo.js';
import {
  genAnchoVentana,
  genCatalogoValido,
  genInstante,
  genLatitud,
  genLongitud,
  instanteDesdeMs,
} from '../generadores.js';

/**
 * Propiedad 32: El cielo responde a los cambios de instante y de lugar.
 *
 * *Para todo* par de Instante_Graduacion separados por mas de un minuto, o
 * *para todo* par de Lugar_Graduacion separados por mas de un grado, el cielo
 * calculado difiere en la altitud o el azimut de al menos una Estrella por
 * encima de la tolerancia de comparacion, sin ninguna modificacion de la logica
 * de la Aplicacion.
 *
 * **Validates: Requirements 8.2**
 *
 * Es la contraparte de la Propiedad 14 (determinismo): juntas dicen que el
 * cielo es una funcion pura de sus entradas **y** que depende de verdad de
 * ellas. Un motor degenerado que devolviera siempre el mismo cielo pasaria el
 * determinismo y debe caer aqui.
 *
 * ## Como se formula "responde a los cambios" de modo que sea siempre cierto
 *
 * El enunciado ingenuo ("si cambia la entrada, el cielo cambia") es falso, y
 * por buenas razones astronomicas:
 *
 * - Una estrella exactamente en un polo celeste (`dec = ±90`) no se mueve nunca
 *   al pasar el tiempo: su altitud es la latitud del observador y su azimut es
 *   el norte o el sur. Un Catalogo_Estelar de una sola estrella polar (que
 *   `genCatalogoValido` puede producir, porque `genDeclinacion` esta sesgada a
 *   ±90) es un contraejemplo legitimo de la version ingenua.
 * - Un dia sidereo exacto devuelve el cielo a su lugar: esa es la Propiedad 15,
 *   no un fallo.
 * - Longitud y tiempo son intercambiables en su efecto sobre el angulo horario
 *   (15 grados de longitud equivalen a una hora sidereal), asi que un cambio de
 *   longitud puede compensar un cambio de tiempo y dejar el cielo intacto. Aqui
 *   **se varia una sola entrada a la vez**, con lo que la compensacion no puede
 *   aparecer; que exista es una propiedad real del cielo, no un error.
 *
 * La formulacion que si es siempre cierta se apoya en que las dos
 * perturbaciones son **rotaciones rigidas** del cielo respecto del observador,
 * exactamente y no de forma aproximada. Con `a = sen dec`, `b = cos dec cos H`
 * y `c = cos dec sen H`, las formulas de `horizontales.ts` son
 *
 * ```
 * norte  = a cos phi - b sen phi
 * este   = -c
 * arriba = a sen phi + b cos phi
 * ```
 *
 * de donde:
 *
 * - cambiar el instante o la longitud solo cambia `H`, es decir gira el par
 *   `(b, c)`: una rotacion alrededor del eje `a`, que en el marco del horizonte
 *   es la direccion del polo celeste, `(cos phi, 0, sen phi)` en la base
 *   (norte, este, arriba). El angulo girado es el cambio del tiempo sidereo
 *   local: `Δlongitud` en el caso de la longitud, y `360.98564736629` grados por
 *   dia sidereo transcurrido en el caso del tiempo;
 * - cambiar la latitud gira el par `(norte, arriba)` y deja `este` intacto: una
 *   rotacion alrededor del eje este, de angulo exactamente `Δlatitud`.
 *
 * Para una rotacion de angulo `psi` alrededor de un eje, un punto a distancia
 * angular `theta` del eje se desplaza sobre la esfera una distancia
 * `d = 2 asin(sen(psi/2) sen theta)`. La identidad es exacta. Y como el camino
 * "primero meridiano, despues paralelo" une los dos puntos con longitud
 * `|Δaltitud| + Δazimut · cos(altitud)`, que nunca es menor que la geodesica:
 *
 * ```
 * |Δaltitud| + Δazimut >= d        y por tanto        max(...) >= d / 2
 * ```
 *
 * Esa desigualdad es lo que se comprueba **estrella por estrella**: cada una se
 * mueve al menos lo que la geometria exige, y las polares quedan bien tratadas
 * sin excepciones, porque para ellas `sen theta = 0` y la cota es vacia por si
 * misma. `theta` se calcula con las coordenadas horizontales que devuelve el
 * propio motor, no con la declinacion del catalogo, de modo que la precesion no
 * entra en la cuenta.
 *
 * Para que la comprobacion no sea vacia se anaden al catalogo dos Estrellas
 * testigo sobre el ecuador celeste, separadas 6 horas de ascension recta. Sus
 * direcciones son ortogonales, y para todo eje unitario `u` se cumple
 * `(u·v)² + (u·w)² <= 1` cuando `v ⊥ w`, asi que **alguna de las dos** esta
 * siempre a `sen theta >= 1/√2` del eje, sea el eje el polo celeste o el este.
 * Con la rotacion minima que generan las entradas eso garantiza un movimiento
 * exigido muy por encima de la tolerancia. Sin los testigos la propiedad seria
 * falsa: el catalogo de una sola estrella polar no responde al paso del tiempo.
 *
 * ## Tolerancia y margen
 *
 * La tolerancia de comparacion se fija en 0.01 grados. No puede ser la de 0.5
 * grados de la Propiedad 15: un minuto de tiempo son 0.2507 grados de rotacion,
 * que reparten entre altitud y azimut un movimiento garantizado de 0.125 grados,
 * y afirmar medio grado seria afirmar algo falso. 0.01 grados queda siete
 * ordenes de magnitud por encima del ruido numerico del motor (1e-9 grados) y un
 * orden por debajo del piso geometrico, asi que la prueba es exigente y honesta.
 *
 * El margen numerico de 1e-3 grados (3.6 segundos de arco) cubre el unico
 * desajuste real del modelo: en el caso del tiempo los dos cielos se precesan a
 * dias julianos distintos, de modo que la transformacion no es exactamente una
 * rotacion. Con desfases acotados a poco mas de dos dias la precesion aporta
 * menos de 4e-5 grados, y la diferencia entre la tasa sidereal usada aqui y el
 * termino cuadratico del GMST del motor menos de 1e-7 grados. En los casos de
 * latitud y longitud los dos cielos comparten dia juliano y el desajuste es
 * solo el redondeo de punto flotante.
 *
 * ## Rendimiento
 *
 * Se recorren cientos de estrellas por iteracion, asi que los incumplimientos
 * se acumulan en una lista y se asierta **una sola vez por iteracion**, como en
 * `cielo-portal.test.ts`. Un `expect` por estrella multiplicaria por mil la
 * cantidad de aserciones y agotaria el tiempo de la prueba.
 */

const GRADOS_A_RADIANES = Math.PI / 180;
const RADIANES_A_GRADOS = 180 / Math.PI;

/** Tolerancia de comparacion del enunciado, en grados. */
const TOLERANCIA_COMPARACION = 0.01;

/** Margen concedido al motor frente a la cota geometrica exacta, en grados. */
const MARGEN_NUMERICO = 1e-3;

/**
 * Grados de rotacion del cielo por dia solar transcurrido: la tasa sidereal
 * (USNO, y termino lineal de Meeus 12.4). Se usa el valor de tabla y no el
 * tiempo sidereo que calcula el motor, para que la propiedad mida la respuesta
 * del motor contra una referencia externa y no contra si mismo.
 */
const GRADOS_POR_DIA_SIDEREO = 360.98564736629;

/** Segundos de un dia solar. */
const SEGUNDOS_POR_DIA = 86_400;

/** Dia sidereo redondeado al segundo, para construir desfases casi periodicos. */
const SEGUNDOS_DIA_SIDEREO = 86_164;

/** Desfase minimo entre dos Instante_Graduacion, en segundos (mas de un minuto). */
const DESFASE_MINIMO_SEGUNDOS = 61;

/** Desfase maximo, en segundos: poco mas de dos dias sidereos. */
const DESFASE_MAXIMO_SEGUNDOS = 2 * SEGUNDOS_DIA_SIDEREO + 3600;

/**
 * Rotacion minima admitida en el caso del tiempo, en grados. Descarta los
 * multiplos casi exactos del dia sidereo, donde el cielo vuelve a su lugar
 * (Propiedad 15) y la propiedad no tendria nada que exigir. El valor es
 * ligeramente inferior a los 0.2549 grados que produce el desfase minimo de 61
 * segundos, para que ese caso frontera si entre.
 */
const ROTACION_MINIMA_TIEMPO = 0.24;

/** Separacion minima entre dos Lugar_Graduacion, en grados (mas de un grado). */
const SEPARACION_MINIMA_LUGAR = 1;

/** Tiempo maximo por prueba, holgado frente al costo medido. */
const TIEMPO_MAXIMO_MS = 20_000;

/** Eje de la rotacion rigida que induce el cambio de una sola entrada. */
type EjeRotacion =
  /** Polo celeste: lo que gira al cambiar el instante o la longitud. */
  | { readonly clase: 'polo'; readonly latitud: number }
  /** Punto este del horizonte: lo que gira al cambiar la latitud. */
  | { readonly clase: 'este' };

/**
 * Dos Estrellas testigo sobre el ecuador celeste, separadas 6 horas de
 * ascension recta y por tanto ortogonales. Garantizan que el catalogo tenga
 * siempre una estrella lejos del eje de giro, sea cual sea el eje.
 *
 * Los nombres no pueden colisionar con los del catalogo generado: `generadores`
 * termina todos sus nombres en `-<indice>`, es decir en digitos.
 */
const TESTIGOS: readonly Estrella[] = [
  { nombre: 'Testigo-equinoccio', ar: 0, dec: 0, magnitud: 1, constelacion: 'Testigos' },
  { nombre: 'Testigo-solsticio', ar: 6, dec: 0, magnitud: 1, constelacion: 'Testigos' },
];

/** Catalogo_Estelar valido con las dos Estrellas testigo al final. */
const genCatalogoConTestigos: fc.Arbitrary<CatalogoEstelar> = genCatalogoValido.map(
  (catalogo) => ({ ...catalogo, estrellas: [...catalogo.estrellas, ...TESTIGOS] }),
);

/** Circulo_Horizonte a partir de una caja visible plausible. */
const genCirculo: fc.Arbitrary<CirculoHorizonte> = fc
  .tuple(genAnchoVentana, genAnchoVentana)
  .map(([ancho, alto]) => calcularCirculo(ancho, alto));

/** Distancia circular entre dos angulos en grados, en [0, 180]. */
function distanciaCircular(uno: number, otro: number): number {
  const bruta = Math.abs(uno - otro) % 360;
  return bruta > 180 ? 360 - bruta : bruta;
}

/** Grados que gira el cielo al desplazar el instante `segundos` segundos. */
function rotacionPorSegundos(segundos: number): number {
  return distanciaCircular((GRADOS_POR_DIA_SIDEREO * segundos) / SEGUNDOS_POR_DIA, 0);
}

/**
 * Desfase entre dos Instante_Graduacion, en segundos enteros: mas de un minuto,
 * a lo sumo dos dias sidereos y un poco, y con una rotacion inducida lejos de
 * los multiplos del dia sidereo.
 *
 * La rama sesgada incluye el desfase minimo exacto, medio dia sidereo (la
 * rotacion maxima) y las vecindades de uno y dos dias sidereos, que son
 * justamente los casos donde un motor accidentalmente periodico se delataria.
 */
const genDesfaseSegundos: fc.Arbitrary<number> = fc
  .tuple(
    fc.oneof(
      {
        weight: 3,
        arbitrary: fc.integer({ min: DESFASE_MINIMO_SEGUNDOS, max: 3600 }),
      },
      {
        weight: 3,
        arbitrary: fc.integer({ min: 3601, max: DESFASE_MAXIMO_SEGUNDOS }),
      },
      {
        weight: 2,
        arbitrary: fc.constantFrom(
          DESFASE_MINIMO_SEGUNDOS,
          62,
          90,
          120,
          600,
          3600,
          21_600,
          SEGUNDOS_DIA_SIDEREO / 2,
          SEGUNDOS_DIA_SIDEREO - 600,
          SEGUNDOS_DIA_SIDEREO - 61,
          SEGUNDOS_DIA_SIDEREO + 61,
          SEGUNDOS_DIA_SIDEREO + 600,
          2 * SEGUNDOS_DIA_SIDEREO - 900,
          2 * SEGUNDOS_DIA_SIDEREO + 900,
        ),
      },
    ),
    fc.constantFrom(1, -1),
  )
  .map(([magnitud, signo]) => signo * Math.round(magnitud))
  .filter((desfase) => rotacionPorSegundos(desfase) >= ROTACION_MINIMA_TIEMPO);

/** Par de latitudes separadas por mas de un grado. */
const genParDeLatitudes: fc.Arbitrary<readonly [number, number]> = fc
  .tuple(genLatitud, genLatitud)
  .filter(([una, otra]) => Math.abs(una - otra) >= SEPARACION_MINIMA_LUGAR);

/**
 * Par de longitudes separadas por mas de un grado **sobre el globo**. La
 * distancia se mide de forma circular a proposito: -179.999999 y 180 difieren en
 * casi 360 grados de aritmetica plana y son practicamente el mismo meridiano.
 */
const genParDeLongitudes: fc.Arbitrary<readonly [number, number]> = fc
  .tuple(genLongitud, genLongitud)
  .filter(([una, otra]) => distanciaCircular(una, otra) >= SEPARACION_MINIMA_LUGAR);

/** Lugar_Graduacion con nombre irrelevante para el calculo. */
function lugar(latitud: number, longitud: number): LugarGraduacion {
  return { nombre: 'Lugar de la ceremonia', latitud, longitud };
}

/** Cielo calculado, exigiendo que el motor acepte unas entradas validas. */
function cieloDe(
  catalogo: CatalogoEstelar,
  instante: InstanteGraduacion,
  sitio: LugarGraduacion,
  circulo: CirculoHorizonte,
): CieloCalculado {
  const resultado = calcularCielo(catalogo, instante, sitio, circulo);
  if (!resultado.ok) {
    throw new Error(`el motor rechazo entradas validas: ${JSON.stringify(resultado.error)}`);
  }
  return resultado.cielo;
}

/**
 * Seno de la distancia angular entre una direccion del cielo y el eje de giro.
 * Es el factor que decide cuanto se desplaza esa direccion: sobre el eje no se
 * mueve, a 90 grados del eje se mueve todo el angulo girado.
 */
function senoAlEje(horizontal: Horizontal, eje: EjeRotacion): number {
  const altitud = horizontal.altitud * GRADOS_A_RADIANES;
  const azimut = horizontal.azimut * GRADOS_A_RADIANES;
  const cosAltitud = Math.cos(altitud);
  const norte = cosAltitud * Math.cos(azimut);
  const este = cosAltitud * Math.sin(azimut);
  const arriba = Math.sin(altitud);

  const cosenoAlEje =
    eje.clase === 'este'
      ? este
      : norte * Math.cos(eje.latitud * GRADOS_A_RADIANES) +
        arriba * Math.sin(eje.latitud * GRADOS_A_RADIANES);

  return Math.sqrt(Math.max(0, 1 - cosenoAlEje * cosenoAlEje));
}

/**
 * Distancia angular exacta que recorre una direccion a `theta` del eje cuando
 * el cielo gira `rotacion` grados: `d = 2 asin(sen(rotacion / 2) sen theta)`.
 */
function desplazamientoExigido(rotacion: number, seno: number): number {
  const argumento = Math.min(1, Math.abs(Math.sin((rotacion / 2) * GRADOS_A_RADIANES)) * seno);
  return 2 * Math.asin(argumento) * RADIANES_A_GRADOS;
}

/** Resumen de la respuesta del cielo a una sola perturbacion. */
interface Respuesta {
  /** Estrellas que se movieron menos de lo que la geometria exige. */
  readonly fallos: readonly string[];
  /** El mayor `max(|Δaltitud|, Δazimut)` observado, en grados. */
  readonly movimientoObservado: number;
  /** La mayor cota inferior `d / 2` exigida por la geometria, en grados. */
  readonly movimientoExigido: number;
}

/**
 * Compara dos cielos que difieren en una sola entrada y que por tanto se
 * relacionan por una rotacion de `rotacion` grados alrededor de `eje`.
 *
 * `estrellas[i]` corresponde a `catalogo.estrellas[i]` en ambos cielos, asi que
 * el indice basta para emparejarlas.
 */
function compararCielos(
  uno: CieloCalculado,
  otro: CieloCalculado,
  eje: EjeRotacion,
  rotacion: number,
): Respuesta {
  const fallos: string[] = [];
  let movimientoObservado = 0;
  let movimientoExigido = 0;

  for (let indice = 0; indice < uno.estrellas.length; indice += 1) {
    const antes = uno.estrellas[indice];
    const despues = otro.estrellas[indice];
    if (antes === undefined || despues === undefined) {
      fallos.push(`estrella ${String(indice)}: los dos cielos no tienen la misma cantidad`);
      continue;
    }

    const deltaAltitud = Math.abs(antes.horizontal.altitud - despues.horizontal.altitud);
    const deltaAzimut = distanciaCircular(antes.horizontal.azimut, despues.horizontal.azimut);
    const exigido = desplazamientoExigido(rotacion, senoAlEje(antes.horizontal, eje));

    // La geodesica nunca supera al camino "meridiano y despues paralelo".
    if (deltaAltitud + deltaAzimut + MARGEN_NUMERICO < exigido) {
      fallos.push(
        `${antes.estrella.nombre}: se movio |Δalt| = ${String(deltaAltitud)} y ` +
          `Δaz = ${String(deltaAzimut)} grados, y la geometria exige al menos ` +
          `${String(exigido)} grados repartidos entre ambos`,
      );
    }

    movimientoObservado = Math.max(movimientoObservado, deltaAltitud, deltaAzimut);
    movimientoExigido = Math.max(movimientoExigido, exigido / 2);
  }

  return { fallos, movimientoObservado, movimientoExigido };
}

/** Comprueba las tres afirmaciones de la propiedad sobre una perturbacion. */
function esperarRespuesta(respuesta: Respuesta, contexto: string): void {
  expect(respuesta.fallos, contexto).toEqual([]);
  // El generador debe producir perturbaciones con consecuencia medible: si esto
  // fallara, la afirmacion siguiente seria vacia.
  expect(respuesta.movimientoExigido, `${contexto}: piso geometrico`).toBeGreaterThan(
    TOLERANCIA_COMPARACION,
  );
  expect(respuesta.movimientoObservado, `${contexto}: movimiento observado`).toBeGreaterThan(
    TOLERANCIA_COMPARACION,
  );
}

describe('Propiedad 32: el cielo responde a los cambios de instante y de lugar', () => {
  it(
    'un instante distinto por mas de un minuto mueve el cielo lo que exige la rotacion terrestre',
    () => {
      fc.assert(
        fc.property(
          genCatalogoConTestigos,
          genInstante,
          genDesfaseSegundos,
          genLatitud,
          genLongitud,
          genCirculo,
          (catalogo, instante, desfase, latitud, longitud, circulo) => {
            const sitio = lugar(latitud, longitud);
            const otroInstante = instanteDesdeMs(instante.msUtc + desfase * 1000);

            const respuesta = compararCielos(
              cieloDe(catalogo, instante, sitio, circulo),
              cieloDe(catalogo, otroInstante, sitio, circulo),
              { clase: 'polo', latitud },
              rotacionPorSegundos(desfase),
            );

            esperarRespuesta(
              respuesta,
              `${instante.iso} -> ${otroInstante.iso} (${String(desfase)} s) en ` +
                `lat ${String(latitud)}, lon ${String(longitud)}`,
            );
          },
        ),
        { numRuns: 200 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );

  it(
    'una latitud distinta por mas de un grado mueve el cielo lo que exige el giro del horizonte',
    () => {
      fc.assert(
        fc.property(
          genCatalogoConTestigos,
          genInstante,
          genParDeLatitudes,
          genLongitud,
          genCirculo,
          (catalogo, instante, [unaLatitud, otraLatitud], longitud, circulo) => {
            const respuesta = compararCielos(
              cieloDe(catalogo, instante, lugar(unaLatitud, longitud), circulo),
              cieloDe(catalogo, instante, lugar(otraLatitud, longitud), circulo),
              { clase: 'este' },
              Math.abs(unaLatitud - otraLatitud),
            );

            esperarRespuesta(
              respuesta,
              `lat ${String(unaLatitud)} -> ${String(otraLatitud)} en ${instante.iso}, ` +
                `lon ${String(longitud)}`,
            );
          },
        ),
        { numRuns: 200 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );

  it(
    'una longitud distinta por mas de un grado mueve el cielo lo que exige el cambio de meridiano',
    () => {
      fc.assert(
        fc.property(
          genCatalogoConTestigos,
          genInstante,
          genLatitud,
          genParDeLongitudes,
          genCirculo,
          (catalogo, instante, latitud, [unaLongitud, otraLongitud], circulo) => {
            const respuesta = compararCielos(
              cieloDe(catalogo, instante, lugar(latitud, unaLongitud), circulo),
              cieloDe(catalogo, instante, lugar(latitud, otraLongitud), circulo),
              { clase: 'polo', latitud },
              distanciaCircular(unaLongitud, otraLongitud),
            );

            esperarRespuesta(
              respuesta,
              `lon ${String(unaLongitud)} -> ${String(otraLongitud)} en ${instante.iso}, ` +
                `lat ${String(latitud)}`,
            );
          },
        ),
        { numRuns: 200 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );
});
