import { beforeEach, describe, expect, it, vi } from 'vitest';

import { crearEstadoSesion, type EstadoSesion } from '../../../../src/infra/sesion.js';
import { CLASE_CIELO, montarCieloFondo } from '../../../../src/vista/portal/cielo-fondo.js';
import {
  CLASES_PORTAL,
  ETIQUETA_CAMPO,
  LONGITUD_MAXIMA_CLAVE,
  MENSAJE_REINTENTO,
  MENSAJE_SIN_VALIDACION,
  TEXTO_BOTON,
  TEXTO_INVITACION,
  montarPortal,
} from '../../../../src/vista/portal/portal.js';

/**
 * Pruebas unitarias del Portal_Acceso sobre jsdom (Tarea 9.7).
 *
 * Cubren la estructura inicial de la vista (Requisito 1.1), la recarga en la
 * misma sesion y en una sesion nueva (Requisitos 1.7 y 1.9), el estado sin
 * validacion de SHA-256 (Requisito 1.11), el orden de tabulacion (Requisito
 * 7.4) y la equivalencia entre Enter, la barra espaciadora y el click
 * (Requisitos 1.8 y 7.10).
 *
 * Lo que depende de las hojas de estilo -el aro de foco dorado de al menos 2 px
 * y la correspondencia entre las clases del DOM y los selectores de
 * `portal.css`- vive en `pruebas/unitarias/estilos/portal-clases.test.ts`, que
 * corre en Node porque lee las hojas del disco. jsdom no aplica las hojas del
 * proyecto ni calcula `outline`, asi que aqui se verifica el lado del DOM y
 * ambas pruebas se encuentran en `CLASES_PORTAL`.
 */

/** Hash_Clave de juguete: 64 caracteres hexadecimales minusculos. */
const HASH_CLAVE = 'a'.repeat(64);

/** Digesto determinista: solo la clave `obsidian` produce el Hash_Clave. */
const digerir = async (texto: string): Promise<string | null> =>
  texto === 'obsidian' ? HASH_CLAVE : 'b'.repeat(64);

/** Requisito 1.11: navegador sin SHA-256 disponible. */
const sinValidacion = async (): Promise<string | null> => null;

function montar(sobrescrituras: {
  readonly digerir?: (texto: string) => Promise<string | null>;
  readonly sesion?: EstadoSesion;
} = {}) {
  const raiz = document.createElement('div');
  document.body.append(raiz);

  const alConcederAcceso = vi.fn();
  const asa = montarPortal(raiz, {
    hashClave: HASH_CLAVE,
    digerir: sobrescrituras.digerir ?? digerir,
    sesion: sobrescrituras.sesion ?? crearEstadoSesion(null),
    alConcederAcceso,
  });

  const seccion = raiz.querySelector('section');
  const formulario = raiz.querySelector('form');
  const campo = raiz.querySelector('input');
  const boton = raiz.querySelector('button');

  if (seccion === null || formulario === null || campo === null || boton === null) {
    throw new Error('el Portal_Acceso no monto su formulario');
  }

  return { raiz, asa, alConcederAcceso, seccion, formulario, campo, boton };
}

