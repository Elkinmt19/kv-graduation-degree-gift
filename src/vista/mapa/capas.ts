/**
 * Capas de dibujo del Mapa_Estelar: fondo y disco del horizonte, reticula
 * tenue, lineas de constelacion, estrellas con disco y halo, y las cuatro
 * marcas cardinales.
 *
 * La vista no calcula (diseno, seccion 3): este modulo recibe un
 * `CieloCalculado` ya resuelto por el Motor_Astronomico y solo pinta. El orden
 * de atras hacia adelante es el del diseno (seccion 5):
 *
 * 1. Degradado de fondo (negro profundo -> azul noche) y disco del
 *    Circulo_Horizonte  ({@link dibujarFondo}).
 * 2. Reticula tenue en azul electrico: circulos de altitud cada 30 grados y
 *    radios cada 45 grados ({@link dibujarReticula}).
 * 3. Lineas de constelacion de 1.0 px ({@link dibujarConstelaciones}).
 * 4. Constelacion Obsidian, que vive en `src/vista/guinos/` y se dibuja entre
 *    esta capa y la siguiente (tarea 11.12 del plan; aqui no se toca).
 * 5. Estrellas: disco mas halo radial ({@link dibujarEstrellas}).
 * 6. Marcas cardinales N, E, S y O ({@link dibujarCardinales}); las etiquetas de
 *    estrellas brillantes de la misma capa las coloca `etiquetas.ts`.
 *
 * ## Requisitos cubiertos
 *
 * - **4.1**: se dibujan unicamente las estrellas que devuelve
 *   `seleccionarDibujables` (`motor.ts`), es decir las visibles con magnitud
 *   aparente menor o igual a 6.0, hasta 3000 y de la mas brillante a la mas
 *   debil. Todas caen dentro del Circulo_Horizonte porque su coordenada de
 *   pantalla proviene de la proyeccion del hemisferio superior.
 * - **4.3**: el grosor del trazo de constelacion es
 *   {@link GROSOR_CONSTELACION} = 1.0 px, dentro del intervalo [0.5, 1.5].
 * - **4.7**: {@link dibujarCardinales} rotula los cuatro puntos de
 *   `cielo.cardinales`, que el motor situa en los azimuts 0, 90, 180 y 270 con
 *   altitud 0, es decir sobre el borde del circulo.
 * - **4.15**: solo se dibujan los `segmentosVisibles` del cielo, que por
 *   invariante de `CieloCalculado` son los que tienen **ambos** extremos con
 *   altitud mayor o igual a 0. Un segmento con un extremo bajo el horizonte
 *   nunca llega hasta aqui, de modo que se omite por completo.
 *
 * ## Color: por que se inyecta
 *
 * `contexto.fillStyle` no resuelve propiedades personalizadas de CSS, asi que el
 * lienzo necesita valores de color ya calculados. Para no repetir ningun
 * literal de la Paleta_Regalo en TypeScript -el Requisito 6.1 reserva ese
 * privilegio a `tokens.css`-, los colores entran como {@link PaletaMapa} y
 * {@link leerPaletaMapa} los resuelve en tiempo de ejecucion con
 * `getComputedStyle`. Un color vacio significa «esta capa no se dibuja»: es lo
 * que ocurre cuando el entorno no aplica las hojas de estilo, y degradar asi
 * evita que un valor inventado se cuele en el dibujo.
 *
 * ## Capas estaticas en un lienzo fuera de pantalla
 *
 * Las capas 1 a 3 no cambian entre fotogramas. {@link crearCapas} las dibuja una
 * sola vez en un `OffscreenCanvas` y las copia con `drawImage`, de modo que el
 * bucle de titileo (`animacion.ts`) solo redibuje las estrellas (Requisito 7.8).
 * Cuando el entorno no ofrece `OffscreenCanvas` -jsdom, por ejemplo- la copia se
 * sustituye por el dibujo directo sobre el lienzo principal: el mapa se ve
 * igual, solo cuesta mas por fotograma.
 */

import type {
  Cardinal,
  CieloCalculado,
  CirculoHorizonte,
  EstrellaCalculada,
  Punto,
  SegmentoVisible,
} from '../../nucleo/astronomia/modelo.js';
import { seleccionarDibujables } from '../../nucleo/astronomia/motor.js';
import { proyectar } from '../../nucleo/astronomia/proyeccion.js';
import { PALETA_REGALO, type NombrePaleta } from '../../nucleo/diseno/contraste.js';
import { normalizarDensidad, type TamanoMapa } from './circulo.js';
import { FUENTE_ETIQUETA, TAMANO_FUENTE_ETIQUETA } from './etiquetas.js';
import { radioPorMagnitud } from './radio.js';

/** Circunferencia completa en radianes. */
const TAU = Math.PI * 2;

