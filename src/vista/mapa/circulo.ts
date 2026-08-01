/**
 * Circulo_Horizonte del Mapa_Estelar: su calculo, el dimensionado del lienzo y
 * el disparo del redibujo al cambiar de tamano.
 *
 * Requisito 4.12: al cambiar el tamano de la ventana el mapa se redibuja en un
 * maximo de 400 ms tras el ultimo cambio, conservando el Circulo_Horizonte
 * completo dentro del area visible con un margen minimo de 8 px por lado y un
 * diametro minimo de 280 px.
 *
 * El modulo sigue el patron de `src/vista/disposicion.ts`: los numeros del
 * diseno viven en constantes exportadas y el calculo es una funcion pura que no
 * lee el DOM ni consulta `window`, de modo que las Propiedades 22 y 13 pueden
 * comprobarlo sin navegador. Solo dos funciones tocan el mundo exterior:
 * {@link ajustarLienzo}, que escribe el tamano del lienzo, y
 * {@link observarTamano}, que conecta el `ResizeObserver`; ambas reciben sus
 * dependencias por parametro.
 *
 * Como se cumple el requisito. El radio es
 * `R = max(140, (min(ancho, alto) - 16) / 2)`:
 * - La resta de 16 px reserva 8 px por lado, asi que el diametro `2R` no pasa
 *   del lado menor menos 16 px y el circulo, centrado, deja ese margen arriba,
 *   abajo, a izquierda y a derecha.
 * - El piso de 140 px sostiene el diametro minimo de 280 px y el invariante
 *   `radio >= 140` que documenta `CirculoHorizonte`. Por debajo de 296 px de
 *   lado menor el piso manda y el margen de 8 px cede: se prefiere un circulo
 *   que asome a un mapa ilegible, y la Pagina_Regalo reserva altura suficiente
 *   para que ese caso no aparezca en los tamanos cubiertos (desde 320 x 400 px
 *   el radio ya viene de la formula).
 * - El antirrebote de 150 ms mas un redibujo completo, del orden de unidades de
 *   milisegundos, deja el redibujo muy dentro del presupuesto de 400 ms.
 */

import type { CirculoHorizonte } from '../../nucleo/astronomia/modelo.js';

/** Radio minimo del Circulo_Horizonte, en pixeles (Requisitos 3.5, 4.12). */
export const RADIO_MINIMO = 140;

/** Margen minimo por lado entre el circulo y el borde visible, en pixeles. */
export const MARGEN_MINIMO = 8;

/** Margen descontado del lado menor: 8 px por cada lado. */
export const MARGEN_TOTAL = 2 * MARGEN_MINIMO;

/** Diametro minimo del Circulo_Horizonte, en pixeles (Requisito 4.12). */
export const DIAMETRO_MINIMO = 2 * RADIO_MINIMO;

/** Antirrebote del cambio de tamano, en milisegundos (diseno, seccion 5). */
export const ANTIRREBOTE_MS = 150;

/** Presupuesto total de redibujo tras el ultimo cambio (Requisito 4.12). */
export const PRESUPUESTO_REDIBUJO_MS = 400;

/**
 * Densidad de pixeles minima admitida. Un `devicePixelRatio` de 0, negativo o
 * `NaN` no describe ninguna pantalla real: se sustituye por 1.
 */
export const DENSIDAD_MINIMA = 1;

/**
 * Densidad de pixeles maxima admitida. Las pantallas actuales llegan a 3 y el
 * zoom del navegador puede empujar el valor mas arriba; el tope de 4 evita que
 * un valor absurdo haga reservar cientos de megabytes de lienzo.
 */
export const DENSIDAD_MAXIMA = 4;

/** Tamano de la caja visible del mapa, en pixeles de CSS. */
export interface TamanoMapa {
  readonly ancho: number;
  readonly alto: number;
}

