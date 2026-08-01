import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type {
  CieloCalculado,
  CirculoHorizonte,
  EstrellaCalculada,
  SegmentoVisible,
} from '../../src/nucleo/astronomia/modelo.js';
import {
  ALTITUD_HORIZONTE,
  MAX_ESTRELLAS_DIBUJADAS,
  calcularCielo,
  seleccionarDibujables,
} from '../../src/nucleo/astronomia/motor.js';
import type { CatalogoEstelar } from '../../src/nucleo/catalogo/modelo.js';
import { calcularCirculo } from '../../src/vista/mapa/circulo.js';
import { MAGNITUD_MAXIMA, radioPorMagnitud } from '../../src/vista/mapa/radio.js';
import {
  genAnchoVentana,
  genCatalogoValido,
  genInstante,
  genLatitud,
  genLongitud,
} from '../generadores.js';

/**
 * Propiedad 17: Visibilidad, seleccion de dibujo y omision de segmentos.
 *
 * *Para todo* cielo calculado, cada Estrella se marca visible si y solo si su
 * altitud es mayor o igual a 0 grados; toda Estrella no visible carece de
 * coordenadas de pantalla; el conjunto seleccionado para dibujo contiene
 * exactamente las Estrellas visibles con magnitud aparente menor o igual a 6.0,
 * con un maximo de 3000 elementos, todas dentro del Circulo_Horizonte; y el
 * conjunto de lineas de constelacion dibujadas contiene exactamente los
 * Segmentos cuyos dos extremos son visibles.
 *
 * **Validates: Requirements 3.10, 4.1, 4.15**
 *
 * Como se comprueba cada clausula:
 *
 * - `visible === (altitud >= 0)` se verifica como **bicondicional**, en las dos
 *   direcciones a la vez: no basta con que toda estrella marcada visible este
 *   sobre el horizonte, tambien toda estrella sobre el horizonte debe quedar
 *   marcada visible. Una comparacion de igualdad entre los dos booleanos cubre
 *   ambos sentidos y ademas rechaza el caso de altitud exactamente 0, que
 *   pertenece al lado visible.
 * - `pantalla === null` se exige **exactamente** cuando la estrella no es
 *   visible (Requisito 3.10), otra vez como bicondicional.
 * - toda coordenada de pantalla producida cae dentro del Circulo_Horizonte, con
 *   la tolerancia de 0.5 px de la Propiedad 13 (corolario del Requisito 3.5).
 * - la seleccion de dibujo se compara contra un oraculo independiente y ademas
 *   se le exigen sus invariantes por separado: solo visibles, solo magnitud
 *   menor o igual a 6.0, tope de 3000, orden de mas brillante a mas debil y
 *   coordenada de pantalla presente en cada elemento (Requisito 4.1).
 * - los segmentos dibujables se calculan aparte a partir de la lista de
 *   estrellas y se comparan con los del motor. `genCatalogoValido` produce
 *   Segmentos siempre consistentes, asi que el oraculo puede resolver los
 *   nombres sin tratar el caso ausente. La comparacion es de igualdad de
 *   conjuntos ordenados, de modo que cubre las dos mitades del Requisito 4.15:
 *   no falta ningun segmento con sus dos extremos visibles y no sobra ninguno
 *   con un extremo bajo el horizonte.
 *
 * Nota de coste. La propiedad recorre **todas** las estrellas de **todos** los
 * catalogos generados, asi que una asercion por estrella la convertiria en la
 * prueba mas lenta de la suite. Los invariantes se comprueban con predicados
 * planos, las violaciones se juntan en un arreglo y se asierta **una sola vez**
 * por iteracion con `toEqual([])`, el mismo patron de `cielo-portal.test.ts`.
 */

/** Tolerancia del invariante del Circulo_Horizonte, en pixeles (Propiedad 13). */
const TOLERANCIA_RADIO_PX = 0.5;

/** Cuantas violaciones se describen por iteracion antes de cortar el detalle. */
const MAX_VIOLACIONES_DESCRITAS = 8;

/**
 * Tiempo maximo por prueba de esta suite. Holgado respecto de lo medido, solo
 * para que la suite no se caiga por contencion cuando varios proyectos de
 * Vitest corren en paralelo.
 */
const TIEMPO_MAXIMO_MS = 30_000;

