import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type {
  CirculoHorizonte,
  InstanteGraduacion,
  LugarGraduacion,
} from '../../src/nucleo/astronomia/modelo.js';
import { calcularCielo, type ResultadoCielo } from '../../src/nucleo/astronomia/motor.js';
import type { CatalogoEstelar } from '../../src/nucleo/catalogo/modelo.js';
import { calcularCirculo } from '../../src/vista/mapa/circulo.js';
import { genCatalogoValido, genInstante, genLatitud, genLongitud } from '../generadores.js';

/**
 * Propiedad 15: Un dia sidereo devuelve el cielo a su lugar (propiedad
 * metamorfica).
 *
 * *Para todo* Catalogo_Estelar, *para todo* Instante_Graduacion valido y *para
 * todo* Lugar_Graduacion valido, calcular las Coordenadas_Horizontales en un
 * instante desplazado 23 horas, 56 minutos y 4.0905 segundos respecto del
 * original produce, para cada Estrella, una altitud que difiere menos de 0.5
 * grados y un azimut que difiere menos de 0.5 grados de los valores originales.
 *
 * **Validates: Requirements 3.7**
 *
 * ## Por que la propiedad debe cumplirse
 *
 * El dia sidereo es lo que tarda la Tierra en volver a apuntar el mismo
 * meridiano celeste al meridiano local. Con la formula de Meeus 12.4 que usa
 * `tiempo.ts`, el tiempo sidereo medio avanza 360.98564736629 grados por dia
 * solar, asi que en 86164.0905 s = 0.9972695659 dias avanza
 * `360.98564736629 x 0.9972695659 = 359.99999936` grados, es decir 360 grados
 * menos 6.4e-7 grados. El angulo horario de cada Estrella vuelve por tanto a su
 * valor con un residuo del orden de 1e-6 grados, y con el vuelven la altitud y
 * el azimut.
 *
 * ## Los 0.5 ms que no caben en un entero
 *
 * El desplazamiento son 86164.0905 s = 86164090.5 ms, que **no** es un numero
 * entero de milisegundos. Se aplica redondeado al milisegundo mas cercano,
 * {@link DESPLAZAMIENTO_MS} = 86164091 ms, para que el instante desplazado tenga
 * una representacion ISO 8601 exacta al milisegundo y `msUtc` no arrastre una
 * fraccion que la cadena no nombra.
 *
 * El precio de ese redondeo es medio milisegundo de rotacion terrestre. La
 * Tierra gira 360 grados en 86164.0905 s, o sea 4.1781e-6 grados por
 * milisegundo, de modo que 0.5 ms valen **2.09e-6 grados**: unas 240 000 veces
 * menos que el margen de 0.5 grados del requisito. La tercera prueba de este
 * archivo lo comprueba de forma empirica, comparando el cielo del
 * desplazamiento redondeado con el del desplazamiento exacto de 86164090.5 ms,
 * que el motor si acepta porque calcula desde `msUtc` y no desde la cadena.
 *
 * ## La precesion tambien avanza, y tampoco importa
 *
 * El motor precesa el catalogo de J2000.0 al equinoccio de la fecha, asi que
 * los dos cielos no parten de las mismas coordenadas ecuatoriales. La precesion
 * general vale 46.12 segundos de arco por ano en ascension recta y 20.04 en
 * declinacion, es decir 0.126 y 0.055 segundos de arco por dia: **3.5e-5 y
 * 1.5e-5 grados**, cuatro ordenes de magnitud por debajo del margen. Sumada al
 * residuo del tiempo sidereo y al redondeo del milisegundo, el desplazamiento
 * real de cada Estrella sobre la esfera tras un dia sidereo queda acotado por
 * {@link DESPLAZAMIENTO_ESFERICO_MAXIMO} = 4e-5 grados. La medicion lo confirma:
 * la mayor diferencia de altitud observada en 600 escenarios fue 3.6e-5 grados.
 *
 * ## Dos sutilezas de la comparacion
 *
 * 1. **El azimut es circular.** 359.9 y 0.1 grados distan 0.2 grados, no 359.8,
 *    asi que la comparacion usa la distancia angular con envolvente
 *    {@link distanciaEnvolvente} que exige la seccion de comparaciones
 *    angulares del diseno, y no una resta bruta. La altitud no es circular: su
 *    diferencia bruta ya es el error.
 *
 * 2. **Junto al cenit y al nadir el azimut se dispara.** El azimut es la
 *    coordenada angular de un sistema polar cuyos dos polos son el cenit y el
 *    nadir: dos direcciones separadas un angulo `d` sobre la esfera pueden
 *    diferir hasta `d / cos(altitud)` en azimut, y ese factor crece sin cota al
 *    acercarse a cualquiera de los dos polos, donde el azimut deja de estar
 *    definido (`horizontales.ts` lo documenta). Una Estrella que pase muy cerca
 *    del cenit o del nadir puede por tanto superar los 0.5 grados de azimut
 *    **aunque el cielo haya vuelto a su lugar**, porque su desplazamiento real
 *    de 4e-5 grados se amplifica sin limite.
 *
 *    **El caso ocurre de verdad, no es teorico.** Se midio sobre 600 escenarios
 *    generados, 26 297 Estrellas en total: 91 Estrellas superaron los 0.5 grados
 *    de azimut, **todas** ellas a menos de 0.5 grados del cenit o del nadir, y
 *    ninguna de ellas se aparto mas de 3.7e-5 grados de su posicion sobre la
 *    esfera. La cuenta exacta varia con la semilla de fast-check; lo que no
 *    varia es que los unicos casos afectados esten pegados a un polo. El
 *    caso extremo es reproducible a mano y lo fija la ultima prueba de este
 *    archivo: `genLatitud` produce +-90 exactos, `genDeclinacion` tambien y
 *    `genInstante` incluye J2000.0 exacto (`2000-01-01T07:00:00-05:00`), donde
 *    los angulos de precesion valen 0. Esa combinacion coloca la Estrella en el
 *    cenit **exacto** en el primer instante (azimut indeterminado: `atan2(0, 0)`
 *    devuelve 0) y a 1.5e-5 grados del cenit un dia sidereo despues, con azimut
 *    280.46 grados. El cielo volvio a su lugar; lo que cambio de golpe es el
 *    nombre que recibe una direccion practicamente vertical.
 *
 *    La respuesta **no** es relajar el margen del requisito, sino (a) contrastar
 *    la separacion angular sobre la esfera, que es la magnitud fisica que el
 *    requisito quiere acotar y que **si** esta bien condicionada en todas
 *    partes, para **todas** las Estrellas sin excepcion, y (b) excluir del
 *    contraste del *componente* azimut una vecindad declarada de los dos polos
 *    del sistema horizontal: las Estrellas cuya altitud, en cualquiera de los
 *    dos instantes, se acerca a +-90 grados por debajo de
 *    {@link MARGEN_CENIT_GRADOS}. Con un margen de 0.5 grados la amplificacion
 *    queda acotada por `1 / cos(89.5 grados) = 114.6`, de modo que la diferencia
 *    de azimut de todo lo que **si** se compara esta acotada por
 *    `4e-5 x 114.6 = 4.6e-3` grados, mas de cien veces por debajo del margen de
 *    0.5; la mayor medida en los 600 escenarios fue 3.8e-3 grados. Lo
 *    excluido son las dos calotas de 0.5 grados de radio alrededor del cenit y
 *    del nadir: `1 - cos(0.5 grados) = 3.8e-5` de cada hemisferio, un 0.0038 %
 *    del cielo, y en el caso del nadir se trata de direcciones que el
 *    Mapa_Estelar nunca dibuja porque estan bajo el horizonte (Requisito 3.10).
 *    **La altitud y la separacion angular se comparan siempre**, cenit y nadir
 *    incluidos, que es justamente donde estan bien condicionadas: dentro de las
 *    calotas excluidas la Estrella sigue teniendo que volver a menos de
 *    {@link SEPARACION_MAXIMA_GRADOS} de donde estaba, asi que la exclusion
 *    del componente azimut no deja ningun agujero por donde pudiera colarse una
 *    Estrella que de verdad se hubiera movido.
 *
 * ## Coste
 *
 * Cada iteracion calcula dos cielos completos de hasta 300 Estrellas. Asertar
 * una vez por Estrella llevaria la prueba a cientos de miles de aserciones y al
 * limite de tiempo, asi que se sigue el patron de `cielo-portal.test.ts`:
 * predicados planos, recoleccion de las violaciones y un solo `toEqual([])` por
 * iteracion.
 */

