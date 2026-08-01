/**
 * Conversion entre coordenadas ecuatoriales y Coordenadas_Horizontales, y su
 * inversa (design.md, seccion 4, apartados (e) y (f)).
 *
 * Modulo puro: no consulta el reloj, no usa fuentes de azar y no toca el DOM.
 * El tiempo sidereo local llega ya calculado por `tiempo.ts` y la precesion ya
 * aplicada por `precesion.ts`; aqui solo hay trigonometria esferica. Toda la
 * aritmetica es IEEE-754 de doble precision, con la misma secuencia de
 * operaciones en cada invocacion, sin acumulacion incremental de angulos, de
 * modo que dos llamadas con las mismas entradas devuelven bits identicos
 * (Requisito 3.6, apartado (h) del diseno).
 *
 * Convenios: todos los angulos se manejan en grados decimales y solo se
 * convierten a radianes dentro de las llamadas trigonometricas. El azimut se
 * mide desde el norte geografico y crece hacia el este, en [0, 360); la altitud
 * queda en [-90, 90] y es **geometrica**: no se aplica refraccion atmosferica
 * (Requisito 3.2).
 *
 * El azimut se obtiene con `atan2` y no con `asin`/`acos`, para no perder
 * precision cerca del cenit ni tener que desambiguar ramas segun el cuadrante.
 *
 * Limitacion conocida: en el cenit y en el nadir exactos el azimut no esta
 * definido geometricamente, igual que la ascension recta no lo esta en los
 * polos celestes; el valor devuelto es el que produce `atan2` sobre argumentos
 * que valen cero, y sigue siendo estable entre invocaciones.
 *
 * Fuente de las formulas: Jean Meeus, *Astronomical Algorithms* (2a ed.),
 * capitulo 13.
 *
 * Requisitos: 3.1, 3.2, 3.3.
 */

import type { Ecuatorial, Horizontal } from './modelo.js';

/** Grados de angulo horario por hora de ascension recta. */
const GRADOS_POR_HORA = 15;

const GRADOS_A_RADIANES = Math.PI / 180;
const RADIANES_A_GRADOS = 180 / Math.PI;

/** Grados de una circunferencia completa; tope abierto del intervalo. */
const CIRCUNFERENCIA = 360;

/**
 * Normaliza un angulo en grados al intervalo [0, 360) con una sola operacion
 * de resto, sin bucles.
 *
 * El cero negativo que produce `atan2` sobre el eje norte se colapsa a `0`,
 * para que un azimut al norte sea un unico valor y no dos indistinguibles a la
 * vista pero distintos para `Object.is`.
 *
 * El desplazamiento de los angulos negativos se comprueba contra el tope: un
 * resto negativo lo bastante pequeno (un subnormal como -8.2e-321, que sale de
 * `atan2` cuando `cos phi = 0` degenera sus argumentos) se pierde entero al
 * sumarle 360 y el resultado redondea a 360 exacto, fuera del intervalo
 * semiabierto del Requisito 3.2. En ese caso el angulo es el norte, asi que se
 * devuelve `0`, la unica representacion admitida.
 */
function normalizarGrados360(grados: number): number {
  const resto = grados % CIRCUNFERENCIA;
  if (resto < 0) {
    const desplazado = resto + CIRCUNFERENCIA;
    return desplazado < CIRCUNFERENCIA ? desplazado : 0;
  }
  return resto === 0 ? 0 : resto;
}

/**
 * Normaliza un angulo en grados al intervalo [-180, 180), el rango natural del
 * angulo horario: negativo antes del paso por el meridiano, positivo despues.
 *
 * No cambia el resultado de las funciones trigonometricas, pero mantiene los
 * argumentos pequenos y hace que los casos notables (`H = 0` en el meridiano
 * superior, `H = -180` en el inferior) sean reconocibles por
 * {@link senoGrados} y {@link cosenoGrados}.
 */
function normalizarGrados180(grados: number): number {
  const resto = normalizarGrados360(grados);
  return resto >= 180 ? resto - 360 : resto;
}

/**
 * Seno de un angulo en grados, exacto en los multiplos de 90.
 *
 * La conversion a radianes no es exacta (`Math.sin(Math.PI)` vale 1.2e-16, no
 * 0), asi que los cuatro angulos rectos se resuelven aparte. Con ello los
 * casos geometricamente limpios salen limpios: una estrella en el meridiano
 * (`H = 0`) cae en azimut exactamente 0 o 180, y un observador en un polo
 * (`cos phi = 0`) no arrastra un residuo que desvie el azimut.
 */
function senoGrados(grados: number): number {
  const angulo = normalizarGrados360(grados);
  if (angulo === 0 || angulo === 180) return 0;
  if (angulo === 90) return 1;
  if (angulo === 270) return -1;
  return Math.sin(angulo * GRADOS_A_RADIANES);
}