/**
 * Alto de la caja visible del mapa, en pixeles: rango continuo mas las
 * fronteras donde el radio deja de venir de la formula y manda el piso de
 * 140 px.
 */
const genAltoVentana: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 280, max: 1400 }) },
  { weight: 2, arbitrary: fc.constantFrom(280, 295, 296, 297, 320, 400, 768, 1080) },
);

/** Circulo_Horizonte real, el que la vista calcula para una caja visible. */
const genCirculo: fc.Arbitrary<CirculoHorizonte> = fc
  .tuple(genAnchoVentana, genAltoVentana)
  .map(([ancho, alto]) => calcularCirculo(ancho, alto));

/** Distancia de un punto al centro del Circulo_Horizonte, en pixeles. */
function distanciaAlCentro(x: number, y: number, circulo: CirculoHorizonte): number {
  return Math.hypot(x - circulo.cx, y - circulo.cy);
}

/**
 * Seleccion de dibujo esperada: las visibles con magnitud menor o igual a 6.0,
 * ordenadas de mas brillante a mas debil y desempatadas por posicion en el
 * catalogo, recortadas al tope de 3000 (Requisito 4.1).
 */
function seleccionEsperada(
  estrellas: readonly EstrellaCalculada[],
): readonly EstrellaCalculada[] {
  const candidatas: { readonly calculada: EstrellaCalculada; readonly indice: number }[] = [];
  for (let indice = 0; indice < estrellas.length; indice += 1) {
    const calculada = estrellas[indice];
    if (calculada === undefined) {
      continue;
    }
    if (calculada.visible && calculada.estrella.magnitud <= MAGNITUD_MAXIMA) {
      candidatas.push({ calculada, indice });
    }
  }

  candidatas.sort((a, b) => {
    const porMagnitud = a.calculada.estrella.magnitud - b.calculada.estrella.magnitud;
    return porMagnitud !== 0 ? porMagnitud : a.indice - b.indice;
  });

  return candidatas
    .slice(0, MAX_ESTRELLAS_DIBUJADAS)
    .map(({ calculada }) => calculada);
}

/**
 * Segmentos dibujables esperados, calculados a partir de la lista de estrellas
 * y no de lo que devolvio el motor: los que tienen sus **dos** extremos sobre
 * el horizonte, en el orden del catalogo (Requisito 4.15).
 */
function segmentosEsperados(
  catalogo: CatalogoEstelar,
  estrellas: readonly EstrellaCalculada[],
): readonly SegmentoVisible[] {
  const porNombre = new Map<string, EstrellaCalculada>();
  for (const calculada of estrellas) {
    porNombre.set(calculada.estrella.nombre, calculada);
  }

  const esperados: SegmentoVisible[] = [];
  for (const segmento of catalogo.segmentos) {
    const desde = porNombre.get(segmento.desde);
    const hasta = porNombre.get(segmento.hasta);
    // `genCatalogoValido` garantiza segmentos consistentes: los dos nombres
    // existen. Si alguno faltara, el segmento tampoco seria dibujable.
    if (desde === undefined || hasta === undefined) {
      continue;
    }
    const a = desde.pantalla;
    const b = hasta.pantalla;
    if (a === null || b === null) {
      continue;
    }
    esperados.push({ a, b });
  }
  return esperados;
}