/** Tamano resuelto del lienzo: caja de CSS y almacen de respaldo. */
export interface AjusteLienzo {
  /** Ancho de la caja de CSS, en pixeles logicos. */
  readonly anchoCss: number;
  /** Alto de la caja de CSS, en pixeles logicos. */
  readonly altoCss: number;
  /** Ancho del almacen de respaldo, en pixeles del dispositivo. */
  readonly anchoLienzo: number;
  /** Alto del almacen de respaldo, en pixeles del dispositivo. */
  readonly altoLienzo: number;
  /** Densidad efectiva ya normalizada, en [1, 4]. */
  readonly densidad: number;
  /** Circulo_Horizonte correspondiente, en pixeles de CSS. */
  readonly circulo: CirculoHorizonte;
}

/** Limita un valor al intervalo cerrado `[minimo, maximo]`. */
function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), maximo);
}

/** Lleva una medida de la caja visible a un entero no negativo de pixeles. */
function medidaValida(valor: number): number {
  return Number.isFinite(valor) ? Math.max(0, Math.floor(valor)) : 0;
}

/**
 * Radio del Circulo_Horizonte para una caja visible dada, en pixeles.
 *
 * Es la formula del diseno (seccion 5, cambio de tamano) y coincide bit a bit
 * con la que declaran las propiedades de proyeccion, que la definen por su
 * cuenta para no depender de la vista.
 *
 * @param ancho Ancho de la caja visible, en pixeles de CSS.
 * @param alto Alto de la caja visible, en pixeles de CSS.
 * @returns El radio en pixeles, nunca menor que 140.
 */
export function radioCirculo(ancho: number, alto: number): number {
  const lado = Math.min(medidaValida(ancho), medidaValida(alto));
  return Math.max(RADIO_MINIMO, (lado - MARGEN_TOTAL) / 2);
}

/**
 * Circulo_Horizonte centrado en la caja visible.
 *
 * @param ancho Ancho de la caja visible, en pixeles de CSS.
 * @param alto Alto de la caja visible, en pixeles de CSS.
 * @returns El circulo con centro en `(ancho / 2, alto / 2)` y radio de
 *          {@link radioCirculo}.
 */
export function calcularCirculo(ancho: number, alto: number): CirculoHorizonte {
  const anchoUtil = medidaValida(ancho);
  const altoUtil = medidaValida(alto);

  return {
    cx: anchoUtil / 2,
    cy: altoUtil / 2,
    radio: radioCirculo(anchoUtil, altoUtil),
  };
}

/**
 * Indica si el circulo cabe en la caja visible con el margen exigido. Es falso
 * solo cuando manda el piso de 140 px, es decir con un lado menor de 296 px.
 *
 * @param ancho Ancho de la caja visible, en pixeles de CSS.
 * @param alto Alto de la caja visible, en pixeles de CSS.
 */
export function cabeConMargen(ancho: number, alto: number): boolean {
  const lado = Math.min(medidaValida(ancho), medidaValida(alto));
  return lado - 2 * radioCirculo(ancho, alto) >= MARGEN_TOTAL;
}

/**
 * Normaliza el `devicePixelRatio`. Los valores no finitos (incluidos `NaN` y
 * los infinitos), nulos o negativos no describen ninguna pantalla y caen en la
 * densidad segura de 1; los finitos excesivos se recortan a 4. Asi el
 * dimensionado del lienzo nunca depende de un dato absurdo del entorno.
 *
 * @param densidad Valor declarado por el entorno.
 * @returns La densidad efectiva, en [1, 4].
 */
export function normalizarDensidad(densidad: number): number {
  if (!Number.isFinite(densidad) || densidad <= 0) {
    return DENSIDAD_MINIMA;
  }
  return limitar(densidad, DENSIDAD_MINIMA, DENSIDAD_MAXIMA);
}

/**
 * Densidad de pixeles del entorno, o 1 cuando no la declara. Se lee aqui y en
 * ningun otro sitio, para que el resto del modulo siga siendo puro.
 */
export function densidadDelEntorno(): number {
  const declarada: unknown = (globalThis as { devicePixelRatio?: unknown }).devicePixelRatio;
  return normalizarDensidad(typeof declarada === 'number' ? declarada : DENSIDAD_MINIMA);
}

