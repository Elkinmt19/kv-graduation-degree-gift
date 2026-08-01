import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type {
  Cardinal,
  CieloCalculado,
  CirculoHorizonte,
  EstrellaCalculada,
  InstanteGraduacion,
  LugarGraduacion,
  Punto,
  SegmentoVisible,
} from '../../src/nucleo/astronomia/modelo.js';
import { calcularCielo, seleccionarDibujables } from '../../src/nucleo/astronomia/motor.js';
import type { CatalogoEstelar } from '../../src/nucleo/catalogo/modelo.js';
import { RADIO_MINIMO, calcularCirculo } from '../../src/vista/mapa/circulo.js';
import { genAnchoVentana, genCatalogoValido, genInstante, genLatitud, genLongitud } from '../generadores.js';

/**
 * Propiedad 14: El Motor_Astronomico es determinista.
 *
 * *Para todo* Catalogo_Estelar, *para todo* Instante_Graduacion valido, *para
 * todo* Lugar_Graduacion valido y *para todo* Circulo_Horizonte, dos
 * invocaciones consecutivas del calculo producen altitudes, azimutes y
 * coordenadas de pantalla cuya diferencia es exactamente 0 para cada Estrella.
 *
 * **Validates: Requirements 3.6**
 *
 * ## Por que se compara con `Object.is` y no con `===` ni con una tolerancia
 *
 * El requisito pide diferencia **exactamente** 0 y el apartado (h) del diseno
 * lo precisa aun mas: dos invocaciones devuelven *bits identicos*, no valores
 * cercanos. Asi que aqui no hay `toBeCloseTo` ni epsilon de ninguna clase.
 *
 * Entre las dos igualdades exactas de JavaScript se elige `Object.is` porque es
 * la que corresponde a la igualdad de bits, y difiere de `===` justo en los dos
 * casos que importan:
 *
 * - **`0` frente a `-0`.** La resta `0 - (-0)` vale 0, de modo que una lectura
 *   literal de "diferencia exactamente 0" los aceptaria, y `===` tambien. Pero
 *   son patrones de bits distintos: si una invocacion devuelve `0` y la
 *   siguiente `-0`, las dos ejecutaron caminos distintos con las mismas
 *   entradas, que es exactamente el defecto que esta propiedad busca. El signo
 *   del cero es observable (`Math.atan2`, `1 / x`, el texto de un `<path>` de
 *   SVG), asi que se exige que coincida.
 * - **`NaN` frente a `NaN`.** Si el motor produjera `NaN` para alguna entrada,
 *   `a - b` seria `NaN` y `===` declararia el fallo, pero un `NaN` repetido en
 *   las dos invocaciones es determinista: el defecto seria de dominio, no de
 *   determinismo, y lo cubren las propiedades 11 y 16. `Object.is` lo trata
 *   como igual y deja que esta prueba hable solo de lo suyo.
 *
 * Con `Object.is`, entonces, la comparacion es mas estricta que la del
 * requisito en el signo del cero y mas honesta en el `NaN`.
 *
 * ## Alcance: tambien las colecciones derivadas
 *
 * El requisito nombra altitudes, azimutes y coordenadas de pantalla, pero el
 * Cielo_Calculado lleva tres colecciones mas que el Mapa_Estelar dibuja tal
 * cual: `segmentosVisibles`, `constelacionesDibujadas` y `cardinales`. Las tres
 * se derivan de las estrellas mediante un `Map` o un `Set`, que es justo donde
 * el apartado (h) del diseno prohibe el orden no determinista, asi que se
 * comparan igual de estricto: misma longitud, mismo orden y bits identicos en
 * cada punto. Y `seleccionarDibujables`, que es lo que decide *que* se dibuja y
 * en que orden, se comprueba en su propia prueba.
 *
 * ## Coste
 *
 * Cada iteracion calcula el cielo completo dos veces, con catalogos de hasta
 * 300 estrellas. Las violaciones se juntan en un arreglo y se asierta **una
 * sola vez por iteracion** con `toEqual([])`, en lugar de llamar a `expect` por
 * estrella: con cuatro campos por estrella y cientos de iteraciones eso serian
 * cientos de miles de aserciones, que es lo que hace estallar el presupuesto de
 * tiempo de la suite. Es el mismo patron de `cielo-portal.test.ts` y
 * `contraste-texto.test.ts`.
 */