/**
 * Clases del Mapa_Estelar en el DOM. Se exportan igual que `CLASES_PORTAL` y
 * `CLASES_CARTA`: el codigo de vista es la fuente de verdad y
 * `src/estilos/mapa.css` apunta exactamente a estas clases. `montarMapa`
 * (tarea 11.11) las escribe en la seccion, el lienzo, el rotulo de lugar y
 * fecha y el mensaje de respaldo.
 */
export const CLASES_MAPA = {
  seccion: 'mapa',
  lienzo: 'mapa__lienzo',
  rotulo: 'mapa__rotulo',
  respaldo: 'mapa__respaldo',
} as const;

/** Grosor del trazo de las lineas de constelacion, en px (Requisito 4.3). */
export const GROSOR_CONSTELACION = 1.0;

/** Grosor del borde del Circulo_Horizonte, en px. */
export const GROSOR_HORIZONTE = 1.5;

/** Grosor de la reticula, en px: mas fina que las lineas de constelacion. */
export const GROSOR_RETICULA = 0.75;

/** Paso de los circulos de altitud de la reticula, en grados (diseno). */
export const PASO_ALTITUD_RETICULA = 30;

/** Paso de los radios de la reticula, en grados (diseno). */
export const PASO_AZIMUT_RETICULA = 45;

/** Factor del halo respecto del radio del disco de la estrella. */
export const FACTOR_HALO = 2.6;

/** Largo de la marca que senala cada punto cardinal, en px. */
export const LARGO_MARCA_CARDINAL = 6;

/** Separacion entre la marca cardinal y su rotulo, en px. */
export const SEPARACION_CARDINAL = 4;

/**
 * Color sin tinta. No es un color de la Paleta_Regalo sino la palabra clave de
 * CSS que no aporta ninguno, y es la que apaga el halo en su borde exterior.
 */
export const SIN_TINTA = 'transparent';

/**
 * Altitudes de los circulos de la reticula, en grados: los multiplos estrictos
 * de 30 por debajo del cenit. El horizonte (altitud 0) ya lo dibuja el borde
 * del disco y el cenit (altitud 90) es un punto, no un circulo.
 */
export const ALTITUDES_RETICULA: readonly number[] = multiplosEstrictos(
  PASO_ALTITUD_RETICULA,
  90,
);

/** Azimuts de los radios de la reticula, en grados: 0, 45, ..., 315. */
export const AZIMUTS_RETICULA: readonly number[] = multiplosDesdeCero(PASO_AZIMUT_RETICULA, 360);

/** Multiplos de `paso` en el intervalo abierto `(0, tope)`. */
function multiplosEstrictos(paso: number, tope: number): readonly number[] {
  const valores: number[] = [];
  for (let valor = paso; valor < tope; valor += paso) {
    valores.push(valor);
  }
  return valores;
}

/** Multiplos de `paso` en el intervalo semiabierto `[0, tope)`. */
function multiplosDesdeCero(paso: number, tope: number): readonly number[] {
  const valores: number[] = [0];
  for (let valor = paso; valor < tope; valor += paso) {
    valores.push(valor);
  }
  return valores;
}

// --- Paleta ------------------------------------------------------------------

/**
 * Colores que el lienzo necesita, ya resueltos a valores que
 * `contexto.fillStyle` entiende. Una cadena vacia significa «sin color»: la capa
 * correspondiente no se dibuja.
 */
export interface PaletaMapa {
  /** Cielo junto al cenit, el extremo oscuro del degradado. */
  readonly cieloAlto: string;
  /** Cielo junto al horizonte, el extremo azul del degradado. */
  readonly cieloBajo: string;
  /** Borde del Circulo_Horizonte. */
  readonly horizonte: string;
  /** Circulos de altitud y radios de la reticula. */
  readonly reticula: string;
  /** Lineas de constelacion. */
  readonly lineaConstelacion: string;
  /** Disco de la estrella. */
  readonly estrella: string;
  /** Centro del halo de la estrella; se apaga hacia {@link SIN_TINTA}. */
  readonly estrellaHalo: string;
  /** Marcas y rotulos cardinales. */
  readonly cardinal: string;
}

/**
 * Propiedad personalizada de `tokens.css` de la que sale cada color. Es el unico
 * sitio donde el codigo nombra los tokens del cielo, de modo que renombrar uno
 * en la hoja se corrige aqui y en ningun otro lugar.
 */
export const PROPIEDADES_PALETA = {
  cieloAlto: '--fondo-cielo-alto',
  cieloBajo: '--fondo-cielo-bajo',
  horizonte: '--horizonte',
  reticula: '--reticula',
  lineaConstelacion: '--linea-constelacion',
  estrella: '--estrella',
  estrellaHalo: '--estrella-halo',
  cardinal: '--texto-etiqueta-mapa',
} as const satisfies Readonly<Record<keyof PaletaMapa, string>>;

