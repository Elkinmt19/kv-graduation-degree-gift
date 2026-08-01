/**
 * `montarMapa`: orquesta el Mapa_Estelar completo dentro de un
 * `<canvas>` ya presente en el DOM.
 *
 * Este modulo no calcula astronomia ni geometria de dibujo: eso ya lo
 * resolvieron `motor.ts` (Cielo_Calculado) y los modulos de `src/vista/mapa/`
 * (`capas.ts`, `circulo.ts`, `etiquetas.ts`, `interaccion.ts`, `animacion.ts`,
 * `rotulo.ts`) mas `src/vista/guinos/obsidian.ts`. Aqui solo se cablean esas
 * piezas: leer la paleta, dimensionar el lienzo, pintar cada fotograma en el
 * orden del diseno (fondo, reticula, constelaciones, Obsidian, estrellas,
 * etiquetas, cardinales), reaccionar al cambio de tamano reproyectando sin
 * volver a invocar el Motor_Astronomico, y exponer la interaccion del
 * puntero y el texto alternativo.
 *
 * Requisitos 4.8 a 4.11 y 4.13: la ruta de respaldo (`op.cielo === null`)
 * dibuja un disco vacio sobre un fondo estrellado decorativo determinista y
 * el texto "El cielo tarda en cargar, pero la carta te espera"; si el
 * contexto 2D no esta disponible, ese mensaje se muestra en un nodo con
 * fondo plano en vez del lienzo.
 */

import type { CieloCalculado, CirculoHorizonte, Punto } from '../../nucleo/astronomia/modelo.js';
import { proyectar } from '../../nucleo/astronomia/proyeccion.js';
import type { ConsultaMedios } from '../../infra/movimiento-reducido.js';
import { crearTitileo, type ControlTitileo } from './animacion.js';
import {
  CLASES_MAPA,
  PALETA_DE_RESPALDO,
  dibujarCardinales,
  dibujarEstrellas,
  leerPaletaMapa,
  crearCapas,
  type CapasMapa,
  type ContextoDibujo,
  type EstrellaDibujable,
} from './capas.js';
import { ajustarLienzo, calcularCirculo, escalarContexto, observarTamano, type TamanoMapa } from './circulo.js';
import { colocarEtiquetas, medidorDeContexto, ALINEACION_ETIQUETA, LINEA_BASE_ETIQUETA } from './etiquetas.js';
import { construirRejilla, montarInteraccion, type InteraccionMontada } from './interaccion.js';
import { aplicarTextoAlternativo, textoAlternativo, type RotuloLugarFecha } from './rotulo.js';
import { fuentePseudoaleatoria, semillaDesdeTexto } from '../portal/cielo-fondo.js';
import { dibujarObsidian, resolverObsidian } from '../guinos/obsidian.js';

/** Texto de la ruta de respaldo (Requisitos 4.9, 4.10, 4.13). */
export const TEXTO_RESPALDO = 'El cielo tarda en cargar, pero la carta te espera';

/** Cantidad de puntos del fondo estrellado decorativo de la ruta de respaldo. */
const PUNTOS_FONDO_RESPALDO = 120;

/** Opciones de {@link montarMapa}. */
export interface OpcionesMapa {
  /** Cielo ya resuelto por el Motor_Astronomico; `null` activa la ruta de respaldo. */
  readonly cielo: CieloCalculado | null;
  /** Rotulo de lugar y fecha, ya construido por quien monta el mapa. */
  readonly rotulo: RotuloLugarFecha;
  /** Interruptor de los Guinos_Personales (constelacion Obsidian). */
  readonly guinos: boolean;
  /** Preferencia de movimiento reducido del visitante. */
  readonly movimientoReducido: boolean;
}

/** Asa devuelta por {@link montarMapa}. */
export interface ControlMapa {
  /** Repinta el fotograma actual sin recalcular nada. */
  redibujar(): void;
  /** Redimensiona el lienzo y reproyecta el cielo sobre el nuevo Circulo_Horizonte (Requisito 4.12). */
  redimensionar(ancho: number, alto: number): void;
  /** Texto alternativo accesible del mapa (Requisito 7.6). */
  textoAlternativo(): string;
  /** Suelta escuchas, observadores y nodos creados por el montaje. */
  destruir(): void;
}

/** Contador de montajes, para que los `id` del DOM no se repitan. */
let montajes = 0;

