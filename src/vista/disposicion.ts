/**
 * Disposicion responsiva de la Pagina_Regalo como funcion pura.
 *
 * Este modulo es el gemelo verificable de `src/estilos/respuesta.css`: usa los
 * mismos numeros que la hoja de estilos (umbral de 880 px, separacion de 32 px,
 * relleno `clamp(16px, 2vw, 32px)`, pistas `minmax(480px, 1.35fr)` y
 * `minmax(320px, 1fr)`) y reproduce el algoritmo de reparto de la rejilla, para
 * poder comprobar los Requisitos 5.9, 7.1, 7.2, 7.3, 7.9 y 7.11 sin navegador.
 *
 * No lee el DOM, no consulta `window` y no guarda estado: recibe el ancho de
 * ventana y devuelve la disposicion. Quien la use en el navegador le pasa
 * `window.innerWidth`.
 *
 * Aritmetica del umbral. Con relleno `2vw` por lado y separacion de 32 px, el
 * ancho disponible para las dos columnas es `0.96 * ancho - 32`, de modo que
 * los minimos (480 + 320 = 800 px) caben exactamente desde 866.67 px. El
 * umbral se fija en 880 px, unos 13 px por encima, margen que absorbe el ancho
 * de una barra de desplazamiento clasica: esa barra cuenta dentro de
 * `window.innerWidth` pero no dentro del area de contenido. Entre 866.67 y
 * 880 px la disposicion es de una sola columna, la rama del Requisito 7.9.
 *
 * Redondeo. El ancho de contenido se trunca al pixel entero y el ancho del
 * Lienzo_Carta se obtiene por resta, no por reparto independiente. Asi la suma
 * `anchoMapa + separacion + anchoCarta` es exactamente `anchoContenido` y
 * nunca excede el ancho de ventana (Requisito 7.1), sin depender de la
 * precision de los flotantes.
 */

/** Ancho de ventana minimo cubierto por los requisitos, en pixeles. */
export const ANCHO_VENTANA_MIN = 320;

/** Ancho de ventana maximo cubierto por los requisitos, en pixeles. */
export const ANCHO_VENTANA_MAX = 1920;

/** Ancho minimo de la columna del Mapa_Estelar (Requisito 7.2), en pixeles. */
export const ANCHO_MIN_MAPA = 480;

/** Ancho minimo de la columna del Lienzo_Carta (Requisito 7.2), en pixeles. */
export const ANCHO_MIN_CARTA = 320;

/** Umbral de dos columnas, en pixeles. Igual al `@media` de `respuesta.css`. */
export const UMBRAL_DOS_COLUMNAS = 880;

/** Ancho por debajo del cual rigen las areas tactiles (Requisito 7.11). */
export const UMBRAL_TACTIL = 768;

/** Separacion entre columnas (`gap: 2rem`), en pixeles. */
export const SEPARACION_REJILLA = 32;

/** Relleno lateral minimo del `clamp` (`1rem`), en pixeles. */
export const RELLENO_MIN = 16;

/** Relleno lateral maximo del `clamp` (`2rem`), en pixeles. */
export const RELLENO_MAX = 32;

/** Proporcion del relleno lateral respecto del ancho de ventana (`2vw`). */
export const RELLENO_PROPORCION = 0.02;

/** Fraccion de la pista del Mapa_Estelar (`1.35fr`). */
export const FRACCION_MAPA = 1.35;

/** Fraccion de la pista del Lienzo_Carta (`1fr`). */
export const FRACCION_CARTA = 1;

/** Area tactil minima por lado, en pixeles (Requisito 7.11). */
export const AREA_TACTIL_MIN = 44;

/** Separacion tactil minima entre controles, en pixeles (Requisito 7.11). */
export const SEPARACION_TACTIL_MIN = 8;

/** Anchos de las dos pistas cuando la rejilla se resuelve en dos columnas. */
export interface AnchosColumnas {
  /** Ancho de la columna del Mapa_Estelar, en pixeles. */
  readonly anchoMapa: number;
  /** Ancho de la columna del Lienzo_Carta, en pixeles. */
  readonly anchoCarta: number;
}

/** Disposicion resuelta de la Pagina_Regalo para un ancho de ventana dado. */
export interface Disposicion {
  /** Ancho de ventana usado para el calculo, en pixeles. */
  readonly anchoVentana: number;
  /** Cantidad de columnas de la rejilla del regalo. */
  readonly columnas: 1 | 2;
  /** Relleno lateral efectivo del `clamp`, en pixeles. */
  readonly relleno: number;
  /** Separacion efectiva de la rejilla, en pixeles. */
  readonly separacion: number;
  /** Ancho disponible dentro del relleno, en pixeles. */
  readonly anchoContenido: number;
  /** Ancho asignado al Mapa_Estelar, en pixeles. */
  readonly anchoMapa: number;
  /** Ancho asignado al Lienzo_Carta, en pixeles. */
  readonly anchoCarta: number;
  /**
   * Verdadero cuando el Lienzo_Carta queda debajo del Mapa_Estelar, es decir
   * en toda disposicion de una sola columna (Requisitos 5.9 y 7.9).
   */
  readonly cartaDebajoDelMapa: boolean;
  /**
   * Verdadero cuando los minimos de las dos columnas caben en el ancho de
   * contenido, con independencia del umbral. Permite distinguir la rama de
   * una sola columna del Requisito 7.9 del margen del umbral.
   */
  readonly cabenDosColumnas: boolean;
  /** Area tactil minima exigida por lado, en pixeles; 0 desde 768 px. */
  readonly areaTactilMin: number;
  /** Separacion tactil minima exigida, en pixeles; 0 desde 768 px. */
  readonly separacionTactilMin: number;
}