/** Paleta sin ningun color: con ella el mapa no pinta nada. */
export const PALETA_VACIA: PaletaMapa = {
  cieloAlto: '',
  cieloBajo: '',
  horizonte: '',
  reticula: '',
  lineaConstelacion: '',
  estrella: '',
  estrellaHalo: '',
  cardinal: '',
};

/**
 * Capa de la Paleta_Regalo que declara cada token de {@link PROPIEDADES_PALETA}
 * en `tokens.css`, para derivar {@link PALETA_DE_RESPALDO} sin repetir ningun
 * literal de color fuera de esa hoja (Requisito 6.1).
 */
const CAPAS_PALETA_MAPA = {
  cieloAlto: { nombre: 'negro-profundo', opacidad: 1 },
  cieloBajo: { nombre: 'azul-noche', opacidad: 0.9 },
  horizonte: { nombre: 'dorado', opacidad: 0.45 },
  reticula: { nombre: 'azul-electrico', opacidad: 0.18 },
  lineaConstelacion: { nombre: 'azul-electrico', opacidad: 0.55 },
  estrella: { nombre: 'dorado', opacidad: 0.95 },
  estrellaHalo: { nombre: 'azul-electrico', opacidad: 0.25 },
  cardinal: { nombre: 'dorado', opacidad: 0.92 },
} as const satisfies Readonly<Record<keyof PaletaMapa, { nombre: NombrePaleta; opacidad: number }>>;

function formatearCapa(capa: { nombre: NombrePaleta; opacidad: number }): string {
  const color = PALETA_REGALO[capa.nombre];
  return `rgb(${String(color.r)} ${String(color.g)} ${String(color.b)} / ${String(capa.opacidad)})`;
}

/**
 * Paleta que usa el mapa cuando el entorno no resuelve `getComputedStyle`
 * (por ejemplo, en el empaquetado sin hojas de estilo). Reproduce exactamente
 * los colores que declara `tokens.css` para cada rol, derivados de
 * {@link PALETA_REGALO} en vez de repetir sus literales.
 */
export const PALETA_DE_RESPALDO: PaletaMapa = {
  cieloAlto: formatearCapa(CAPAS_PALETA_MAPA.cieloAlto),
  cieloBajo: formatearCapa(CAPAS_PALETA_MAPA.cieloBajo),
  horizonte: formatearCapa(CAPAS_PALETA_MAPA.horizonte),
  reticula: formatearCapa(CAPAS_PALETA_MAPA.reticula),
  lineaConstelacion: formatearCapa(CAPAS_PALETA_MAPA.lineaConstelacion),
  estrella: formatearCapa(CAPAS_PALETA_MAPA.estrella),
  estrellaHalo: formatearCapa(CAPAS_PALETA_MAPA.estrellaHalo),
  cardinal: formatearCapa(CAPAS_PALETA_MAPA.cardinal),
};

/**
 * Lector de estilo calculado, con la forma minima de `CSSStyleDeclaration`. Se
 * recorta a proposito para poder sustituirlo en pruebas por un objeto simple.
 */
export interface LectorEstilo {
  getPropertyValue(propiedad: string): string;
}

/** Fuente de estilo calculado; `null` cuando el entorno no ofrece ninguna. */
export type FuenteEstilo = (elemento: Element) => LectorEstilo | null;

/**
 * Fuente por omision: el `getComputedStyle` del entorno cuando existe. Es la
 * unica funcion del modulo que consulta el mundo exterior.
 */
export const estiloDelEntorno: FuenteEstilo = (elemento) => {
  const obtener = (globalThis as { getComputedStyle?: unknown }).getComputedStyle;
  if (typeof obtener !== 'function') {
    return null;
  }
  return (obtener as typeof getComputedStyle).call(globalThis, elemento);
};

/**
 * Resuelve la {@link PaletaMapa} a partir de los tokens de `tokens.css` que
 * hereda el elemento indicado.
 *
 * Los tokens que el entorno no resuelva quedan como cadena vacia y su capa no se
 * dibuja: es preferible un cielo incompleto a un color inventado que se salga de
 * la Paleta_Regalo (Requisito 6.1).
 *
 * @param elemento Elemento del que se leen los tokens, normalmente el lienzo.
 * @param fuente Fuente de estilo calculado; por omision la del entorno.
 */
