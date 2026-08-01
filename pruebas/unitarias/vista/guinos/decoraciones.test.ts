import { describe, expect, it } from 'vitest';

import {
  CLASES_DECORACIONES,
  DECORACIONES_GUINOS,
  LADO_MAXIMO_DECORACION,
  montarDecoraciones,
  resolverDecoraciones,
} from '../../../../src/vista/guinos/decoraciones.js';

describe('resolverDecoraciones (Requisitos 6.5, 6.8)', () => {
  it('con los guinos activados devuelve las cinco referencias personales', () => {
    const decoraciones = resolverDecoraciones({ guinos: true });
    expect(decoraciones).toBe(DECORACIONES_GUINOS);
    expect(decoraciones).toHaveLength(5);
    expect(decoraciones.map((decoracion) => decoracion.id)).toEqual([
      'michi',
      'guchi',
      'sanjuanero',
      'jeep-rubicon',
      'fisica-nuclear',
    ]);
  });

  it('con los guinos desactivados no devuelve ninguna', () => {
    expect(resolverDecoraciones({ guinos: false })).toEqual([]);
  });
});

describe('montarDecoraciones (Requisitos 6.5, 6.8)', () => {
  it('con los guinos desactivados no agrega ningun nodo y devuelve null', () => {
    const raiz = document.createElement('div');
    const montadas = montarDecoraciones(raiz, { guinos: false });

    expect(montadas).toBeNull();
    expect(raiz.children).toHaveLength(0);
  });

  it('con los guinos activados agrega un SVG por decoracion, cada uno con role e imagen alternativa', () => {
    const raiz = document.createElement('div');
    const montadas = montarDecoraciones(raiz, { guinos: true });

    expect(montadas).not.toBeNull();
    expect(raiz.children).toHaveLength(1);
    expect(raiz.querySelector(`.${CLASES_DECORACIONES.contenedor}`)).toBe(montadas?.contenedor);

    const figuras = raiz.querySelectorAll(`.${CLASES_DECORACIONES.figura}`);
    expect(figuras).toHaveLength(DECORACIONES_GUINOS.length);

    figuras.forEach((figura, indice) => {
      expect(figura.tagName.toLowerCase()).toBe('svg');
      expect(figura.getAttribute('role')).toBe('img');
      expect(figura.getAttribute('aria-label')).toBe(DECORACIONES_GUINOS[indice]?.alt);
      expect(figura.getAttribute('viewBox')).toBe(
        `0 0 ${String(LADO_MAXIMO_DECORACION)} ${String(LADO_MAXIMO_DECORACION)}`,
      );
    });
  });

  it('destruir() quita el contenedor del DOM y es idempotente', () => {
    const raiz = document.createElement('div');
    const montadas = montarDecoraciones(raiz, { guinos: true });

    montadas?.destruir();
    expect(raiz.children).toHaveLength(0);
    expect(() => montadas?.destruir()).not.toThrow();
  });
});
