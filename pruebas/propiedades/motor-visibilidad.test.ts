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
 * Las tres clausulas se comprueban como **bicondicionales**, no en una sola
 * direccion:
 *
 * - `visible === (altitud >= 0)`: no basta con que toda marcada visible este
 *   sobre el horizonte, tambien toda estrella sobre el horizonte debe quedar
 *   marcada visible. La igualdad de los dos booleanos cubre los dos sentidos y
 *   ademas fija el caso de altitud exactamente 0, que pertenece al lado
 *   visible.
 * - `pantalla === null` **exactamente** cuando la estrella no es visible
 *   (Requisito 3.10). La direccion olvidada con facilidad es la otra: una
 *   estrella visible sin coordenadas tambien rompe el requisito.
 * - un Segmento aparece en `segmentosVisibles` **si y solo si** sus dos
 *   extremos resuelven a estrellas visibles (Requisito 4.15). Se compara la
 *   lista completa contra un oraculo calculado aparte a partir de las
 *   estrellas, de modo que ni falta ninguno con los dos extremos arriba ni
 *   sobra ninguno con un extremo bajo el horizonte.
 *
 * El conjunto seleccionado para dibujo es el de `seleccionarDibujables`: el
 * motor no pudo codificar el tope de 3000 dentro de `CieloCalculado`, cuyo
 * invariante fija `estrellas` en el orden del catalogo, asi que la seleccion
 * vive en esa funcion pura aparte. Se le exige el tope de 3000, el filtro de
 * magnitud 6.0, la visibilidad, la presencia de coordenadas y que estas caigan
 * dentro del Circulo_Horizonte (corolario del Requisito 3.5, con la tolerancia
 * de 0.5 px de la Propiedad 13).
 *
 * Nota de coste. La propiedad toca **todas** las estrellas de cada catalogo
 * generado, y `genCatalogoValido` produce hasta 300. Una asercion por estrella
 * y por iteracion la volveria la prueba mas lenta de la suite, asi que los
 * invariantes se comprueban con predicados planos, las violaciones se juntan en
 * un arreglo y se asierta **una sola vez** por iteracion con `toEqual([])`, el
 * patron de `cielo-portal.test.ts`.
 */

/** Tolerancia del invariante del Circulo_Horizonte, en pixeles (Propiedad 13). */
const TOLERANCIA_RADIO_PX = 0.5;

/** Cuantas violaciones se describen por iteracion antes de cortar el detalle. */
const MAX_VIOLACIONES_DESCRITAS = 6;

/**
 * Tiempo maximo por prueba, holgado respecto de lo medido (unidades de
 * decimas de segundo por propiedad): solo evita que la suite se caiga por
 * contencion cuando corren varios proyectos de Vitest a la vez.
 */
const TIEMPO_MAXIMO_MS = 30_000;

/** Alto de la caja visible del mapa, en pixeles. */
const genAltoVentana: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 280, max: 1400 }) },
  { weight: 2, arbitrary: fc.constantFrom(280, 295, 296, 297, 400, 768, 1080) },
);

/** Circulo_Horizonte real, el que la vista calcula para una caja visible. */
const genCirculo: fc.Arbitrary<CirculoHorizonte> = fc
  .tuple(genAnchoVentana, genAltoVentana)
  .map(([ancho, alto]) => calcularCirculo(ancho, alto));

/** Cuantas veces se vio cada rama, para descartar una propiedad trivial. */
interface Conteo {
  visibles: number;
  invisibles: number;
  conPantalla: number;
  sinPantalla: number;
  segmentosDibujados: number;
  segmentosOmitidos: number;
}

function conteoEnCero(): Conteo {
  return {
    visibles: 0,
    invisibles: 0,
    conPantalla: 0,
    sinPantalla: 0,
    segmentosDibujados: 0,
    segmentosOmitidos: 0,
  };
}

/** Distancia de un punto al centro del Circulo_Horizonte, en pixeles. */
function distanciaAlCentro(x: number, y: number, circulo: CirculoHorizonte): number {
  return Math.hypot(x - circulo.cx, y - circulo.cy);
}

/** Un punto cae dentro del Circulo_Horizonte, con la tolerancia de 0.5 px. */
function dentroDelCirculo(x: number, y: number, circulo: CirculoHorizonte): boolean {
  return distanciaAlCentro(x, y, circulo) <= circulo.radio + TOLERANCIA_RADIO_PX;
}