export function leerPaletaMapa(
  elemento: Element,
  fuente: FuenteEstilo = estiloDelEntorno,
): PaletaMapa {
  const estilo = fuente(elemento);
  if (estilo === null) {
    return PALETA_VACIA;
  }

  const leer = (token: string): string => {
    const valor = estilo.getPropertyValue(token);
    return typeof valor === 'string' ? valor.trim() : '';
  };

  return {
    cieloAlto: leer(PROPIEDADES_PALETA.cieloAlto),
    cieloBajo: leer(PROPIEDADES_PALETA.cieloBajo),
    horizonte: leer(PROPIEDADES_PALETA.horizonte),
    reticula: leer(PROPIEDADES_PALETA.reticula),
    lineaConstelacion: leer(PROPIEDADES_PALETA.lineaConstelacion),
    estrella: leer(PROPIEDADES_PALETA.estrella),
    estrellaHalo: leer(PROPIEDADES_PALETA.estrellaHalo),
    cardinal: leer(PROPIEDADES_PALETA.cardinal),
  };
}

// --- Contexto de dibujo ------------------------------------------------------

/** Degradado minimo, con la forma de `CanvasGradient`. */
export interface DegradadoDibujo {
  addColorStop(desplazamiento: number, color: string): void;
}

/** Estilo de relleno o trazo admitido por el contexto. */
export type EstiloDibujo = string | DegradadoDibujo | CanvasPattern;

/**
 * Contexto 2D recortado a lo que estas capas usan. `CanvasRenderingContext2D` y
 * `OffscreenCanvasRenderingContext2D` lo satisfacen sin adaptador alguno, y una
 * prueba puede pasar un registrador de llamadas para comprobar el dibujo sin
 * navegador.
 */
export interface ContextoDibujo {
  fillStyle: EstiloDibujo;
  strokeStyle: EstiloDibujo;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, ancho: number, alto: number): void;
  fillRect(x: number, y: number, ancho: number, alto: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radio: number,
    anguloInicial: number,
    anguloFinal: number,
    antihorario?: boolean,
  ): void;
  fill(): void;
  stroke(): void;
  fillText(texto: string, x: number, y: number, anchoMaximo?: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): DegradadoDibujo;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): DegradadoDibujo;
  /**
   * Copia una imagen ya dibujada. El origen se declara `unknown` porque cada
   * entorno tiene el suyo (`OffscreenCanvas`, `HTMLCanvasElement`) y esta
   * interfaz no debe atarse a ninguno.
   */
  drawImage(origen: unknown, x: number, y: number, ancho: number, alto: number): void;
}

// --- Capa 1: fondo y disco del horizonte -------------------------------------

/** Medida utilizable de la caja visible: entera y no negativa. */
function medidaValida(valor: number): number {
  return Number.isFinite(valor) ? Math.max(0, Math.floor(valor)) : 0;
}

/** Indica si un punto tiene ambas coordenadas finitas. */
function puntoFinito(punto: Punto): boolean {
  return Number.isFinite(punto.x) && Number.isFinite(punto.y);
}

/** Indica si el circulo puede dibujarse: centro finito y radio positivo. */
function circuloDibujable(circulo: CirculoHorizonte): boolean {
  return (
    Number.isFinite(circulo.cx) &&
    Number.isFinite(circulo.cy) &&
    Number.isFinite(circulo.radio) &&
    circulo.radio > 0
  );
}

/**
 * Capa 1: degradado de fondo del cielo y disco del Circulo_Horizonte.
 *
 * El fondo va de `cieloAlto` arriba a `cieloBajo` abajo; el disco repite la
 * pareja en un degradado radial, oscuro en el cenit y azulado hacia el
 * horizonte, que es como se ve el cielo real. El borde del disco se traza con el
 * color de horizonte, de modo que el Circulo_Horizonte quede siempre visible.
 *
 * @param contexto Contexto de dibujo, en pixeles de CSS.
 * @param tamano Caja visible del mapa, en pixeles de CSS.
 * @param circulo Circulo_Horizonte, en pixeles de CSS.
 * @param paleta Colores ya resueltos.
 */
export function dibujarFondo(
  contexto: ContextoDibujo,
  tamano: TamanoMapa,
  circulo: CirculoHorizonte,
  paleta: PaletaMapa,
): void {
  const ancho = medidaValida(tamano.ancho);
  const alto = medidaValida(tamano.alto);

  contexto.clearRect(0, 0, ancho, alto);

  const conCielo = paleta.cieloAlto !== '' && paleta.cieloBajo !== '';
  if (conCielo && ancho > 0 && alto > 0) {
    const fondo = contexto.createLinearGradient(0, 0, 0, alto);
    fondo.addColorStop(0, paleta.cieloAlto);
    fondo.addColorStop(1, paleta.cieloBajo);
    contexto.fillStyle = fondo;
    contexto.fillRect(0, 0, ancho, alto);
  }

  if (!circuloDibujable(circulo)) {
    return;
  }

  if (conCielo) {
    const disco = contexto.createRadialGradient(
      circulo.cx,
      circulo.cy,
      0,
      circulo.cx,
      circulo.cy,
      circulo.radio,
    );
    disco.addColorStop(0, paleta.cieloAlto);
    disco.addColorStop(1, paleta.cieloBajo);
    contexto.fillStyle = disco;
    contexto.beginPath();
    contexto.arc(circulo.cx, circulo.cy, circulo.radio, 0, TAU);
    contexto.fill();
  }

  if (paleta.horizonte !== '') {
    contexto.strokeStyle = paleta.horizonte;
    contexto.lineWidth = GROSOR_HORIZONTE;
    contexto.beginPath();
    contexto.arc(circulo.cx, circulo.cy, circulo.radio, 0, TAU);
    contexto.stroke();
  }
}