/** Violaciones de la clausula de visibilidad y de coordenadas de pantalla. */
function violacionesDeVisibilidad(cielo: CieloCalculado): string[] {
  const fallos: string[] = [];

  for (let indice = 0; indice < cielo.estrellas.length; indice += 1) {
    const calculada = cielo.estrellas[indice];
    if (calculada === undefined) {
      continue;
    }

    const sobreElHorizonte = calculada.horizontal.altitud >= ALTITUD_HORIZONTE;
    const sinPantalla = calculada.pantalla === null;

    // Bicondicional del Requisito 3.10, en sus dos direcciones.
    const visibilidadCorrecta = calculada.visible === sobreElHorizonte;
    const pantallaCorrecta = sinPantalla === !calculada.visible;
    const dentroDelCirculo =
      calculada.pantalla === null ||
      distanciaAlCentro(calculada.pantalla.x, calculada.pantalla.y, cielo.circulo) <=
        cielo.circulo.radio + TOLERANCIA_RADIO_PX;

    if (visibilidadCorrecta && pantallaCorrecta && dentroDelCirculo) {
      continue;
    }
    if (fallos.length >= MAX_VIOLACIONES_DESCRITAS) {
      continue;
    }

    const contexto = `estrella ${String(indice)} (altitud ${String(calculada.horizontal.altitud)})`;
    if (!visibilidadCorrecta) {
      fallos.push(
        `${contexto}: visible = ${String(calculada.visible)}, se esperaba ${String(sobreElHorizonte)}`,
      );
    }
    if (!pantallaCorrecta) {
      fallos.push(
        `${contexto}: pantalla ${sinPantalla ? 'ausente' : 'presente'} con visible = ${String(calculada.visible)}`,
      );
    }
    if (!dentroDelCirculo && calculada.pantalla !== null) {
      const distancia = distanciaAlCentro(
        calculada.pantalla.x,
        calculada.pantalla.y,
        cielo.circulo,
      );
      fallos.push(
        `${contexto}: distancia al centro ${String(distancia)} px, radio ${String(cielo.circulo.radio)} px`,
      );
    }
  }

  return fallos;
}

/**
 * Violaciones de la clausula de seleccion de dibujo (Requisito 4.1). Se
 * comprueban los invariantes por separado y ademas la igualdad con el oraculo,
 * de modo que un fallo diga cual de las dos cosas se rompio.
 */
function violacionesDeSeleccion(
  estrellas: readonly EstrellaCalculada[],
  circulo: CirculoHorizonte,
): string[] {
  const fallos: string[] = [];
  const dibujables = seleccionarDibujables(estrellas);

  if (dibujables.length > MAX_ESTRELLAS_DIBUJADAS) {
    fallos.push(
      `seleccion de ${String(dibujables.length)} estrellas, tope ${String(MAX_ESTRELLAS_DIBUJADAS)}`,
    );
  }

  for (let posicion = 0; posicion < dibujables.length; posicion += 1) {
    const dibujable = dibujables[posicion];
    if (dibujable === undefined) {
      continue;
    }

    const magnitud = dibujable.estrella.magnitud;
    const pantalla = dibujable.pantalla;
    const valida =
      dibujable.visible &&
      magnitud <= MAGNITUD_MAXIMA &&
      pantalla !== null &&
      distanciaAlCentro(pantalla.x, pantalla.y, circulo) <= circulo.radio + TOLERANCIA_RADIO_PX;

    if (valida || fallos.length >= MAX_VIOLACIONES_DESCRITAS) {
      continue;
    }

    const contexto = `seleccionada ${String(posicion)} (${dibujable.estrella.nombre})`;
    if (!dibujable.visible) {
      fallos.push(`${contexto}: no visible`);
    }
    if (magnitud > MAGNITUD_MAXIMA) {
      fallos.push(`${contexto}: magnitud ${String(magnitud)} mayor que ${String(MAGNITUD_MAXIMA)}`);
    }
    if (pantalla === null) {
      fallos.push(`${contexto}: sin coordenadas de pantalla`);
    } else if (
      distanciaAlCentro(pantalla.x, pantalla.y, circulo) >
      circulo.radio + TOLERANCIA_RADIO_PX
    ) {
      fallos.push(
        `${contexto}: fuera del Circulo_Horizonte, distancia ${String(distanciaAlCentro(pantalla.x, pantalla.y, circulo))} px`,
      );
    }
  }

  // Orden de mas brillante a mas debil: se revisa aparte para nombrar el par
  // culpable en lugar de solo la posicion.
  for (let posicion = 1; posicion < dibujables.length; posicion += 1) {
    const anterior = dibujables[posicion - 1];
    const actual = dibujables[posicion];
    if (anterior === undefined || actual === undefined) {
      continue;
    }
    if (
      anterior.estrella.magnitud > actual.estrella.magnitud &&
      fallos.length < MAX_VIOLACIONES_DESCRITAS
    ) {
      fallos.push(
        `orden roto en ${String(posicion)}: magnitud ${String(anterior.estrella.magnitud)} antes de ${String(actual.estrella.magnitud)}`,
      );
    }
  }

  const esperada = seleccionEsperada(estrellas);
  if (dibujables.length !== esperada.length) {
    fallos.push(
      `seleccion de ${String(dibujables.length)} estrellas, se esperaban ${String(esperada.length)}`,
    );
  } else {
    for (let posicion = 0; posicion < esperada.length; posicion += 1) {
      if (
        dibujables[posicion] !== esperada[posicion] &&
        fallos.length < MAX_VIOLACIONES_DESCRITAS
      ) {
        fallos.push(`seleccion distinta del oraculo en la posicion ${String(posicion)}`);
      }
    }
  }

  return fallos;
}