/**
 * Calcula el tamano del lienzo para una caja visible y una densidad dadas.
 *
 * Funcion pura. El almacen de respaldo mide `ancho * densidad` por
 * `alto * densidad` en pixeles del dispositivo mientras la caja de CSS
 * conserva `ancho` por `alto`, de manera que los radios de estrella de 0.6 px
 * se dibujen nitidos en pantallas de densidad alta (diseno, seccion 5).
 *
 * @param ancho Ancho de la caja visible, en pixeles de CSS.
 * @param alto Alto de la caja visible, en pixeles de CSS.
 * @param densidad Densidad declarada; por omision la del entorno.
 * @returns Las medidas de CSS, las del almacen de respaldo, la densidad
 *          efectiva y el Circulo_Horizonte resultante.
 */
export function dimensionarLienzo(
  ancho: number,
  alto: number,
  densidad: number = densidadDelEntorno(),
): AjusteLienzo {
  const anchoCss = medidaValida(ancho);
  const altoCss = medidaValida(alto);
  const efectiva = normalizarDensidad(densidad);

  return {
    anchoCss,
    altoCss,
    anchoLienzo: Math.round(anchoCss * efectiva),
    altoLienzo: Math.round(altoCss * efectiva),
    densidad: efectiva,
    circulo: calcularCirculo(anchoCss, altoCss),
  };
}

/**
 * Aplica al lienzo el tamano calculado por {@link dimensionarLienzo}: escribe
 * `width` y `height` en pixeles del dispositivo y fija la caja de CSS en
 * pixeles logicos.
 *
 * Escribir `width` o `height` limpia el lienzo y devuelve la matriz de
 * transformacion a la identidad, asi que quien dibuje debe escalar el contexto
 * por `densidad` con {@link escalarContexto} y volver a dibujar; eso es
 * exactamente lo que hace el redibujo del Requisito 4.12.
 *
 * @param lienzo Lienzo a dimensionar.
 * @param tamano Caja visible en pixeles de CSS.
 * @param densidad Densidad declarada; por omision la del entorno.
 * @returns El ajuste aplicado.
 */
export function ajustarLienzo(
  lienzo: HTMLCanvasElement,
  tamano: TamanoMapa,
  densidad: number = densidadDelEntorno(),
): AjusteLienzo {
  const ajuste = dimensionarLienzo(tamano.ancho, tamano.alto, densidad);

  lienzo.width = ajuste.anchoLienzo;
  lienzo.height = ajuste.altoLienzo;
  lienzo.style.width = `${String(ajuste.anchoCss)}px`;
  lienzo.style.height = `${String(ajuste.altoCss)}px`;

  return ajuste;
}

/**
 * Escala el contexto para poder dibujar en pixeles de CSS sobre un almacen de
 * respaldo de densidad mayor. Se usa `setTransform` y no `scale` para que
 * llamarla dos veces no acumule escalas.
 */
export function escalarContexto(
  contexto: CanvasRenderingContext2D,
  densidad: number,
): void {
  const efectiva = normalizarDensidad(densidad);
  contexto.setTransform(efectiva, 0, 0, efectiva, 0, 0);
}

/** Reloj minimo del antirrebote; en pruebas se sustituye por uno manual. */
export interface Reloj {
  programar(accion: () => void, ms: number): unknown;
  cancelar(identificador: unknown): void;
}

/** Reloj por omision, apoyado en `setTimeout` del entorno. */
export const RELOJ_DEL_ENTORNO: Reloj = {
  programar: (accion, ms) => setTimeout(accion, ms),
  cancelar: (identificador) => {
    clearTimeout(identificador as ReturnType<typeof setTimeout>);
  },
};

/** Disparador con antirrebote. */
export interface Antirrebote {
  /** Reinicia la espera; la accion corre `ms` despues de esta llamada. */
  disparar(): void;
  /** Cancela la espera pendiente, si la hay. */
  cancelar(): void;
  /** Verdadero mientras haya una espera pendiente. */
  pendiente(): boolean;
}

/**
 * Envuelve una accion en un antirrebote: cada disparo reinicia la espera y la
 * accion corre una sola vez, `ms` milisegundos despues del ultimo disparo. Es
 * lo que evita redibujar el cielo en cada uno de los cientos de avisos que
 * emite el navegador mientras se arrastra el borde de la ventana.
 *
 * @param accion Accion a ejecutar tras la espera.
 * @param ms Espera en milisegundos; por omision los 150 del diseno.
 * @param reloj Reloj a usar; por omision el del entorno.
 */