function medidaValida(valor: number): number {
  return Number.isFinite(valor) ? Math.max(0, Math.floor(valor)) : 0;
}

/** Consulta de movimiento reducido sintetica a partir de un booleano fijo. */
function consultaFija(matches: boolean): ConsultaMedios {
  return {
    matches,
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
  };
}

/** Contenedor visible del lienzo: su padre, o el propio lienzo si no lo tiene. */
function contenedorDe(lienzo: HTMLCanvasElement): HTMLElement {
  return lienzo.parentElement ?? lienzo;
}

/**
 * Alto que el CSS asigna al lienzo por si mismo (`--alto-mapa`, fijado por el
 * viewport), sin la altura extra que le suma el contenido del contenedor
 * (rotulo, relleno, separacion). Se limpia la altura en linea antes de medir
 * y se restaura despues, para no perder el valor que ya se habia calculado.
 *
 * Medir el contenedor en su lugar crearia un bucle: el contenedor crece con
 * el lienzo, `ResizeObserver` avisa del contenedor mas grande, el lienzo
 * vuelve a crecer, y asi sin limite (el mapa "cae" hacia abajo).
 */
function altoLienzoSegunCss(lienzo: HTMLCanvasElement): number {
  const altoPrevio = lienzo.style.height;
  lienzo.style.height = '';
  const alto = lienzo.clientHeight;
  lienzo.style.height = altoPrevio;
  return alto;
}

/** Tamano visible actual: ancho del contenedor, alto que fija el CSS del lienzo. */
function tamanoActual(contenedor: HTMLElement, lienzo: HTMLCanvasElement): TamanoMapa {
  return { ancho: contenedor.clientWidth, alto: altoLienzoSegunCss(lienzo) };
}

/** Crea el parrafo `.mapa__rotulo` con el texto de lugar y fecha. */
function crearRotuloDom(contenedor: HTMLElement, rotulo: RotuloLugarFecha): HTMLParagraphElement {
  const elemento = document.createElement('p');
  elemento.className = CLASES_MAPA.rotulo;
  elemento.textContent = rotulo.texto;
  contenedor.append(elemento);
  return elemento;
}

/** Crea el parrafo `.mapa__respaldo` con el mensaje de la ruta de respaldo. */
function crearRespaldoDom(contenedor: HTMLElement): HTMLParagraphElement {
  const elemento = document.createElement('p');
  elemento.className = CLASES_MAPA.respaldo;
  elemento.textContent = TEXTO_RESPALDO;
  contenedor.append(elemento);
  return elemento;
}

/**
 * Fondo estrellado decorativo determinista para la ruta de respaldo: puntos
 * pseudoaleatorios sembrados por texto fijo, para que dos montajes de
 * respaldo se vean iguales (Requisito 4.9).
 */
function dibujarFondoRespaldo(
  contexto: ContextoDibujo,
  tamano: TamanoMapa,
  semilla: number,
): void {
  const ancho = medidaValida(tamano.ancho);
  const alto = medidaValida(tamano.alto);

  contexto.clearRect(0, 0, ancho, alto);
  contexto.fillStyle = PALETA_DE_RESPALDO.cieloAlto;
  contexto.fillRect(0, 0, ancho, alto);

  if (ancho <= 0 || alto <= 0) {
    return;
  }

  const siguiente = fuentePseudoaleatoria(semilla);
  contexto.fillStyle = PALETA_DE_RESPALDO.estrella;
  for (let indice = 0; indice < PUNTOS_FONDO_RESPALDO; indice += 1) {
    const x = siguiente() * ancho;
    const y = siguiente() * alto;
    const radio = 0.5 + siguiente() * 1;
    contexto.globalAlpha = 0.4 + siguiente() * 0.6;
    contexto.beginPath();
    contexto.arc(x, y, radio, 0, Math.PI * 2);
    contexto.fill();
  }
  contexto.globalAlpha = 1;
}

/** Reemplaza el lienzo por un `<div>` de fondo plano con el mismo mensaje (Requisito 4.10). */
function sustituirPorNodoPlano(lienzo: HTMLCanvasElement, texto: string): HTMLDivElement {
  const nodo = document.createElement('div');
  nodo.className = CLASES_MAPA.lienzo;
  aplicarTextoAlternativo(nodo, texto);
  lienzo.replaceWith(nodo);
  return nodo;
}

