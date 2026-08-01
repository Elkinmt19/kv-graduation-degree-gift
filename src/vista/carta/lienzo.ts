/**
 * Lienzo_Carta: dibuja la Carta ya resuelta por el nucleo.
 *
 * La vista no calcula: `resolverCarta` (`src/nucleo/carta/resolver.ts`) descarta
 * los parrafos vacios, respeta el orden declarado, aplica el tope de 6000
 * caracteres y decide `disponible`. Aqui solo se recorre esa estructura.
 *
 * Cobertura de requisitos:
 * - 5.1: un `<p>` independiente por parrafo, en el mismo orden de
 *   `CartaResuelta.parrafos`.
 * - 5.5 y 5.6: el saludo va antes del primer parrafo y la firma despues del
 *   ultimo, cada uno en su propio `<p>`.
 * - 5.2: en la primera presentacion de la sesion, y con al menos un parrafo, el
 *   texto se revela con la animacion `aparicion-carta` de `carta.css`, cuya
 *   duracion es el token `--duracion-carta` (1200 ms) y cuyo estado final deja
 *   el texto con opacidad total.
 * - 5.3: en las siguientes presentaciones de la misma sesion el estado arranca
 *   en `revelada`, sin animacion alguna. La distincion no la inventa la vista:
 *   la lee de `EstadoSesion.cartaYaRevelada()`, y al revelar marca la sesion con
 *   `marcarCartaRevelada()`.
 * - 5.4: el desplazamiento vertical ocurre dentro de `.carta__desplazable`, que
 *   `carta.css` declara con `overflow-y: auto`, `overflow-x: hidden` y
 *   `overscroll-behavior: contain`, de modo que llegar al final no arrastra el
 *   Mapa_Estelar.
 * - 5.7: con `disponible: false` se muestra `MENSAJE_CARTA_NO_DISPONIBLE` y no
 *   se oculta nada mas: `montarCarta` agrega su propia seccion a `raiz` y no
 *   toca ningun hermano, asi que el Mapa_Estelar sigue visible.
 * - 5.8: la tipografia serif y los minimos de 16 px y 1.6 los declara
 *   `carta.css` con los tokens `--familia-carta`, `--cuerpo-carta` y
 *   `--alto-linea-carta`.
 * - 7.5: con movimiento reducido la animacion no se aplica (el estado arranca
 *   en `revelada`), y si la preferencia cambia mientras la aparicion corre, el
 *   texto salta a su estado final en el mismo turno.
 *
 * Vocabulario de clases. `CLASES_CARTA` es el unico sitio donde se nombran las
 * clases: el DOM las escribe y `src/estilos/carta.css` apunta exactamente a
 * ellas, igual que `CLASES_PORTAL` en el Portal_Acceso. Dos salvedades sobre su
 * presencia en el DOM: `parrafo` aparece una vez por parrafo, y `saludo`,
 * `parrafo` y `firma` se excluyen mutuamente con `respaldo`, porque una Carta
 * no disponible no tiene texto que rotular.
 */

import {
  consultaDelNavegador,
  observarMovimientoReducido,
  prefiereMovimientoReducido,
  type ConsultaMedios,
} from '../../infra/movimiento-reducido.js';
import type { EstadoSesion } from '../../infra/sesion.js';
import type { CartaResuelta } from '../../nucleo/carta/resolver.js';

/**
 * Carta lista para dibujar. El tipo vive en el nucleo, que no puede depender de
 * la vista; el Lienzo_Carta lo reexporta para que quien dibuje importe de un
 * solo modulo.
 */
export type { CartaResuelta } from '../../nucleo/carta/resolver.js';

/** Mensaje de respaldo de una Carta sin parrafos utiles (Requisito 5.7). */
export const MENSAJE_CARTA_NO_DISPONIBLE = 'La carta aún no está disponible';

/** Rotulo accesible de la seccion cuando no hay saludo que la nombre. */
export const ETIQUETA_CARTA = 'Carta dedicada';

