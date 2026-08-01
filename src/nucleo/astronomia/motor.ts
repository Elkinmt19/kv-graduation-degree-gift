/**
 * Fachada del Motor_Astronomico: `calcularCielo` recibe el Catalogo_Estelar, el
 * Instante_Graduacion, el Lugar_Graduacion y el Circulo_Horizonte, y devuelve
 * un Cielo_Calculado listo para dibujar, o un `ErrorMotor` si las entradas no
 * son admisibles.
 *
 * Encadena los cuatro modulos puros del canal en este orden:
 *
 * 1. `tiempo.ts`: dia juliano del instante y tiempo sidereo local del lugar.
 * 2. `precesion.ts`: coordenadas J2000.0 del catalogo -> equinoccio de la
 *    fecha.
 * 3. `horizontales.ts`: ecuatoriales de la fecha -> Coordenadas_Horizontales.
 * 4. `proyeccion.ts`: horizontales -> coordenadas de pantalla, solo para las
 *    estrellas sobre el horizonte.
 *
 * Modulo puro: sin DOM, sin `fetch`, sin `Date.now()` y sin `Math.random()`.
 * Los fallos viajan como datos, nunca como excepciones.
 *
 * ## Orden de validacion (Requisito 3.9)
 *
 * Antes de producir **ninguna** coordenada se validan, en este orden, el
 * Instante_Graduacion, la latitud y la longitud. El primer defecto detiene el
 * calculo y se devuelve con el campo y el valor recibidos. La precedencia
 * importa solo cuando hay mas de un defecto a la vez: en ese caso se reporta el
 * primero de la lista, que sigue identificando un campo invalido real.
 *
 * ## Determinismo (Requisito 3.6, apartado (h) del diseno)
 *
 * - No se consulta el reloj ni ninguna fuente de azar. `Date.parse` se usa una
 *   sola vez y solo para *validar* la cadena del instante; el valor que entra
 *   al calculo es `instante.msUtc`, ya derivado en la frontera.
 * - El dia juliano y el tiempo sidereo local se calculan **una vez** para todo
 *   el catalogo, no por estrella: asi ninguna estrella depende del resultado de
 *   la anterior y no hay acumulacion incremental de angulos.
 * - No se itera sobre `Set` ni `Map` de claves numericas. Las dos estructuras
 *   asociativas del modulo tienen claves de tipo cadena y **solo** se consultan
 *   con `get`/`has`; el orden de recorrido siempre lo fija un arreglo del
 *   catalogo o de la seleccion de dibujo.
 * - El unico ordenamiento (`seleccionarDibujables`) desempata por posicion en
 *   el catalogo, de modo que no depende de si el motor de la plataforma ordena
 *   de forma estable.
 *
 * Con ello dos invocaciones con las mismas entradas devuelven bits identicos,
 * no solo valores cercanos.
 *
 * ## Coste (Requisito 3.11)
 *
 * El coste crece de forma lineal con el catalogo: precesion, conversion y
 * proyeccion por estrella, mas un ordenamiento de las candidatas a dibujo. Los
 * angulos de precesion se recalculan dentro de `precesarDesdeJ2000` en cada
 * llamada, porque hacerlo una sola vez exigiria duplicar aqui la formula de
 * Meeus 21.3; para un `jd` fijo el resultado es identico bit a bit en cada
 * estrella, y el sobrecoste medido queda dos ordenes de magnitud por debajo de
 * los 300 ms que admite el requisito para 3000 estrellas.
 *
 * ## Nota de capas
 *
 * `radioPorMagnitud` vive en `src/vista/mapa/radio.ts` y el nucleo lo importa.
 * Es la unica dependencia del nucleo hacia una carpeta de vista y se acepta a
 * proposito: `radio.ts` es una funcion pura sin DOM, sin reloj y sin azar, asi
 * que ninguna de las reglas de pureza del nucleo se rompe, y `radio` es un
 * campo de `EstrellaCalculada`, es decir parte del modelo astronomico. La
 * alternativa seria duplicar la curva del Requisito 4.2 en dos lugares, que es
 * peor. Si la direccion de la dependencia llegara a molestar, `radio.ts` puede
 * moverse al nucleo sin cambiar una linea de comportamiento.
 *
 * Requisitos: 3.1, 3.6, 3.9, 3.10, 3.11, 4.1, 4.7, 4.15.
 */