/** Violaciones de la clausula de omision de segmentos (Requisito 4.15). */
function violacionesDeSegmentos(cielo: CieloCalculado, catalogo: CatalogoEstelar): string[] {
  const fallos: string[] = [];
  const esperados = segmentosEsperados(catalogo, cielo.estrellas);
  const obtenidos = cielo.segmentosVisibles;

  if (obtenidos.length !== esperados.length) {
    fallos.push(
      `${String(obtenidos.length)} segmentos dibujables de ${String(catalogo.segmentos.length)}, se esperaban ${String(esperados.length)}`,
    );
  }

  const comunes = Math.min(obtenidos.length, esperados.length);
  for (let posicion = 0; posicion < comunes; posicion += 1) {
    const obtenido = obtenidos[posicion];
    const esperado = esperados[posicion];
    if (obtenido === undefined || esperado === undefined) {
      continue;
    }
    // Los extremos son las mismas referencias de `pantalla` que produjo el
    // motor, asi que la identidad basta y evita comparar objeto por objeto.
    if (
      (obtenido.a !== esperado.a || obtenido.b !== esperado.b) &&
      fallos.length < MAX_VIOLACIONES_DESCRITAS
    ) {
      fallos.push(`segmento ${String(posicion)} con extremos distintos de los esperados`);
    }
  }

  return fallos;
}

/** Todas las violaciones de la Propiedad 17 para un cielo concreto. */
function violacionesDelCielo(cielo: CieloCalculado, catalogo: CatalogoEstelar): string[] {
  return [
    ...violacionesDeVisibilidad(cielo),
    ...violacionesDeSeleccion(cielo.estrellas, cielo.circulo),
    ...violacionesDeSegmentos(cielo, catalogo),
  ];
}

/** Entrada sintetica para ejercitar la seleccion mas alla del catalogo real. */
interface EntradaSintetica {
  readonly visible: boolean;
  readonly magnitud: number;
}

/**
 * Estrella calculada sintetica que respeta los invariantes del modelo: las no
 * visibles no tienen coordenadas de pantalla y las visibles caen en el centro
 * del circulo, que siempre esta dentro de el.
 */
function calculadaSintetica(
  entrada: EntradaSintetica,
  indice: number,
  circulo: CirculoHorizonte,
): EstrellaCalculada {
  return {
    estrella: {
      nombre: `Sintetica-${String(indice)}`,
      ar: 0,
      dec: 0,
      magnitud: entrada.magnitud,
      constelacion: 'Prueba',
    },
    horizontal: { altitud: entrada.visible ? 10 : -10, azimut: 0 },
    visible: entrada.visible,
    pantalla: entrada.visible ? { x: circulo.cx, y: circulo.cy } : null,
    radio: radioPorMagnitud(entrada.magnitud),
  };
}

/**
 * Magnitudes que el Catalogo_Estelar valido no puede contener, porque el
 * Lector_Catalogo las rechaza: son las que ejercitan el filtro de 6.0 de la
 * seleccion de dibujo.
 */
const genMagnitudSintetica: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.double({ min: -2, max: 9, noNaN: true, noDefaultInfinity: true }) },
  {
    weight: 2,
    arbitrary: fc.constantFrom(-1.5, 0, 3, 5.999999, 6, 6.000001, 6.5, 9),
  },
);

const genEntradasSinteticas: fc.Arbitrary<readonly EntradaSintetica[]> = fc.array(
  fc.record({ visible: fc.boolean(), magnitud: genMagnitudSintetica }),
  { maxLength: 60 },
);

