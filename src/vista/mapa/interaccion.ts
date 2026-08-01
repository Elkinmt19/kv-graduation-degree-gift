/**
 * Interaccion del Mapa_Estelar con el puntero: que Estrella esta senalada y
 * que ficha se muestra.
 *
 * Requisitos que cubre:
 * - 4.5: senalar una Estrella con el cursor, o tocarla en pantalla tactil,
 *   dentro de un radio de deteccion minimo de 12 px alrededor de su centro,
 *   muestra en un maximo de 150 ms su nombre, su constelacion y su magnitud
 *   aparente con un decimal.
 * - 4.14: retirar el cursor de la Estrella senalada, o tocar un punto sin
 *   Estrella dentro del radio, oculta la informacion en un maximo de 150 ms y
 *   deja el cielo dibujado sin cambios.
 *
 * ## Como se reparte el modulo
 *
 * La geometria es pura y vive arriba: {@link construirRejilla} indexa las
 * Estrellas dibujadas en una rejilla uniforme de celdas de 16 px y
 * {@link resolverImpacto} devuelve la mas cercana al punto senalado dentro del
 * radio, o `null`. Ninguna de las dos toca el DOM, lee el reloj ni consulta
 * `window`, de modo que la Propiedad 20 puede ejercitarlas sin navegador.
 *
 * El cableado del DOM vive abajo, en {@link montarInteraccion}, y recibe por
 * parametro todo lo que depende del entorno: el programador de fotogramas, la
 * consulta de medios del puntero grueso y la conversion de coordenadas del
 * evento. jsdom no tiene eventos de puntero reales ni disposicion, asi que sin
 * esa costura la parte de comportamiento no seria comprobable.
 *
 * ## Por que una rejilla y por que de 16 px
 *
 * El mapa dibuja hasta 3000 Estrellas (Requisito 4.1) y `pointermove` llega
 * decenas de veces por segundo: recorrer las 3000 en cada aviso desperdicia
 * trabajo. Con celdas de 16 px basta consultar la celda del punto y sus ocho
 * vecinas, porque el radio de deteccion (12 px, 14 px en punteros gruesos)
 * nunca supera el lado de la celda: si la distancia en un eje no pasa de 14 px
 * y la celda mide 16 px, el indice de celda no puede diferir en mas de uno. El
 * barrido se calcula igualmente como `ceil(radio / tamanoCelda)` para que la
 * correccion no dependa de que esas constantes no cambien; con las del diseno
 * el resultado son exactamente las 9 celdas vecinas.
 *
 * ## Frontera del radio y desempates
 *
 * El radio es un intervalo **cerrado**: una Estrella a exactamente 12.0 px del
 * punto cuenta como senalada, porque el Requisito 4.5 habla de un radio de
 * deteccion *minimo* de 12 px y excluir la igualdad lo reduciria. Entre dos
 * Estrellas a la misma distancia gana la de posicion menor en el arreglo que
 * se indexo, es decir la mas brillante cuando el arreglo viene de
 * `seleccionarDibujables`. El desempate se hace comparando el par
 * `(distancia, indice)` y no por el orden en que se recorren las celdas, de
 * modo que el resultado no depende de la geometria de la rejilla.
 *
 * ## El cielo no se redibuja
 *
 * La ficha es un elemento del DOM superpuesto al lienzo, no pintura sobre el
 * lienzo. Mostrarla u ocultarla no invoca ninguna operacion de dibujo, que es
 * justo lo que exige el Requisito 4.14 al pedir que el cielo quede sin cambios.
 */

import type { ConsultaMedios } from '../../infra/movimiento-reducido.js';
import type { EstrellaCalculada, Punto } from '../../nucleo/astronomia/modelo.js';
import type { Estrella } from '../../nucleo/catalogo/modelo.js';

/** Lado de las celdas de la rejilla de indexado, en pixeles (diseno, seccion 5). */
export const TAMANO_CELDA = 16;

/** Radio de deteccion con puntero fino, en pixeles (Requisito 4.5). */
export const RADIO_DETECCION = 12;

/** Radio de deteccion con puntero grueso (dedo o lapiz), en pixeles. */
export const RADIO_DETECCION_GRUESO = 14;