/**
 * Seleccion de dibujo esperada, calculada aqui y no tomada del motor: las
 * visibles con magnitud menor o igual a 6.0, de mas brillante a mas debil,
 * desempatadas por posicion en el catalogo y recortadas a 3000
 * (Requisito 4.1).
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

  return candidatas.slice(0, MAX_ESTRELLAS_DIBUJADAS).map(({ calculada }) => calculada);
}

/**
 * Segmentos dibujables esperados: los que tienen sus **dos** extremos sobre el
 * horizonte, en el orden del catalogo (Requisito 4.15). `genCatalogoValido`
 * garantiza que los dos nombres de cada Segmento existen, asi que el caso
 * ausente no puede aparecer; se trata igual porque tampoco seria dibujable.
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
    if (desde === undefined || hasta === undefined) {
      continue;
    }
    if (!desde.visible || !hasta.visible || desde.pantalla === null || hasta.pantalla === null) {
      continue;
    }
    esperados.push({ a: desde.pantalla, b: hasta.pantalla });
  }
  return esperados;
}

/**
 * Violaciones de las dos clausulas por Estrella: el bicondicional de
 * visibilidad y el de las coordenadas de pantalla, mas el invariante del
 * Circulo_Horizonte para las que si las tienen.
 */
function violacionesDeVisibilidad(cielo: CieloCalculado, conteo: Conteo): string[] {
  const fallos: string[] = [];

  for (let indice = 0; indice < cielo.estrellas.length; indice += 1) {
    const calculada = cielo.estrellas[indice];
    if (calculada === undefined) {
      continue;
    }

    const sobreElHorizonte = calculada.horizontal.altitud >= ALTITUD_HORIZONTE;
    const conPantalla = calculada.pantalla !== null;

    if (calculada.visible) {
      conteo.visibles += 1;
    } else {
      conteo.invisibles += 1;
    }
    if (conPantalla) {
      conteo.conPantalla += 1;
    } else {
      conteo.sinPantalla += 1;
    }

    // Requisito 3.10, en sus dos direcciones a la vez.
    const visibilidadCorrecta = calculada.visible === sobreElHorizonte;
    const pantallaCorrecta = conPantalla === calculada.visible;
    const ubicacionCorrecta =
      calculada.pantalla === null ||
      dentroDelCirculo(calculada.pantalla.x, calculada.pantalla.y, cielo.circulo);

    if (visibilidadCorrecta && pantallaCorrecta && ubicacionCorrecta) {
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
        `${contexto}: pantalla ${conPantalla ? 'presente' : 'ausente'} con visible = ${String(calculada.visible)}`,
      );
    }
    if (!ubicacionCorrecta && calculada.pantalla !== null) {
      fallos.push(
        `${contexto}: distancia al centro ${String(distanciaAlCentro(calculada.pantalla.x, calculada.pantalla.y, cielo.circulo))} px, radio ${String(cielo.circulo.radio)} px`,
      );
    }
  }

  return fallos;
}

/**
 * Violaciones de la clausula de seleccion de dibujo (Requisito 4.1). Se
 * comprueban los invariantes uno a uno y ademas la igualdad con el oraculo, de
 * modo que un fallo diga cual de las dos cosas se rompio.
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

    const pantalla = dibujable.pantalla;
    const magnitud = dibujable.estrella.magnitud;
    const valida =
      dibujable.visible &&
      magnitud <= MAGNITUD_MAXIMA &&
      pantalla !== null &&
      dentroDelCirculo(pantalla.x, pantalla.y, circulo);

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
    } else if (!dentroDelCirculo(pantalla.x, pantalla.y, circulo)) {
      fallos.push(
        `${contexto}: fuera del Circulo_Horizonte, distancia ${String(distanciaAlCentro(pantalla.x, pantalla.y, circulo))} px`,
      );
    }
  }

  // La otra direccion: ninguna visible de magnitud admisible puede faltar. La
  // igualdad con el oraculo la cubre de una vez, incluido el orden por brillo.
  const esperada = seleccionEsperada(estrellas);
  if (dibujables.length !== esperada.length) {
    fallos.push(
      `seleccion de ${String(dibujables.length)} estrellas, se esperaban ${String(esperada.length)}`,
    );
  } else {
    for (let posicion = 0; posicion < esperada.length; posicion += 1) {
      if (dibujables[posicion] === esperada[posicion]) {
        continue;
      }
      if (fallos.length < MAX_VIOLACIONES_DESCRITAS) {
        fallos.push(`seleccion distinta de la esperada en la posicion ${String(posicion)}`);
      }
    }
  }

  return fallos;
}

/** Violaciones de la clausula de omision de segmentos (Requisito 4.15). */
function violacionesDeSegmentos(
  cielo: CieloCalculado,
  catalogo: CatalogoEstelar,
  conteo: Conteo,
): string[] {
  const fallos: string[] = [];
  const esperados = segmentosEsperados(catalogo, cielo.estrellas);
  const obtenidos = cielo.segmentosVisibles;

  conteo.segmentosDibujados += esperados.length;
  conteo.segmentosOmitidos += catalogo.segmentos.length - esperados.length;

  if (obtenidos.length !== esperados.length) {
    fallos.push(
      `${String(obtenidos.length)} segmentos dibujados de ${String(catalogo.segmentos.length)}, se esperaban ${String(esperados.length)}`,
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
    // motor, asi que la identidad basta y evita comparar campo por campo.
    if (obtenido.a === esperado.a && obtenido.b === esperado.b) {
      continue;
    }
    if (fallos.length < MAX_VIOLACIONES_DESCRITAS) {
      fallos.push(`segmento ${String(posicion)} con extremos distintos de los esperados`);
    }
  }

  return fallos;
}

/** Todas las violaciones de la Propiedad 17 para un cielo concreto. */
function violacionesDelCielo(
  cielo: CieloCalculado,
  catalogo: CatalogoEstelar,
  conteo: Conteo,
): string[] {
  return [
    ...violacionesDeVisibilidad(cielo, conteo),
    ...violacionesDeSeleccion(cielo.estrellas, cielo.circulo),
    ...violacionesDeSegmentos(cielo, catalogo, conteo),
  ];
}

/** Entrada sintetica para ejercitar la seleccion mas alla del catalogo valido. */
interface EntradaSintetica {
  readonly visible: boolean;
  readonly magnitud: number;
}

/**
 * Estrella calculada sintetica que respeta los invariantes del modelo: las no
 * visibles no reciben coordenadas y las visibles caen en el centro del
 * circulo, que siempre esta dentro de el.
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
 * Magnitudes que un Catalogo_Estelar valido no puede contener, porque el
 * Lector_Catalogo las rechaza fuera de [-1.5, 6.0]: son justamente las que
 * ejercitan el filtro de 6.0 de la seleccion de dibujo.
 */
const genMagnitudSintetica: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.double({ min: -2, max: 9, noNaN: true, noDefaultInfinity: true }) },
  { weight: 2, arbitrary: fc.constantFrom(-1.5, 0, 3, 5.999999, 6, 6.000001, 6.5, 9) },
);