/**
 * Monta el Mapa_Estelar sobre `lienzo`.
 *
 * @param lienzo Lienzo ya presente en el DOM, hijo de la seccion `.mapa`.
 * @param op Cielo (o `null` para la ruta de respaldo), rotulo, guinos y
 *           preferencia de movimiento reducido.
 * @returns Asa con `redibujar`, `redimensionar`, `textoAlternativo` y `destruir`.
 */
export function montarMapa(lienzo: HTMLCanvasElement, op: OpcionesMapa): ControlMapa {
  montajes += 1;

  const contenedor = contenedorDe(lienzo);
  const rotuloDom = crearRotuloDom(contenedor, op.rotulo);

  if (op.cielo === null) {
    return montarRespaldo(lienzo, contenedor, rotuloDom);
  }

  return montarCielo(lienzo, contenedor, rotuloDom, op.cielo, op);
}

/** Ruta de respaldo: sin Cielo_Calculado (Requisitos 4.9, 4.10, 4.13). */
function montarRespaldo(
  lienzo: HTMLCanvasElement,
  contenedor: HTMLElement,
  rotuloDom: HTMLParagraphElement,
): ControlMapa {
  const respaldoDom = crearRespaldoDom(contenedor);
  const semilla = semillaDesdeTexto(`respaldo-${String(montajes)}`);

  let contexto: CanvasRenderingContext2D | null = null;
  let nodoPlano: HTMLDivElement | null = null;

  try {
    contexto = lienzo.getContext('2d');
  } catch {
    contexto = null;
  }

  const pintar = (): void => {
    if (contexto === null) {
      return;
    }
    const ajuste = ajustarLienzo(lienzo, tamanoActual(contenedor, lienzo));
    escalarContexto(contexto, ajuste.densidad);
    dibujarFondoRespaldo(contexto, { ancho: ajuste.anchoCss, alto: ajuste.altoCss }, semilla);
  };

  if (contexto === null) {
    nodoPlano = sustituirPorNodoPlano(lienzo, TEXTO_RESPALDO);
  } else {
    aplicarTextoAlternativo(lienzo, TEXTO_RESPALDO);
    pintar();
  }

  const observacion = observarTamano(contenedor, () => {
    if (contexto !== null) {
      pintar();
    }
  });

  return {
    redibujar: (): void => {
      if (contexto !== null) {
        pintar();
      }
    },
    redimensionar: (): void => {
      if (contexto !== null) {
        pintar();
      }
    },
    textoAlternativo: (): string => TEXTO_RESPALDO,
    destruir: (): void => {
      observacion.detener();
      rotuloDom.remove();
      respaldoDom.remove();
      nodoPlano?.remove();
    },
  };
}