/** Escribe en el campo y dispara el evento que escucha el portal. */
function escribir(campo: HTMLInputElement, valor: string): void {
  campo.value = valor;
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Espera los turnos de microtareas en que resuelve el digesto. */
async function esperarDigesto(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** Envia el formulario y espera el turno en que resuelve el digesto. */
async function enviar(formulario: HTMLFormElement): Promise<void> {
  formulario.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await esperarDigesto();
}

describe('montarPortal', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('muestra la invitacion, el campo de contrasena y el boton deshabilitado (Requisitos 1.1, 1.5)', () => {
    const { raiz, campo, boton } = montar();

    expect(raiz.textContent).toContain(TEXTO_INVITACION);
    expect(campo.type).toBe('password');
    expect(campo.maxLength).toBe(LONGITUD_MAXIMA_CLAVE);
    expect(boton.disabled).toBe(true);
    expect(raiz.querySelector('[aria-live="polite"]')?.textContent).toBe('');
  });

  it('con la clave correcta registra la sesion y concede el acceso (Requisito 1.3)', async () => {
    const { alConcederAcceso, formulario, campo } = montar();

    escribir(campo, '  Obsidian  ');
    await enviar(formulario);

    expect(alConcederAcceso).toHaveBeenCalledTimes(1);
  });

  it('con la clave incorrecta limpia el campo, devuelve el foco y muestra el reintento (Requisito 1.4)', async () => {
    const { alConcederAcceso, formulario, campo, raiz } = montar();

    escribir(campo, 'michi');
    await enviar(formulario);

    expect(alConcederAcceso).not.toHaveBeenCalled();
    expect(campo.value).toBe('');
    expect(document.activeElement).toBe(campo);
    expect(raiz.querySelector('[aria-live="polite"]')?.textContent).toBe(MENSAJE_REINTENTO);
  });
});

// --- Requisito 1.1: estructura inicial de la vista ---------------------------

describe('Requisito 1.1: estructura inicial del Portal_Acceso', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('el formulario envuelve la invitacion, la etiqueta, el campo, el boton y el mensaje', () => {
    const { seccion, formulario, campo, boton } = montar();

    expect(seccion.classList.contains(CLASES_PORTAL.seccion)).toBe(true);
    expect(seccion.hidden).toBe(false);
    expect(formulario.classList.contains(CLASES_PORTAL.formulario)).toBe(true);

    // El titulo nombra la seccion, de modo que la vista tiene un rotulo unico.
    const invitacion = seccion.querySelector(`.${CLASES_PORTAL.invitacion}`);
    expect(invitacion?.textContent).toBe(TEXTO_INVITACION);
    expect(seccion.getAttribute('aria-labelledby')).toBe(invitacion?.id);

    // El campo lleva etiqueta accesible aunque no se dibuje texto junto a el.
    const etiqueta = formulario.querySelector('label');
    expect(etiqueta?.textContent).toBe(ETIQUETA_CAMPO);
    expect(etiqueta?.htmlFor).toBe(campo.id);

    for (const nodo of [campo, boton]) {
      expect(formulario.contains(nodo)).toBe(true);
    }
    expect(boton.textContent).toBe(TEXTO_BOTON);
  });

  it('el campo es de contrasena con longitud maxima de 64 caracteres', () => {
    const { campo } = montar();

    expect(campo.type).toBe('password');
    expect(campo.maxLength).toBe(LONGITUD_MAXIMA_CLAVE);
    expect(LONGITUD_MAXIMA_CLAVE).toBe(64);
    expect(campo.value).toBe('');
  });

  it('el boton arranca deshabilitado y la region de anuncios arranca vacia', () => {
    const { seccion, boton } = montar();

    expect(boton.type).toBe('submit');
    expect(boton.disabled).toBe(true);

    const mensaje = seccion.querySelector(`.${CLASES_PORTAL.mensaje}`);
    expect(mensaje?.getAttribute('aria-live')).toBe('polite');
    expect(mensaje?.getAttribute('role')).toBe('status');
    expect(mensaje?.textContent).toBe('');
  });
});

// --- Requisitos 1.7 y 1.9: recarga y sesion nueva ----------------------------

describe('Requisitos 1.7 y 1.9: acceso concedido por sesion', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('recargar en la misma sesion concede el acceso sin volver a pedir la clave (Requisito 1.7)', async () => {
    // `crearEstadoSesion(null)` guarda en memoria: el mismo objeto representa la
    // misma sesion del navegador, y montar de nuevo equivale a recargar.
    const sesion = crearEstadoSesion(null);

    const primera = montar({ sesion });
    escribir(primera.campo, 'obsidian');
    await enviar(primera.formulario);
    expect(primera.alConcederAcceso).toHaveBeenCalledTimes(1);
    primera.asa.destruir();

    const recarga = montar({ sesion });

    // Se concede en el montaje: nadie escribio ni envio nada.
    expect(recarga.alConcederAcceso).toHaveBeenCalledTimes(1);
    expect(recarga.campo.value).toBe('');
    expect(recarga.seccion.dataset['estado']).toBe('concedido');
    expect(recarga.seccion.hidden).toBe(true);
  });

  it('una sesion nueva vuelve a pedir la clave y mantiene el portal visible (Requisito 1.9)', async () => {
    const anterior = crearEstadoSesion(null);
    const primera = montar({ sesion: anterior });
    escribir(primera.campo, 'obsidian');
    await enviar(primera.formulario);
    expect(anterior.accesoConcedido()).toBe(true);
    primera.asa.destruir();

    // Otra sesion del navegador: `sessionStorage` no comparte el estado.
    const nueva = crearEstadoSesion(null);
    expect(nueva.accesoConcedido()).toBe(false);

    const segunda = montar({ sesion: nueva });

    expect(segunda.alConcederAcceso).not.toHaveBeenCalled();
    expect(segunda.seccion.hidden).toBe(false);
    expect(segunda.seccion.dataset['estado']).toBe('reposo');
    expect(segunda.raiz.textContent).toContain(TEXTO_INVITACION);
    expect(segunda.boton.disabled).toBe(true);
  });
});