const genEntradasSinteticas: fc.Arbitrary<readonly EntradaSintetica[]> = fc.array(
  fc.record({ visible: fc.boolean(), magnitud: genMagnitudSintetica }),
  { maxLength: 60 },
);

describe('Propiedad 17: visibilidad, seleccion de dibujo y omision de segmentos', () => {
  it(
    'marca visible exactamente a las Estrellas de altitud mayor o igual a 0, omite las coordenadas de las demas y omite los Segmentos con un extremo bajo el horizonte',
    () => {
      const conteo = conteoEnCero();

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

            // Las entradas vienen de generadores validos: el rechazo de las
            // invalidas es asunto de la Propiedad 16.
            expect(resultado.ok, 'el motor rechazo entradas validas').toBe(true);
            if (!resultado.ok) {
              return;
            }

            expect(
              violacionesDelCielo(resultado.cielo, catalogo, conteo),
              `instante ${instante.iso}, lat ${String(latitud)}, lon ${String(longitud)}`,
            ).toEqual([]);
          },
        ),
        { numRuns: 200 },
      );

      // Sin esto la propiedad podria pasar de forma trivial: un cielo donde
      // todas las estrellas resultaran visibles no probaria nada de la mitad
      // negativa de los tres bicondicionales.
      expect(conteo.visibles).toBeGreaterThan(0);
      expect(conteo.invisibles).toBeGreaterThan(0);
      expect(conteo.conPantalla).toBeGreaterThan(0);
      expect(conteo.sinPantalla).toBeGreaterThan(0);
      expect(conteo.segmentosDibujados).toBeGreaterThan(0);
      expect(conteo.segmentosOmitidos).toBeGreaterThan(0);
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
        { numRuns: 200 },
      );
    },
    TIEMPO_MAXIMO_MS,
  );

  it('nunca selecciona mas de 3000 Estrellas y lo que descarta son las mas debiles', () => {
    const circulo = calcularCirculo(900, 700);
    const total = MAX_ESTRELLAS_DIBUJADAS + 200;
    const estrellas: EstrellaCalculada[] = [];
    for (let indice = 0; indice < total; indice += 1) {
      estrellas.push(
        calculadaSintetica(
          // Magnitudes crecientes con el indice: la estrella 0 es la mas
          // brillante y la ultima la mas debil.
          { visible: true, magnitud: -1.5 + (7.5 * indice) / (total - 1) },
          indice,
          circulo,
        ),
      );
    }

    const dibujables = seleccionarDibujables(estrellas);

    expect(dibujables.length).toBe(MAX_ESTRELLAS_DIBUJADAS);
    expect(violacionesDeSeleccion(estrellas, circulo)).toEqual([]);
    expect(dibujables.at(-1)?.estrella.nombre).toBe(
      `Sintetica-${String(MAX_ESTRELLAS_DIBUJADAS - 1)}`,
    );
  });
});