describe('Propiedad 17: visibilidad, seleccion de dibujo y omision de segmentos', () => {
  it(
    'marca visible exactamente a las Estrellas de altitud mayor o igual a 0 y omite sus coordenadas cuando no lo son',
    () => {
      fc.assert(
        fc.property(
          genCatalogoValido,
          genInstante,
          genLatitud,
          genLongitud,
          genCirculo,
          (catalogo, instante, latitud, longitud, circulo) => {
            const resultado = calcularCielo(
              catalogo,
              instante,
              { nombre: 'Lugar de prueba', latitud, longitud },
              circulo,
            );

            // Las entradas provienen de generadores validos, asi que el motor
            // no puede rechazarlas: eso lo cubre la Propiedad 16.
            expect(resultado.ok, 'el motor rechazo entradas validas').toBe(true);
            if (!resultado.ok) {
              return;
            }

            expect(
              violacionesDelCielo(resultado.cielo, catalogo),
              `instante ${instante.iso}, lat ${String(latitud)}, lon ${String(longitud)}`,
            ).toEqual([]);
          },
        ),
        { numRuns: 300 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );

  it(
    'selecciona para dibujo solo las visibles de magnitud menor o igual a 6.0, incluso con magnitudes que el catalogo no admite',
    () => {
      const circulo = calcularCirculo(900, 700);

      fc.assert(
        fc.property(genEntradasSinteticas, (entradas) => {
          const estrellas = entradas.map((entrada, indice) =>
            calculadaSintetica(entrada, indice, circulo),
          );

          expect(violacionesDeSeleccion(estrellas, circulo)).toEqual([]);
        }),
        { numRuns: 300 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );

  it('aplica el tope de 3000 Estrellas dibujadas quedandose con las mas brillantes', () => {
    const circulo = calcularCirculo(900, 700);
    const total = MAX_ESTRELLAS_DIBUJADAS + 200;
    const estrellas: EstrellaCalculada[] = [];
    for (let indice = 0; indice < total; indice += 1) {
      estrellas.push(
        calculadaSintetica(
          {
            visible: true,
            // Magnitudes decrecientes en brillo con el indice, de -1.5 a 6.0.
            magnitud: -1.5 + (7.5 * indice) / (total - 1),
          },
          indice,
          circulo,
        ),
      );
    }

    const dibujables = seleccionarDibujables(estrellas);

    expect(dibujables.length).toBe(MAX_ESTRELLAS_DIBUJADAS);
    expect(violacionesDeSeleccion(estrellas, circulo)).toEqual([]);
    // Lo que se pierde son las mas debiles: la ultima seleccionada es mas
    // brillante que cualquiera de las descartadas.
    expect(dibujables.at(-1)?.estrella.nombre).toBe(
      `Sintetica-${String(MAX_ESTRELLAS_DIBUJADAS - 1)}`,
    );
  });

  it('omite por completo los Segmentos con un extremo bajo el horizonte', () => {
    fc.assert(
      fc.property(
        genCatalogoValido,
        genInstante,
        genLatitud,
        genLongitud,
        genCirculo,
        (catalogo, instante, latitud, longitud, circulo) => {
          const resultado = calcularCielo(
            catalogo,
            instante,
            { nombre: 'Lugar de prueba', latitud, longitud },
            circulo,
          );
          expect(resultado.ok).toBe(true);
          if (!resultado.ok) {
            return;
          }

          const visiblePorNombre = new Map<string, boolean>();
          for (const calculada of resultado.cielo.estrellas) {
            visiblePorNombre.set(calculada.estrella.nombre, calculada.visible);
          }

          let conExtremoBajoElHorizonte = 0;
          let conLosDosVisibles = 0;
          for (const segmento of catalogo.segmentos) {
            const desde = visiblePorNombre.get(segmento.desde) ?? false;
            const hasta = visiblePorNombre.get(segmento.hasta) ?? false;
            if (desde && hasta) {
              conLosDosVisibles += 1;
            } else {
              conExtremoBajoElHorizonte += 1;
            }
          }

          expect({
            dibujados: resultado.cielo.segmentosVisibles.length,
            omitidos: catalogo.segmentos.length - resultado.cielo.segmentosVisibles.length,
          }).toEqual({
            dibujados: conLosDosVisibles,
            omitidos: conExtremoBajoElHorizonte,
          });
        },
      ),
      { numRuns: 200 },
    );
  }, TIEMPO_MAXIMO_MS);
});
