/**
 * Constelacion dedicada "Obsidian": el guino a la Kawasaki Z650 de KawaValen
 * dibujado sobre el Mapa_Estelar en dorado.
 *
 * No es una constelacion de la IAU, es una figura inventada para el regalo: una
 * lista ordenada de nombres de Estrella del Catalogo_Estelar y los Segmentos
 * que las unen. El modulo se divide en dos mitades que no se mezclan:
 *
 * - **Seleccion**, pura: {@link resolverObsidian} recibe el Cielo_Calculado y
 *   el interruptor de los Guinos_Personales y devuelve la {@link FiguraObsidian}
 *   con los segmentos ya en coordenadas de pantalla y el rotulo colocado. No
 *   toca el DOM ni el lienzo, asi que la Propiedad 29 puede comprobar el
 *   bicondicional del Requisito 6.9 sin navegador.
 * - **Trazo**, con lienzo: {@link dibujarObsidian} pinta lo que la mitad pura ya
 *   decidio y no vuelve a decidir nada.
 *
 * Requisito 6.4: la figura se traza con entre 4 y 9 Segmentos sobre Estrellas
 * del Catalogo_Estelar con altitud mayor o igual a 0 grados en el
 * Instante_Graduacion, en color dorado y rotulada "Obsidian".
 *
 * Requisito 6.9: si menos de 5 de sus Estrellas tienen altitud mayor o igual a
 * 0 grados, la figura **y su rotulo** se omiten. La omision es silenciosa: no
 * hay excepciones, ni mensajes, ni banderas de error; el resto del cielo lo
 * dibujan las demas capas del mapa, que este modulo no toca.
 *
 * El color llega por parametro. `CanvasRenderingContext2D` no resuelve
 * `var(--linea-obsidian)`, asi que quien monta el mapa lee el token con
 * `getComputedStyle` y pasa el color ya resuelto, igual que hacen las otras
 * capas del lienzo.
 *
 * ## Seleccion de estrellas: valor marcador
 *
 * La lista de {@link ESTRELLAS_OBSIDIAN} es **provisional**. La definitiva la
 * fija la tarea 19.4, que depende del autor del regalo y del
 * Instante_Graduacion confirmado.
 *
 * Criterio de la provisional, para que la figura se dibuje de verdad mientras
 * llega la definitiva: el gancho de Escorpio, ocho estrellas reales del
 * catalogo generado a partir de HYG v3, todas sobre el horizonte de Neiva
 * (latitud 2.9484, longitud -75.2795) en el instante marcador
 * 2026-07-31T18:00:00-05:00, con altitudes entre 28 y 58 grados. Se lee como el
 * perfil de una moto: el manillar en Dschubba, el motor en Antares, el chasis
 * bajando por Larawag hasta Sargas y el escape remontando por Iota-1 y Kappa
 * hasta la punta de Lesath y Shaula. Son estrellas brillantes (magnitud
 * aparente entre 1.06 y 2.99), asi que la figura queda legible y ninguna cae
 * por debajo del corte de dibujo del Requisito 4.1.
 */

import { ALTITUD_HORIZONTE } from '../../nucleo/astronomia/motor.js';
import type {
  CieloCalculado,
  EstrellaCalculada,
  Punto,
  SegmentoVisible,
} from '../../nucleo/astronomia/modelo.js';
import type { Segmento } from '../../nucleo/catalogo/modelo.js';

/** Rotulo de la figura (Requisito 6.4). */
export const ROTULO_OBSIDIAN = 'Obsidian';

/**
 * Cantidad minima de Estrellas de la figura sobre el horizonte para dibujarla
 * (Requisito 6.9). Por debajo se omiten figura y rotulo.
 */
export const MIN_ESTRELLAS_SOBRE_HORIZONTE = 5;

/** Cantidad minima de Segmentos que puede declarar la figura (Requisito 6.4). */
export const MIN_SEGMENTOS = 4;

/** Cantidad maxima de Segmentos que puede declarar la figura (Requisito 6.4). */
export const MAX_SEGMENTOS = 9;

/**
 * Grosor del trazo dorado, en pixeles. Queda dentro del rango 0.5-1.5 px que el
 * Requisito 4.3 exige a las lineas de constelacion y algo por encima del 1.0 px
 * de las lineas comunes, para que la figura dedicada se distinga sin gritar.
 */
export const GROSOR_TRAZO = 1.4;

/** Cuerpo del rotulo, en pixeles; el minimo exigido a las etiquetas es 11 px. */
export const TAMANO_ROTULO_PX = 12;

