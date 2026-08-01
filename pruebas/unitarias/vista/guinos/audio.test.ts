import { describe, expect, it, vi } from 'vitest';

import type { ElementoAudio, Reloj } from '../../../../src/vista/guinos/audio.js';
import { CLASES_AUDIO, ETIQUETAS_AUDIO, VOLUMEN_INICIAL, montarAudio } from '../../../../src/vista/guinos/audio.js';

/** Reloj manual: `programar` no corre nada solo, `disparar()` ejecuta la accion pendiente. */
function relojManual(): Reloj & { disparar(): void; cancelado(): boolean } {
  let accionPendiente: (() => void) | null = null;
  let cancelo = false;
  return {
    programar: (accion) => {
      accionPendiente = accion;
      return {};
    },
    cancelar: () => {
      cancelo = true;
      accionPendiente = null;
    },
    disparar: () => {
      accionPendiente?.();
    },
    cancelado: () => cancelo,
  };
}

/** Elemento de audio de mentira: registra llamadas y expone los escuchas para dispararlos a mano. */
function elementoFalso(): ElementoAudio & {
  dispararCanplay(): void;
  dispararError(): void;
  reproducciones: number;
  pausas: number;
} {
  const escuchasCanplay: Array<() => void> = [];
  const escuchasError: Array<() => void> = [];
  let reproducciones = 0;
  let pausas = 0;

  return {
    volume: 1,
    paused: true,
    play: () => {
      reproducciones += 1;
      return Promise.resolve();
    },
    pause: () => {
      pausas += 1;
    },
    addEventListener: (tipo, escucha) => {
      (tipo === 'canplay' ? escuchasCanplay : escuchasError).push(escucha);
    },
    removeEventListener: (tipo, escucha) => {
      const lista = tipo === 'canplay' ? escuchasCanplay : escuchasError;
      const indice = lista.indexOf(escucha);
      if (indice >= 0) {
        lista.splice(indice, 1);
      }
    },
    dispararCanplay: () => {
      for (const escucha of escuchasCanplay) escucha();
    },
    dispararError: () => {
      for (const escucha of escuchasError) escucha();
    },
    get reproducciones() {
      return reproducciones;
    },
    get pausas() {
      return pausas;
    },
  };
}

describe('montarAudio (Requisito 6.8)', () => {
  it('con la musica desactivada no agrega ningun nodo y devuelve null', () => {
    const raiz = document.createElement('div');
    const montado = montarAudio(raiz, { musica: false });

    expect(montado).toBeNull();
    expect(raiz.children).toHaveLength(0);
  });
});

describe('montarAudio con la musica activada (Requisito 6.6)', () => {
  it('arranca deshabilitado en estado cargando', () => {
    const raiz = document.createElement('div');
    const elemento = elementoFalso();
    const montado = montarAudio(raiz, { musica: true, elemento, reloj: relojManual() });

    expect(montado).not.toBeNull();
    expect(raiz.children).toHaveLength(1);
    expect(montado?.estado()).toBe('cargando');
    expect(montado?.boton.disabled).toBe(true);
    expect(montado?.boton.className).toBe(CLASES_AUDIO.boton);
    expect(montado?.boton.getAttribute('aria-label')).toBe(ETIQUETAS_AUDIO['cargando']);
  });

  it('pasa a detenido con volumen al 50% cuando el audio esta listo antes de la espera', () => {
    const raiz = document.createElement('div');
    const elemento = elementoFalso();
    const reloj = relojManual();
    const montado = montarAudio(raiz, { musica: true, elemento, reloj });

    elemento.dispararCanplay();

    expect(montado?.estado()).toBe('detenido');
    expect(montado?.boton.disabled).toBe(false);
    expect(elemento.volume).toBe(VOLUMEN_INICIAL);
    expect(reloj.cancelado()).toBe(true);
  });

  it('pasa a no-disponible y queda deshabilitado si la espera vence antes del canplay (Requisito 6.10)', () => {
    const raiz = document.createElement('div');
    const elemento = elementoFalso();
    const reloj = relojManual();
    const montado = montarAudio(raiz, { musica: true, elemento, reloj });

    reloj.disparar();

    expect(montado?.estado()).toBe('no-disponible');
    expect(montado?.boton.disabled).toBe(true);
    expect(montado?.boton.getAttribute('aria-label')).toBe(ETIQUETAS_AUDIO['no-disponible']);

    // Un canplay tardio, llegado despues de la espera, ya no cambia nada.
    elemento.dispararCanplay();
    expect(montado?.estado()).toBe('no-disponible');
  });

  it('pasa a no-disponible si el elemento dispara error antes de la espera', () => {
    const raiz = document.createElement('div');
    const elemento = elementoFalso();
    const reloj = relojManual();
    const montado = montarAudio(raiz, { musica: true, elemento, reloj });

    elemento.dispararError();

    expect(montado?.estado()).toBe('no-disponible');
    expect(reloj.cancelado()).toBe(true);
  });

  it('el clic alterna entre reproduciendo y detenido una vez disponible', () => {
    const raiz = document.createElement('div');
    const elemento = elementoFalso();
    const montado = montarAudio(raiz, { musica: true, elemento, reloj: relojManual() });

    elemento.dispararCanplay();

    montado?.boton.click();
    expect(montado?.estado()).toBe('reproduciendo');
    expect(elemento.reproducciones).toBe(1);
    expect(montado?.boton.getAttribute('aria-label')).toBe(ETIQUETAS_AUDIO['reproduciendo']);

    montado?.boton.click();
    expect(montado?.estado()).toBe('detenido');
    expect(elemento.pausas).toBe(1);
  });

  it('el clic no hace nada mientras esta cargando o no disponible', () => {
    const raiz = document.createElement('div');
    const elemento = elementoFalso();
    const montado = montarAudio(raiz, { musica: true, elemento, reloj: relojManual() });

    montado?.boton.click();
    expect(montado?.estado()).toBe('cargando');
    expect(elemento.reproducciones).toBe(0);
  });

  it('destruir() cancela la espera pendiente, quita el boton y es idempotente', () => {
    const raiz = document.createElement('div');
    const elemento = elementoFalso();
    const reloj = relojManual();
    const montado = montarAudio(raiz, { musica: true, elemento, reloj });

    montado?.destruir();

    expect(raiz.children).toHaveLength(0);
    expect(reloj.cancelado()).toBe(true);

    // Un canplay tras destruir no reactiva nada.
    elemento.dispararCanplay();
    expect(montado?.estado()).toBe('cargando');
    expect(() => montado?.destruir()).not.toThrow();
  });

  it('usa un reloj real por omision, programando la espera con setTimeout', () => {
    vi.useFakeTimers();
    try {
      const raiz = document.createElement('div');
      const elemento = elementoFalso();
      const montado = montarAudio(raiz, { musica: true, elemento });

      expect(montado?.estado()).toBe('cargando');
      vi.advanceTimersByTime(5000);
      expect(montado?.estado()).toBe('no-disponible');
    } finally {
      vi.useRealTimers();
    }
  });
});