/** Margen del Requisito 3.7, en grados. La comparacion es estricta. */
const MARGEN_GRADOS = 0.5;

/** Duracion del dia sidereo medio, en segundos (Requisito 3.7). */
const DIA_SIDEREO_SEGUNDOS = 86_164.0905;

/** El mismo dia sidereo en milisegundos: no es un entero. */
const DESPLAZAMIENTO_EXACTO_MS = DIA_SIDEREO_SEGUNDOS * 1000;

/** Desplazamiento aplicado, redondeado al milisegundo mas cercano. */
const DESPLAZAMIENTO_MS = Math.round(DESPLAZAMIENTO_EXACTO_MS);

/**
 * Cota del desplazamiento real de una Estrella sobre la esfera tras un dia
 * sidereo, en grados: residuo del tiempo sidereo (6.4e-7), precesion de un dia
 * (3.5e-5) y redondeo de 0.5 ms (2.1e-6), con holgura.
 */
const DESPLAZAMIENTO_ESFERICO_MAXIMO = 4e-5;

/**
 * Cota que se exige a la separacion angular sobre la esfera de **cada**
 * Estrella, en grados. Es {@link DESPLAZAMIENTO_ESFERICO_MAXIMO} con un factor
 * 25 de holgura, para que la prueba no se vuelva un contraste de la formula de
 * precesion; sigue siendo 500 veces menor que el margen de 0.5 grados del
 * requisito, asi que no lo relaja en absoluto. La mayor separacion medida en
 * 600 escenarios (26 297 Estrellas) fue 3.64e-5 grados, cenit y nadir
 * incluidos.
 */