/**
 * Familia del rotulo. Reproduce el valor de `--familia-ui` con su generica
 * `sans-serif` de respaldo (Requisito 6.7), escrita en claro porque el lienzo no
 * resuelve variables de CSS.
 */
export const FAMILIA_ROTULO = "'Inter', system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";

/** Fuente completa del rotulo, lista para `contexto.font`. */
export const FUENTE_ROTULO = `${String(TAMANO_ROTULO_PX)}px ${FAMILIA_ROTULO}`;

/** Separacion entre el rotulo y la estrella mas alta de la figura, en pixeles. */
export const SEPARACION_ROTULO = 10;

/**
 * Estrellas de la figura, en orden de recorrido. **Valor marcador**: la
 * seleccion definitiva la fija la tarea 19.4. Los nombres son los que publica
 * `public/datos/catalogo-estelar.json`, con la precedencia nombre propio ->
 * designacion Bayer -> Flamsteed -> `HIP <n>`.
 */
export const ESTRELLAS_OBSIDIAN: readonly string[] = [
  'Dschubba',
  'Antares',
  'Larawag',
  'Sargas',
  'Iota-1 Sco',
  'Kappa Sco',
  'Lesath',
  'Shaula',
];

/**
 * Segmentos de la figura: siete, dentro del rango 4-9 del Requisito 6.4. Trazan
 * un camino simple por las ocho estrellas, sin bifurcaciones ni cierres.
 */
export const SEGMENTOS_OBSIDIAN: readonly Segmento[] = [
  { desde: 'Dschubba', hasta: 'Antares' },
  { desde: 'Antares', hasta: 'Larawag' },
  { desde: 'Larawag', hasta: 'Sargas' },
  { desde: 'Sargas', hasta: 'Iota-1 Sco' },
  { desde: 'Iota-1 Sco', hasta: 'Kappa Sco' },
  { desde: 'Kappa Sco', hasta: 'Lesath' },
  { desde: 'Lesath', hasta: 'Shaula' },
];

/** Rotulo colocado de la figura. */
export interface RotuloObsidian {
  readonly texto: string;
  readonly punto: Punto;
}

/**
 * Resultado de la seleccion, listo para dibujar.
 *
 * Invariantes:
 * - `dibujable === (sobreHorizonte >= 5)` cuando los Guinos_Personales estan
 *   activados y hay cielo; con los guinos desactivados o sin cielo,
 *   `dibujable === false` (Requisitos 6.8 y 6.9).
 * - `rotulo === null` exactamente cuando `dibujable === false`: figura y rotulo
 *   aparecen y desaparecen juntos (Requisito 6.9).
 * - `segmentos` esta vacio cuando `dibujable === false`, y cuando es verdadero
 *   contiene solo los Segmentos declarados con sus **dos** extremos sobre el
 *   horizonte, en el orden de {@link SEGMENTOS_OBSIDIAN}.
 */
export interface FiguraObsidian {
  readonly dibujable: boolean;
  /** Cuantas Estrellas de la figura tienen altitud mayor o igual a 0 grados. */
  readonly sobreHorizonte: number;
  readonly segmentos: readonly SegmentoVisible[];
  readonly rotulo: RotuloObsidian | null;
}

/** Figura ausente: ni trazo ni rotulo, y ningun aviso. */
const FIGURA_OMITIDA: FiguraObsidian = {
  dibujable: false,
  sobreHorizonte: 0,
  segmentos: [],
  rotulo: null,
};

/** Opciones de la seleccion. */
export interface OpcionesObsidian {
  /** Interruptor de los Guinos_Personales del Archivo_Configuracion (Req. 6.8). */
  readonly guinos: boolean;
  /** Estrellas de la figura; por omision las de {@link ESTRELLAS_OBSIDIAN}. */
  readonly estrellas?: readonly string[];
  /** Segmentos de la figura; por omision los de {@link SEGMENTOS_OBSIDIAN}. */
  readonly segmentos?: readonly Segmento[];
}

/**
 * Estrellas de la figura que estan sobre el horizonte, en el orden declarado.
 *
 * Una Estrella declarada que no exista en el Catalogo_Estelar simplemente no
 * cuenta: no se puede dibujar lo que no tiene coordenadas, y el recuento del
 * Requisito 6.9 se encarga del resto sin necesidad de un error aparte.
 *
 * @param cielo Cielo_Calculado del Instante_Graduacion.
 * @param nombres Nombres de las Estrellas de la figura.
 */