/** Limita un valor al intervalo cerrado `[minimo, maximo]`. */
function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), maximo);
}

/**
 * Relleno lateral efectivo de `padding: clamp(1rem, 2vw, 2rem)`.
 *
 * @param anchoVentana Ancho de ventana en pixeles.
 * @returns El relleno por lado, en pixeles, dentro de [16, 32].
 */
export function rellenoLateral(anchoVentana: number): number {
  return limitar(anchoVentana * RELLENO_PROPORCION, RELLENO_MIN, RELLENO_MAX);
}

/**
 * Ancho disponible dentro del relleno, truncado al pixel entero para que
 * ninguna suma de pistas pueda exceder el ancho de ventana (Requisito 7.1).
 *
 * @param anchoVentana Ancho de ventana en pixeles.
 * @returns El ancho de contenido en pixeles, nunca negativo.
 */
export function anchoContenido(anchoVentana: number): number {
  return Math.max(0, Math.floor(anchoVentana - 2 * rellenoLateral(anchoVentana)));
}

/**
 * Reparte el ancho de contenido entre las dos pistas siguiendo el algoritmo de
 * la rejilla: primero el reparto proporcional a las fracciones, y si una pista
 * queda por debajo de su minimo se fija en ese minimo y la otra recibe el
 * resto.
 *
 * @param anchoVentana Ancho de ventana en pixeles.
 * @returns Los anchos de las dos columnas, o `null` cuando los minimos de
 *          480 y 320 pixeles no caben junto con la separacion.
 */
export function anchosDosColumnas(anchoVentana: number): AnchosColumnas | null {
  const disponible = anchoContenido(anchoVentana) - SEPARACION_REJILLA;

  if (disponible < ANCHO_MIN_MAPA + ANCHO_MIN_CARTA) {
    return null;
  }

  const proporcional = Math.floor(
    (disponible * FRACCION_MAPA) / (FRACCION_MAPA + FRACCION_CARTA),
  );
  const anchoMapa = Math.max(
    ANCHO_MIN_MAPA,
    Math.min(proporcional, disponible - ANCHO_MIN_CARTA),
  );

  return { anchoMapa, anchoCarta: disponible - anchoMapa };
}

/**
 * Decide columnas y anchos de la Pagina_Regalo a partir del ancho de ventana.
 *
 * Contrato (Requisitos 5.9, 7.1, 7.2, 7.3, 7.9, 7.11):
 * - Por debajo de 768 px: una sola columna, Lienzo_Carta debajo del
 *   Mapa_Estelar, area tactil de 44 px y separacion de 8 px.
 * - Entre 768 y 1023 px: dos columnas cuando el Lienzo_Carta conserva 320 px o
 *   mas; en caso contrario una sola columna con la carta debajo del mapa.
 * - Desde 1024 px: dos columnas, con al menos 480 px para el Mapa_Estelar y
 *   320 px para el Lienzo_Carta.
 * - Para todo ancho: `anchoMapa + separacion + anchoCarta` no excede el ancho
 *   de contenido, que a su vez no excede el ancho de ventana.
 *
 * @param anchoVentana Ancho de ventana en pixeles; los requisitos lo cubren
 *                     entre 320 y 1920, y fuera de ese intervalo la funcion
 *                     sigue devolviendo anchos no negativos.
 * @returns La disposicion resuelta.
 */
export function calcularDisposicion(anchoVentana: number): Disposicion {
  const relleno = rellenoLateral(anchoVentana);
  const contenido = anchoContenido(anchoVentana);
  const candidatos = anchosDosColumnas(anchoVentana);
  const dosColumnas = candidatos !== null && anchoVentana >= UMBRAL_DOS_COLUMNAS;
  const tactil = anchoVentana < UMBRAL_TACTIL;

  return {
    anchoVentana,
    columnas: dosColumnas ? 2 : 1,
    relleno,
    separacion: SEPARACION_REJILLA,
    anchoContenido: contenido,
    // En una sola columna cada bloque ocupa todo el ancho de contenido.
    anchoMapa: dosColumnas && candidatos !== null ? candidatos.anchoMapa : contenido,
    anchoCarta: dosColumnas && candidatos !== null ? candidatos.anchoCarta : contenido,
    cartaDebajoDelMapa: !dosColumnas,
    cabenDosColumnas: candidatos !== null,
    areaTactilMin: tactil ? AREA_TACTIL_MIN : 0,
    separacionTactilMin: tactil ? SEPARACION_TACTIL_MIN : 0,
  };
}