// --- Requisito 1.11: navegador sin SHA-256 ----------------------------------

describe('Requisito 1.11: sin calculo de SHA-256 no hay acceso', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('pasa a sin-validacion, anuncia el motivo y no concede el acceso', async () => {
    const { alConcederAcceso, seccion, formulario, campo } = montar({ digerir: sinValidacion });

    escribir(campo, 'obsidian');
    await enviar(formulario);

    expect(seccion.dataset['estado']).toBe('sin-validacion');
    expect(seccion.querySelector(`.${CLASES_PORTAL.mensaje}`)?.textContent).toBe(
      MENSAJE_SIN_VALIDACION,
    );
    expect(alConcederAcceso).not.toHaveBeenCalled();
    // La vista se conserva: el portal sigue en pantalla y nada se revelo.
    expect(seccion.hidden).toBe(false);
  });

  it('ni siquiera con la clave correcta registra el acceso en la sesion', async () => {
    const sesion = crearEstadoSesion(null);
    const { formulario, campo } = montar({ digerir: sinValidacion, sesion });

    escribir(campo, 'obsidian');
    await enviar(formulario);

    expect(sesion.accesoConcedido()).toBe(false);
  });
});

/** Clases `portal…` que el Portal_Acceso escribe realmente en el DOM. */
function clasesEmitidas(raiz: HTMLElement): Set<string> {
  return new Set(
    [...raiz.querySelectorAll<HTMLElement>('*')]
      .flatMap((nodo) => [...nodo.classList])
      .filter(
        (clase) =>
          clase === CLASES_PORTAL.seccion || clase.startsWith(`${CLASES_PORTAL.seccion}__`),
      ),
  );
}

/** Elementos alcanzables con pulsaciones sucesivas de Tab, en orden del DOM. */
function focalizables(raiz: HTMLElement): HTMLElement[] {
  const candidatos = raiz.querySelectorAll<HTMLElement>(
    'a[href], area[href], button, input, select, textarea, iframe, [tabindex], [contenteditable]',
  );

  return [...candidatos].filter(
    (nodo) =>
      !nodo.matches(':disabled') &&
      nodo.getAttribute('tabindex') !== '-1' &&
      !nodo.classList.contains('solo-lectores'),
  );
}

