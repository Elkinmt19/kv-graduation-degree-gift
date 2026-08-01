import { beforeEach, describe, expect, it } from 'vitest';

import type { ConsultaMedios, EventoMedios } from '../../../../src/infra/movimiento-reducido.js';
import { crearEstadoSesion } from '../../../../src/infra/sesion.js';
import { resolverCarta } from '../../../../src/nucleo/carta/resolver.js';
import {
  ANIMACION_APARICION,
  CLASES_CARTA,
  MENSAJE_CARTA_NO_DISPONIBLE,
  montarCarta,
  type CartaResuelta,
} from '../../../../src/vista/carta/lienzo.js';

/**
 * Pruebas unitarias del Lienzo_Carta sobre jsdom (Tareas 12.4 y 12.5).
 *
 * Cubren el DOM que monta la vista: el orden saludo, parrafos y firma
 * (Requisitos 5.1, 5.5, 5.6), la animacion solo en la primera presentacion de
 * la sesion y su ausencia en las siguientes, leidas del estado de sesion real
 * (Requisitos 5.2, 5.3), el estado final directo o alcanzado a mitad de la
 * aparicion con movimiento reducido (Requisito 7.5) y el mensaje de respaldo con
 * el Mapa_Estelar visible (Requisito 5.7).
 *
 * El desplazamiento contenido del Requisito 5.4 no se verifica aqui: jsdom no
 * aplica las hojas del proyecto ni calcula disposicion, asi que `overflow` y
 * `overscroll-behavior` se comprueban sobre la hoja real en
 * `pruebas/unitarias/estilos/carta-clases.test.ts`.
 */

const CARTA: CartaResuelta = resolverCarta({
  saludo: 'Querida KawaValen',
  parrafos: ['Primero', 'Segundo', '   ', 'Tercero'],
  firma: 'Con cariño',
});

/** Raiz con un Mapa_Estelar hermano, como en la Pagina_Regalo. */
function preparar(): { raiz: HTMLElement; mapa: HTMLElement } {
  const raiz = document.createElement('div');
  const mapa = document.createElement('div');
  mapa.id = 'mapa';
  raiz.append(mapa);
  document.body.append(raiz);
  return { raiz, mapa };
}

/** Consulta de medios gobernada a mano, para mover la preferencia en el acto. */
interface ConsultaGobernada extends ConsultaMedios {
  /** Cambia la preferencia y avisa a quien la observa. */
  cambiar(reducido: boolean): void;
  /** Escuchas aun registradas, para comprobar que `destruir` las suelta. */
  escuchas(): number;
}

function consultaGobernada(inicial: boolean): ConsultaGobernada {
  const escuchas = new Set<(evento: EventoMedios) => void>();
  let reducido = inicial;

  return {
    get matches(): boolean {
      return reducido;
    },
    addEventListener(_tipo, escucha) {
      escuchas.add(escucha);
    },
    removeEventListener(_tipo, escucha) {
      escuchas.delete(escucha);
    },
    cambiar(nuevo: boolean): void {
      reducido = nuevo;
      for (const escucha of escuchas) escucha({ matches: nuevo });
    },
    escuchas: () => escuchas.size,
  };
}

/**
 * Termina una animacion CSS sobre el elemento. jsdom no implementa
 * `AnimationEvent`, asi que se despacha un evento con el nombre de animacion
 * que el navegador entregaria.
 */
function terminarAnimacion(elemento: Element, nombre: string): void {
  const evento = new Event('animationend', { bubbles: true });
  Object.defineProperty(evento, 'animationName', { value: nombre });
  elemento.dispatchEvent(evento);
}

/** Region desplazable de una Carta montada, la que lleva la animacion. */
function desplazableDe(seccion: HTMLElement): Element {
  const desplazable = seccion.querySelector(`.${CLASES_CARTA.desplazable}`);
  if (desplazable === null) throw new Error('la Carta no monto su region desplazable');
  return desplazable;
}