/** Margen minusculo para pisar la frontera del radio minimo sin bajar de ella. */
const EPSILON = 1e-9;

/**
 * Tiempo maximo por prueba de esta suite. Holgado respecto de lo medido (unas
 * decimas de segundo por propiedad), para que la suite no se caiga por
 * contencion cuando el equipo corre varios proyectos de Vitest a la vez.
 */
const TIEMPO_MAXIMO_MS = 20_000;

/** Nombres de lugar; no entran en el calculo, pero viajan en el resultado. */
const NOMBRES_LUGAR = ['Neiva, Huila', 'Polo Norte', 'Quito', 'Ushuaia', ''] as const;

/**
 * Radio del Circulo_Horizonte, en pixeles. El invariante del modelo es
 * `radio >= 140`, asi que se cubre la frontera exacta, su vecindad por arriba y
 * radios grandes de pantalla de escritorio.
 */
const genRadio: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({
      min: RADIO_MINIMO,
      max: 1200,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      RADIO_MINIMO,
      RADIO_MINIMO + EPSILON,
      140.5,
      180,
      320.75,
      512,
      1024,
    ),
  },
);

/**
 * Coordenada del centro del circulo. Se varia a proposito, incluyendo valores
 * negativos y el cero negativo: con el centro en `-0` toda coordenada de
 * pantalla del cenit sale `-0`, lo que ejercita justamente la distincion que
 * `Object.is` hace y `===` no.
 */
const genCoordenadaCentro: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({ min: -800, max: 2400, noNaN: true, noDefaultInfinity: true }),
  },
  { weight: 2, arbitrary: fc.constantFrom(0, -0, 8, 160.5, 320, 960, 1920, -140) },
);

/**
 * Circulo_Horizonte tal como lo produce la vista para una ventana real, con la
 * formula del Requisito 4.12. Se construye con `calcularCirculo` para que la
 * propiedad se ejercite sobre los circulos que el programa usa de verdad.
 */
const genCirculoDeVentana: fc.Arbitrary<CirculoHorizonte> = fc
  .tuple(genAnchoVentana, genAnchoVentana)
  .map(([ancho, alto]) => calcularCirculo(ancho, alto));

/** Circulo_Horizonte libre: centro cualquiera y radio admisible cualquiera. */
const genCirculoLibre: fc.Arbitrary<CirculoHorizonte> = fc.record({
  cx: genCoordenadaCentro,
  cy: genCoordenadaCentro,
  radio: genRadio,
});

/** Circulo_Horizonte valido, de una de las dos procedencias anteriores. */
const genCirculo: fc.Arbitrary<CirculoHorizonte> = fc.oneof(
  { weight: 2, arbitrary: genCirculoDeVentana },
  { weight: 3, arbitrary: genCirculoLibre },
);

/** Lugar_Graduacion valido: latitud en [-90, 90] y longitud en (-180, 180]. */
const genLugar: fc.Arbitrary<LugarGraduacion> = fc.record({
  nombre: fc.constantFrom(...NOMBRES_LUGAR),
  latitud: genLatitud,
  longitud: genLongitud,
});

/** Las cuatro entradas del motor, generadas juntas. */
interface Entradas {
  readonly catalogo: CatalogoEstelar;
  readonly instante: InstanteGraduacion;
  readonly lugar: LugarGraduacion;
  readonly circulo: CirculoHorizonte;
}

const genEntradas: fc.Arbitrary<Entradas> = fc.record({
  catalogo: genCatalogoValido,
  instante: genInstante,
  lugar: genLugar,
  circulo: genCirculo,
});

/**
 * Calcula el cielo y falla ruidosamente si el motor rechaza las entradas: los
 * generadores solo producen instantes y lugares validos, asi que un rechazo
 * significa que el generador y el motor dejaron de estar de acuerdo, y eso hay
 * que ver antes de hablar de determinismo.
 */