/**
 * Nombre de la animacion de aparicion. Es el mismo `@keyframes` que declara
 * `src/estilos/carta.css`, y el que llega en el evento `animationend`.
 */
export const ANIMACION_APARICION = 'aparicion-carta';

/**
 * Duracion de la aparicion progresiva, en milisegundos (Requisito 5.2). La hoja
 * la toma del token `--duracion-carta`; esta constante permite comprobar que
 * ambos lados declaran el mismo valor.
 */
export const DURACION_APARICION_MS = 1200;

/** Clases que el Lienzo_Carta escribe en el DOM y que estila `carta.css`. */
export const CLASES_CARTA = {
  seccion: 'carta',
  desplazable: 'carta__desplazable',
  saludo: 'carta__saludo',
  parrafo: 'carta__parrafo',
  firma: 'carta__firma',
  respaldo: 'carta__respaldo',
} as const;

/** Estado de presentacion de la Carta, publicado en `data-estado`. */
export type EstadoCarta = 'apareciendo' | 'revelada' | 'respaldo';

/**
 * Como se presenta la Carta. Todo es opcional y todo tiene una lectura por
 * omision, de modo que la Aplicacion pase el estado de sesion y la consulta de
 * medios reales, y una prueba pueda fijar las dos decisiones a mano.
 */
export interface OpcionesCarta {
  /**
   * Estado de la sesion del navegador. Sin el, se asume primera presentacion.
   * Con el, `cartaYaRevelada()` distingue el Requisito 5.2 del 5.3 y revelar
   * la Carta llama a `marcarCartaRevelada()`.
   */
  readonly sesion?: EstadoSesion;
  /**
   * Consulta de movimiento reducido a observar. Por omision la del navegador;
   * `null` desactiva la consulta y la observacion.
   */
  readonly consultaMovimiento?: ConsultaMedios | null;
  /** Fuerza la decision del Requisito 5.2 frente al 5.3, por encima de `sesion`. */
  readonly primeraVezEnSesion?: boolean;
  /** Fuerza la preferencia del Requisito 7.5, por encima de `consultaMovimiento`. */
  readonly movimientoReducido?: boolean;
}

/** Asa devuelta por `montarCarta`. */
export interface CartaMontada {
  /** Seccion que el Lienzo_Carta agrego a la raiz. */
  readonly seccion: HTMLElement;
  /** Estado de presentacion actual, el mismo que publica `data-estado`. */
  estado(): EstadoCarta;
  /** Quita la Carta del DOM y suelta sus escuchas. Idempotente. */
  destruir(): void;
}

/** Contador de montajes, para que los `id` del DOM no se repitan. */
let montajes = 0;

/**
 * Monta el Lienzo_Carta dentro de `raiz`.
 *
 * No borra el contenido previo de `raiz`: agrega su propia seccion, de modo que
 * el Mapa_Estelar pueda convivir como hermano y siga visible incluso cuando la
 * Carta no esta disponible (Requisito 5.7).
 *
 * @param raiz Elemento contenedor donde vive la Carta.
 * @param carta Carta ya resuelta por `resolverCarta`.
 * @param opciones Estado de sesion, preferencia de movimiento o sus valores
 *   forzados; ver `OpcionesCarta`.
 * @returns Asa con la seccion, el estado actual y `destruir()`.
 */