// --- Capa 2: reticula --------------------------------------------------------

/**
 * Radio de dibujo de un circulo de altitud, en pixeles. Se obtiene de
 * `proyectar` y no de una formula propia, para que la reticula caiga sobre las
 * mismas altitudes que las estrellas.
 *
 * @param altitud Altitud en grados, en [0, 90].
 * @param circulo Circulo_Horizonte de destino.
 */
export function radioDeAltitud(altitud: number, circulo: CirculoHorizonte): number {
  const punto = proyectar({ altitud, azimut: 0 }, circulo);
  return Math.hypot(punto.x - circulo.cx, punto.y - circulo.cy);
}

/**
 * Capa 2: reticula tenue, con circulos de altitud cada 30 grados y radios cada
 * 45 grados (diseno, seccion 5).
 *
 * @param contexto Contexto de dibujo, en pixeles de CSS.
 * @param circulo Circulo_Horizonte, en pixeles de CSS.
 * @param paleta Colores ya resueltos.
 */
export function dibujarReticula(
  contexto: ContextoDibujo,
  circulo: CirculoHorizonte,
  paleta: PaletaMapa,
): void {
  if (paleta.reticula === '' || !circuloDibujable(circulo)) {
    return;
  }

  contexto.strokeStyle = paleta.reticula;
  contexto.lineWidth = GROSOR_RETICULA;

  for (const altitud of ALTITUDES_RETICULA) {
    const radio = radioDeAltitud(altitud, circulo);
    if (!(radio > 0)) {
      continue;
    }
    contexto.beginPath();
    contexto.arc(circulo.cx, circulo.cy, radio, 0, TAU);
    contexto.stroke();
  }

  for (const azimut of AZIMUTS_RETICULA) {
    const borde = proyectar({ altitud: 0, azimut }, circulo);
    if (!puntoFinito(borde)) {
      continue;
    }
    contexto.beginPath();
    contexto.moveTo(circulo.cx, circulo.cy);
    contexto.lineTo(borde.x, borde.y);
    contexto.stroke();
  }
}

// --- Capa 3: lineas de constelacion ------------------------------------------

/**
 * Capa 3: lineas de constelacion, con trazo de 1.0 px (Requisito 4.3).
 *
 * Requisito 4.15: se dibuja exactamente lo que se recibe. La entrada natural es
 * `cielo.segmentosVisibles`, que por invariante de `CieloCalculado` solo
 * contiene los segmentos con **ambos** extremos de altitud mayor o igual a 0;
 * los demas ya vienen omitidos y esta funcion no puede resucitarlos.
 *
 * @param contexto Contexto de dibujo, en pixeles de CSS.
 * @param segmentos Segmentos visibles del cielo.
 * @param paleta Colores ya resueltos.
 * @returns Cantidad de segmentos trazados.
 */
export function dibujarConstelaciones(
  contexto: ContextoDibujo,
  segmentos: readonly SegmentoVisible[],
  paleta: PaletaMapa,
): number {
  if (paleta.lineaConstelacion === '' || segmentos.length === 0) {
    return 0;
  }

  contexto.strokeStyle = paleta.lineaConstelacion;
  contexto.lineWidth = GROSOR_CONSTELACION;

  let trazados = 0;
  contexto.beginPath();
  for (const segmento of segmentos) {
    if (!puntoFinito(segmento.a) || !puntoFinito(segmento.b)) {
      continue;
    }
    contexto.moveTo(segmento.a.x, segmento.a.y);
    contexto.lineTo(segmento.b.x, segmento.b.y);
    trazados += 1;
  }

  if (trazados > 0) {
    // Un solo trazo para todas las lineas: el navegador rasteriza una vez.
    contexto.stroke();
  }
  return trazados;
}

// --- Capa 5: estrellas -------------------------------------------------------

/** Estrella lista para dibujar, con su indice en `cielo.estrellas`. */
export interface EstrellaDibujable {
  /**
   * Posicion en `cielo.estrellas`. Es la clave con la que el bucle de titileo
   * indexa las opacidades del fotograma (`animacion.ts`).
   */
  readonly indice: number;
  /** Estrella calculada, siempre con `pantalla !== null`. */
  readonly calculada: EstrellaCalculada;
  /** Centro del disco, en pixeles de CSS. */
  readonly centro: Punto;
  /** Radio del disco, en pixeles: en [0.6, 3.5] (Requisito 4.2). */
  readonly radio: number;
}