export function estrellasSobreHorizonte(
  cielo: CieloCalculado,
  nombres: readonly string[] = ESTRELLAS_OBSIDIAN,
): readonly EstrellaCalculada[] {
  const porNombre = new Map<string, EstrellaCalculada>();
  for (const calculada of cielo.estrellas) {
    porNombre.set(calculada.estrella.nombre, calculada);
  }

  // El recorrido lo fija el arreglo de nombres, no el `Map`, asi que el
  // resultado es una funcion de las entradas.
  const sobre: EstrellaCalculada[] = [];
  for (const nombre of nombres) {
    const calculada = porNombre.get(nombre);
    if (calculada === undefined) {
      continue;
    }
    if (calculada.horizontal.altitud >= ALTITUD_HORIZONTE) {
      sobre.push(calculada);
    }
  }
  return sobre;
}

/**
 * Decide si la figura se dibuja y, en tal caso, produce sus Segmentos en
 * coordenadas de pantalla y coloca su rotulo. Funcion pura.
 *
 * @param cielo Cielo_Calculado, o `null` en la ruta de respaldo del mapa.
 * @param opciones Interruptor de los guinos y, para pruebas, figura alternativa.
 * @returns La figura resuelta; {@link FiguraObsidian.dibujable} en `false`
 *          significa omision silenciosa.
 */
export function resolverObsidian(
  cielo: CieloCalculado | null,
  opciones: OpcionesObsidian,
): FiguraObsidian {
  // Requisito 6.8: con los guinos desactivados no hay figura. Sin cielo
  // tampoco: la ruta de respaldo del mapa no dibuja estrellas.
  if (!opciones.guinos || cielo === null) {
    return FIGURA_OMITIDA;
  }

  const nombres = opciones.estrellas ?? ESTRELLAS_OBSIDIAN;
  const declarados = opciones.segmentos ?? SEGMENTOS_OBSIDIAN;
  const sobre = estrellasSobreHorizonte(cielo, nombres);

  // Requisito 6.9: el bicondicional del dibujo depende solo del recuento de
  // estrellas sobre el horizonte.
  if (sobre.length < MIN_ESTRELLAS_SOBRE_HORIZONTE) {
    return { dibujable: false, sobreHorizonte: sobre.length, segmentos: [], rotulo: null };
  }

  const puntoPorNombre = new Map<string, Punto>();
  for (const calculada of sobre) {
    if (calculada.pantalla !== null) {
      puntoPorNombre.set(calculada.estrella.nombre, calculada.pantalla);
    }
  }

  const segmentos: SegmentoVisible[] = [];
  for (const segmento of declarados) {
    const a = puntoPorNombre.get(segmento.desde);
    const b = puntoPorNombre.get(segmento.hasta);
    // Igual que las lineas comunes (Requisito 4.15): un segmento con un extremo
    // bajo el horizonte no se traza, aunque la figura si se dibuje.
    if (a === undefined || b === undefined) {
      continue;
    }
    segmentos.push({ a, b });
  }

  return {
    dibujable: true,
    sobreHorizonte: sobre.length,
    segmentos,
    rotulo: { texto: ROTULO_OBSIDIAN, punto: anclaRotulo(puntoPorNombre.values()) },
  };
}

/**
 * Ancla del rotulo: encima de la estrella mas alta de la figura, que es la de
 * menor `y` en pantalla. Ante empate manda la primera en el orden declarado, de
 * modo que la posicion no depende del recorrido de ninguna estructura
 * asociativa.
 */
function anclaRotulo(puntos: Iterable<Punto>): Punto {
  let mejor: Punto | null = null;
  for (const punto of puntos) {
    if (mejor === null || punto.y < mejor.y) {
      mejor = punto;
    }
  }
  if (mejor === null) {
    // Inalcanzable: hay al menos cinco estrellas sobre el horizonte y toda
    // estrella visible tiene coordenadas de pantalla. Se responde con el origen
    // antes que con una excepcion, porque el Requisito 6.9 pide silencio.
    return { x: 0, y: 0 };
  }
  return { x: mejor.x, y: mejor.y - SEPARACION_ROTULO };
}