const SEPARACION_MAXIMA_GRADOS = 1e-3;

const GRADOS_A_RADIANES = Math.PI / 180;

/**
 * Separacion angular entre dos Coordenadas_Horizontales, en grados: la distancia
 * sobre la esfera celeste, que es la magnitud fisica que el Requisito 3.7 quiere
 * acotar.
 *
 * Se usa la forma del semiverseno y no `acos(sin·sin + cos·cos·cos)`, porque el
 * arcocoseno pierde casi todas las cifras significativas cuando las dos
 * direcciones casi coinciden, que es exactamente el caso de esta propiedad.
 *
 * Junto al cenit y al nadir la formula degenera con elegancia: el factor
 * `cos(altitud)` anula la contribucion del azimut, de modo que la separacion de
 * dos direcciones verticales es la diferencia de altitud aunque sus azimuts no
 * tengan nada que ver. Por eso esta medida **si** se puede exigir en todo el
 * cielo, mientras el componente azimut no.
 */
function separacionEsferica(
  una: { readonly altitud: number; readonly azimut: number },
  otra: { readonly altitud: number; readonly azimut: number },
): number {
  const altitudA = una.altitud * GRADOS_A_RADIANES;
  const altitudB = otra.altitud * GRADOS_A_RADIANES;
  const mitadAltitud = Math.sin((altitudB - altitudA) / 2);
  const mitadAzimut = Math.sin(((otra.azimut - una.azimut) * GRADOS_A_RADIANES) / 2);
  const semiverseno =
    mitadAltitud * mitadAltitud +
    Math.cos(altitudA) * Math.cos(altitudB) * mitadAzimut * mitadAzimut;
  return (2 * Math.asin(Math.min(1, Math.sqrt(Math.max(0, semiverseno))))) / GRADOS_A_RADIANES;
}

