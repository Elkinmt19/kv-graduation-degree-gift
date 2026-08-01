/**
 * Decoraciones personales: un guino por referencia (Michi, Guchi, sanjuanero,
 * Jeep Rubicon, física nuclear), como SVG en línea de trazo dorado.
 *
 * Igual que `obsidian.ts`, el modulo se divide en una mitad pura y una impura:
 *
 * - **Seleccion**, pura: {@link resolverDecoraciones} decide *cuales*
 *   decoraciones se muestran: todas con los Guinos_Personales activados,
 *   ninguna sin ellos (Requisito 6.8). No toca el DOM.
 * - **Montaje**, con DOM: {@link montarDecoraciones} monta lo que la mitad
 *   pura ya decidio. Con la lista vacia no crea ningun nodo, de modo que
 *   ninguna regla de disposicion reserva su espacio.
 *
 * Requisito 6.5: cada decoracion es un unico SVG en linea de trazo dorado
 * (`var(--linea-obsidian)`, el mismo token que traza la constelacion
 * Obsidian), de a lo sumo 96 px en su lado mayor, con `role="img"` y
 * `aria-label` que la nombra, en una banda propia de la rejilla
 * (`.regalo__decoraciones`, ver `src/estilos/respuesta.css`) para no
 * superponerse al Circulo_Horizonte ni al texto de la Carta.
 *
 * El color va escrito en claro en cada trazo (`var(--linea-obsidian)`), a
 * diferencia de `obsidian.ts`: aqui es SVG, no `<canvas>`, y SVG si resuelve
 * las propiedades personalizadas de CSS por si solo.
 */

const ESPACIO_DE_NOMBRES_SVG = 'http://www.w3.org/2000/svg';

/** Lado maximo de cada decoracion, en pixeles (Requisito 6.5). */
export const LADO_MAXIMO_DECORACION = 96;

/** Una decoracion personal: identidad, texto alternativo y su trazo SVG. */
export interface Decoracion {
  readonly id: string;
  /** Texto alternativo que nombra la referencia (Requisito 6.5). */
  readonly alt: string;
  /** Contenido interior del `<svg>`, en trazo dorado via `var(--linea-obsidian)`. */
  readonly trazo: string;
}

/** Las cinco referencias personales del Requisito 6.5, en orden fijo. */
export const DECORACIONES_GUINOS: readonly Decoracion[] = [
  {
    id: 'michi',
    alt: 'Michi, una de las gatas de KawaValen',
    trazo: `
      <path d="M28 40 18 18 34 30 M68 40 78 18 62 30" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M24 40c0-13 11-22 24-22s24 9 24 22v14c0 13-11 22-24 22s-24-9-24-22z" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5"/>
      <circle cx="38" cy="42" r="2.4" fill="var(--linea-obsidian)"/>
      <circle cx="58" cy="42" r="2.4" fill="var(--linea-obsidian)"/>
      <path d="M44 52h8M30 54h-16M30 60h-18M66 54h16M66 60h18" stroke="var(--linea-obsidian)" stroke-width="1.6" stroke-linecap="round"/>
    `,
  },
  {
    id: 'guchi',
    alt: 'Guchi, la otra gata de KawaValen',
    trazo: `
      <path d="M20 78c0-24 8-46 24-46s24 22 24 46" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M30 34 22 14 38 26 M50 26 58 14 62 30" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="40" cy="34" r="14" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5"/>
      <circle cx="35" cy="34" r="2" fill="var(--linea-obsidian)"/>
      <circle cx="45" cy="34" r="2" fill="var(--linea-obsidian)"/>
      <path d="M68 70c10-4 14-16 8-24" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5" stroke-linecap="round"/>
    `,
  },
  {
    id: 'sanjuanero',
    alt: 'Una pareja bailando el sanjuanero',
    trazo: `
      <circle cx="34" cy="20" r="7" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5"/>
      <path d="M34 27v18M34 45c-14 0-20 12-20 26h40c0-14-6-26-20-26z" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M34 30 20 40M34 30 48 40" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="70" cy="20" r="7" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5"/>
      <path d="M70 27v46M70 30 58 42M70 30 82 40" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M62 73h16" stroke="var(--linea-obsidian)" stroke-width="2.5" stroke-linecap="round"/>
    `,
  },
  {
    id: 'jeep-rubicon',
    alt: 'Un Jeep Rubicon',
    trazo: `
      <path d="M14 62v-8c0-4 3-8 8-9l6-14c2-4 6-6 10-6h20c4 0 8 2 10 6l6 14c5 1 8 5 8 9v8" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M14 62h68M30 45h36" stroke="var(--linea-obsidian)" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M18 24v16M78 24v16" stroke="var(--linea-obsidian)" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="28" cy="66" r="9" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5"/>
      <circle cx="68" cy="66" r="9" fill="none" stroke="var(--linea-obsidian)" stroke-width="2.5"/>
    `,
  },
  {
    id: 'fisica-nuclear',
    alt: 'Un átomo, guiño a la física nuclear',
    trazo: `
      <circle cx="48" cy="48" r="6" fill="var(--linea-obsidian)"/>
      <ellipse cx="48" cy="48" rx="36" ry="14" fill="none" stroke="var(--linea-obsidian)" stroke-width="2"/>
      <ellipse cx="48" cy="48" rx="36" ry="14" fill="none" stroke="var(--linea-obsidian)" stroke-width="2" transform="rotate(60 48 48)"/>
      <ellipse cx="48" cy="48" rx="36" ry="14" fill="none" stroke="var(--linea-obsidian)" stroke-width="2" transform="rotate(120 48 48)"/>
      <circle cx="84" cy="48" r="3" fill="var(--linea-obsidian)"/>
      <circle cx="21" cy="34" r="3" fill="var(--linea-obsidian)"/>
      <circle cx="21" cy="62" r="3" fill="var(--linea-obsidian)"/>
    `,
  },
] as const;