export function montarCarta(
  raiz: HTMLElement,
  carta: CartaResuelta,
  opciones: OpcionesCarta = {},
): CartaMontada {
  const consulta =
    opciones.consultaMovimiento === undefined
      ? consultaDelNavegador()
      : opciones.consultaMovimiento;

  const movimientoReducido = opciones.movimientoReducido ?? prefiereMovimientoReducido(consulta);
  const primeraVezEnSesion =
    opciones.primeraVezEnSesion ?? !(opciones.sesion?.cartaYaRevelada() ?? false);

  const sufijo = String((montajes += 1));
  const idSaludo = `carta-saludo-${sufijo}`;

  const seccion = document.createElement('section');
  seccion.className = CLASES_CARTA.seccion;

  const desplazable = document.createElement('div');
  desplazable.className = CLASES_CARTA.desplazable;
  seccion.append(desplazable);

  if (carta.disponible) {
    // Requisitos 5.5, 5.1 y 5.6: el saludo, un `<p>` por parrafo en el orden
    // declarado, y la firma al final.
    const saludo = document.createElement('p');
    saludo.className = CLASES_CARTA.saludo;
    saludo.id = idSaludo;
    saludo.textContent = carta.saludo;
    desplazable.append(saludo);

    for (const parrafo of carta.parrafos) {
      const bloque = document.createElement('p');
      bloque.className = CLASES_CARTA.parrafo;
      bloque.textContent = parrafo;
      desplazable.append(bloque);
    }

    const firma = document.createElement('p');
    firma.className = CLASES_CARTA.firma;
    firma.textContent = carta.firma;
    desplazable.append(firma);

    // El saludo nombra la seccion cuando tiene texto visible; si el
    // Archivo_Configuracion lo dejo vacio, el rotulo fijo cumple ese papel.
    if (carta.saludo.trim().length > 0) {
      seccion.setAttribute('aria-labelledby', idSaludo);
    } else {
      seccion.setAttribute('aria-label', ETIQUETA_CARTA);
    }
  } else {
    // Requisito 5.7: mensaje de respaldo. Nada mas se oculta ni se retira.
    const respaldo = document.createElement('p');
    respaldo.className = CLASES_CARTA.respaldo;
    respaldo.textContent = MENSAJE_CARTA_NO_DISPONIBLE;
    desplazable.append(respaldo);
    seccion.setAttribute('aria-label', ETIQUETA_CARTA);
  }

  /**
   * Requisitos 5.2, 5.3 y 7.5: solo aparece progresivamente una Carta con
   * texto, en la primera presentacion de la sesion y sin movimiento reducido.
   */
  const conAparicion = carta.disponible && primeraVezEnSesion && !movimientoReducido;

  let estado: EstadoCarta = !carta.disponible
    ? 'respaldo'
    : conAparicion
      ? 'apareciendo'
      : 'revelada';
  let destruido = false;

  const aplicarEstado = (nuevo: EstadoCarta): void => {
    estado = nuevo;
    seccion.dataset['estado'] = nuevo;
  };

  /** Deja el texto en su estado final, con opacidad total. */
  const finalizarAparicion = (): void => {
    if (estado === 'apareciendo') {
      aplicarEstado('revelada');
    }
  };

  const alTerminarAnimacion = (evento: AnimationEvent): void => {
    if (evento.animationName === ANIMACION_APARICION) {
      finalizarAparicion();
    }
  };

  aplicarEstado(estado);

  if (carta.disponible && primeraVezEnSesion) {
    // La Carta queda revelada para el resto de la sesion, tanto si aparecio
    // progresivamente como si se mostro ya en su estado final (Requisito 5.3).
    opciones.sesion?.marcarCartaRevelada();
  }

  if (conAparicion) {
    desplazable.addEventListener('animationend', alTerminarAnimacion);
  }

  // Requisito 7.5: activar la preferencia a mitad de la aparicion deja el texto
  // en su estado final de inmediato, sin esperar los 1200 ms restantes.
  const dejarDeObservar = conAparicion
    ? observarMovimientoReducido((reducido) => {
        if (reducido && !destruido) {
          finalizarAparicion();
        }
      }, consulta)
    : () => {};

  raiz.append(seccion);

  return {
    seccion,
    estado: () => estado,
    destruir(): void {
      if (destruido) {
        return;
      }

      destruido = true;
      desplazable.removeEventListener('animationend', alTerminarAnimacion);
      dejarDeObservar();
      seccion.remove();
    },
  };
}