/**
 * Radio de las vecindades del cenit y del nadir excluidas del contraste de
 * azimut, en grados. Ver el apartado 2 de la cabecera: acota la amplificacion
 * en 114.6 y deja fuera el 0.0038 % de cada hemisferio.
 */
const MARGEN_CENIT_GRADOS = 0.5;

/** Altitud absoluta desde la que el azimut se considera mal condicionado. */
const ALTITUD_DEGENERADA = 90 - MARGEN_CENIT_GRADOS;

/** Desplazamiento horario del Instante_Graduacion (Requisitos 8.1, 8.4). */
const DESPLAZAMIENTO_COLOMBIA = '-05:00';

const MS_HORA = 3_600_000;
const HORAS_DESPLAZAMIENTO = -5;

/**
 * Distancia angular minima entre dos angulos circulares, en grados: el camino
 * corto, en [0, 180]. Es la formula `((a - b + 180) mod 360) - 180` del diseno,
 * con el resto llevado al intervalo positivo porque el `%` de JavaScript
 * conserva el signo del dividendo.
 */
function distanciaEnvolvente(a: number, b: number): number {
  return Math.abs(((((a - b + 180) % 360) + 360) % 360) - 180);
}

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

/**
 * Construye un `InstanteGraduacion` con desplazamiento -05:00 y cuatro
 * decimales de segundo, de modo que la cadena nombre tambien la fraccion de
 * milisegundo del desplazamiento exacto.
 *
 * `PATRON_INSTANTE` del motor admite de 1 a 9 decimales de segundo, asi que la
 * cadena es valida. `Date.parse` trunca a partir del tercer decimal, de manera
 * que para un `msUtc` con medio milisegundo la cadena y el numero difieren en
 * esos 0.5 ms; es irrelevante porque el motor usa `iso` solo para validar el
 * formato y calcula siempre desde `msUtc`, tal como documenta `motor.ts`.
 */
function instanteEn(msUtc: number): InstanteGraduacion {
  const enteros = Math.floor(msUtc);
  const fraccionDeMs = msUtc - enteros;
  const local = new Date(enteros + HORAS_DESPLAZAMIENTO * MS_HORA);
  const segundos = local.getUTCSeconds() + (local.getUTCMilliseconds() + fraccionDeMs) / 1000;

  const fecha = [
    String(local.getUTCFullYear()).padStart(4, '0'),
    dosDigitos(local.getUTCMonth() + 1),
    dosDigitos(local.getUTCDate()),
  ].join('-');
  const hora = [
    dosDigitos(local.getUTCHours()),
    dosDigitos(local.getUTCMinutes()),
    segundos.toFixed(4).padStart(7, '0'),
  ].join(':');

  return { iso: `${fecha}T${hora}${DESPLAZAMIENTO_COLOMBIA}`, msUtc };
}

/** Entrada completa de una iteracion de la propiedad. */
interface Escenario {
  readonly catalogo: CatalogoEstelar;
  readonly instante: InstanteGraduacion;
  readonly lugar: LugarGraduacion;
  readonly circulo: CirculoHorizonte;
}

/**
 * Circulo_Horizonte realista: el que el Mapa_Estelar calcularia para una
 * ventana admitida. No influye en las Coordenadas_Horizontales, pero evita
 * verificar la propiedad sobre un circulo que la vista nunca produciria.
 */
const genCirculo: fc.Arbitrary<CirculoHorizonte> = fc
  .tuple(fc.integer({ min: 320, max: 1920 }), fc.integer({ min: 400, max: 1200 }))
  .map(([ancho, alto]) => calcularCirculo(ancho, alto));

const genEscenario: fc.Arbitrary<Escenario> = fc
  .tuple(genCatalogoValido, genInstante, genLatitud, genLongitud, genCirculo)
  .map(([catalogo, instante, latitud, longitud, circulo]) => ({
    catalogo,
    instante,
    lugar: { nombre: 'Lugar de prueba', latitud, longitud },
    circulo,
  }));

