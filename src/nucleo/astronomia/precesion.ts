/**
 * Precesion de coordenadas ecuatoriales entre la epoca J2000.0 y el equinoccio
 * de la fecha, con los angulos zeta, z y theta de Jean Meeus, *Astronomical
 * Algorithms* (2a ed.), capitulo 21, formula 21.3.
 *
 * El Catalogo_Estelar guarda las posiciones en J2000.0; entre esa epoca y una
 * fecha de 2025 la precesion las desplaza hasta unos 0.35 grados, mas del
 * triple del margen de 0.1 grados del Requisito 3.8, asi que el paso no es
 * opcional.
 *
 * Convenios de este modulo:
 * - los angulos se manejan en grados y solo se convierten a radianes dentro de
 *   las llamadas trigonometricas;
 * - `jd` es el dia juliano del instante de destino y llega como parametro: el
 *   modulo no consulta el reloj ni ninguna otra fuente externa, de modo que dos
 *   invocaciones con las mismas entradas devuelven bits identicos
 *   (Requisito 3.6);
 * - `precesarHaciaJ2000` es la inversa algebraica exacta de
 *   `precesarDesdeJ2000` con los mismos zeta, z y theta, de modo que la
 *   propiedad de ida y vuelta del Requisito 3.3 se cumple sobre el paso
 *   completo del canal.
 *
 * Limitacion conocida: en los polos exactos (`dec === 90` o `dec === -90`) la
 * ascension recta no esta definida geometricamente y el resultado depende del
 * redondeo de punto flotante; la declinacion si se conserva.
 *
 * Requisitos: 3.1, 3.3.
 */

import type { Ecuatorial } from './modelo.js';

/** Dia juliano de la epoca J2000.0, origen de la precesion. */
const JD_J2000 = 2451545.0;

/** Dias julianos de un siglo juliano. */
const DIAS_POR_SIGLO = 36525;

/** Segundos de arco en un grado. */
const SEGUNDOS_ARCO_POR_GRADO = 3600;

/** Horas de ascension recta por grado de angulo. */
const GRADOS_POR_HORA = 15;

const GRADOS_A_RADIANES = Math.PI / 180;
const RADIANES_A_GRADOS = 180 / Math.PI;

/** Angulos de precesion de Meeus 21.3, ya convertidos a grados. */
interface AngulosPrecesion {
  readonly zeta: number;
  readonly z: number;
  readonly theta: number;
}

const sen = (grados: number): number => Math.sin(grados * GRADOS_A_RADIANES);
const cos = (grados: number): number => Math.cos(grados * GRADOS_A_RADIANES);

/**
 * Normaliza un angulo en grados al intervalo [0, 360).
 *
 * El segundo resto no es redundante: cuando el primero es un subnormal
 * negativo, sumarle 360 lo pierde entero y el resultado redondea a 360 exacto;
 * el `% 360` final lo devuelve a `0` y mantiene cerrado el intervalo, con lo
 * que `ar` nunca alcanza las 24 horas (Requisito 2.3).
 */
function normalizarGrados(grados: number): number {
  return ((grados % 360) + 360) % 360;
}

/**
 * Evita que el redondeo de punto flotante saque el argumento de `asin` del
 * intervalo [-1, 1] y produzca `NaN` en las declinaciones cercanas a los polos.
 */
function acotarSeno(valor: number): number {
  if (valor > 1) return 1;
  if (valor < -1) return -1;
  return valor;
}

/**
 * Angulos zeta, z y theta para el intervalo J2000.0 -> `jd`, en grados.
 *
 * Los polinomios de Meeus 21.3 estan expresados en segundos de arco con
 * `t = (JD - 2451545.0) / 36525`.
 */
function angulosPrecesion(jd: number): AngulosPrecesion {
  const t = (jd - JD_J2000) / DIAS_POR_SIGLO;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    zeta: (2306.2181 * t + 0.30188 * t2 + 0.017998 * t3) / SEGUNDOS_ARCO_POR_GRADO,
    z: (2306.2181 * t + 1.09468 * t2 + 0.018203 * t3) / SEGUNDOS_ARCO_POR_GRADO,
    theta: (2004.3109 * t - 0.42665 * t2 - 0.041833 * t3) / SEGUNDOS_ARCO_POR_GRADO,
  };
}

