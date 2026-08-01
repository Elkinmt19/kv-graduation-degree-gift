/**
 * Modulo de tiempo del Motor_Astronomico (Requisito 3.1).
 *
 * Convierte el Instante_Graduacion en las magnitudes de tiempo que consumen la
 * precesion y la conversion a Coordenadas_Horizontales: dia juliano, siglos
 * julianos desde J2000.0, tiempo sidereo medio de Greenwich y tiempo sidereo
 * local.
 *
 * Modulo puro: no consulta el reloj (`Date.now`), no usa fuentes de azar y no
 * acumula angulos de forma incremental. Cada funcion deriva su resultado
 * unicamente de sus argumentos, con la misma secuencia de operaciones en cada
 * invocacion, de modo que dos llamadas con las mismas entradas devuelven bits
 * identicos (Requisito 3.6, seccion de determinismo del diseno).
 *
 * Fuente de las formulas: Jean Meeus, *Astronomical Algorithms* (2a ed.),
 * capitulo 12 (formula 12.4), y la nota de tiempo sidereo del U.S. Naval
 * Observatory. Se usa tiempo sidereo **medio**, no aparente: la ecuacion de los
 * equinoccios no supera ~0.0046 grados, dos ordenes de magnitud por debajo del
 * margen de 0.1 grados del Requisito 3.8.
 *
 * Todos los angulos se manejan en grados decimales.
 */

/** Dia juliano de la epoca Unix (1970-01-01T00:00:00Z). */
const JD_EPOCA_UNIX = 2440587.5;

/** Milisegundos de un dia juliano completo. */
const MS_POR_DIA = 86_400_000;

/** Dia juliano de la epoca estandar J2000.0 (2000-01-01T12:00:00 TT). */
const JD_J2000 = 2451545.0;

/** Dias de un siglo juliano. */
const DIAS_POR_SIGLO_JULIANO = 36525;

/** Grados de una circunferencia completa; tope abierto del intervalo. */
const CIRCUNFERENCIA = 360;

/**
 * Dia juliano correspondiente a un instante UTC.
 *
 * `JD = 2440587.5 + msUtc / 86 400 000`
 *
 * El paso desde la cadena ISO 8601 con desplazamiento -05:00 hasta los
 * milisegundos UTC lo hace `Date.parse` en la frontera del motor
 * (`InstanteGraduacion.msUtc`), no este modulo.
 *
 * @param msUtc Milisegundos transcurridos desde la epoca Unix en UTC.
 * @returns El dia juliano, en dias.
 */
export function diaJuliano(msUtc: number): number {
  return JD_EPOCA_UNIX + msUtc / MS_POR_DIA;
}

/**
 * Siglos julianos transcurridos desde J2000.0.
 *
 * `T = (JD - 2451545.0) / 36525`
 *
 * @param jd Dia juliano.
 * @returns Los siglos julianos, negativos antes de J2000.0.
 */
export function siglosJulianos(jd: number): number {
  return (jd - JD_J2000) / DIAS_POR_SIGLO_JULIANO;
}

/**
 * Tiempo sidereo medio de Greenwich (GMST), en grados dentro de [0, 360)
 * (Meeus 12.4):
 *
 * ```
 * GMST = 280.46061837
 *      + 360.98564736629 * (JD - 2451545.0)
 *      + 0.000387933 * T^2
 *      - T^3 / 38 710 000            (mod 360)
 * ```
 *
 * @param jd Dia juliano del instante buscado.
 * @returns El GMST en grados, normalizado a [0, 360).
 */
export function tsmGreenwichGrados(jd: number): number {
  const diasDesdeJ2000 = jd - JD_J2000;
  const t = siglosJulianos(jd);
  const grados =
    280.46061837 +
    360.98564736629 * diasDesdeJ2000 +
    0.000387933 * t * t -
    (t * t * t) / 38_710_000;
  return normalizarGrados360(grados);
}

/**
 * Tiempo sidereo local, en grados dentro de [0, 360).
 *
 * `TSL = (GMST + longitud) mod 360`, con la longitud **positiva hacia el
 * este**. El Lugar_Graduacion por defecto (Neiva) tiene longitud -75.2819, es
 * decir al oeste de Greenwich.
 *
 * @param jd Dia juliano del instante buscado.
 * @param longitudGrados Longitud geografica en grados, positiva al este.
 * @returns El tiempo sidereo local en grados, normalizado a [0, 360).
 */
export function tsLocalGrados(jd: number, longitudGrados: number): number {
  return normalizarGrados360(tsmGreenwichGrados(jd) + longitudGrados);
}

/**
 * Lleva un angulo cualquiera al intervalo [0, 360) en una sola operacion de
 * resto, sin bucles ni acumulacion. Devuelve `0` y no `-0` para que el
 * resultado sea identico bit a bit entre invocaciones equivalentes.
 *
 * El desplazamiento de los angulos negativos se comprueba contra el tope: un
 * resto negativo subnormal se pierde entero al sumarle 360 y el resultado
 * redondea a 360 exacto, que ya esta fuera del intervalo. Ese angulo es el
 * origen, asi que se devuelve `0`.
 */
function normalizarGrados360(grados: number): number {
  const resto = grados % CIRCUNFERENCIA;
  if (resto < 0) {
    const desplazado = resto + CIRCUNFERENCIA;
    return desplazado < CIRCUNFERENCIA ? desplazado : 0;
  }
  return resto === 0 ? 0 : resto;
}
