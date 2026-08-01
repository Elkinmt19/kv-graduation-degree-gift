import { describe, expect, it } from 'vitest';
import { normalizarClave } from '../../../src/nucleo/clave.js';

describe('normalizarClave (Requisito 1.2)', () => {
  it('recorta los espacios en blanco iniciales y finales', () => {
    expect(normalizarClave('  obsidian  ')).toBe('obsidian');
    expect(normalizarClave('\t\n obsidian \r\n')).toBe('obsidian');
  });

  it('conserva los espacios internos', () => {
    expect(normalizarClave('  michi y guchi  ')).toBe('michi y guchi');
  });

  it('convierte las letras a minusculas', () => {
    expect(normalizarClave('KawaValen Z650')).toBe('kawavalen z650');
  });

  it('devuelve cadena vacia cuando la entrada es vacia o solo espacios', () => {
    expect(normalizarClave('')).toBe('');
    expect(normalizarClave('   \t\n  ')).toBe('');
  });

  it('no aplica normalizacion Unicode', () => {
    // 'e' + U+0301 (combinante) se mantiene descompuesta, distinta de 'é' compuesta.
    expect(normalizarClave('e\u0301')).toBe('e\u0301');
    expect(normalizarClave('e\u0301')).not.toBe('\u00e9');
  });
});