/** Opciones de la seleccion. */
export interface OpcionesDecoraciones {
  /** Interruptor de los Guinos_Personales del Archivo_Configuracion (Req. 6.8). */
  readonly guinos: boolean;
}

/**
 * Decide que decoraciones se muestran. Funcion pura: con los guinos
 * desactivados no hay ninguna (Requisito 6.8); activados, las cinco de
 * {@link DECORACIONES_GUINOS} en su orden declarado (Requisito 6.5).
 */
export function resolverDecoraciones(opciones: OpcionesDecoraciones): readonly Decoracion[] {
  return opciones.guinos ? DECORACIONES_GUINOS : [];
}

/** Clases que el modulo escribe en el DOM y que estila `src/estilos/guinos.css`. */
export const CLASES_DECORACIONES = {
  contenedor: 'guinos-decoraciones',
  elemento: 'guinos-decoraciones__item',
  figura: 'guinos-decoraciones__figura',
} as const;

/** Asa devuelta por `montarDecoraciones`. */
export interface DecoracionesMontadas {
  /** Contenedor que el modulo agrego a la raiz. */
  readonly contenedor: HTMLElement;
  /** Quita las decoraciones del DOM. Idempotente. */
  destruir(): void;
}

/**
 * Monta las decoraciones personales dentro de `raiz`.
 *
 * Con los Guinos_Personales desactivados no crea ningun nodo y devuelve
 * `null`: ninguna regla de disposicion puede reservar el espacio de un
 * elemento que no existe (Requisito 6.8).
 *
 * @param raiz Elemento contenedor donde vive la banda de decoraciones.
 * @param opciones Interruptor de los Guinos_Personales.
 * @returns El asa del montaje, o `null` si no se creo ningun nodo.
 */
export function montarDecoraciones(
  raiz: HTMLElement,
  opciones: OpcionesDecoraciones,
): DecoracionesMontadas | null {
  const decoraciones = resolverDecoraciones(opciones);
  if (decoraciones.length === 0) {
    return null;
  }

  const contenedor = document.createElement('div');
  contenedor.className = CLASES_DECORACIONES.contenedor;

  for (const decoracion of decoraciones) {
    const item = document.createElement('span');
    item.className = CLASES_DECORACIONES.elemento;

    const svg = document.createElementNS(ESPACIO_DE_NOMBRES_SVG, 'svg');
    svg.setAttribute('class', CLASES_DECORACIONES.figura);
    svg.setAttribute(
      'viewBox',
      `0 0 ${String(LADO_MAXIMO_DECORACION)} ${String(LADO_MAXIMO_DECORACION)}`,
    );
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', decoracion.alt);
    svg.innerHTML = decoracion.trazo;

    item.append(svg);
    contenedor.append(item);
  }

  raiz.append(contenedor);

  let destruido = false;

  return {
    contenedor,
    destruir(): void {
      if (destruido) {
        return;
      }
      destruido = true;
      contenedor.remove();
    },
  };
}
