/**
 * Calculo de contraste del sistema de diseno.
 *
 * Modulo puro, sin DOM y sin dependencias: implementa la luminancia relativa de
 * WCAG 2.1, la composicion de capas con opacidad sobre un fondo opaco y la
 * relacion de contraste entre dos colores. Al vivir aqui la aritmetica, tanto
 * las pruebas del sistema de diseno como cualquier verificacion de un rol nuevo
 * usan la misma formula.
 *
 * Requisito 6.1: la Paleta_Regalo se declara una sola vez, con los cuatro
 * colores autorizados y el intervalo de opacidad admitido.
 * Requisito 6.2: todo texto debe alcanzar 4.5:1 contra el fondo efectivo que
 * resulta de componer capas y opacidades.
 * Requisito 7.4: el aro de foco solo necesita 3:1 contra el fondo adyacente,
 * por eso el minimo de elementos no textuales se expone aparte.
 *
 * Referencia de la formula: WCAG 2.1, definiciones de *relative luminance* y
 * *contrast ratio*.
 */

/** Componentes sRGB de un color opaco. Cada canal vive en [0, 255]. */
export interface ColorRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Capa de color con opacidad, equivalente a `rgb(var(--x-rgb) / a)` en CSS.
 * `opacidad` vive en [0, 1]; el sistema de diseno solo expone [0.05, 1].
 */
export interface Capa {
  readonly color: ColorRgb;
  readonly opacidad: number;
}

/** Nombres de los cuatro colores autorizados por el Requisito 6.1. */
export type NombrePaleta = 'negro-profundo' | 'azul-noche' | 'azul-electrico' | 'dorado';

/** La Paleta_Regalo, en los mismos valores que declara `tokens.css`. */
export const PALETA_REGALO: Readonly<Record<NombrePaleta, ColorRgb>> = {
  'negro-profundo': { r: 5, g: 6, b: 13 },
  'azul-noche': { r: 11, g: 42, b: 111 },
  'azul-electrico': { r: 30, g: 79, b: 216 },
  dorado: { r: 212, g: 175, b: 55 },
};

/** Opacidad minima admitida por el Requisito 6.1. */
export const OPACIDAD_MINIMA = 0.05;

/** Opacidad maxima admitida por el Requisito 6.1. */
export const OPACIDAD_MAXIMA = 1;

/** Relacion de contraste minima para texto (Requisito 6.2). */
export const CONTRASTE_MINIMO_TEXTO = 4.5;

/** Relacion de contraste minima para el aro de foco (Requisito 7.4). */
export const CONTRASTE_MINIMO_NO_TEXTO = 3;

/**
 * Opacidad minima con la que el dorado alcanza 4.5:1 sobre negro profundo.
 * El sistema de diseno no expone ningun token de texto por debajo de este
 * valor; se documenta aqui para que las pruebas puedan verificarlo.
 */
export const OPACIDAD_MINIMA_TEXTO_DORADO = 0.7;

/** Deja un canal dentro de [0, 255] sin alterar su parte fraccionaria. */
function limitarCanal(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.min(255, Math.max(0, valor));
}

/** Deja una opacidad dentro de [0, 1]. */
function limitarOpacidad(valor: number): number {
  if (!Number.isFinite(valor)) return 1;
  return Math.min(1, Math.max(0, valor));
}

/**
 * Interpreta un literal hexadecimal de CSS (`#RGB`, `#RRGGBB`, con o sin
 * canal alfa) y devuelve sus componentes sRGB.
 *
 * Devuelve `null` en lugar de lanzar cuando el literal no es valido, de acuerdo
 * con la convencion del nucleo de tratar los fallos como datos. El canal alfa,
 * si viene, se ignora: la opacidad se modela como `Capa.opacidad`.
 *
 * @param hex Literal tal como aparece en la hoja de estilo, p. ej. `#05060D`.
 */
export function interpretarHex(hex: string): ColorRgb | null {
  const cuerpo = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(cuerpo)) return null;

  let canales: readonly string[];
  if (cuerpo.length === 3 || cuerpo.length === 4) {
    canales = [...cuerpo].slice(0, 3).map((digito) => digito + digito);
  } else if (cuerpo.length === 6 || cuerpo.length === 8) {
    canales = [cuerpo.slice(0, 2), cuerpo.slice(2, 4), cuerpo.slice(4, 6)];
  } else {
    return null;
  }

  const [r = '00', g = '00', b = '00'] = canales;
  return {
    r: Number.parseInt(r, 16),
    g: Number.parseInt(g, 16),
    b: Number.parseInt(b, 16),
  };
}