/** Presupuesto de respuesta para mostrar u ocultar la ficha (Requisitos 4.5, 4.14). */
export const PRESUPUESTO_RESPUESTA_MS = 150;

/** Consulta de medios que declara un puntero grueso. */
export const CONSULTA_PUNTERO_GRUESO = '(pointer: coarse)';

/** Tipos de puntero que se consideran gruesos cuando el evento los declara. */
export const TIPOS_PUNTERO_GRUESO: readonly string[] = ['touch', 'pen'];

/** Rotulo que precede a la magnitud en la ficha, para que el numero se entienda. */
export const ETIQUETA_MAGNITUD = 'Magnitud';

/** Rotulo accesible de la ficha de la Estrella senalada. */
export const ETIQUETA_FICHA = 'Estrella senalada';

/**
 * Clases que la ficha escribe en el DOM. Se exportan igual que `CLASES_PORTAL`
 * y `CLASES_CARTA`: el DOM es la fuente de verdad y `src/estilos/mapa.css`
 * apunta exactamente a estas clases.
 */
export const CLASES_FICHA = {
  ficha: 'mapa__ficha',
  nombre: 'mapa__ficha-nombre',
  constelacion: 'mapa__ficha-constelacion',
  magnitud: 'mapa__ficha-magnitud',
} as const;

/** Estrella dibujada que puede senalarse, con su centro ya resuelto. */
export interface EstrellaSenalable {
  /** Posicion en el arreglo indexado; fija el desempate entre distancias iguales. */
  readonly indice: number;
  /** Estrella calculada, siempre con `pantalla !== null`. */
  readonly calculada: EstrellaCalculada;
  /** Centro de dibujo en pixeles de CSS, copiado de `estrella.pantalla`. */
  readonly centro: Punto;
}

/**
 * Indice espacial de las Estrellas senalables.
 *
 * Invariantes: `tamanoCelda > 0`; toda `EstrellaSenalable` de `senalables`
 * tiene centro finito y aparece en exactamente una celda; las claves de
 * `celdas` solo se consultan con `get`, nunca se recorren, de modo que el
 * resultado no depende del orden de insercion del `Map`.
 */
export interface RejillaEstrellas {
  readonly tamanoCelda: number;
  readonly senalables: readonly EstrellaSenalable[];
  readonly celdas: ReadonlyMap<string, readonly number[]>;
}

/** Estrella senalada y su distancia al punto, en pixeles. */
export interface Impacto {
  readonly senalable: EstrellaSenalable;
  readonly distancia: number;
}

/** Los tres datos que muestra la ficha (Requisito 4.5). */
export interface FichaEstrella {
  readonly nombre: string;
  readonly constelacion: string;
  /** Magnitud aparente con exactamente un decimal. */
  readonly magnitud: string;
}

/** Lado de celda utilizable: cualquier valor absurdo cae en el del diseno. */
function celdaValida(tamanoCelda: number): number {
  return Number.isFinite(tamanoCelda) && tamanoCelda > 0 ? tamanoCelda : TAMANO_CELDA;
}

/** Clave de celda. Cadena y no numero para que dos ejes no se confundan. */
function clave(columna: number, fila: number): string {
  return `${String(columna)}:${String(fila)}`;
}

/** Indice de celda de una coordenada. */
function celdaDe(coordenada: number, tamanoCelda: number): number {
  return Math.floor(coordenada / tamanoCelda);
}

/**
 * Indexa las Estrellas dibujadas en una rejilla uniforme.
 *
 * Solo entran las Estrellas con `pantalla !== null` y coordenadas finitas: una
 * Estrella que no se dibuja no puede senalarse, asi que tampoco debe poder
 * impactarse. Lo natural es pasarle el resultado de `seleccionarDibujables`,
 * que es exactamente el conjunto que el mapa pinta.
 *
 * Funcion pura. El orden de `senalables` es el del arreglo recibido, con los
 * descartes suprimidos.
 *
 * @param estrellas Estrellas calculadas, normalmente las dibujables.
 * @param tamanoCelda Lado de la celda en pixeles; por omision 16.
 * @returns La rejilla lista para {@link resolverImpacto}.
 */
