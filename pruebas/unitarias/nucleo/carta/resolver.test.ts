import { describe, expect, it } from 'vitest';

import type { CartaConfigurada } from '../../../../src/nucleo/configuracion/modelo.js';
import {
  MAX_CARACTERES_CARTA,
  MAX_CARACTERES_ROTULO,
  MAX_PARRAFOS_CARTA,
  resolverCarta,
} from '../../../../src/nucleo/carta/resolver.js';

/** Carta base; cada prueba sustituye solo el campo que le interesa. */
function carta(cambios: Partial<CartaConfigurada> = {}): CartaConfigurada {
  return {
    saludo: 'Kawa, felicidades',
    parrafos: ['Primer parrafo.', 'Segundo parrafo.'],
    firma: 'Con carino',
    ...cambios,
  };
}

describe('resolverCarta: orden y saludo/firma (Requisitos 5.1, 5.5, 5.6)', () => {
  it('conserva los parrafos en el orden declarado, con su texto tal cual', () => {
    const resuelta = resolverCarta(carta({ parrafos: ['uno', '  dos  ', 'tres 🐱'] }));

    expect(resuelta.parrafos).toEqual(['uno', '  dos  ', 'tres 🐱']);
    expect(resuelta.disponible).toBe(true);
  });

  it('devuelve el saludo y la firma declarados', () => {
    const resuelta = resolverCarta(carta({ saludo: 'Hola, fisica', firma: 'Tu amigo' }));

    expect(resuelta.saludo).toBe('Hola, fisica');
    expect(resuelta.firma).toBe('Tu amigo');
  });

  it('limita el saludo y la firma a 120 caracteres', () => {
    const largo = 'á'.repeat(200);
    const resuelta = resolverCarta(carta({ saludo: largo, firma: largo }));

    expect(resuelta.saludo).toHaveLength(MAX_CARACTERES_ROTULO);
    expect(resuelta.firma).toHaveLength(MAX_CARACTERES_ROTULO);
  });

  it('toma a lo sumo 20 parrafos', () => {
    const parrafos = Array.from({ length: 26 }, (_, indice) => `parrafo ${String(indice)}`);
    const resuelta = resolverCarta(carta({ parrafos }));

    expect(resuelta.parrafos).toHaveLength(MAX_PARRAFOS_CARTA);
    expect(resuelta.parrafos[0]).toBe('parrafo 0');
    expect(resuelta.parrafos.at(-1)).toBe('parrafo 19');
  });
});

describe('resolverCarta: descarte de parrafos vacios (Requisitos 5.1, 5.7)', () => {
  it('descarta los parrafos vacios o de solo espacios y conserva el resto', () => {
    const resuelta = resolverCarta(carta({ parrafos: ['', 'uno', '   \t\n ', 'dos', ''] }));

    expect(resuelta.parrafos).toEqual(['uno', 'dos']);
    expect(resuelta.disponible).toBe(true);
  });

  it('marca la Carta como no disponible cuando no hay parrafos declarados', () => {
    const resuelta = resolverCarta(carta({ parrafos: [] }));

    expect(resuelta.parrafos).toEqual([]);
    expect(resuelta.disponible).toBe(false);
    // El saludo y la firma se conservan; el Lienzo_Carta decide que mostrar.
    expect(resuelta.saludo).toBe('Kawa, felicidades');
    expect(resuelta.firma).toBe('Con carino');
  });

  it('marca la Carta como no disponible cuando todos los parrafos estan vacios', () => {
    const resuelta = resolverCarta(carta({ parrafos: ['', '   ', '\t\n', '\u00a0'] }));

    expect(resuelta.parrafos).toEqual([]);
    expect(resuelta.disponible).toBe(false);
  });
});

describe('resolverCarta: tope de 6000 caracteres (Requisito 5.1)', () => {
  it('conserva el prefijo mas largo que no excede el tope y detiene la seleccion', () => {
    const parrafos = ['a'.repeat(3000), 'b'.repeat(3000), 'c'.repeat(10), 'd'.repeat(5)];
    const resuelta = resolverCarta(carta({ parrafos }));

    expect(resuelta.parrafos).toEqual([parrafos[0], parrafos[1]]);
    expect(resuelta.parrafos.join('')).toHaveLength(MAX_CARACTERES_CARTA);
    expect(resuelta.disponible).toBe(true);
  });

  it('no salta el parrafo que no cabe para tomar uno posterior mas corto', () => {
    const parrafos = ['a'.repeat(5990), 'b'.repeat(100), 'c'.repeat(5)];
    const resuelta = resolverCarta(carta({ parrafos }));

    expect(resuelta.parrafos).toEqual([parrafos[0]]);
  });

  it('acepta un total de exactamente 6000 caracteres', () => {
    const parrafos = ['x'.repeat(MAX_CARACTERES_CARTA)];
    const resuelta = resolverCarta(carta({ parrafos }));

    expect(resuelta.parrafos).toEqual(parrafos);
  });

  it('recorta el primer parrafo cuando por si solo excede el tope, sin dejar la Carta vacia', () => {
    const resuelta = resolverCarta(carta({ parrafos: ['y'.repeat(MAX_CARACTERES_CARTA + 500)] }));

    expect(resuelta.parrafos).toHaveLength(1);
    expect(resuelta.parrafos[0]).toHaveLength(MAX_CARACTERES_CARTA);
    expect(resuelta.disponible).toBe(true);
  });

  it('recorta sin partir un par suplente', () => {
    // 3000 emojis ocupan 6000 unidades de codigo; el caracter extra fuerza el recorte.
    const resuelta = resolverCarta(carta({ parrafos: [`${'🐱'.repeat(3000)}🏍`] }));

    const primero = resuelta.parrafos[0] ?? '';
    expect(primero).toHaveLength(MAX_CARACTERES_CARTA);
    expect([...primero]).toHaveLength(3000);
  });
});