describe('Requisito 7.4: orden de tabulacion y aro de foco dorado', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('el campo y el boton son los unicos elementos tabulables, en orden del DOM', () => {
    const { raiz, campo, boton } = montar();
    // El cielo decorativo se monta junto al formulario, como en la Aplicacion.
    montarCieloFondo(raiz, { semilla: 7, consulta: null });

    // Con el campo vacio el boton esta deshabilitado (Requisito 1.5), asi que
    // primero se escribe para que la secuencia completa sea alcanzable.
    escribir(campo, 'obsidian');

    expect(focalizables(raiz)).toEqual([campo, boton]);
    // El orden del DOM es el orden visual: el campo precede al boton.
    expect(campo.compareDocumentPosition(boton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('ningun elemento tabulable fuerza un orden distinto del visual', () => {
    const { raiz, campo } = montar();
    escribir(campo, 'obsidian');

    // Un `tabindex` positivo adelantaria el elemento y romperia el orden visual.
    for (const nodo of focalizables(raiz)) {
      const declarado = nodo.getAttribute('tabindex');
      expect(declarado === null || Number.parseInt(declarado, 10) <= 0).toBe(true);
    }
  });

  it('el cielo decorativo queda fuera del arbol accesible y del orden de tabulacion', () => {
    const { raiz } = montar();
    montarCieloFondo(raiz, { semilla: 7, consulta: null });

    const cielo = raiz.querySelector<HTMLElement>(`.${CLASE_CIELO}`);
    expect(cielo).not.toBeNull();
    expect(cielo?.getAttribute('aria-hidden')).toBe('true');
    expect(cielo?.childElementCount).toBeGreaterThan(0);
    expect(focalizables(cielo as HTMLElement)).toEqual([]);
  });

  it('el campo y el boton reciben el foco al recorrerlos', () => {
    const { raiz, campo, boton } = montar();
    escribir(campo, 'obsidian');

    // jsdom no dibuja contornos ni aplica las hojas del proyecto: el aro dorado
    // de al menos 2 px se verifica sobre las hojas reales en
    // `pruebas/unitarias/estilos/portal-clases.test.ts`. Aqui solo se comprueba
    // que cada elemento del recorrido admite el foco.
    for (const nodo of focalizables(raiz)) {
      nodo.focus();
      expect(document.activeElement).toBe(nodo);
    }

    expect(document.activeElement).toBe(boton);
  });
});

describe('Requisitos 1.8 y 7.10: Enter y la barra espaciadora equivalen al click', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('el campo y el boton pertenecen al mismo formulario nativo', () => {
    const { formulario, campo, boton } = montar();

    // De aqui sale la equivalencia: el navegador convierte Enter en el campo en
    // un envio implicito, y Enter o la barra espaciadora sobre el boton en un
    // click que el `<form>` traduce en el mismo envio. No hay codigo de teclado.
    expect(campo.form).toBe(formulario);
    expect(boton.form).toBe(formulario);
    expect(boton.type).toBe('submit');
    expect(formulario.querySelectorAll('button').length).toBe(1);
  });

  it('el envio implicito del formulario y el click sobre el boton conceden igual', async () => {
    // Enter con el campo enfocado: envio implicito del formulario.
    const conEnter = montar();
    escribir(conEnter.campo, 'obsidian');
    conEnter.campo.focus();
    conEnter.formulario.requestSubmit();
    await esperarDigesto();

    // Barra espaciadora sobre el boton: el navegador la traduce en un click.
    const conBarra = montar();
    escribir(conBarra.campo, 'obsidian');
    conBarra.boton.focus();
    conBarra.boton.click();
    await esperarDigesto();

    for (const camino of [conEnter, conBarra]) {
      expect(camino.alConcederAcceso).toHaveBeenCalledTimes(1);
      expect(camino.seccion.dataset['estado']).toBe('concedido');
    }
  });

  it('ambos caminos coinciden tambien cuando la clave no es la esperada', async () => {
    const conEnter = montar();
    escribir(conEnter.campo, 'michi');
    conEnter.formulario.requestSubmit();
    await esperarDigesto();

    const conBarra = montar();
    escribir(conBarra.campo, 'michi');
    conBarra.boton.click();
    await esperarDigesto();

    for (const camino of [conEnter, conBarra]) {
      expect(camino.alConcederAcceso).not.toHaveBeenCalled();
      expect(camino.seccion.dataset['estado']).toBe('reintento');
      expect(camino.campo.value).toBe('');
      expect(camino.seccion.querySelector(`.${CLASES_PORTAL.mensaje}`)?.textContent).toBe(
        MENSAJE_REINTENTO,
      );
    }
  });
});

describe('el DOM del portal usa el vocabulario de clases que estila su hoja', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('el DOM emite exactamente las clases declaradas en CLASES_PORTAL', () => {
    const { raiz } = montar();
    const emitidas = clasesEmitidas(raiz);

    // `CLASES_PORTAL` es el contrato: este lado fija el DOM y
    // `pruebas/unitarias/estilos/portal-clases.test.ts` fija los selectores de
    // `src/estilos/portal.css` contra el mismo objeto. Renombrar una clase en un
    // solo lado hace fallar una de las dos.
    expect([...emitidas].sort()).toEqual([...Object.values(CLASES_PORTAL)].sort());
    expect(emitidas.size).toBe(Object.keys(CLASES_PORTAL).length);
  });

  it('cada clase del contrato aparece en un solo elemento de la vista', () => {
    const { raiz } = montar();

    for (const clase of Object.values(CLASES_PORTAL)) {
      expect(raiz.querySelectorAll(`.${clase}`).length, clase).toBe(1);
    }
  });
});