/** Colores y trazo del dibujo; el lienzo no resuelve `var(--...)`. */
export interface EstiloObsidian {
  /** Color del trazo, ya resuelto desde `--linea-obsidian`. */
  readonly color: string;
  /**
   * Color del rotulo, ya resuelto desde `--texto-etiqueta-mapa`. Por omision el
   * del trazo; se declara aparte porque el rotulo **es texto** y el Requisito
   * 6.2 le exige 4.5:1 contra el fondo, mientras el trazo es decorativo.
   */
  readonly colorRotulo?: string;
  /** Grosor del trazo; por omision {@link GROSOR_TRAZO}. */
  readonly grosor?: number;
  /** Fuente del rotulo; por omision {@link FUENTE_ROTULO}. */
  readonly fuente?: string;
}

/**
 * Traza la figura y su rotulo en dorado sobre el lienzo del Mapa_Estelar.
 *
 * No decide nada: si la figura no es dibujable no toca el contexto y devuelve
 * `false`, sin lanzar ni registrar nada (Requisito 6.9). El estado del contexto
 * se restaura al salir, de modo que las capas siguientes del mapa no heredan el
 * color ni el grosor de la figura.
 *
 * @param contexto Contexto 2D del Mapa_Estelar, ya escalado a pixeles de CSS.
 * @param figura Figura resuelta por {@link resolverObsidian}.
 * @param estilo Colores resueltos y trazo.
 * @returns `true` si se dibujo algo.
 */
export function dibujarObsidian(
  contexto: CanvasRenderingContext2D,
  figura: FiguraObsidian,
  estilo: EstiloObsidian,
): boolean {
  if (!figura.dibujable || figura.rotulo === null) {
    return false;
  }

  contexto.save();

  if (figura.segmentos.length > 0) {
    contexto.strokeStyle = estilo.color;
    contexto.lineWidth = estilo.grosor ?? GROSOR_TRAZO;
    contexto.lineCap = 'round';
    contexto.lineJoin = 'round';
    contexto.beginPath();
    for (const { a, b } of figura.segmentos) {
      contexto.moveTo(a.x, a.y);
      contexto.lineTo(b.x, b.y);
    }
    contexto.stroke();
  }

  contexto.fillStyle = estilo.colorRotulo ?? estilo.color;
  contexto.font = estilo.fuente ?? FUENTE_ROTULO;
  contexto.textAlign = 'center';
  contexto.textBaseline = 'bottom';
  contexto.fillText(figura.rotulo.texto, figura.rotulo.punto.x, figura.rotulo.punto.y);

  contexto.restore();
  return true;
}

/**
 * Comprueba la figura declarada contra el Requisito 6.4. Existe para que la
 * lista marcador -y la definitiva de la tarea 19.4- no puedan quedar mal
 * formadas sin que una prueba lo note.
 *
 * @returns Los defectos encontrados; vacio significa figura bien formada.
 */
export function problemasDeclaracion(
  estrellas: readonly string[] = ESTRELLAS_OBSIDIAN,
  segmentos: readonly Segmento[] = SEGMENTOS_OBSIDIAN,
): readonly string[] {
  const problemas: string[] = [];

  if (segmentos.length < MIN_SEGMENTOS || segmentos.length > MAX_SEGMENTOS) {
    problemas.push(
      `se declararon ${String(segmentos.length)} segmentos, fuera del rango ${String(MIN_SEGMENTOS)}-${String(MAX_SEGMENTOS)}`,
    );
  }

  const declaradas = new Set<string>();
  for (const nombre of estrellas) {
    if (nombre.trim().length === 0) {
      problemas.push('hay un nombre de estrella vacio');
      continue;
    }
    if (declaradas.has(nombre)) {
      problemas.push(`estrella repetida: ${nombre}`);
      continue;
    }
    declaradas.add(nombre);
  }

  if (declaradas.size < MIN_ESTRELLAS_SOBRE_HORIZONTE) {
    problemas.push(
      `se declararon ${String(declaradas.size)} estrellas distintas, menos de las ${String(MIN_ESTRELLAS_SOBRE_HORIZONTE)} que exige el Requisito 6.9 para poder dibujar`,
    );
  }

  const vistos = new Set<string>();
  for (const { desde, hasta } of segmentos) {
    if (!declaradas.has(desde) || !declaradas.has(hasta)) {
      problemas.push(`segmento con extremo no declarado: ${desde} - ${hasta}`);
      continue;
    }
    if (desde === hasta) {
      problemas.push(`segmento degenerado: ${desde}`);
      continue;
    }
    const llave = desde < hasta ? `${desde}\u0000${hasta}` : `${hasta}\u0000${desde}`;
    if (vistos.has(llave)) {
      problemas.push(`segmento repetido: ${desde} - ${hasta}`);
      continue;
    }
    vistos.add(llave);
  }

  return problemas;
}