/** Cielo del escenario en el instante indicado. */
function cieloDe(escenario: Escenario, instante: InstanteGraduacion): ResultadoCielo {
  return calcularCielo(escenario.catalogo, instante, escenario.lugar, escenario.circulo);
}

/** Verdadero cuando el azimut esta mal condicionado en alguno de los dos cielos. */
function cercaDeUnPolo(unaAltitud: number, otraAltitud: number): boolean {
  return Math.abs(unaAltitud) > ALTITUD_DEGENERADA || Math.abs(otraAltitud) > ALTITUD_DEGENERADA;
}

/**
 * Violaciones de la Propiedad 15 en un escenario: una linea por Estrella cuya
 * altitud, o cuyo azimut fuera de las vecindades del cenit y del nadir, se
 * separe 0.5 grados o mas del valor original tras un dia sidereo, y una linea
 * mas por Estrella que ademas se aparte de su posicion sobre la esfera mas de
 * {@link SEPARACION_MAXIMA_GRADOS}. La lista vacia significa que el escenario
 * cumple la propiedad por completo.
 *
 * @param escenario Catalogo, instante, lugar y circulo de la iteracion.
 * @param desplazamientoMs Desplazamiento aplicado al instante, en milisegundos.
 */
function violacionesTrasUnDiaSidereo(escenario: Escenario, desplazamientoMs: number): string[] {
  const original = cieloDe(escenario, escenario.instante);
  const desplazado = cieloDe(escenario, instanteEn(escenario.instante.msUtc + desplazamientoMs));

  if (!original.ok) {
    return [`el motor rechazo el instante original: ${JSON.stringify(original.error)}`];
  }
  if (!desplazado.ok) {
    return [`el motor rechazo el instante desplazado: ${JSON.stringify(desplazado.error)}`];
  }

  const antes = original.cielo.estrellas;
  const despues = desplazado.cielo.estrellas;
  if (antes.length !== despues.length) {
    return [`el catalogo cambio de tamano: ${String(antes.length)} -> ${String(despues.length)}`];
  }

  const fallos: string[] = [];
  for (let indice = 0; indice < antes.length; indice += 1) {
    const uno = antes[indice];
    const otro = despues[indice];
    if (uno === undefined || otro === undefined) {
      fallos.push(`falta la estrella ${String(indice)} en alguno de los dos cielos`);
      continue;
    }

    const nombre = uno.estrella.nombre;
    const altitudAntes = uno.horizontal.altitud;
    const altitudDespues = otro.horizontal.altitud;
    const diferenciaAltitud = Math.abs(altitudDespues - altitudAntes);

    // La altitud se compara siempre, tambien junto al cenit y al nadir.
    if (!(diferenciaAltitud < MARGEN_GRADOS)) {
      fallos.push(
        `${nombre}: altitud ${String(altitudAntes)} -> ${String(altitudDespues)}, diferencia ${String(diferenciaAltitud)}`,
      );
    }

    // La separacion sobre la esfera tambien se compara siempre, y contra una
    // cota 500 veces mas estrecha que la del requisito: es la magnitud fisica
    // que dice si el cielo volvio o no a su lugar, y la que cubre las calotas
    // del cenit y del nadir donde el azimut queda fuera del contraste.
    const separacion = separacionEsferica(uno.horizontal, otro.horizontal);
    if (!(separacion < SEPARACION_MAXIMA_GRADOS)) {
      fallos.push(
        `${nombre}: separacion esferica ${String(separacion)} grados desde (alt ${String(altitudAntes)}, az ${String(uno.horizontal.azimut)})`,
      );
    }

    // Vecindad del cenit o del nadir: ahi el azimut no esta bien condicionado y
    // no se contrasta. Ver el apartado 2 de la cabecera.
    if (cercaDeUnPolo(altitudAntes, altitudDespues)) {
      continue;
    }

    const diferenciaAzimut = distanciaEnvolvente(otro.horizontal.azimut, uno.horizontal.azimut);
    if (!(diferenciaAzimut < MARGEN_GRADOS)) {
      fallos.push(
        `${nombre}: azimut ${String(uno.horizontal.azimut)} -> ${String(otro.horizontal.azimut)}, distancia ${String(diferenciaAzimut)} con altitud ${String(altitudAntes)}`,
      );
    }
  }

  return fallos;
}