import { MAGNITUD_MAXIMA, radioPorMagnitud } from '../../vista/mapa/radio.js';
import type { CatalogoEstelar, Segmento } from '../catalogo/modelo.js';
import type { ErrorMotor } from '../errores.js';
import { aHorizontales } from './horizontales.js';
import type {
  Cardinal,
  CieloCalculado,
  CirculoHorizonte,
  EstrellaCalculada,
  InstanteGraduacion,
  LugarGraduacion,
  SegmentoVisible,
} from './modelo.js';
import { precesarDesdeJ2000 } from './precesion.js';
import { proyectar } from './proyeccion.js';
import { diaJuliano, tsLocalGrados } from './tiempo.js';

/**
 * Union discriminada con el desenlace del calculo. En la rama de fallo no
 * viaja ninguna coordenada, ni completa ni parcial (Requisito 3.9).
 */
export type ResultadoCielo =
  | { readonly ok: true; readonly cielo: CieloCalculado }
  | { readonly ok: false; readonly error: ErrorMotor };

/** Altitud minima para considerar una Estrella visible (Requisito 3.10). */
export const ALTITUD_HORIZONTE = 0;

/** Tope de Estrellas dibujadas simultaneamente (Requisito 4.1). */
export const MAX_ESTRELLAS_DIBUJADAS = 3000;

/** Latitud minima admisible del Lugar_Graduacion, en grados (Requisito 3.9). */
const LATITUD_MINIMA = -90;

/** Latitud maxima admisible del Lugar_Graduacion, en grados (Requisito 3.9). */
const LATITUD_MAXIMA = 90;

/**
 * Cota de la longitud admisible, en grados: el intervalo es (-180, 180], abierto
 * por la izquierda para que cada meridiano tenga una sola representacion
 * (Requisito 3.9).
 */
const LONGITUD_COTA = 180;

/**
 * Fecha y hora ISO 8601 con desplazamiento horario explicito, `Z` o `±HH:MM`
 * (Requisito 3.9). Se exige el desplazamiento porque sin el la cadena no
 * designa un instante unico. Los segundos y la fraccion de segundo son
 * opcionales; el separador debe ser la `T`, no un espacio, cuya interpretacion
 * depende de la plataforma.
 */
const PATRON_INSTANTE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Las cuatro marcas cardinales, en los azimuts del Requisito 4.7. Se declara
 * como arreglo, y no como objeto ni como `Map`, para que el orden de recorrido
 * sea el escrito aqui.
 */
const CARDINALES: readonly { readonly rotulo: Cardinal['rotulo']; readonly azimut: number }[] = [
  { rotulo: 'N', azimut: 0 },
  { rotulo: 'E', azimut: 90 },
  { rotulo: 'S', azimut: 180 },
  { rotulo: 'O', azimut: 270 },
];

/** Candidata a dibujo junto con su posicion en el catalogo, para el desempate. */
interface Candidata {
  readonly indice: number;
  readonly calculada: EstrellaCalculada;
}

/**
 * Calcula el cielo completo del Instante_Graduacion sobre el Lugar_Graduacion.
 *
 * @param catalogo Catalogo_Estelar ya validado, con coordenadas en J2000.0.
 * @param instante Instante_Graduacion, con sus milisegundos UTC ya derivados.
 * @param lugar Lugar_Graduacion de la ceremonia.
 * @param circulo Circulo_Horizonte de destino, en pixeles.
 * @returns El `CieloCalculado`, o el primer `ErrorMotor` de la validacion
 *   previa. En caso de error no se produce ninguna Coordenada_Horizontal ni
 *   coordenada de pantalla.
 */