function cieloDe({ catalogo, instante, lugar, circulo }: Entradas): CieloCalculado {
  const resultado = calcularCielo(catalogo, instante, lugar, circulo);
  if (!resultado.ok) {
    throw new Error(
      `el motor rechazo entradas que el generador declara validas: ${resultado.error.clase}`,
    );
  }
  return resultado.cielo;
}

/** Igualdad de bits de dos numeros de doble precision (ver la nota de arriba). */
function mismoNumero(a: number, b: number): boolean {
  return Object.is(a, b);
}

/** Texto de un numero que distingue `-0` de `0`, para los mensajes de fallo. */
function mostrar(valor: number): string {
  return Object.is(valor, -0) ? '-0' : String(valor);
}

/**
 * Diferencias entre dos puntos de pantalla, con la misma igualdad de bits.
 * `etiqueta` dice de quien es el punto (una estrella, un extremo de segmento,
 * una marca cardinal) para que el mensaje de fallo se lea solo.
 */
function diferenciasDePunto(a: Punto, b: Punto, etiqueta: string): string[] {
  const fallos: string[] = [];
  if (!mismoNumero(a.x, b.x)) {
    fallos.push(`${etiqueta}.x ${mostrar(a.x)} != ${mostrar(b.x)}`);
  }
  if (!mismoNumero(a.y, b.y)) {
    fallos.push(`${etiqueta}.y ${mostrar(a.y)} != ${mostrar(b.y)}`);
  }
  return fallos;
}

/**
 * Diferencias entre dos calculos de una misma Estrella. Devuelve la lista
 * vacia cuando altitud, azimut y coordenadas de pantalla coinciden bit a bit.
 */
function diferenciasDeEstrella(
  a: EstrellaCalculada,
  b: EstrellaCalculada,
  indice: number,
): string[] {
  const fallos: string[] = [];
  const anotar = (campo: string, primero: string, segundo: string): void => {
    fallos.push(`estrella ${String(indice)}: ${campo} ${primero} != ${segundo}`);
  };

  if (a.estrella.nombre !== b.estrella.nombre) {
    anotar('nombre', a.estrella.nombre, b.estrella.nombre);
  }
  if (!mismoNumero(a.horizontal.altitud, b.horizontal.altitud)) {
    anotar('altitud', mostrar(a.horizontal.altitud), mostrar(b.horizontal.altitud));
  }
  if (!mismoNumero(a.horizontal.azimut, b.horizontal.azimut)) {
    anotar('azimut', mostrar(a.horizontal.azimut), mostrar(b.horizontal.azimut));
  }
  if (a.visible !== b.visible) {
    anotar('visible', String(a.visible), String(b.visible));
  }

  // El Requisito 3.10 ata `pantalla === null` a la invisibilidad, asi que un
  // desacuerdo en la nulidad ya es un desacuerdo de coordenadas.
  if ((a.pantalla === null) !== (b.pantalla === null)) {
    anotar('pantalla', a.pantalla === null ? 'null' : 'punto', b.pantalla === null ? 'null' : 'punto');
    return fallos;
  }
  if (a.pantalla !== null && b.pantalla !== null) {
    fallos.push(
      ...diferenciasDePunto(a.pantalla, b.pantalla, `estrella ${String(indice)}: pantalla`),
    );
  }

  return fallos;
}

/**
 * Diferencias entre dos listas de segmentos visibles: cantidad, orden y los dos
 * extremos de cada uno. El orden importa porque el motor lo declara: es el del
 * catalogo, no el del `Map` que usa para indexar por nombre.
 */
function diferenciasDeSegmentos(
  primeros: readonly SegmentoVisible[],
  segundos: readonly SegmentoVisible[],
): string[] {
  if (primeros.length !== segundos.length) {
    return [
      `cantidad de segmentosVisibles: ${String(primeros.length)} != ${String(segundos.length)}`,
    ];
  }

  const fallos: string[] = [];
  for (let indice = 0; indice < primeros.length; indice += 1) {
    const a = primeros[indice];
    const b = segundos[indice];
    if (a === undefined || b === undefined) {
      fallos.push(`segmento ${String(indice)}: ausente en uno de los dos calculos`);
      continue;
    }
    fallos.push(...diferenciasDePunto(a.a, b.a, `segmento ${String(indice)}: a`));
    fallos.push(...diferenciasDePunto(a.b, b.b, `segmento ${String(indice)}: b`));
  }
  return fallos;
}

