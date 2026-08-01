/**
 * Etiquetas de las estrellas brillantes del Mapa_Estelar: seleccion, medida y
 * colocacion voraz sin solapamiento.
 *
 * Requisito 4.4: se muestra el nombre de las Estrellas con magnitud aparente
 * menor o igual a 1.5, con un tamano de fuente minimo de 11 px, un maximo de 30
 * etiquetas simultaneas y sin superposicion entre etiquetas; si dos se
 * superponen se oculta la de mayor magnitud aparente.
 *
 * ## Como se cumple el requisito
 *
 * - **Magnitud**: solo entran las estrellas visibles, con coordenada de
 *   pantalla, y magnitud menor o igual a {@link MAGNITUD_MAXIMA_ETIQUETA}.
 * - **Fuente**: {@link TAMANO_FUENTE_ETIQUETA} es 12 px, un pixel por encima
 *   del minimo exigido; coincide con `--cuerpo-etiqueta-mapa` de
 *   `src/estilos/tokens.css` (0.75rem = 12 px), de modo que el lienzo y el CSS
 *   no se contradicen.
 * - **Tope**: la colocacion se detiene al alcanzar {@link MAX_ETIQUETAS}.
 * - **Sin superposicion y cesion por magnitud**: se recorre de la estrella mas
 *   brillante a la mas debil y se descarta toda candidata cuya caja
 *   delimitadora se cruce con una ya colocada. Como el recorrido va en magnitud
 *   ascendente, la etiqueta que cede en un conflicto es siempre la de mayor
 *   magnitud aparente, que es exactamente la regla del requisito.
 *
 * ## Orden de entrada
 *
 * La entrada natural es la salida de `seleccionarDibujables` (`motor.ts`), que
 * ya devuelve las estrellas visibles ordenadas por magnitud ascendente y
 * desempatadas por posicion en el catalogo. {@link colocarEtiquetas} vuelve a
 * ordenar con **ese mismo criterio** (magnitud ascendente, desempate por
 * posicion en la entrada), asi que sobre la salida del motor el ordenamiento es
 * un no-operativo y el orden se conserva bit a bit. Se hace de todos modos para
 * que la garantia de cesion por magnitud del Requisito 4.4 sea una propiedad de
 * esta funcion y no una obligacion de quien la llama.
 *
 * ## Separacion entre el lienzo y la medida del texto (probar sin navegador)
 *
 * `measureText` solo existe en un contexto 2D, pero la colocacion voraz es
 * geometria pura. Por eso el modulo tiene dos piezas independientes:
 *
 * - {@link colocarEtiquetas}, funcion pura que recibe un {@link MedidorTexto},
 *   es decir cualquier `(texto: string) => number` que devuelva el ancho en
 *   pixeles. Sin DOM, sin reloj y sin azar.
 * - {@link medidorDeContexto}, la unica pieza que toca el lienzo: fija la fuente
 *   del contexto y envuelve `measureText`.
 *
 * Esa costura es la que necesita la Propiedad 19 del diseno («las etiquetas del
 * mapa nunca se superponen y ceden por magnitud», tarea 11.5): puede ejercitar
 * la colocacion con un medidor sintetico, por ejemplo
 * `(texto) => texto.length * 7`, sin montar un navegador.
 *
 * ## Geometria de cada etiqueta
 *
 * La etiqueta no se dibuja encima del disco de su estrella: se separa
 * {@link SEPARACION_ETIQUETA} pixeles del borde del disco, centrada en vertical
 * sobre la estrella. Se prueban dos posiciones, primero la del lado que mira al
 * centro del Circulo_Horizonte y luego la opuesta, y se prefiere la primera que
 * quede **dentro** del circulo y libre de solapes. Si ninguna de las dos cabe
 * dentro del circulo se acepta la primera libre de solapes aunque asome un poco
 * del disco del horizonte: es mejor que una estrella brillante junto al borde
 * pierda su nombre. El Requisito 4.4 no exige contencion, de modo que esta
 * preferencia es una decision de estetica, no de cumplimiento.
 *
 * Que haya dos posiciones no debilita la regla del requisito: un choque en un
 * lado hace probar el otro, y solo cuando **ninguno** de los dos queda libre se
 * descarta la etiqueta, que por el orden del recorrido es siempre la de mayor
 * magnitud aparente del conflicto.
 *
 * Quien dibuje debe usar `textAlign = ALINEACION_ETIQUETA` y
 * `textBaseline = LINEA_BASE_ETIQUETA`, porque el punto {@link EtiquetaColocada.ancla}
 * se calcula con esa alineacion.
 */