export function calcularCielo(
  catalogo: CatalogoEstelar,
  instante: InstanteGraduacion,
  lugar: LugarGraduacion,
  circulo: CirculoHorizonte,
): ResultadoCielo {
  // Requisito 3.9: la validacion precede a todo calculo. Nada de lo que sigue
  // se ejecuta si alguna entrada es inadmisible.
  const defecto = validarEntradas(instante, lugar);
  if (defecto !== null) {
    return { ok: false, error: defecto };
  }

  // Magnitudes de tiempo comunes a todo el catalogo: se calculan una sola vez.
  const jd = diaJuliano(instante.msUtc);
  const tsLocal = tsLocalGrados(jd, lugar.longitud);

  const estrellas: EstrellaCalculada[] = [];
  for (const estrella of catalogo.estrellas) {
    const equinoccioDeLaFecha = precesarDesdeJ2000({ ar: estrella.ar, dec: estrella.dec }, jd);
    const horizontal = aHorizontales(equinoccioDeLaFecha, lugar.latitud, tsLocal);
    const visible = horizontal.altitud >= ALTITUD_HORIZONTE;
    estrellas.push({
      estrella,
      horizontal,
      visible,
      // Requisito 3.10: bajo el horizonte no hay coordenadas de pantalla.
      pantalla: visible ? proyectar(horizontal, circulo) : null,
      radio: radioPorMagnitud(estrella.magnitud),
    });
  }

  return {
    ok: true,
    cielo: {
      instante,
      lugar,
      circulo,
      // El orden del catalogo se conserva: `estrellas[i]` corresponde a
      // `catalogo.estrellas[i]`.
      estrellas,
      segmentosVisibles: segmentosVisiblesDe(catalogo.segmentos, estrellas),
      constelacionesDibujadas: constelacionesDe(seleccionarDibujables(estrellas)),
      cardinales: cardinalesDe(circulo),
    },
  };
}

/**
 * Estrellas que el Mapa_Estelar debe dibujar: las visibles con magnitud
 * aparente menor o igual a 6.0, hasta un maximo de 3000 (Requisito 4.1).
 *
 * El tope se aplica **por brillo**: se ordenan por magnitud aparente ascendente
 * (las mas brillantes primero) y se toman las 3000 primeras, de modo que si el
 * catalogo excede el tope lo que se pierde son las estrellas mas debiles, las
 * que menos aportan al dibujo. El desempate entre magnitudes iguales es la
 * posicion en el catalogo, asi que la seleccion es una funcion de las entradas
 * y no depende de la estabilidad del ordenamiento de la plataforma
 * (Requisito 3.6).
 *
 * El orden devuelto, de mas brillante a mas debil, es tambien el que necesita
 * el Mapa_Estelar para colocar sus etiquetas cediendo por magnitud
 * (Requisito 4.4).
 *
 * Toda estrella devuelta tiene `pantalla !== null` y cae dentro del
 * Circulo_Horizonte, porque es visible y la proyeccion del hemisferio superior
 * nunca sale del circulo (Requisito 3.5).
 *
 * @param estrellas Estrellas calculadas, en el orden del catalogo.
 */
export function seleccionarDibujables(
  estrellas: readonly EstrellaCalculada[],
): readonly EstrellaCalculada[] {
  const candidatas: Candidata[] = [];
  for (let indice = 0; indice < estrellas.length; indice += 1) {
    const calculada = estrellas[indice];
    if (calculada === undefined || !calculada.visible) {
      continue;
    }
    if (calculada.estrella.magnitud > MAGNITUD_MAXIMA) {
      continue;
    }
    candidatas.push({ indice, calculada });
  }

  candidatas.sort((a, b) => {
    const porMagnitud = a.calculada.estrella.magnitud - b.calculada.estrella.magnitud;
    return porMagnitud !== 0 ? porMagnitud : a.indice - b.indice;
  });

  const seleccionadas: EstrellaCalculada[] = [];
  const tope = Math.min(candidatas.length, MAX_ESTRELLAS_DIBUJADAS);
  for (let posicion = 0; posicion < tope; posicion += 1) {
    const candidata = candidatas[posicion];
    if (candidata !== undefined) {
      seleccionadas.push(candidata.calculada);
    }
  }
  return seleccionadas;
}

/**
 * Comprueba el Instante_Graduacion y el Lugar_Graduacion (Requisito 3.9).
 *
 * Las comparaciones de rango se escriben negando la pertenencia
 * (`!(x >= min && x <= max)`) y no como `x < min || x > max`, porque asi un
 * `NaN` tambien se rechaza: toda comparacion con `NaN` es falsa.
 *
 * @returns El primer defecto hallado, o `null` si las entradas son admisibles.
 */