/**
 * Linealiza un canal sRGB de 8 bits, primer paso de la luminancia relativa de
 * WCAG 2.1: division por 12.92 en el tramo oscuro y curva de exponente 2.4 en
 * el resto.
 *
 * @param valor Canal en [0, 255]; los valores fuera del intervalo se limitan.
 */
export function canalLineal(valor: number): number {
  const normalizado = limitarCanal(valor) / 255;
  return normalizado <= 0.03928 ? normalizado / 12.92 : ((normalizado + 0.055) / 1.055) ** 2.4;
}

/**
 * Luminancia relativa de un color opaco, en [0, 1] (0 = negro, 1 = blanco),
 * segun WCAG 2.1.
 */
export function luminanciaRelativa(color: ColorRgb): number {
  return (
    0.2126 * canalLineal(color.r) + 0.7152 * canalLineal(color.g) + 0.0722 * canalLineal(color.b)
  );
}

/**
 * Compone una capa translucida sobre un fondo opaco (`source-over`), que es lo
 * que hace el navegador al pintar `rgb(var(--x-rgb) / a)` encima de una capa
 * ya opaca. Conserva la parte fraccionaria: no simula el redondeo a 8 bits del
 * compositor, cuya diferencia es inferior a la centesima en la relacion final.
 */
export function componerSobre(fondo: ColorRgb, capa: Capa): ColorRgb {
  const alfa = limitarOpacidad(capa.opacidad);
  const mezclar = (frente: number, atras: number): number =>
    limitarCanal(frente) * alfa + limitarCanal(atras) * (1 - alfa);

  return {
    r: mezclar(capa.color.r, fondo.r),
    g: mezclar(capa.color.g, fondo.g),
    b: mezclar(capa.color.b, fondo.b),
  };
}

/**
 * Compone una pila de capas sobre una base opaca, de la mas lejana a la mas
 * cercana al observador, y devuelve el color efectivo resultante.
 *
 * @param base Color opaco del fondo del documento, normalmente `--fondo-base`.
 * @param capas Capas en orden de pintado; la ultima queda encima.
 */
export function componerCapas(base: ColorRgb, capas: readonly Capa[]): ColorRgb {
  return capas.reduce<ColorRgb>((acumulado, capa) => componerSobre(acumulado, capa), base);
}

/**
 * Relacion de contraste entre dos colores opacos, `(Lclara + 0.05) /
 * (Loscura + 0.05)` segun WCAG 2.1. El resultado vive en [1, 21] y es
 * simetrico respecto del orden de los argumentos.
 */
export function relacionContraste(primero: ColorRgb, segundo: ColorRgb): number {
  const luminanciaPrimero = luminanciaRelativa(primero);
  const luminanciaSegundo = luminanciaRelativa(segundo);
  const clara = Math.max(luminanciaPrimero, luminanciaSegundo);
  const oscura = Math.min(luminanciaPrimero, luminanciaSegundo);
  return (clara + 0.05) / (oscura + 0.05);
}

/**
 * Relacion de contraste de un texto sobre su fondo efectivo, componiendo las
 * dos pilas de capas sobre la misma base opaca (Requisito 6.2).
 *
 * @param base Color opaco de partida, p. ej. el negro profundo de `--fondo-base`.
 * @param capasFondo Capas que forman el fondo efectivo bajo el texto.
 * @param capasTexto Capas del color del texto, con su opacidad.
 */
export function contrasteCompuesto(
  base: ColorRgb,
  capasFondo: readonly Capa[],
  capasTexto: readonly Capa[],
): number {
  const fondoEfectivo = componerCapas(base, capasFondo);
  const textoEfectivo = componerCapas(fondoEfectivo, capasTexto);
  return relacionContraste(textoEfectivo, fondoEfectivo);
}

/** Indica si una relacion de contraste alcanza el minimo de texto (4.5:1). */
export function cumpleContrasteDeTexto(relacion: number): boolean {
  return relacion >= CONTRASTE_MINIMO_TEXTO;
}

/** Indica si una relacion de contraste alcanza el minimo del aro de foco (3:1). */
export function cumpleContrasteNoTextual(relacion: number): boolean {
  return relacion >= CONTRASTE_MINIMO_NO_TEXTO;
}