/** Coseno de un angulo en grados, exacto en los multiplos de 90. */
function cosenoGrados(grados: number): number {
  const angulo = normalizarGrados360(grados);
  if (angulo === 0) return 1;
  if (angulo === 90 || angulo === 270) return 0;
  if (angulo === 180) return -1;
  return Math.cos(angulo * GRADOS_A_RADIANES);
}

/**
 * Evita que el redondeo saque el argumento de `asin` del intervalo [-1, 1] y
 * devuelva `NaN` en el cenit, el nadir o los polos celestes.
 */
function acotarSeno(valor: number): number {
  if (valor > 1) return 1;
  if (valor < -1) return -1;
  return valor;
}

/**
 * Arcoseno en grados, exacto en los tres valores notables del intervalo para
 * que el cenit sea 90 y no 89.99999999999999.
 */
function arcosenoGrados(seno: number): number {
  const valor = acotarSeno(seno);
  if (valor === 1) return 90;
  if (valor === -1) return -90;
  if (valor === 0) return 0;
  return Math.asin(valor) * RADIANES_A_GRADOS;
}

/**
 * Convierte coordenadas ecuatoriales del equinoccio de la fecha en
 * Coordenadas_Horizontales vistas desde el Lugar_Graduacion.
 *
 * Con `alpha = ar * 15`, angulo horario `H = TSL - alpha` normalizado a
 * [-180, 180) y latitud `phi` (apartado (e) del diseno):
 *
 * ```
 * sin(alt) = sin phi * sin d + cos phi * cos d * cos H
 * Az       = atan2( -cos d * sin H ,  sin d * cos phi - cos d * sin phi * cos H )
 * ```
 *
 * @param eq Coordenadas ecuatoriales: `ar` en horas, `dec` en grados.
 * @param lat Latitud geografica del observador en grados, positiva al norte.
 * @param tsLocal Tiempo sidereo local en grados, tal como lo devuelve
 *                `tsLocalGrados`.
 * @returns Altitud en [-90, 90] grados y azimut en [0, 360) grados desde el
 *          norte y creciente al este.
 */
export function aHorizontales(eq: Ecuatorial, lat: number, tsLocal: number): Horizontal {
  const anguloHorario = normalizarGrados180(tsLocal - eq.ar * GRADOS_POR_HORA);

  const senLat = senoGrados(lat);
  const cosLat = cosenoGrados(lat);
  const senDec = senoGrados(eq.dec);
  const cosDec = cosenoGrados(eq.dec);
  const senH = senoGrados(anguloHorario);
  const cosH = cosenoGrados(anguloHorario);

  const senAltitud = senLat * senDec + cosLat * cosDec * cosH;
  const azimutY = -cosDec * senH;
  const azimutX = senDec * cosLat - cosDec * senLat * cosH;

  return {
    altitud: arcosenoGrados(senAltitud),
    azimut: normalizarGrados360(Math.atan2(azimutY, azimutX) * RADIANES_A_GRADOS),
  };
}

/**
 * Inversa exacta de {@link aHorizontales}: recupera las coordenadas
 * ecuatoriales de unas Coordenadas_Horizontales (apartado (f) del diseno).
 *
 * ```
 * sin d = sin(alt) * sin phi + cos(alt) * cos phi * cos Az
 * H     = atan2( -cos(alt) * sin Az ,  sin(alt) * cos phi - cos(alt) * sin phi * cos Az )
 * alpha = (TSL - H) mod 360        ->    ar = alpha / 15
 * ```
 *
 * La simetria de las dos formulas es la misma que hay entre el triangulo
 * esferico polo-cenit-estrella visto desde el polo y visto desde el cenit; por
 * eso la ida y vuelta reproduce la ascension recta y la declinacion originales
 * dentro del margen de 0.01 grados del Requisito 3.3.
 *
 * @param h Coordenadas_Horizontales en grados decimales.
 * @param lat Latitud geografica del observador en grados, positiva al norte.
 * @param tsLocal Tiempo sidereo local en grados.
 * @returns Coordenadas ecuatoriales con `ar` en [0, 24) horas y `dec` en
 *          [-90, 90] grados.
 */
export function aEcuatoriales(h: Horizontal, lat: number, tsLocal: number): Ecuatorial {
  const senLat = senoGrados(lat);
  const cosLat = cosenoGrados(lat);
  const senAlt = senoGrados(h.altitud);
  const cosAlt = cosenoGrados(h.altitud);
  const senAz = senoGrados(h.azimut);
  const cosAz = cosenoGrados(h.azimut);

  const senDec = senAlt * senLat + cosAlt * cosLat * cosAz;
  const horarioY = -cosAlt * senAz;
  const horarioX = senAlt * cosLat - cosAlt * senLat * cosAz;

  const anguloHorario = Math.atan2(horarioY, horarioX) * RADIANES_A_GRADOS;
  const ascensionRectaGrados = normalizarGrados360(tsLocal - anguloHorario);

  return {
    ar: ascensionRectaGrados / GRADOS_POR_HORA,
    dec: arcosenoGrados(senDec),
  };
}