import type {
  CirculoHorizonte,
  EstrellaCalculada,
  Punto,
} from '../../nucleo/astronomia/modelo.js';

/** Magnitud aparente maxima que recibe etiqueta (Requisito 4.4). */
export const MAGNITUD_MAXIMA_ETIQUETA = 1.5;

/** Numero maximo de etiquetas simultaneas (Requisito 4.4). */
export const MAX_ETIQUETAS = 30;

/** Tamano de fuente minimo que admite el Requisito 4.4, en pixeles. */
export const TAMANO_FUENTE_MINIMO = 11;

/**
 * Tamano de fuente de las etiquetas, en pixeles. Doce da un pixel de margen
 * sobre el minimo del requisito y coincide con `--cuerpo-etiqueta-mapa`.
 */
export const TAMANO_FUENTE_ETIQUETA = 12;

/** Familia tipografica de la interfaz, copiada de `--familia-ui`. */
export const FAMILIA_ETIQUETA = "'Inter', system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";

/** Valor listo para asignar a `contexto.font`. */
export const FUENTE_ETIQUETA = `${String(TAMANO_FUENTE_ETIQUETA)}px ${FAMILIA_ETIQUETA}`;

/** Alineacion horizontal con la que se calcula {@link EtiquetaColocada.ancla}. */
export const ALINEACION_ETIQUETA = 'left';

/** Linea base con la que se calcula {@link EtiquetaColocada.ancla}. */
export const LINEA_BASE_ETIQUETA = 'middle';

/**
 * Alto de la caja de una etiqueta, en pixeles. El factor 1.2 es el alto de
 * linea habitual de una fuente de interfaz: con linea base `middle` la caja se
 * reparte a partes iguales arriba y abajo del punto de ancla.
 */
export const ALTO_ETIQUETA = TAMANO_FUENTE_ETIQUETA * 1.2;

/** Separacion entre el borde del disco de la estrella y el texto, en pixeles. */
export const SEPARACION_ETIQUETA = 4;

/**
 * Holgura anadida a cada lado de la caja delimitadora, en pixeles. Al estar en
 * las dos cajas de una comparacion, dos etiquetas colocadas quedan siempre a 4
 * px o mas de distancia y no se leen como una sola.
 */
export const RELLENO_ETIQUETA = 2;

/**
 * Mide el ancho de un texto en pixeles con la fuente de las etiquetas.
 *
 * En produccion lo produce {@link medidorDeContexto} a partir de `measureText`;
 * en pruebas basta una funcion sintetica, lo que permite comprobar la
 * colocacion sin navegador.
 */
export type MedidorTexto = (texto: string) => number;

