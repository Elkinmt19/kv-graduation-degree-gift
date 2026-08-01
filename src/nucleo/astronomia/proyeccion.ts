/**
 * Proyeccion_Estereografica centrada en el cenit y su inversa.
 *
 * Modulo puro, sin DOM y sin estado: convierte Coordenadas_Horizontales en
 * coordenadas de pantalla dentro del Circulo_Horizonte y de vuelta. Toda la
 * aritmetica es IEEE-754 de doble precision, sin reloj ni azar, de modo que dos
 * invocaciones con las mismas entradas devuelven bits identicos (Requisito 3.6).
 *
 * Formula (design.md, seccion 4, apartado (g)). Con distancia cenital
 * `z = 90 - alt` y radio del Circulo_Horizonte `R`:
 *
 * ```
 * r = R * tan(z / 2)            (z = 0 -> r = 0 ; z = 90 -> r = R)
 * x = cx - r * sin(Az)
 * y = cy - r * cos(Az)
 * ```
 *
 * El signo negativo de `x` orienta el mapa como se ve mirando hacia arriba:
 * norte arriba y este a la izquierda, la convencion de los planisferios
 * celestes.
 *
 * Inversa:
 *
 * ```
 * r  = hypot(x - cx, y - cy)
 * Az = atan2(-(x - cx), -(y - cy))   (mod 360)
 * z  = 2 * atan(r / R)               ->   alt = 90 - z
 * ```
 *
 * Requisito 3.4: proyectar y desproyectar es una ida y vuelta con error maximo
 * de 0.01 grados para toda altitud mayor o igual a 0.
 * Requisito 3.5: `alt = 0` cae exactamente sobre el borde (`r = R`) y
 * `alt > 0` cae estrictamente dentro (`r < R`).
 *
 * Referencia de la proyeccion: Jean Meeus, *Astronomical Algorithms* (2a ed.).
 */

import type { CirculoHorizonte, Horizontal, Punto } from './modelo';

const GRADOS_POR_RADIAN = 180 / Math.PI;
const RADIANES_POR_GRADO = Math.PI / 180;

/** Grados de una circunferencia completa; tope abierto del intervalo. */
const CIRCUNFERENCIA = 360;

/**
 * Normaliza un angulo en grados al intervalo [0, 360).
 *
 * El cero negativo que produce `atan2` en el eje norte se colapsa a `0` para
 * que el azimut sea un unico valor y no dos indistinguibles a la vista pero
 * distintos para `Object.is`.
 *
 * El desplazamiento de los angulos negativos se comprueba contra el tope: un
 * resto negativo subnormal (el que sale de `atan2(-dx, -dy)` cuando `dx` es
 * un subnormal positivo y `dy` es negativo) se pierde entero al sumarle 360 y
 * el resultado redondea a 360 exacto, fuera del intervalo semiabierto del
 * Requisito 3.2. Ese angulo es el norte, asi que se devuelve `0`.
 */
function normalizarGrados(grados: number): number {
  const resto = grados % CIRCUNFERENCIA;
  if (resto < 0) {
    const desplazado = resto + CIRCUNFERENCIA;
    return desplazado < CIRCUNFERENCIA ? desplazado : 0;
  }
  return resto === 0 ? 0 : resto;
}

/**
 * Seno de un angulo en grados, exacto en los multiplos de 90.
 *
 * Las llamadas trigonometricas de la biblioteca estandar reciben el angulo ya
 * convertido a radianes, y esa conversion no es exacta: `Math.sin(Math.PI)` no
 * es 0 sino 1.2e-16. Resolver los cuatro angulos rectos aparte hace que las
 * marcas cardinales del Requisito 4.7 queden sobre sus ejes sin desviacion
 * alguna, en lugar de a una fraccion de picometro de ellos.
 */
function senoGrados(grados: number): number {
  const angulo = normalizarGrados(grados);
  if (angulo === 0 || angulo === 180) return 0;
  if (angulo === 90) return 1;
  if (angulo === 270) return -1;
  return Math.sin(angulo * RADIANES_POR_GRADO);
}

/** Coseno de un angulo en grados, exacto en los multiplos de 90. */
function cosenoGrados(grados: number): number {
  const angulo = normalizarGrados(grados);
  if (angulo === 0) return 1;
  if (angulo === 90 || angulo === 270) return 0;
  if (angulo === 180) return -1;
  return Math.cos(angulo * RADIANES_POR_GRADO);
}

/**
 * Tangente de la mitad de la distancia cenital, exacta en los dos extremos que
 * fija el Requisito 3.5: `z = 0` (cenit) da 0 y `z = 90` (horizonte) da 1, de
 * modo que la estrella del horizonte cae en `r = R` sin arrastrar el error de
 * `Math.tan(Math.PI / 4)`, que vale 0.9999999999999999.
 */
function tangenteMitad(distanciaCenital: number): number {
  const mitad = distanciaCenital / 2;
  if (mitad === 0) return 0;
  if (mitad === 45) return 1;
  return Math.tan(mitad * RADIANES_POR_GRADO);
}

/**
 * Proyecta unas Coordenadas_Horizontales sobre el Circulo_Horizonte.
 *
 * El cenit (`altitud = 90`) cae en el centro del circulo; el horizonte
 * (`altitud = 0`) cae exactamente sobre el borde, a distancia `radio` del
 * centro; el azimut 0 (norte) queda arriba y el azimut 90 (este) a la
 * izquierda. Las altitudes negativas devuelven un punto fuera del circulo: es
 * el motor (`motor.ts`) el que decide no dibujarlas (Requisito 3.10).
 *
 * @param h Coordenadas_Horizontales en grados decimales.
 * @param c Circulo_Horizonte de destino, en pixeles.
 */
export function proyectar(h: Horizontal, c: CirculoHorizonte): Punto {
  const distanciaCenital = 90 - h.altitud;
  const r = c.radio * tangenteMitad(distanciaCenital);
  return {
    x: c.cx - r * senoGrados(h.azimut),
    y: c.cy - r * cosenoGrados(h.azimut),
  };
}

/**
 * Inversa de {@link proyectar}: recupera las Coordenadas_Horizontales de un
 * punto de pantalla.
 *
 * El centro exacto del circulo devuelve el cenit con azimut 0, que es la unica
 * eleccion posible porque en el cenit el azimut es indeterminado. Un punto a
 * distancia mayor que el radio devuelve altitud negativa, coherente con
 * {@link proyectar}.
 *
 * @param p Punto de pantalla, en pixeles.
 * @param c Circulo_Horizonte al que pertenece el punto.
 */
export function desproyectar(p: Punto, c: CirculoHorizonte): Horizontal {
  const dx = p.x - c.cx;
  const dy = p.y - c.cy;
  const r = Math.hypot(dx, dy);

  if (r === 0) return { altitud: 90, azimut: 0 };

  const cociente = r / c.radio;
  // El horizonte se resuelve aparte para que la ida y vuelta del borde sea
  // exacta y no 90 - 90.00000000000001 (Requisito 3.5).
  const distanciaCenital = cociente === 1 ? 90 : 2 * Math.atan(cociente) * GRADOS_POR_RADIAN;

  return {
    altitud: 90 - distanciaCenital,
    azimut: normalizarGrados(Math.atan2(-dx, -dy) * GRADOS_POR_RADIAN),
  };
}
