import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  listarOrigenesAjenos,
  verificarAusenciaDeClaveEnTextoClaro,
  verificarHashClave,
  verificarOrigenesAjenos,
  verificarPaquete,
} from '../../../herramientas/verificar-paquete.js';

/**
 * Pruebas de verificacion del paquete (Tarea 17.2).
 *
 * La primera prueba ejecuta la construccion real (`npm run build`) y aplica
 * `verificarPaquete` al `dist/` resultante: `dist/` no contiene ninguna clave
 * en texto claro, el Hash_Clave configurado cumple el formato exigido y
 * aparece en el paquete, y ningun archivo referencia un origen ajeno (aparte
 * del espacio de nombres XML de SVG, que no es una peticion de red).
 *
 * El resto de las pruebas ejercitan cada comprobacion por separado, sobre
 * contenido de ejemplo, para no depender de que `dist/` este en un estado u
 * otro.
 *
 * Requisitos: 1.6, 8.7.
 */

const RAIZ = join(__dirname, '..', '..', '..');
const HASH_VALIDO = 'a'.repeat(64);

function crearDistDeMuestra(): { ruta: string; limpiar: () => void } {
  const ruta = mkdtempSync(join(tmpdir(), 'verificar-paquete-'));
  return { ruta, limpiar: () => rmSync(ruta, { recursive: true, force: true }) };
}

describe('verificarPaquete sobre la construccion real', () => {
  it('dist/ construido no tiene clave en texto claro, tiene el Hash_Clave y ningun origen ajeno', () => {
    execFileSync('npm', ['run', 'build'], { cwd: RAIZ, stdio: 'ignore' });

    const configuracion = JSON.parse(
      readFileSync(join(RAIZ, 'regalo.config.json'), 'utf8'),
    ) as { hashClave: string };

    const resultado = verificarPaquete({
      rutaDist: join(RAIZ, 'dist'),
      hashClaveEsperado: configuracion.hashClave,
      claveTextoClaro: 'clave de prueba',
    });

    expect(resultado.problemas).toEqual([]);
    expect(resultado.valido).toBe(true);
    expect(resultado.archivosRevisados.length).toBeGreaterThan(0);
  }, 60_000);
});

describe('verificarHashClave', () => {
  it('reporta un problema cuando el hash no tiene el formato exigido', () => {
    const problemas = verificarHashClave(HASH_VALIDO, 'no-es-un-hash');
    expect(problemas.length).toBeGreaterThan(0);
  });

  it('reporta un problema cuando el hash valido no aparece en el contenido', () => {
    const problemas = verificarHashClave('contenido sin el hash', HASH_VALIDO);
    expect(problemas.length).toBe(1);
  });

  it('no reporta problemas cuando el hash valido aparece en el contenido', () => {
    const problemas = verificarHashClave(`algo antes ${HASH_VALIDO} algo despues`, HASH_VALIDO);
    expect(problemas).toEqual([]);
  });
});

describe('verificarAusenciaDeClaveEnTextoClaro', () => {
  it('no reporta problemas cuando no se le da ninguna clave para comprobar', () => {
    expect(verificarAusenciaDeClaveEnTextoClaro('cualquier contenido', undefined)).toEqual([]);
  });

  it('detecta la clave tal cual, en mayuscula y normalizada', () => {
    expect(
      verificarAusenciaDeClaveEnTextoClaro('...KawaValen...', 'kawavalen').length,
    ).toBeGreaterThan(0);
    expect(
      verificarAusenciaDeClaveEnTextoClaro('...  KawaValen  ...', '  KawaValen  ').length,
    ).toBeGreaterThan(0);
  });

  it('no reporta nada cuando la clave no esta en el contenido', () => {
    expect(verificarAusenciaDeClaveEnTextoClaro('contenido inocuo', 'clave secreta')).toEqual([]);
  });
});

describe('verificarOrigenesAjenos', () => {
  it('ignora el espacio de nombres XML de SVG', () => {
    expect(listarOrigenesAjenos('xmlns="http://www.w3.org/2000/svg"')).toEqual([]);
    expect(verificarOrigenesAjenos('xmlns="http://www.w3.org/2000/svg"')).toEqual([]);
  });

  it('reporta cualquier otro origen absoluto', () => {
    const problemas = verificarOrigenesAjenos('fetch("https://fonts.googleapis.com/css")');
    expect(problemas).toHaveLength(1);
    expect(problemas[0]?.mensaje).toContain('fonts.googleapis.com');
  });
});

describe('verificarPaquete sobre un dist/ de muestra', () => {
  it('acumula todos los problemas de una sola pasada', () => {
    const { ruta, limpiar } = crearDistDeMuestra();
    try {
      writeFileSync(
        join(ruta, 'index.html'),
        '<script>fetch("https://ajeno.example/x")</script><span>clave-secreta</span>',
      );

      const resultado = verificarPaquete({
        rutaDist: ruta,
        hashClaveEsperado: 'formato-invalido',
        claveTextoClaro: 'clave-secreta',
      });

      expect(resultado.valido).toBe(false);
      expect(resultado.problemas.length).toBeGreaterThanOrEqual(3);
    } finally {
      limpiar();
    }
  });
});