export function construirRejilla(
  estrellas: readonly EstrellaCalculada[],
  tamanoCelda: number = TAMANO_CELDA,
): RejillaEstrellas {
  const lado = celdaValida(tamanoCelda);
  const senalables: EstrellaSenalable[] = [];
  const celdas = new Map<string, number[]>();

  for (const calculada of estrellas) {
    const centro = calculada.pantalla;
    if (centro === null || !Number.isFinite(centro.x) || !Number.isFinite(centro.y)) {
      continue;
    }

    const indice = senalables.length;
    senalables.push({ indice, calculada, centro });

    const llave = clave(celdaDe(centro.x, lado), celdaDe(centro.y, lado));
    const cubo = celdas.get(llave);
    if (cubo === undefined) {
      celdas.set(llave, [indice]);
    } else {
      cubo.push(indice);
    }
  }

  return { tamanoCelda: lado, senalables, celdas };
}

/**
 * Resuelve el impacto de un punto senalado sobre la rejilla.
 *
 * Consulta la celda del punto y sus vecinas hasta `ceil(radio / tamanoCelda)`
 * de distancia en indices de celda (con los numeros del diseno, las 9 celdas
 * vecinas) y devuelve la Estrella mas cercana cuya distancia al punto no
 * supera `radio`, o `null` si no hay ninguna.
 *
 * Funcion pura y total: un punto con coordenadas no finitas, o un radio no
 * finito o negativo, devuelven `null` en lugar de lanzar.
 *
 * @param rejilla Indice construido por {@link construirRejilla}.
 * @param punto Punto senalado, en pixeles de CSS y en el sistema del lienzo.
 * @param radio Radio de deteccion en pixeles; por omision 12.
 * @returns El impacto mas cercano, con la igualdad incluida, o `null`.
 */
export function resolverImpacto(
  rejilla: RejillaEstrellas,
  punto: Punto,
  radio: number = RADIO_DETECCION,
): Impacto | null {
  if (!Number.isFinite(punto.x) || !Number.isFinite(punto.y)) {
    return null;
  }
  if (!Number.isFinite(radio) || radio < 0) {
    return null;
  }

  const lado = rejilla.tamanoCelda;
  const columna = celdaDe(punto.x, lado);
  const fila = celdaDe(punto.y, lado);
  const barrido = Math.ceil(radio / lado);
  // Se compara el cuadrado de la distancia para no calcular raices dentro del
  // bucle; el radio se eleva al cuadrado una sola vez.
  const radioCuadrado = radio * radio;

  let mejor: EstrellaSenalable | null = null;
  let mejorCuadrado = Number.POSITIVE_INFINITY;

  for (let dy = -barrido; dy <= barrido; dy += 1) {
    for (let dx = -barrido; dx <= barrido; dx += 1) {
      const cubo = rejilla.celdas.get(clave(columna + dx, fila + dy));
      if (cubo === undefined) {
        continue;
      }

      for (const indice of cubo) {
        const senalable = rejilla.senalables[indice];
        if (senalable === undefined) {
          continue;
        }

        const distanciaX = senalable.centro.x - punto.x;
        const distanciaY = senalable.centro.y - punto.y;
        const cuadrado = distanciaX * distanciaX + distanciaY * distanciaY;
        if (cuadrado > radioCuadrado) {
          continue;
        }

        // Desempate por posicion en el arreglo indexado, no por orden de
        // recorrido de las celdas: asi el resultado no depende de la rejilla.
        const gana =
          mejor === null ||
          cuadrado < mejorCuadrado ||
          (cuadrado === mejorCuadrado && senalable.indice < mejor.indice);
        if (gana) {
          mejor = senalable;
          mejorCuadrado = cuadrado;
        }
      }
    }
  }

  return mejor === null ? null : { senalable: mejor, distancia: Math.sqrt(mejorCuadrado) };
}

/**
 * Radio de deteccion segun el grosor del puntero.
 *
 * @param grueso Verdadero para dedo o lapiz, que apuntan con menos precision.
 */
export function radioDeteccion(grueso: boolean): number {
  return grueso ? RADIO_DETECCION_GRUESO : RADIO_DETECCION;
}