/** Ruta principal: con Cielo_Calculado (Requisito 4.11). */
function montarCielo(
  lienzo: HTMLCanvasElement,
  contenedor: HTMLElement,
  rotuloDom: HTMLParagraphElement,
  cieloInicial: CieloCalculado,
  op: OpcionesMapa,
): ControlMapa {
  let cielo = cieloInicial;

  let contexto: CanvasRenderingContext2D | null = null;
  try {
    contexto = lienzo.getContext('2d');
  } catch {
    contexto = null;
  }

  if (contexto === null) {
    const nodoPlano = sustituirPorNodoPlano(lienzo, TEXTO_RESPALDO);
    const respaldoDom = crearRespaldoDom(contenedor);
    return {
      redibujar: (): void => {},
      redimensionar: (): void => {},
      textoAlternativo: (): string => TEXTO_RESPALDO,
      destruir: (): void => {
        rotuloDom.remove();
        respaldoDom.remove();
        nodoPlano.remove();
      },
    };
  }

  const paleta = leerPaletaMapa(lienzo);
  const paletaEfectiva = paleta.cieloAlto === '' ? PALETA_DE_RESPALDO : paleta;
  const colorObsidian = leerColorObsidian(lienzo);

  let ajuste = ajustarLienzo(lienzo, tamanoActual(contenedor, lienzo));
  escalarContexto(contexto, ajuste.densidad);

  let capas: CapasMapa = crearCapas({ cielo, paleta: paletaEfectiva, tamano: { ancho: ajuste.anchoCss, alto: ajuste.altoCss } });
  let dibujables: readonly EstrellaDibujable[] = capas.dibujables;

  const pintarFotograma = (opacidades?: ArrayLike<number>): void => {
    if (contexto === null) {
      return;
    }
    capas.dibujarEstaticas(contexto);

    const figuraObsidian = resolverObsidian(cielo, { guinos: op.guinos });
    dibujarObsidian(contexto, figuraObsidian, { color: colorObsidian });

    dibujarEstrellas(contexto, dibujables, paletaEfectiva, opacidades);

    const medir = medidorDeContexto(contexto);
    const etiquetas = colocarEtiquetas(cielo.estrellas, cielo.circulo, medir);
    contexto.textAlign = ALINEACION_ETIQUETA;
    contexto.textBaseline = LINEA_BASE_ETIQUETA;
    contexto.fillStyle = paletaEfectiva.cardinal;
    for (const etiqueta of etiquetas) {
      contexto.fillText(etiqueta.texto, etiqueta.ancla.x, etiqueta.ancla.y);
    }

    dibujarCardinales(contexto, cielo.circulo, cielo.cardinales, paletaEfectiva);
  };

  const consultaMovimiento = consultaFija(op.movimientoReducido);
  let titileo: ControlTitileo = crearTitileo({
    cielo,
    pintar: pintarFotograma,
    consulta: consultaMovimiento,
  });

  let interaccion: InteraccionMontada = montarInteraccion(lienzo, {
    rejilla: construirRejilla(dibujables.map((d) => d.calculada)),
  });

  aplicarTextoAlternativo(lienzo, textoAlternativo(cielo));
  titileo.iniciar();

  const reproyectar = (nuevoCirculo: CirculoHorizonte): CieloCalculado => {
    const puntoDe = (horizontal: { altitud: number; azimut: number }): Punto | null =>
      horizontal.altitud >= 0 ? proyectar(horizontal, nuevoCirculo) : null;

    return {
      ...cielo,
      circulo: nuevoCirculo,
      estrellas: cielo.estrellas.map((estrella) => ({
        ...estrella,
        pantalla: puntoDe(estrella.horizontal),
      })),
      cardinales: cielo.cardinales.map((cardinal) => ({
        ...cardinal,
        punto: proyectar({ altitud: 0, azimut: azimutDeCardinal(cardinal.rotulo) }, nuevoCirculo),
      })),
    };
  };

  const redimensionar = (ancho: number, alto: number): void => {
    if (contexto === null) {
      return;
    }

    ajuste = ajustarLienzo(lienzo, { ancho, alto });
    escalarContexto(contexto, ajuste.densidad);

    const nuevoCirculo = calcularCirculo(ajuste.anchoCss, ajuste.altoCss);
    cielo = reproyectar(nuevoCirculo);

    titileo.destruir();
    capas.destruir();
    capas = crearCapas({ cielo, paleta: paletaEfectiva, tamano: { ancho: ajuste.anchoCss, alto: ajuste.altoCss } });
    dibujables = capas.dibujables;

    titileo = crearTitileo({ cielo, pintar: pintarFotograma, consulta: consultaMovimiento });
    interaccion.actualizarRejilla(construirRejilla(dibujables.map((d) => d.calculada)));
    aplicarTextoAlternativo(lienzo, textoAlternativo(cielo));
    titileo.iniciar();
  };

  const observacion = observarTamano(contenedor, (tamano) => {
    redimensionar(tamano.ancho, altoLienzoSegunCss(lienzo));
  });

  return {
    redibujar: (): void => {
      pintarFotograma();
    },
    redimensionar,
    textoAlternativo: (): string => textoAlternativo(cielo),
    destruir: (): void => {
      observacion.detener();
      titileo.destruir();
      interaccion.destruir();
      capas.destruir();
      rotuloDom.remove();
    },
  };
}

/** Azimut fijo de cada marca cardinal, el mismo que fija el Motor_Astronomico. */
function azimutDeCardinal(rotulo: 'N' | 'E' | 'S' | 'O'): number {
  switch (rotulo) {
    case 'N':
      return 0;
    case 'E':
      return 90;
    case 'S':
      return 180;
    case 'O':
      return 270;
  }
}

/** Lee `--linea-obsidian` del lienzo; cadena vacia si el entorno no la resuelve. */
function leerColorObsidian(lienzo: HTMLCanvasElement): string {
  const obtener = (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle;
  if (typeof obtener !== 'function') {
    return PALETA_DE_RESPALDO.estrella;
  }
  const valor = obtener(lienzo).getPropertyValue('--linea-obsidian').trim();
  return valor === '' ? PALETA_DE_RESPALDO.estrella : valor;
}