/** Caja delimitadora alineada a los ejes, con origen en su esquina superior izquierda. */
export interface CajaEtiqueta {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

/** Etiqueta ya colocada y lista para dibujar. */
export interface EtiquetaColocada {
  /** Estrella etiquetada, con su nombre, constelacion y magnitud. */
  readonly estrella: EstrellaCalculada;
  /** Texto dibujado: el nombre de la estrella. */
  readonly texto: string;
  /**
   * Punto donde llamar a `fillText`, valido con `textAlign = 'left'` y
   * `textBaseline = 'middle'`.
   */
  readonly ancla: Punto;
  /** Caja delimitadora usada para resolver los solapes, con su holgura incluida. */
  readonly caja: CajaEtiqueta;
}

/** Candidata a dibujo junto con su posicion en la entrada, para el desempate. */
interface Candidata {
  readonly posicion: number;
  readonly calculada: EstrellaCalculada;
  readonly pantalla: Punto;
}

/**
 * Indica si dos cajas delimitadoras se cruzan. El contacto por el borde no
 * cuenta como solape: dos cajas que solo comparten una arista no ocultan texto
 * la una de la otra.
 */
export function solapan(a: CajaEtiqueta, b: CajaEtiqueta): boolean {
  return (
    a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto
  );
}

/** Indica si una caja cabe por completo dentro del Circulo_Horizonte. */
export function dentroDelCirculo(caja: CajaEtiqueta, circulo: CirculoHorizonte): boolean {
  const esquinas: readonly Punto[] = [
    { x: caja.x, y: caja.y },
    { x: caja.x + caja.ancho, y: caja.y },
    { x: caja.x, y: caja.y + caja.alto },
    { x: caja.x + caja.ancho, y: caja.y + caja.alto },
  ];

  // Basta comprobar las cuatro esquinas: la caja es convexa y el disco tambien,
  // asi que si sus vertices estan dentro, todo el rectangulo lo esta.
  for (const esquina of esquinas) {
    const dx = esquina.x - circulo.cx;
    const dy = esquina.y - circulo.cy;
    if (dx * dx + dy * dy > circulo.radio * circulo.radio) {
      return false;
    }
  }
  return true;
}

/**
 * Coloca las etiquetas de las estrellas brillantes (Requisito 4.4).
 *
 * Funcion pura: el unico contacto con el lienzo es el {@link MedidorTexto} que
 * recibe, de modo que la colocacion se puede comprobar sin navegador.
 *
 * @param estrellas Estrellas calculadas, idealmente la salida de
 *   `seleccionarDibujables`. Se filtran las no visibles, las sin coordenada de
 *   pantalla y las de magnitud mayor que 1.5, y el resto se recorre en magnitud
 *   ascendente con desempate por posicion en la entrada.
 * @param circulo Circulo_Horizonte de destino, para preferir las posiciones que
 *   quedan dentro del disco.
 * @param medir Medidor de anchos de texto en pixeles.
 * @returns Las etiquetas colocadas, como maximo 30, en orden de magnitud
 *   ascendente y con cajas delimitadoras dos a dos disjuntas.
 */
export function colocarEtiquetas(
  estrellas: readonly EstrellaCalculada[],
  circulo: CirculoHorizonte,
  medir: MedidorTexto,
): readonly EtiquetaColocada[] {
  const candidatas = candidatasOrdenadas(estrellas);
  const colocadas: EtiquetaColocada[] = [];

  for (const candidata of candidatas) {
    if (colocadas.length >= MAX_ETIQUETAS) {
      break;
    }

    const etiqueta = colocarUna(candidata, circulo, medir, colocadas);
    if (etiqueta !== null) {
      colocadas.push(etiqueta);
    }
  }

  return colocadas;
}

/**
 * Medidor apoyado en el contexto 2D del lienzo. Fija la fuente en cada medida,
 * porque cualquier otra capa del mapa pudo haber cambiado `contexto.font` entre
 * dos llamadas.
 *
 * @param contexto Contexto 2D del lienzo del mapa.
 * @param fuente Valor de `contexto.font`; por omision el de las etiquetas.
 */
export function medidorDeContexto(
  contexto: CanvasRenderingContext2D,
  fuente: string = FUENTE_ETIQUETA,
): MedidorTexto {
  return (texto: string): number => {
    contexto.font = fuente;
    return contexto.measureText(texto).width;
  };
}

/**
 * Filtra y ordena las candidatas a etiqueta.
 *
 * El comparador es el mismo de `seleccionarDibujables`: magnitud ascendente y
 * desempate por posicion en la entrada. Sobre la salida del motor no altera
 * nada; sobre una entrada en cualquier otro orden restablece el recorrido de
 * mas brillante a mas debil que exige el Requisito 4.4.
 */
function candidatasOrdenadas(estrellas: readonly EstrellaCalculada[]): readonly Candidata[] {
  const candidatas: Candidata[] = [];

  for (let posicion = 0; posicion < estrellas.length; posicion += 1) {
    const calculada = estrellas[posicion];
    if (calculada === undefined || !calculada.visible || calculada.pantalla === null) {
      continue;
    }
    if (!(calculada.estrella.magnitud <= MAGNITUD_MAXIMA_ETIQUETA)) {
      continue;
    }
    candidatas.push({ posicion, calculada, pantalla: calculada.pantalla });
  }

  candidatas.sort((a, b) => {
    const porMagnitud = a.calculada.estrella.magnitud - b.calculada.estrella.magnitud;
    return porMagnitud !== 0 ? porMagnitud : a.posicion - b.posicion;
  });

  return candidatas;
}

/**
 * Intenta colocar la etiqueta de una candidata.
 *
 * @returns La etiqueta, o `null` si el texto no mide nada util o si las dos
 *   posiciones posibles chocan con una etiqueta ya colocada.
 */
function colocarUna(
  candidata: Candidata,
  circulo: CirculoHorizonte,
  medir: MedidorTexto,
  colocadas: readonly EtiquetaColocada[],
): EtiquetaColocada | null {
  const texto = candidata.calculada.estrella.nombre;
  const ancho = medir(texto);
  if (!Number.isFinite(ancho) || ancho <= 0) {
    return null;
  }

  const posibles = posicionesPosibles(candidata, ancho, circulo);
  const libres = posibles.filter((posible) => !colocadas.some((otra) => solapan(posible.caja, otra.caja)));

  const dentro = libres.find((libre) => dentroDelCirculo(libre.caja, circulo));
  const elegida = dentro ?? libres[0];
  if (elegida === undefined) {
    return null;
  }

  return { estrella: candidata.calculada, texto, ancla: elegida.ancla, caja: elegida.caja };
}

/**
 * Las dos posiciones candidatas de una etiqueta, primero la del lado que mira
 * al centro del Circulo_Horizonte, que es la que tiene mas probabilidad de
 * caber dentro del disco.
 */
function posicionesPosibles(
  candidata: Candidata,
  ancho: number,
  circulo: CirculoHorizonte,
): readonly { readonly ancla: Punto; readonly caja: CajaEtiqueta }[] {
  const separacion = candidata.calculada.radio + SEPARACION_ETIQUETA;
  const derecha = posicionLateral(candidata.pantalla, ancho, separacion, 'derecha');
  const izquierda = posicionLateral(candidata.pantalla, ancho, separacion, 'izquierda');

  return candidata.pantalla.x > circulo.cx ? [izquierda, derecha] : [derecha, izquierda];
}

/** Posicion de la etiqueta a un lado de la estrella, centrada en vertical. */
function posicionLateral(
  pantalla: Punto,
  ancho: number,
  separacion: number,
  lado: 'derecha' | 'izquierda',
): { readonly ancla: Punto; readonly caja: CajaEtiqueta } {
  const x = lado === 'derecha' ? pantalla.x + separacion : pantalla.x - separacion - ancho;

  return {
    ancla: { x, y: pantalla.y },
    caja: {
      x: x - RELLENO_ETIQUETA,
      y: pantalla.y - ALTO_ETIQUETA / 2 - RELLENO_ETIQUETA,
      ancho: ancho + 2 * RELLENO_ETIQUETA,
      alto: ALTO_ETIQUETA + 2 * RELLENO_ETIQUETA,
    },
  };
}
