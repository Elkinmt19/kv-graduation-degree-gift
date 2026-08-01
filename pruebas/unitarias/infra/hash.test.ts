import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { digerir } from '../../../src/infra/hash';

/**
 * Pruebas unitarias del digesto SHA-256 del borde.
 *
 * Dos responsabilidades: que el digesto sea el SHA-256 real en hexadecimal
 * minuscula de 64 caracteres, el mismo que calcula el comando `hash-clave`
 * (Requisito 8.6), y que la ausencia de Web Crypto devuelva `null` en lugar de
 * lanzar, que es lo que lleva al Portal_Acceso al estado `sin-validacion`
 * (Requisito 1.11).
 *
 * Las pruebas de ausencia sustituyen `globalThis.crypto` y
 * `globalThis.isSecureContext`, y los restauran despues para no filtrar estado
 * a otros archivos de prueba.
 */

/** Digesto de referencia, calculado con la biblioteca estandar de Node. */
function referencia(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('digerir: digesto disponible (Requisitos 1.6 y 8.6)', () => {
  it('devuelve 64 caracteres hexadecimales minusculas', async () => {
    const digesto = await digerir('valentina');

    expect(digesto).toMatch(/^[0-9a-f]{64}$/);
  });

  it('coincide con el SHA-256 de node:crypto para el texto vacio', async () => {
    expect(await digerir('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await digerir('')).toBe(referencia(''));
  });

  it('coincide con el SHA-256 de node:crypto en textos con acentos y espacios', async () => {
    for (const texto of ['valentina', 'maria valentina', 'gradúa física ✨', 'clave con  espacios']) {
      expect(await digerir(texto)).toBe(referencia(texto));
    }
  });

  it('es determinista y distingue textos distintos', async () => {
    const [primero, segundo, otro] = await Promise.all([
      digerir('kawavalen'),
      digerir('kawavalen'),
      digerir('kawavalem'),
    ]);

    expect(primero).toBe(segundo);
    expect(otro).not.toBe(primero);
  });

  it('no normaliza el texto recibido: eso es responsabilidad de quien llama', async () => {
    // El Requisito 1.2 lo aplica `normalizarClave` antes de llamar aqui.
    expect(await digerir('  Valentina  ')).not.toBe(await digerir('valentina'));
    expect(await digerir('  Valentina  ')).toBe(referencia('  Valentina  '));
  });
});

describe('digerir: SHA-256 ausente lleva a sin-validacion (Requisito 1.11)', () => {
  it('devuelve null cuando Web Crypto no existe', async () => {
    vi.stubGlobal('crypto', undefined);

    expect(await digerir('valentina')).toBeNull();
  });

  it('devuelve null cuando crypto existe pero no expone subtle', async () => {
    vi.stubGlobal('crypto', {});

    expect(await digerir('valentina')).toBeNull();
  });

  it('devuelve null cuando subtle no expone digest', async () => {
    vi.stubGlobal('crypto', { subtle: {} });

    expect(await digerir('valentina')).toBeNull();
  });

  it('devuelve null cuando el contexto no es seguro', async () => {
    // `crypto.subtle` sigue presente: es `isSecureContext` quien lo descarta.
    vi.stubGlobal('isSecureContext', false);

    expect(await digerir('valentina')).toBeNull();
  });

  it('devuelve null cuando digest lanza', async () => {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: () => {
          throw new Error('operacion no permitida');
        },
      },
    });

    expect(await digerir('valentina')).toBeNull();
  });

  it('devuelve null cuando digest rechaza la promesa', async () => {
    vi.stubGlobal('crypto', {
      subtle: { digest: () => Promise.reject(new Error('calculo interrumpido')) },
    });

    expect(await digerir('valentina')).toBeNull();
  });

  it('devuelve null cuando el acceso a crypto lanza', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      get() {
        throw new Error('acceso a crypto denegado');
      },
    });

    try {
      expect(await digerir('valentina')).toBeNull();
    } finally {
      if (descriptor === undefined) {
        delete (globalThis as { crypto?: unknown }).crypto;
      } else {
        Object.defineProperty(globalThis, 'crypto', descriptor);
      }
    }
  });
});

describe('digerir: los sustitutos globales quedan restaurados', () => {
  it('vuelve a calcular el digesto real tras las pruebas de ausencia', async () => {
    expect(await digerir('valentina')).toBe(referencia('valentina'));
    expect(globalThis.isSecureContext).not.toBe(false);
  });
});