/**
 * Radio de dibujo de una estrella calculada. Se usa el que trae el motor y, si
 * no es utilizable, se recalcula con `radioPorMagnitud`, de modo que ninguna
 * estrella dibujable quede sin disco.
 */
function radioDeDibujo(calculada: EstrellaCalculada): number {
  return Number.isFinite(calculada.radio) && calculada.radio > 0
    ? calculada.radio
    : radioPorMagnitud(calculada.estrella.magnitud);
}

/**
 * Estrellas que el mapa debe dibujar, en el orden de `seleccionarDibujables`:
 * las visibles con magnitud menor o igual a 6.0, hasta 3000, de la mas brillante
 * a la mas debil (Requisito 4.1).
 *
 * El indice se resuelve por identidad de objeto: `seleccionarDibujables` no
 * copia las estrellas calculadas, devuelve las mismas referencias que trae
 * `cielo.estrellas`, asi que un `Map` de referencia a posicion basta y no hay
 * que volver a buscar por nombre.
 *
 * @param cielo Cielo ya calculado.
 * @returns Las estrellas dibujables con su indice, centro y radio.
 */
export function prepararEstrellas(cielo: CieloCalculado): readonly EstrellaDibujable[] {
  const indices = new Map<EstrellaCalculada, number>();
  for (let indice = 0; indice < cielo.estrellas.length; indice += 1) {
    const calculada = cielo.estrellas[indice];
    if (calculada !== undefined) {
      indices.set(calculada, indice);
    }
  }

  const dibujables: EstrellaDibujable[] = [];
  for (const calculada of seleccionarDibujables(cielo.estrellas)) {
    const centro = calculada.pantalla;
    if (centro === null || !puntoFinito(centro)) {
      continue;
    }
    dibujables.push({
      indice: indices.get(calculada) ?? dibujables.length,
      calculada,
      centro,
      radio: radioDeDibujo(calculada),
    });
  }
  return dibujables;
}

/** Opacidad de una estrella en el fotograma actual, siempre en [0, 1]. */
function opacidadDe(opacidades: ArrayLike<number> | undefined, indice: number): number {
  if (opacidades === undefined || indice < 0 || indice >= opacidades.length) {
    return 1;
  }
  const valor = opacidades[indice];
  if (valor === undefined || !Number.isFinite(valor)) {
    return 1;
  }
  return Math.min(1, Math.max(0, valor));
}

/**
 * Capa 5: estrellas, cada una con su disco y su halo radial.
 *
 * El halo se pinta antes que el disco y se apaga desde `estrellaHalo` hasta
 * {@link SIN_TINTA} en {@link FACTOR_HALO} veces el radio, lo que da el brillo
 * difuso de las estrellas brillantes sin ensanchar el punto.
 *
 * @param contexto Contexto de dibujo, en pixeles de CSS.
 * @param dibujables Salida de {@link prepararEstrellas}.
 * @param paleta Colores ya resueltos.
 * @param opacidades Opacidad por estrella, indexada por
 *   {@link EstrellaDibujable.indice}; ausente equivale a plena luz. Es la forma
 *   que entrega el bucle de titileo.
 * @returns Cantidad de estrellas dibujadas.
 */
export function dibujarEstrellas(
  contexto: ContextoDibujo,
  dibujables: readonly EstrellaDibujable[],
  paleta: PaletaMapa,
  opacidades?: ArrayLike<number>,
): number {
  if (paleta.estrella === '' || dibujables.length === 0) {
    return 0;
  }

  contexto.save();
  let dibujadas = 0;

  for (const dibujable of dibujables) {
    const { centro, radio } = dibujable;
    if (!(radio > 0)) {
      continue;
    }

    contexto.globalAlpha = opacidadDe(opacidades, dibujable.indice);

    if (paleta.estrellaHalo !== '') {
      const halo = contexto.createRadialGradient(
        centro.x,
        centro.y,
        radio,
        centro.x,
        centro.y,
        radio * FACTOR_HALO,
      );
      halo.addColorStop(0, paleta.estrellaHalo);
      halo.addColorStop(1, SIN_TINTA);
      contexto.fillStyle = halo;
      contexto.beginPath();
      contexto.arc(centro.x, centro.y, radio * FACTOR_HALO, 0, TAU);
      contexto.fill();
    }

    contexto.fillStyle = paleta.estrella;
    contexto.beginPath();
    contexto.arc(centro.x, centro.y, radio, 0, TAU);
    contexto.fill();
    dibujadas += 1;
  }

  contexto.restore();
  return dibujadas;
}