/**
 * Diferencias entre dos listas de constelaciones dibujadas. Se comparan como
 * secuencias, no como conjuntos: el motor promete el orden de primera aparicion
 * dentro de la seleccion de dibujo, y ese orden llega al texto alternativo del
 * Mapa_Estelar (Requisito 7.6).
 */
function diferenciasDeConstelaciones(
  primeras: readonly string[],
  segundas: readonly string[],
): string[] {
  if (primeras.length !== segundas.length) {
    return [
      `cantidad de constelacionesDibujadas: ${String(primeras.length)} != ${String(segundas.length)}`,
    ];
  }

  const fallos: string[] = [];
  for (let indice = 0; indice < primeras.length; indice += 1) {
    if (primeras[indice] !== segundas[indice]) {
      fallos.push(
        `constelacion ${String(indice)}: ${primeras[indice] ?? '(ausente)'} != ${segundas[indice] ?? '(ausente)'}`,
      );
    }
  }
  return fallos;
}

/** Diferencias entre las cuatro marcas cardinales: rotulo, orden y punto. */
function diferenciasDeCardinales(
  primeras: readonly Cardinal[],
  segundas: readonly Cardinal[],
): string[] {
  if (primeras.length !== segundas.length) {
    return [`cantidad de cardinales: ${String(primeras.length)} != ${String(segundas.length)}`];
  }

  const fallos: string[] = [];
  for (let indice = 0; indice < primeras.length; indice += 1) {
    const a = primeras[indice];
    const b = segundas[indice];
    if (a === undefined || b === undefined) {
      fallos.push(`cardinal ${String(indice)}: ausente en uno de los dos calculos`);
      continue;
    }
    if (a.rotulo !== b.rotulo) {
      fallos.push(`cardinal ${String(indice)}: rotulo ${a.rotulo} != ${b.rotulo}`);
    }
    fallos.push(...diferenciasDePunto(a.punto, b.punto, `cardinal ${a.rotulo}: punto`));
  }
  return fallos;
}

/**
 * Diferencias entre dos cielos calculados con las mismas entradas: estrella por
 * estrella en el orden del catalogo, y despues las tres colecciones derivadas.
 * La lista vacia es el cumplimiento de la Propiedad 14.
 */
function diferencias(primero: CieloCalculado, segundo: CieloCalculado): string[] {
  const fallos: string[] = [];

  if (primero.estrellas.length !== segundo.estrellas.length) {
    fallos.push(
      `cantidad de estrellas: ${String(primero.estrellas.length)} != ${String(segundo.estrellas.length)}`,
    );
    return fallos;
  }

  for (let indice = 0; indice < primero.estrellas.length; indice += 1) {
    const a = primero.estrellas[indice];
    const b = segundo.estrellas[indice];
    if (a === undefined || b === undefined) {
      fallos.push(`estrella ${String(indice)}: ausente en uno de los dos calculos`);
      continue;
    }
    fallos.push(...diferenciasDeEstrella(a, b, indice));
  }

  fallos.push(...diferenciasDeSegmentos(primero.segmentosVisibles, segundo.segmentosVisibles));
  fallos.push(
    ...diferenciasDeConstelaciones(
      primero.constelacionesDibujadas,
      segundo.constelacionesDibujadas,
    ),
  );
  fallos.push(...diferenciasDeCardinales(primero.cardinales, segundo.cardinales));

  return fallos;
}

/**
 * Descripcion corta de unas entradas, para que el contraejemplo que informe
 * fast-check se lea sin desplegar el catalogo completo.
 */