/** Indica si el `pointerType` de un evento describe un puntero grueso. */
export function punteroGruesoPorTipo(tipo: string | undefined): boolean {
  return tipo !== undefined && TIPOS_PUNTERO_GRUESO.includes(tipo);
}

/**
 * Consulta `(pointer: coarse)` del navegador, o `null` cuando `matchMedia` no
 * esta disponible. Es el unico punto del modulo que interroga al entorno.
 */
export function consultaPunteroDelNavegador(): ConsultaMedios | null {
  try {
    const coincidir = globalThis.matchMedia;
    return typeof coincidir === 'function'
      ? coincidir.call(globalThis, CONSULTA_PUNTERO_GRUESO)
      : null;
  } catch {
    return null;
  }
}

/**
 * Magnitud aparente con exactamente un decimal (Requisito 4.5).
 *
 * `toFixed(1)` produce siempre un decimal, tambien en enteros. El caso `-0.0`,
 * que aparece con magnitudes en (-0.05, 0), se normaliza a `0.0`: mostrar un
 * cero negativo no informa de nada y sigue teniendo un decimal. Una magnitud
 * no finita se rotula con un guion, porque no hay numero que mostrar.
 */
export function formatearMagnitud(magnitud: number): string {
  if (!Number.isFinite(magnitud)) {
    return '—';
  }
  const texto = magnitud.toFixed(1);
  return texto === '-0.0' ? '0.0' : texto;
}

/**
 * Los tres datos de la ficha, ya en el formato en que se presentan.
 *
 * Funcion pura, de modo que la Propiedad 20 pueda comprobar el decimal sin
 * montar DOM.
 */
export function describirEstrella(estrella: Estrella): FichaEstrella {
  return {
    nombre: estrella.nombre,
    constelacion: estrella.constelacion,
    magnitud: formatearMagnitud(estrella.magnitud),
  };
}

/** Estado de presentacion de la ficha, publicado en `data-estado`. */
export type EstadoFicha = 'oculta' | 'visible';

/**
 * Programador de fotogramas minimo. En pruebas se sustituye por uno manual,
 * porque `requestAnimationFrame` no es controlable desde fuera.
 */
export interface ProgramadorFotograma {
  programar(accion: () => void): unknown;
  cancelar(identificador: unknown): void;
}

/**
 * Programador por omision: `requestAnimationFrame` cuando el entorno lo
 * ofrece, y un temporizador inmediato cuando no. Ambos agrupan la rafaga de
 * eventos en un solo trabajo, que es lo que mantiene la respuesta muy por
 * debajo de los 150 ms.
 */
export const FOTOGRAMA_DEL_ENTORNO: ProgramadorFotograma = {
  programar: (accion) => {
    const pedir = (globalThis as { requestAnimationFrame?: (cb: () => void) => number })
      .requestAnimationFrame;
    return typeof pedir === 'function'
      ? { animacion: pedir.call(globalThis, accion) }
      : { temporizador: setTimeout(accion, 0) };
  },
  cancelar: (identificador) => {
    const marca = identificador as { animacion?: number; temporizador?: unknown };
    if (marca.animacion !== undefined) {
      const cancelar = (globalThis as { cancelAnimationFrame?: (id: number) => void })
        .cancelAnimationFrame;
      if (typeof cancelar === 'function') {
        cancelar.call(globalThis, marca.animacion);
      }
      return;
    }
    if (marca.temporizador !== undefined) {
      clearTimeout(marca.temporizador as ReturnType<typeof setTimeout>);
    }
  },
};

/**
 * Evento de puntero minimo que necesita la interaccion. Se recorta a proposito:
 * jsdom no construye `PointerEvent`, asi que las pruebas despachan objetos con
 * estas tres propiedades.
 */
export interface EventoPuntero {
  readonly clientX?: number;
  readonly clientY?: number;
  readonly pointerType?: string;
}

/** Conversion del evento a coordenadas locales del lienzo, en pixeles de CSS. */
export type ConversorPunto = (evento: EventoPuntero, objetivo: Element) => Punto;

/**
 * Conversion por omision: resta la esquina de la caja del objetivo a las
 * coordenadas de ventana del evento. Depende de `getBoundingClientRect`, que en
 * jsdom devuelve ceros; de ahi que sea sustituible.
 */
