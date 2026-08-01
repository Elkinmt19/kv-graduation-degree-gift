import { describe, expect, it } from 'vitest';

describe('andamiaje de las vistas (entorno jsdom)', () => {
  it('expone un DOM para montar el Portal_Acceso y la Pagina_Regalo', () => {
    const nodo = document.createElement('div');
    nodo.id = 'aplicacion';
    document.body.append(nodo);

    expect(document.querySelector('#aplicacion')).toBe(nodo);
  });
});