function resumen({ catalogo, instante, lugar, circulo }: Entradas): string {
  return [
    `${String(catalogo.estrellas.length)} estrellas`,
    instante.iso,
    `lat ${String(lugar.latitud)}`,
    `lon ${String(lugar.longitud)}`,
    `circulo (${mostrar(circulo.cx)}, ${mostrar(circulo.cy)}) r=${String(circulo.radio)}`,
  ].join(' · ');
}

describe('Propiedad 14: el Motor_Astronomico es determinista', () => {
  it(
    'dos invocaciones consecutivas dan altitudes, azimutes, coordenadas de pantalla y colecciones derivadas identicas bit a bit',
    () => {
      fc.assert(
        fc.property(genEntradas, (entradas) => {
          const primero = cieloDe(entradas);
          const segundo = cieloDe(entradas);

          expect(diferencias(primero, segundo), resumen(entradas)).toEqual([]);
        }),
        { numRuns: 200 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );

  it(
    'el determinismo no depende del orden: intercalar otro calculo no altera el resultado',
    () => {
      // El motor no guarda estado entre llamadas, pero eso hay que comprobarlo:
      // una cache mal escrita, o un acumulador de angulos compartido, pasaria la
      // prueba anterior y fallaria aqui.
      fc.assert(
        fc.property(genEntradas, genEntradas, (unas, otras) => {
          const primero = cieloDe(unas);
          cieloDe(otras);
          const segundo = cieloDe(unas);

          expect(diferencias(primero, segundo), resumen(unas)).toEqual([]);
        }),
        { numRuns: 100 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );

  it(
    'la seleccion de dibujables repite el mismo orden, sin depender de la estabilidad del ordenamiento',
    () => {
      // `seleccionarDibujables` ordena por magnitud y desempata por posicion en
      // el catalogo, de modo que su salida tambien es funcion de las entradas
      // (Requisito 3.6). Los catalogos generados repiten magnitudes con
      // frecuencia, asi que los empates se ejercitan solos.
      fc.assert(
        fc.property(genEntradas, (entradas) => {
          const cielo = cieloDe(entradas);
          const unaVez = seleccionarDibujables(cielo.estrellas);
          const otraVez = seleccionarDibujables(cielo.estrellas);

          const fallos: string[] = [];
          if (unaVez.length !== otraVez.length) {
            fallos.push(`cantidad: ${String(unaVez.length)} != ${String(otraVez.length)}`);
          } else {
            for (let indice = 0; indice < unaVez.length; indice += 1) {
              const a = unaVez[indice];
              const b = otraVez[indice];
              if (a !== b) {
                fallos.push(
                  `posicion ${String(indice)}: ${a?.estrella.nombre ?? '(ausente)'} != ${b?.estrella.nombre ?? '(ausente)'}`,
                );
              }
            }
          }

          expect(fallos, resumen(entradas)).toEqual([]);
        }),
        { numRuns: 100 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );

  it('las colecciones derivadas se llenan, asi que la comparacion no es vacia', () => {
    // Una propiedad de igualdad pasa trivialmente sobre listas vacias. Con una
    // muestra de semilla fija se comprueba que los generadores producen de
    // verdad segmentos visibles y constelaciones dibujadas, es decir que lo
    // comparado arriba tiene contenido.
    const muestras = fc.sample(genEntradas, { numRuns: 60, seed: 20251212 });
    const cielos = muestras.map((entradas) => cieloDe(entradas));

    expect(cielos.some((cielo) => cielo.segmentosVisibles.length > 0)).toBe(true);
    expect(cielos.some((cielo) => cielo.constelacionesDibujadas.length > 0)).toBe(true);
    expect(cielos.every((cielo) => cielo.cardinales.length === 4)).toBe(true);
  });

  it('la igualdad exacta que se usa distingue el cero negativo del positivo', () => {
    // Justifica en codigo la eleccion documentada arriba: si la comparacion
    // fuera `===`, o una resta contra 0, este caso pasaria inadvertido.
    expect(mismoNumero(0, -0)).toBe(false);
    expect(0 - -0).toBe(0);
    expect(mismoNumero(Number.NaN, Number.NaN)).toBe(true);
    expect(mismoNumero(1.5, 1.5)).toBe(true);
  });
});