export const CONVERSOR_POR_CAJA: ConversorPunto = (evento, objetivo) => {
  const caja = objetivo.getBoundingClientRect();
  return { x: (evento.clientX ?? 0) - caja.left, y: (evento.clientY ?? 0) - caja.top };
};

/** Como se monta la interaccion. Todo lo del entorno llega por aqui. */
export interface OpcionesInteraccion {
  /** Rejilla inicial; por omision una vacia, que no detecta nada. */
  readonly rejilla?: RejillaEstrellas;
  /** Contenedor de la ficha; por omision el padre del objetivo, o el objetivo. */
  readonly contenedor?: HTMLElement;
  /** Programador de fotogramas; por omision el del entorno. */
  readonly fotograma?: ProgramadorFotograma;
  /**
   * Consulta del puntero grueso a leer en cada resolucion; por omision la del
   * navegador. `null` desactiva la consulta y solo manda el `pointerType`.
   */
  readonly consultaPuntero?: ConsultaMedios | null;
  /** Conversion de coordenadas; por omision {@link CONVERSOR_POR_CAJA}. */
  readonly conversor?: ConversorPunto;
  /** Radio fijo en pixeles, por encima del grosor del puntero. */
  readonly radio?: number;
}

/** Asa devuelta por {@link montarInteraccion}. */
export interface InteraccionMontada {
  /** Ficha superpuesta al lienzo. Nunca se dibuja dentro del lienzo. */
  readonly ficha: HTMLElement;
  /** Estrella senalada ahora mismo, o `null`. */
  senalada(): EstrellaCalculada | null;
  /** Estado de presentacion actual, el mismo que publica `data-estado`. */
  estado(): EstadoFicha;
  /** Verdadero mientras haya un fotograma pendiente de resolver. */
  pendiente(): boolean;
  /** Reemplaza la rejilla tras un redibujo o un cambio de tamano. */
  actualizarRejilla(rejilla: RejillaEstrellas): void;
  /** Suelta las escuchas, cancela el fotograma pendiente y quita la ficha. */
  destruir(): void;
}

/** Rejilla vacia, util como valor inicial: no detecta ninguna Estrella. */
export function rejillaVacia(tamanoCelda: number = TAMANO_CELDA): RejillaEstrellas {
  return construirRejilla([], tamanoCelda);
}

/**
 * Conecta el puntero al Mapa_Estelar y mantiene la ficha de la Estrella
 * senalada (Requisitos 4.5 y 4.14).
 *
 * Los tres eventos que exige el diseno, `pointermove`, `pointerdown` y
 * `pointerleave`, no resuelven nada por si mismos: guardan la ultima intencion
 * y piden un fotograma si no hay uno pedido. Asi una rafaga de decenas de
 * avisos se resuelve una sola vez, y siempre con la posicion mas reciente.
 *
 * @param objetivo Elemento que recibe los eventos, normalmente el lienzo.
 * @param opciones Rejilla, contenedor y dependencias del entorno.
 */