// --- Capa 6: marcas cardinales ----------------------------------------------

/**
 * Capa 6: las cuatro marcas cardinales sobre el borde del Circulo_Horizonte
 * (Requisito 4.7).
 *
 * Cada marca es un trazo corto hacia dentro desde el punto que da el motor -que
 * esta en el azimut exacto, sin desviacion alguna- y su rotulo se dibuja un poco
 * mas adentro, para que no se salga del lienzo aunque el margen sea de 8 px. El
 * texto usa la misma fuente de 12 px que las etiquetas de estrella, asi que el
 * mapa habla con una sola voz.
 *
 * @param contexto Contexto de dibujo, en pixeles de CSS.
 * @param circulo Circulo_Horizonte, en pixeles de CSS.
 * @param cardinales Marcas del cielo: `cielo.cardinales`.
 * @param paleta Colores ya resueltos.
 * @returns Cantidad de marcas rotuladas.
 */
export function dibujarCardinales(
  contexto: ContextoDibujo,
  circulo: CirculoHorizonte,
  cardinales: readonly Cardinal[],
  paleta: PaletaMapa,
): number {
  if (paleta.cardinal === '' || !circuloDibujable(circulo)) {
    return 0;
  }

  contexto.save();
  contexto.strokeStyle = paleta.cardinal;
  contexto.fillStyle = paleta.cardinal;
  contexto.lineWidth = GROSOR_HORIZONTE;
  contexto.font = FUENTE_ETIQUETA;
  contexto.textAlign = 'center';
  contexto.textBaseline = 'middle';

  const adentroRotulo =
    LARGO_MARCA_CARDINAL + SEPARACION_CARDINAL + TAMANO_FUENTE_ETIQUETA / 2;
  let rotuladas = 0;

  for (const cardinal of cardinales) {
    const punto = cardinal.punto;
    if (!puntoFinito(punto)) {
      continue;
    }

    // Vector unitario del centro hacia la marca. En el centro no hay direccion
    // posible y la marca se omite.
    const dx = punto.x - circulo.cx;
    const dy = punto.y - circulo.cy;
    const distancia = Math.hypot(dx, dy);
    if (!(distancia > 0)) {
      continue;
    }
    const ux = dx / distancia;
    const uy = dy / distancia;

    contexto.beginPath();
    contexto.moveTo(punto.x, punto.y);
    contexto.lineTo(punto.x - ux * LARGO_MARCA_CARDINAL, punto.y - uy * LARGO_MARCA_CARDINAL);
    contexto.stroke();

    contexto.fillText(
      cardinal.rotulo,
      punto.x - ux * adentroRotulo,
      punto.y - uy * adentroRotulo,
    );
    rotuladas += 1;
  }

  contexto.restore();
  return rotuladas;
}

// --- Composicion: capas estaticas en cache y fotograma completo --------------

/** Lienzo fuera de pantalla minimo, con la forma de `OffscreenCanvas`. */
export interface LienzoFueraDePantalla {
  readonly width: number;
  readonly height: number;
  getContext(tipo: '2d'): ContextoDibujo | null;
}

/**
 * Fabrica de lienzos fuera de pantalla. Devuelve `null` cuando el entorno no
 * ofrece ninguno, y entonces las capas estaticas se dibujan directamente sobre
 * el lienzo principal.
 */
export type FabricaFueraDePantalla = (
  ancho: number,
  alto: number,
) => LienzoFueraDePantalla | null;

/**
 * Fabrica por omision: usa el `OffscreenCanvas` del entorno cuando existe.
 * jsdom no lo implementa, de modo que las pruebas de vista ejercitan la rama de
 * dibujo directo sin ningun montaje especial.
 */
export const fabricaFueraDePantalla: FabricaFueraDePantalla = (ancho, alto) => {
  const Constructor = (globalThis as { OffscreenCanvas?: typeof OffscreenCanvas }).OffscreenCanvas;
  if (typeof Constructor !== 'function' || ancho <= 0 || alto <= 0) {
    return null;
  }
  try {
    return new Constructor(ancho, alto) as unknown as LienzoFueraDePantalla;
  } catch {
    // Un entorno que declara el constructor pero no puede crear el lienzo (sin
    // memoria de GPU, por ejemplo) cae en el dibujo directo.
    return null;
  }
};

/** Opciones de {@link crearCapas}. */
export interface OpcionesCapas {
  /** Cielo ya resuelto; estas capas no calculan, solo dibujan. */
  readonly cielo: CieloCalculado;
  /** Colores ya resueltos, normalmente de {@link leerPaletaMapa}. */
  readonly paleta: PaletaMapa;
  /** Caja visible del mapa, en pixeles de CSS. */
  readonly tamano: TamanoMapa;
  /** Densidad de pixeles del lienzo de cache; por omision 1. */
  readonly densidad?: number;
  /**
   * Fabrica de lienzos fuera de pantalla. Por omision la del entorno; `null`
   * fuerza el dibujo directo, util para comparar las dos rutas en pruebas.
   */
  readonly fabrica?: FabricaFueraDePantalla | null;
}