export function antirrebote(
  accion: () => void,
  ms: number = ANTIRREBOTE_MS,
  reloj: Reloj = RELOJ_DEL_ENTORNO,
): Antirrebote {
  let espera: unknown = null;

  const cancelar = (): void => {
    if (espera !== null) {
      reloj.cancelar(espera);
      espera = null;
    }
  };

  return {
    disparar: (): void => {
      cancelar();
      espera = reloj.programar(() => {
        espera = null;
        accion();
      }, ms);
    },
    cancelar,
    pendiente: (): boolean => espera !== null,
  };
}

/**
 * Observador de tamano minimo, con la forma de `ResizeObserver`. Se recorta a
 * proposito para poder sustituirlo en pruebas por un objeto simple.
 */
export interface ObservadorTamano {
  observe(objetivo: Element): void;
  disconnect(): void;
}

/**
 * Fabrica de observadores. Recibe la funcion que hay que llamar en cada aviso
 * de cambio y devuelve el observador, o `null` cuando el entorno no ofrece
 * ninguno.
 */
export type FabricaObservador = (alAvisar: () => void) => ObservadorTamano | null;

/**
 * Fabrica por omision: usa el `ResizeObserver` del entorno cuando existe y
 * devuelve `null` cuando no. jsdom no lo implementa, de modo que las pruebas de
 * vista ejercitan justamente esa rama.
 */
export const fabricaDelEntorno: FabricaObservador = (alAvisar) => {
  const Constructor = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;

  if (typeof Constructor !== 'function') {
    return null;
  }

  return new Constructor(() => {
    alAvisar();
  });
};

/** Opciones de la observacion del tamano del mapa. */
export interface OpcionesObservacion {
  /** Espera del antirrebote en milisegundos; por omision 150. */
  readonly antirreboteMs?: number;
  /** Reloj del antirrebote; por omision el del entorno. */
  readonly reloj?: Reloj;
  /** Fabrica de observadores; por omision la del entorno. */
  readonly fabrica?: FabricaObservador;
}

/** Observacion montada sobre un elemento. */
export interface Observacion {
  /**
   * Verdadero cuando el entorno ofrecio un observador. Con `false` la vista
   * sigue funcionando: dibuja una vez y no reacciona a los cambios de tamano.
   */
  readonly activa: boolean;
  /** Verdadero mientras el antirrebote tenga un redibujo pendiente. */
  pendiente(): boolean;
  /** Desconecta el observador y cancela la espera pendiente. */
  detener(): void;
}

/**
 * Observa el tamano de un elemento y dispara el redibujo con antirrebote de
 * 150 ms (Requisito 4.12).
 *
 * Degrada sin ruido: si el entorno no tiene `ResizeObserver`, no se observa
 * nada, `activa` queda en `false` y `detener` sigue siendo seguro de llamar.
 *
 * @param elemento Elemento cuyo tamano se observa, normalmente el contenedor
 *                 del lienzo.
 * @param alRedibujar Accion de redibujo, invocada con la caja visible del
 *                    elemento en pixeles de CSS.
 * @param opciones Espera, reloj y fabrica de observadores.
 * @returns La observacion, con su funcion de limpieza.
 */
export function observarTamano(
  elemento: HTMLElement,
  alRedibujar: (tamano: TamanoMapa) => void,
  opciones: OpcionesObservacion = {},
): Observacion {
  const espera = antirrebote(
    () => {
      alRedibujar({ ancho: elemento.clientWidth, alto: elemento.clientHeight });
    },
    opciones.antirreboteMs ?? ANTIRREBOTE_MS,
    opciones.reloj ?? RELOJ_DEL_ENTORNO,
  );

  const fabrica = opciones.fabrica ?? fabricaDelEntorno;
  const observador = fabrica(() => {
    espera.disparar();
  });

  if (observador === null) {
    return {
      activa: false,
      pendiente: (): boolean => false,
      detener: (): void => {
        espera.cancelar();
      },
    };
  }

  observador.observe(elemento);

  return {
    activa: true,
    pendiente: (): boolean => espera.pendiente(),
    detener: (): void => {
      espera.cancelar();
      observador.disconnect();
    },
  };
}