/** Mayor separacion angular observada entre dos cielos, por coordenada. */
interface Separaciones {
  readonly altitud: number;
  readonly azimut: number;
}

/**
 * Mayores diferencias de altitud y de azimut entre dos desplazamientos del
 * mismo instante. El azimut se mide solo lejos del cenit y del nadir, por la
 * razon del apartado 2 de la cabecera. Sirve para medir el efecto del redondeo
 * de 0.5 ms, no para verificar el requisito.
 */
function separacionMaxima(
  escenario: Escenario,
  unMs: number,
  otroMs: number,
): Separaciones | string {
  const uno = cieloDe(escenario, instanteEn(escenario.instante.msUtc + unMs));
  const otro = cieloDe(escenario, instanteEn(escenario.instante.msUtc + otroMs));
  if (!uno.ok || !otro.ok) {
    return 'el motor rechazo alguno de los dos instantes desplazados';
  }

  let altitud = 0;
  let azimut = 0;
  for (let indice = 0; indice < uno.cielo.estrellas.length; indice += 1) {
    const a = uno.cielo.estrellas[indice];
    const b = otro.cielo.estrellas[indice];
    if (a === undefined || b === undefined) {
      return `falta la estrella ${String(indice)}`;
    }
    altitud = Math.max(altitud, Math.abs(b.horizontal.altitud - a.horizontal.altitud));
    if (!cercaDeUnPolo(a.horizontal.altitud, b.horizontal.altitud)) {
      azimut = Math.max(azimut, distanciaEnvolvente(b.horizontal.azimut, a.horizontal.azimut));
    }
  }
  return { altitud, azimut };
}