/** Capas del cielo ya preparadas para dibujar fotograma a fotograma. */
export interface CapasMapa {
  /** Estrellas dibujables, en el orden del Requisito 4.1. */
  readonly dibujables: readonly EstrellaDibujable[];
  /**
   * Verdadero cuando las capas 1 a 3 viven en un lienzo fuera de pantalla y se
   * copian con `drawImage`; falso cuando se redibujan directamente.
   */
  readonly enCache: boolean;
  /** Pinta las capas estaticas: la copia de la cache o el dibujo directo. */
  dibujarEstaticas(contexto: ContextoDibujo): void;
  /**
   * Pinta un fotograma completo: capas estaticas, estrellas y marcas
   * cardinales.
   *
   * @param contexto Contexto del lienzo visible, ya escalado a pixeles de CSS.
   * @param opacidades Opacidades del fotograma, indexadas por posicion en
   *   `cielo.estrellas`; ausentes equivalen a plena luz.
   */
  dibujar(contexto: ContextoDibujo, opacidades?: ArrayLike<number>): void;
  /** Suelta el lienzo de cache. Llamarla dos veces es seguro. */
  destruir(): void;
}

/**
 * Prepara las capas de un cielo: selecciona las estrellas dibujables y deja las
 * capas estaticas listas, en un lienzo fuera de pantalla cuando el entorno lo
 * permite (diseno, seccion 5; Requisito 7.8).
 *
 * @param opciones Cielo, paleta, tamano, densidad y fabrica de lienzos.
 * @returns Las capas, con su funcion de limpieza.
 */
export function crearCapas(opciones: OpcionesCapas): CapasMapa {
  const { cielo, paleta, tamano } = opciones;
  const ancho = medidaValida(tamano.ancho);
  const alto = medidaValida(tamano.alto);
  const densidad = normalizarDensidad(opciones.densidad ?? 1);
  const dibujables = prepararEstrellas(cielo);

  const dibujarDirecto = (contexto: ContextoDibujo): void => {
    dibujarFondo(contexto, { ancho, alto }, cielo.circulo, paleta);
    dibujarReticula(contexto, cielo.circulo, paleta);
    dibujarConstelaciones(contexto, cielo.segmentosVisibles, paleta);
  };

  const fabrica = opciones.fabrica === undefined ? fabricaFueraDePantalla : opciones.fabrica;
  let cache = crearCache(fabrica, ancho, alto, densidad, dibujarDirecto);

  return {
    dibujables,
    enCache: cache !== null,
    dibujarEstaticas: (contexto: ContextoDibujo): void => {
      if (cache === null) {
        dibujarDirecto(contexto);
        return;
      }
      // La cache mide `ancho * densidad`; se copia escalada a pixeles de CSS,
      // que es la unidad en la que dibuja el resto del mapa.
      contexto.clearRect(0, 0, ancho, alto);
      contexto.drawImage(cache, 0, 0, ancho, alto);
    },
    dibujar(contexto: ContextoDibujo, opacidades?: ArrayLike<number>): void {
      this.dibujarEstaticas(contexto);
      dibujarEstrellas(contexto, dibujables, paleta, opacidades);
      dibujarCardinales(contexto, cielo.circulo, cielo.cardinales, paleta);
    },
    destruir: (): void => {
      cache = null;
    },
  };
}

/**
 * Crea el lienzo de cache y pinta en el las capas estaticas. Devuelve `null`
 * cuando el entorno no ofrece lienzos fuera de pantalla o cuando el que ofrece
 * no da contexto 2D, y entonces las capas se dibujan directamente.
 */
function crearCache(
  fabrica: FabricaFueraDePantalla | null,
  ancho: number,
  alto: number,
  densidad: number,
  pintar: (contexto: ContextoDibujo) => void,
): LienzoFueraDePantalla | null {
  if (fabrica === null || ancho <= 0 || alto <= 0) {
    return null;
  }

  const lienzo = fabrica(Math.round(ancho * densidad), Math.round(alto * densidad));
  if (lienzo === null) {
    return null;
  }

  const contexto = lienzo.getContext('2d');
  if (contexto === null) {
    return null;
  }

  // Igual que `escalarContexto` en `circulo.ts`: se dibuja en pixeles de CSS
  // sobre un almacen de respaldo de densidad mayor, con `setTransform` para que
  // repetir la llamada no acumule escalas.
  contexto.setTransform(densidad, 0, 0, densidad, 0, 0);
  pintar(contexto);
  return lienzo;
}