/** Construye una Ecuatorial a partir de una ascension recta en grados. */
function aEcuatorial(arGrados: number, decGrados: number): Ecuatorial {
  return {
    ar: normalizarGrados(arGrados) / GRADOS_POR_HORA,
    dec: decGrados,
  };
}

/**
 * Precesa coordenadas de la epoca J2000.0 al equinoccio de la fecha `jd`.
 *
 * Con `alfa0 = ar * 15` y `delta0 = dec` (Meeus 21.3):
 *
 * ```
 * A = cos d0 * sin(a0 + zeta)
 * B = cos theta * cos d0 * cos(a0 + zeta) - sin theta * sin d0
 * C = sin theta * cos d0 * cos(a0 + zeta) + cos theta * sin d0
 * alfa = z + atan2(A, B)      delta = asin(C)
 * ```
 *
 * @param eq Coordenadas en J2000.0: `ar` en horas, `dec` en grados.
 * @param jd Dia juliano del equinoccio de destino.
 * @returns Coordenadas del equinoccio de la fecha, `ar` en [0, 24) horas y
 *          `dec` en [-90, 90] grados.
 */
export function precesarDesdeJ2000(eq: Ecuatorial, jd: number): Ecuatorial {
  const { zeta, z, theta } = angulosPrecesion(jd);

  const alfaMasZeta = eq.ar * GRADOS_POR_HORA + zeta;
  const cosDec = cos(eq.dec);
  const senDec = sen(eq.dec);

  const a = cosDec * sen(alfaMasZeta);
  const b = cos(theta) * cosDec * cos(alfaMasZeta) - sen(theta) * senDec;
  const c = sen(theta) * cosDec * cos(alfaMasZeta) + cos(theta) * senDec;

  const alfaGrados = z + Math.atan2(a, b) * RADIANES_A_GRADOS;
  const decGrados = Math.asin(acotarSeno(c)) * RADIANES_A_GRADOS;

  return aEcuatorial(alfaGrados, decGrados);
}

/**
 * Precesa coordenadas del equinoccio de la fecha `jd` de vuelta a J2000.0.
 *
 * Inversa algebraica de `precesarDesdeJ2000`: reutiliza los mismos zeta, z y
 * theta intercambiando papeles.
 *
 * ```
 * A' = cos d * sin(a - z)
 * B' = cos theta * cos d * cos(a - z) + sin theta * sin d
 * C' = -sin theta * cos d * cos(a - z) + cos theta * sin d
 * a0 + zeta = atan2(A', B')      d0 = asin(C')
 * ```
 *
 * @param eq Coordenadas del equinoccio de la fecha: `ar` en horas, `dec` en
 *           grados.
 * @param jd Dia juliano de ese equinoccio.
 * @returns Coordenadas en J2000.0, `ar` en [0, 24) horas y `dec` en [-90, 90]
 *          grados.
 */
export function precesarHaciaJ2000(eq: Ecuatorial, jd: number): Ecuatorial {
  const { zeta, z, theta } = angulosPrecesion(jd);

  const alfaMenosZ = eq.ar * GRADOS_POR_HORA - z;
  const cosDec = cos(eq.dec);
  const senDec = sen(eq.dec);

  const a = cosDec * sen(alfaMenosZ);
  const b = cos(theta) * cosDec * cos(alfaMenosZ) + sen(theta) * senDec;
  const c = -sen(theta) * cosDec * cos(alfaMenosZ) + cos(theta) * senDec;

  const alfaGrados = Math.atan2(a, b) * RADIANES_A_GRADOS - zeta;
  const decGrados = Math.asin(acotarSeno(c)) * RADIANES_A_GRADOS;

  return aEcuatorial(alfaGrados, decGrados);
}