function validarEntradas(instante: InstanteGraduacion, lugar: LugarGraduacion): ErrorMotor | null {
  if (
    !PATRON_INSTANTE.test(instante.iso) ||
    !Number.isFinite(Date.parse(instante.iso)) ||
    !Number.isFinite(instante.msUtc)
  ) {
    return { clase: 'instante-invalido', recibido: instante.iso };
  }
  if (!(lugar.latitud >= LATITUD_MINIMA && lugar.latitud <= LATITUD_MAXIMA)) {
    return { clase: 'lugar-invalido', campo: 'latitud', recibido: lugar.latitud };
  }
  if (!(lugar.longitud > -LONGITUD_COTA && lugar.longitud <= LONGITUD_COTA)) {
    return { clase: 'lugar-invalido', campo: 'longitud', recibido: lugar.longitud };
  }
  return null;
}

/**
 * Segmentos dibujables: solo aquellos cuyos **dos** extremos estan sobre el
 * horizonte (Requisitos 4.3 y 4.15). Basta comprobar `pantalla !== null`,
 * porque esa coordenada existe exactamente para las estrellas visibles.
 *
 * El indice por nombre es un `Map` de claves de tipo cadena y solo se consulta
 * con `get`: el orden de los segmentos devueltos es el del catalogo, no el del
 * `Map` (Requisito 3.6).
 */
function segmentosVisiblesDe(
  segmentos: readonly Segmento[],
  estrellas: readonly EstrellaCalculada[],
): readonly SegmentoVisible[] {
  const porNombre = new Map<string, EstrellaCalculada>();
  for (const calculada of estrellas) {
    porNombre.set(calculada.estrella.nombre, calculada);
  }

  const visibles: SegmentoVisible[] = [];
  for (const segmento of segmentos) {
    const desde = porNombre.get(segmento.desde);
    const hasta = porNombre.get(segmento.hasta);
    if (desde === undefined || hasta === undefined) {
      continue;
    }
    if (desde.pantalla === null || hasta.pantalla === null) {
      continue;
    }
    visibles.push({ a: desde.pantalla, b: hasta.pantalla });
  }
  return visibles;
}

/**
 * Nombres de las constelaciones efectivamente dibujadas, sin repeticiones y en
 * orden de primera aparicion dentro de la seleccion de dibujo, es decir de la
 * estrella mas brillante a la mas debil. Alimenta el texto alternativo del
 * Mapa_Estelar (Requisito 7.6), que asi nombra primero las constelaciones mas
 * llamativas del cielo.
 *
 * El `Set` tiene claves de tipo cadena y solo se usa para comprobar
 * pertenencia; el arreglo devuelto se construye aparte, de modo que su orden no
 * depende del recorrido del `Set` (Requisito 3.6).
 */
function constelacionesDe(dibujables: readonly EstrellaCalculada[]): readonly string[] {
  const vistas = new Set<string>();
  const nombres: string[] = [];
  for (const dibujable of dibujables) {
    const constelacion = dibujable.estrella.constelacion;
    if (vistas.has(constelacion)) {
      continue;
    }
    vistas.add(constelacion);
    nombres.push(constelacion);
  }
  return nombres;
}

/**
 * Las cuatro marcas cardinales sobre el borde del Circulo_Horizonte
 * (Requisito 4.7).
 *
 * Se obtienen con la misma Proyeccion_Estereografica que las estrellas, con
 * altitud 0 y azimut 0, 90, 180 y 270. La proyeccion resuelve los multiplos de
 * 90 grados de forma exacta, asi que los cuatro puntos caen sobre el borde y
 * sobre sus ejes sin desviacion alguna: cero grados de error, muy por debajo
 * del grado que admite el requisito.
 */
function cardinalesDe(circulo: CirculoHorizonte): readonly Cardinal[] {
  return CARDINALES.map(({ rotulo, azimut }) => ({
    rotulo,
    punto: proyectar({ altitud: ALTITUD_HORIZONTE, azimut }, circulo),
  }));
}