export function montarInteraccion(
  objetivo: HTMLElement,
  opciones: OpcionesInteraccion = {},
): InteraccionMontada {
  const fotograma = opciones.fotograma ?? FOTOGRAMA_DEL_ENTORNO;
  const conversor = opciones.conversor ?? CONVERSOR_POR_CAJA;
  const consultaPuntero =
    opciones.consultaPuntero === undefined ? consultaPunteroDelNavegador() : opciones.consultaPuntero;
  const contenedor = opciones.contenedor ?? objetivo.parentElement ?? objetivo;

  let rejilla = opciones.rejilla ?? rejillaVacia();

  const ficha = document.createElement('div');
  ficha.className = CLASES_FICHA.ficha;
  // `role="status"` con `aria-live="polite"` hace que el cambio se anuncie sin
  // interrumpir; el rotulo nombra la region cuando aun no tiene texto.
  ficha.setAttribute('role', 'status');
  ficha.setAttribute('aria-live', 'polite');
  ficha.setAttribute('aria-label', ETIQUETA_FICHA);

  const nombre = document.createElement('span');
  nombre.className = CLASES_FICHA.nombre;
  const constelacion = document.createElement('span');
  constelacion.className = CLASES_FICHA.constelacion;
  const magnitud = document.createElement('span');
  magnitud.className = CLASES_FICHA.magnitud;
  ficha.append(nombre, constelacion, magnitud);

  contenedor.append(ficha);

  let estado: EstadoFicha = 'oculta';
  let senalada: EstrellaSenalable | null = null;
  let intencion: { readonly punto: Punto; readonly grueso: boolean } | null = null;
  let salida = false;
  let pedido: unknown = null;
  let destruido = false;

  const ocultar = (): void => {
    senalada = null;
    estado = 'oculta';
    ficha.hidden = true;
    ficha.dataset['estado'] = 'oculta';
    // Se limpia el texto para que un lector de pantalla no anuncie una Estrella
    // que ya no esta senalada.
    nombre.textContent = '';
    constelacion.textContent = '';
    magnitud.textContent = '';
  };

  const mostrar = (impacto: Impacto): void => {
    senalada = impacto.senalable;
    estado = 'visible';

    const datos = describirEstrella(impacto.senalable.calculada.estrella);
    nombre.textContent = datos.nombre;
    constelacion.textContent = datos.constelacion;
    magnitud.textContent = `${ETIQUETA_MAGNITUD} ${datos.magnitud}`;

    // La ficha se coloca junto al centro de la Estrella. Son pixeles de CSS del
    // mismo sistema en que se dibujo el cielo, no del lienzo de respaldo.
    ficha.style.left = `${String(impacto.senalable.centro.x)}px`;
    ficha.style.top = `${String(impacto.senalable.centro.y)}px`;

    ficha.hidden = false;
    ficha.dataset['estado'] = 'visible';
  };

  const resolver = (): void => {
    pedido = null;

    if (salida) {
      // Requisito 4.14: el cursor salio del mapa; la ficha se va con el.
      salida = false;
      intencion = null;
      ocultar();
      return;
    }

    const pendienteAhora = intencion;
    intencion = null;
    if (pendienteAhora === null) {
      return;
    }

    const grueso = pendienteAhora.grueso || consultaPuntero?.matches === true;
    const radio = opciones.radio ?? radioDeteccion(grueso);
    const impacto = resolverImpacto(rejilla, pendienteAhora.punto, radio);

    if (impacto === null) {
      // Requisito 4.14: vacio dentro del radio, nada que mostrar.
      ocultar();
      return;
    }
    mostrar(impacto);
  };

  const pedirFotograma = (): void => {
    if (destruido || pedido !== null) {
      return;
    }
    pedido = fotograma.programar(resolver);
  };

  const alSenalar = (evento: Event): void => {
    const puntero = evento as EventoPuntero;
    salida = false;
    intencion = {
      punto: conversor(puntero, objetivo),
      grueso: punteroGruesoPorTipo(puntero.pointerType),
    };
    pedirFotograma();
  };

  const alSalir = (): void => {
    salida = true;
    intencion = null;
    pedirFotograma();
  };

  objetivo.addEventListener('pointermove', alSenalar);
  objetivo.addEventListener('pointerdown', alSenalar);
  objetivo.addEventListener('pointerleave', alSalir);

  ocultar();

  return {
    ficha,
    senalada: (): EstrellaCalculada | null => senalada?.calculada ?? null,
    estado: (): EstadoFicha => estado,
    pendiente: (): boolean => pedido !== null,
    actualizarRejilla: (nueva: RejillaEstrellas): void => {
      rejilla = nueva;
      // La Estrella senalada pudo dejar de existir o cambiar de sitio: se
      // oculta la ficha y se espera el siguiente aviso del puntero.
      ocultar();
    },
    destruir: (): void => {
      if (destruido) {
        return;
      }
      destruido = true;
      objetivo.removeEventListener('pointermove', alSenalar);
      objetivo.removeEventListener('pointerdown', alSenalar);
      objetivo.removeEventListener('pointerleave', alSalir);
      if (pedido !== null) {
        fotograma.cancelar(pedido);
        pedido = null;
      }
      ficha.remove();
    },
  };
}