describe('montarCarta', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('escribe un parrafo por bloque, con el saludo antes y la firma despues (Requisitos 5.1, 5.5, 5.6)', () => {
    const { raiz } = preparar();
    const asa = montarCarta(raiz, CARTA, { consultaMovimiento: null });

    const parrafos = [...asa.seccion.querySelectorAll('p')];
    expect(parrafos.map((nodo) => nodo.className)).toEqual([
      CLASES_CARTA.saludo,
      ...CARTA.parrafos.map(() => CLASES_CARTA.parrafo),
      CLASES_CARTA.firma,
    ]);
    expect(parrafos.map((nodo) => nodo.textContent)).toEqual([
      CARTA.saludo,
      ...CARTA.parrafos,
      CARTA.firma,
    ]);
    // El parrafo de espacios en blanco no llega al DOM: lo descarto el nucleo.
    expect(CARTA.parrafos).toEqual(['Primero', 'Segundo', 'Tercero']);
  });

  it('aparece progresivamente la primera vez y en estado final la siguiente (Requisitos 5.2, 5.3)', () => {
    const { raiz } = preparar();
    const sesion = crearEstadoSesion(null);

    const primera = montarCarta(raiz, CARTA, { sesion, consultaMovimiento: null });
    expect(primera.estado()).toBe('apareciendo');
    expect(primera.seccion.dataset['estado']).toBe('apareciendo');
    expect(sesion.cartaYaRevelada()).toBe(true);
    primera.destruir();

    const segunda = montarCarta(raiz, CARTA, { sesion, consultaMovimiento: null });
    expect(segunda.estado()).toBe('revelada');
    expect(segunda.seccion.dataset['estado']).toBe('revelada');
  });

  it('una sesion distinta vuelve a animar; la marca no es el numero de montajes (Requisitos 5.2, 5.3)', () => {
    const { raiz } = preparar();

    // Sesion que ya vio la Carta: el estado arranca en su forma final.
    const vista = crearEstadoSesion(null);
    vista.marcarCartaRevelada();
    const repetida = montarCarta(raiz, CARTA, { sesion: vista, consultaMovimiento: null });
    expect(repetida.estado()).toBe('revelada');
    repetida.destruir();

    // Otra pestana, otro almacen: la aparicion vuelve a correr.
    const nueva = montarCarta(raiz, CARTA, {
      sesion: crearEstadoSesion(null),
      consultaMovimiento: null,
    });
    expect(nueva.estado()).toBe('apareciendo');
  });

  it('al terminar la animacion de aparicion queda revelada (Requisito 5.2)', () => {
    const { raiz } = preparar();
    const asa = montarCarta(raiz, CARTA, { primeraVezEnSesion: true, consultaMovimiento: null });
    const desplazable = desplazableDe(asa.seccion);

    expect(asa.estado()).toBe('apareciendo');

    // Otra animacion de la misma region no da por terminada la aparicion.
    terminarAnimacion(desplazable, 'titileo-punto');
    expect(asa.estado()).toBe('apareciendo');

    terminarAnimacion(desplazable, ANIMACION_APARICION);
    expect(asa.estado()).toBe('revelada');
    expect(asa.seccion.dataset['estado']).toBe('revelada');

    // El estado final es estable: repetir el evento no lo mueve.
    terminarAnimacion(desplazable, ANIMACION_APARICION);
    expect(asa.estado()).toBe('revelada');
  });

  it('activar el movimiento reducido a mitad de la aparicion salta al estado final (Requisito 7.5)', () => {
    const { raiz } = preparar();
    const consulta = consultaGobernada(false);
    const asa = montarCarta(raiz, CARTA, { primeraVezEnSesion: true, consultaMovimiento: consulta });

    expect(asa.estado()).toBe('apareciendo');

    // Sin esperar los 1200 ms restantes: el texto queda completo en el acto.
    consulta.cambiar(true);
    expect(asa.estado()).toBe('revelada');
    expect(asa.seccion.dataset['estado']).toBe('revelada');

    // Desactivar la preferencia despues no reinicia la aparicion.
    consulta.cambiar(false);
    expect(asa.estado()).toBe('revelada');
  });

  it('con la preferencia ya declarada en la consulta no hay animacion (Requisito 7.5)', () => {
    const { raiz } = preparar();
    const consulta = consultaGobernada(true);
    const sesion = crearEstadoSesion(null);

    const asa = montarCarta(raiz, CARTA, { sesion, consultaMovimiento: consulta });

    expect(asa.estado()).toBe('revelada');
    // No hay aparicion que observar, asi que tampoco hay escucha registrada.
    expect(consulta.escuchas()).toBe(0);
    // Y la Carta cuenta como revelada para el resto de la sesion.
    expect(sesion.cartaYaRevelada()).toBe(true);
  });

  it('con movimiento reducido muestra el estado final sin animacion (Requisito 7.5)', () => {
    const { raiz } = preparar();
    const asa = montarCarta(raiz, CARTA, { movimientoReducido: true, consultaMovimiento: null });

    expect(asa.estado()).toBe('revelada');
  });

  it('sin parrafos utiles muestra el respaldo y conserva el Mapa_Estelar (Requisito 5.7)', () => {
    const { raiz, mapa } = preparar();
    const vacia = resolverCarta({ saludo: 'Hola', parrafos: ['   ', ''], firma: 'Yo' });

    const asa = montarCarta(raiz, vacia, { consultaMovimiento: null });

    expect(vacia.disponible).toBe(false);
    expect(asa.estado()).toBe('respaldo');
    expect(asa.seccion.querySelector(`.${CLASES_CARTA.respaldo}`)?.textContent).toBe(
      MENSAJE_CARTA_NO_DISPONIBLE,
    );
    expect(asa.seccion.querySelector(`.${CLASES_CARTA.parrafo}`)).toBeNull();
    // El mapa sigue en el arbol y visible: la Carta no oculta a sus hermanos.
    expect(raiz.contains(mapa)).toBe(true);
    expect(mapa.hidden).toBe(false);
  });

  it('el respaldo no anima ni oculta al Mapa_Estelar hermano (Requisito 5.7)', () => {
    const { raiz, mapa } = preparar();
    const vacia = resolverCarta({ saludo: 'Hola', parrafos: [], firma: 'Yo' });
    const sesion = crearEstadoSesion(null);

    const asa = montarCarta(raiz, vacia, { sesion, consultaMovimiento: null });

    // El respaldo no es una revelacion: no consume la aparicion de la sesion.
    expect(asa.estado()).toBe('respaldo');
    expect(sesion.cartaYaRevelada()).toBe(false);

    // La Carta se agrega como hermana del mapa, sin tocarlo ni esconderlo.
    expect(mapa.nextElementSibling).toBe(asa.seccion);
    expect(mapa.getAttribute('aria-hidden')).toBeNull();
    expect(mapa.style.display).toBe('');
    expect(mapa.isConnected).toBe(true);
    // Y el mensaje de respaldo esta a la vista, no oculto tras un atributo.
    const respaldo = asa.seccion.querySelector(`.${CLASES_CARTA.respaldo}`) as HTMLElement | null;
    expect(respaldo?.textContent).toBe(MENSAJE_CARTA_NO_DISPONIBLE);
    expect(respaldo?.hidden).toBe(false);
  });

  it('destruir retira la seccion, suelta las escuchas y es idempotente', () => {
    const { raiz } = preparar();
    const consulta = consultaGobernada(false);
    const asa = montarCarta(raiz, CARTA, { primeraVezEnSesion: true, consultaMovimiento: consulta });
    const desplazable = desplazableDe(asa.seccion);

    expect(consulta.escuchas()).toBe(1);

    asa.destruir();
    asa.destruir();

    expect(raiz.querySelector(`.${CLASES_CARTA.seccion}`)).toBeNull();
    expect(consulta.escuchas()).toBe(0);

    // Nada de lo que ocurra despues mueve el estado de una Carta destruida.
    consulta.cambiar(true);
    terminarAnimacion(desplazable, ANIMACION_APARICION);
    expect(asa.estado()).toBe('apareciendo');
  });
});