describe('Propiedad 15: un dia sidereo devuelve el cielo a su lugar', () => {
  // Feature: kawavalen-graduation-gift, Property 15: Para todo Catalogo_Estelar, para todo
  // Instante_Graduacion valido y para todo Lugar_Graduacion valido, calcular las
  // Coordenadas_Horizontales en un instante desplazado 23 horas, 56 minutos y 4.0905 segundos
  // respecto del original produce, para cada Estrella, una altitud que difiere menos de 0.5 grados
  // y un azimut que difiere menos de 0.5 grados de los valores originales.
  it('devuelve la altitud y el azimut a menos de 0.5 grados de los originales', () => {
    fc.assert(
      fc.property(genEscenario, (escenario) => {
        expect(
          violacionesTrasUnDiaSidereo(escenario, DESPLAZAMIENTO_MS),
          `instante ${escenario.instante.iso}, lat ${String(escenario.lugar.latitud)}, lon ${String(escenario.lugar.longitud)}`,
        ).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it('desplaza 23 h 56 min 4.0905 s, redondeados al milisegundo mas cercano', () => {
    expect(DESPLAZAMIENTO_MS).toBe(86_164_091);
    expect(DESPLAZAMIENTO_MS).toBe(((23 * 60 + 56) * 60 + 4) * 1000 + 91);
    expect(Math.abs(DESPLAZAMIENTO_EXACTO_MS - DESPLAZAMIENTO_MS)).toBeLessThanOrEqual(0.5);
  });

  it('el redondeo del milisegundo mueve el cielo mucho menos que el margen de 0.5 grados', () => {
    fc.assert(
      fc.property(genEscenario, (escenario) => {
        const separacion = separacionMaxima(
          escenario,
          DESPLAZAMIENTO_MS,
          DESPLAZAMIENTO_EXACTO_MS,
        );
        expect(typeof separacion, String(separacion)).toBe('object');
        if (typeof separacion === 'string') {
          return;
        }

        // 0.5 ms de rotacion son 2.09e-6 grados de angulo horario. La altitud no
        // amplifica y se queda en ese orden; el azimut puede amplificar hasta
        // 114.6 en el borde de la vecindad excluida, o sea 2.4e-4 grados. La
        // cota comun de 1e-3 los cubre a los dos con holgura y sigue siendo 500
        // veces menor que el margen del requisito.
        expect(separacion.altitud).toBeLessThan(1e-3);
        expect(separacion.azimut).toBeLessThan(1e-3);
      }),
      { numRuns: 100 },
    );
  });

  it('la amplificacion del azimut queda acotada fuera de la vecindad excluida', () => {
    const amplificacion = 1 / Math.cos((ALTITUD_DEGENERADA * Math.PI) / 180);

    expect(amplificacion).toBeLessThan(115);
    expect(DESPLAZAMIENTO_ESFERICO_MAXIMO * amplificacion).toBeLessThan(MARGEN_GRADOS / 100);
    // La calota excluida es el 0.0038 % de cada hemisferio.
    expect(1 - Math.cos((MARGEN_CENIT_GRADOS * Math.PI) / 180)).toBeLessThan(4e-5);
  });

  it('en el cenit exacto el azimut salta aunque el cielo haya vuelto a su lugar', () => {
    // Caso extremo del apartado 2 de la cabecera: observador en el polo norte,
    // Estrella en el polo celeste norte y J2000.0 exacto, donde la precesion es
    // la identidad. La Estrella arranca en el cenit exacto, con azimut
    // indeterminado, y un dia sidereo despues sigue a 1.5e-5 grados del cenit
    // pero con otro azimut. Es la razon de ser de la exclusion, fijada aqui como
    // ejemplo para que nadie la retire por creerla teorica.
    const j2000 = instanteEn(Date.parse('2000-01-01T12:00:00Z'));
    const escenario: Escenario = {
      catalogo: {
        version: 1,
        epoca: 'J2000.0',
        atribucion: '',
        estrellas: [{ nombre: 'Cenital', ar: 0, dec: 90, magnitud: 2, constelacion: 'Prueba' }],
        segmentos: [],
      },
      instante: j2000,
      lugar: { nombre: 'Polo norte', latitud: 90, longitud: 0 },
      circulo: calcularCirculo(800, 800),
    };

    const original = cieloDe(escenario, j2000);
    const desplazado = cieloDe(escenario, instanteEn(j2000.msUtc + DESPLAZAMIENTO_MS));
    expect(original.ok && desplazado.ok).toBe(true);
    if (!original.ok || !desplazado.ok) {
      return;
    }

    const antes = original.cielo.estrellas[0]?.horizontal;
    const despues = desplazado.cielo.estrellas[0]?.horizontal;
    expect(antes).toBeDefined();
    expect(despues).toBeDefined();
    if (antes === undefined || despues === undefined) {
      return;
    }

    // El cielo si volvio a su lugar: la altitud no se movio ni una milesima.
    expect(antes.altitud).toBe(90);
    expect(Math.abs(despues.altitud - antes.altitud)).toBeLessThan(1e-3);

    // El azimut, en cambio, salta cientos de grados, y por eso se excluye.
    expect(cercaDeUnPolo(antes.altitud, despues.altitud)).toBe(true);
    expect(distanciaEnvolvente(despues.azimut, antes.azimut)).toBeGreaterThan(MARGEN_GRADOS);

    // Y sin embargo la Estrella no se movio del cielo: la separacion sobre la
    // esfera, que es lo que el requisito quiere acotar, se queda en 1e-5 grados.
    // Esto es lo que hace legitima la exclusion del componente azimut: dentro de
    // la calota la propiedad sigue exigiendo algo, y algo mucho mas estrecho.
    expect(separacionEsferica(antes, despues)).toBeLessThan(SEPARACION_MAXIMA_GRADOS);

    // Con la exclusion en su sitio, el escenario cumple la propiedad.
    expect(violacionesTrasUnDiaSidereo(escenario, DESPLAZAMIENTO_MS)).toEqual([]);
  });
});
