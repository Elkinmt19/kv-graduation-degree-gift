import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { digerir } from '../../src/infra/hash.js';
import { normalizarClave } from '../../src/nucleo/clave.js';
import { genClave, genRelleno } from '../generadores.js';

/**
 * Propiedad 33: El comando de hash y el Portal_Acceso coinciden siempre.
 *
 * **Validates: Requirements 8.6**
 *
 * Las dos rutas de calculo del Hash_Clave son distintas por construccion: el
 * comando `hash-clave` usa `node:crypto` (`createHash('sha256')`) y el
 * Portal_Acceso usa Web Crypto (`digerir`, sobre `crypto.subtle`). Esta
 * propiedad las compara para toda Clave_Acceso en texto claro, incluidas las
 * variantes que solo difieren en el espacio en blanco de los extremos o en el
 * uso de mayusculas (Requisitos 1.2 y 8.6).
 *
 * `crypto.subtle` existe en Node 20 a traves de `globalThis.crypto`, asi que
 * `digerir` es ejecutable en el proyecto `nucleo` de Vitest sin navegador.
 */

/** Forma exigida al Hash_Clave: 64 caracteres hexadecimales minusculos. */
const HEXADECIMAL_64 = /^[0-9a-f]{64}$/u;

/**
 * Reproduce el calculo del comando `hash-clave`: SHA-256 sobre la clave ya
 * normalizada, con `node:crypto` y salida hexadecimal.
 */
function digestoComando(claveNormalizada: string): string {
  return createHash('sha256').update(claveNormalizada, 'utf8').digest('hex');
}

/** Ejecuta el comando real y devuelve su salida estandar sin el salto final. */
function ejecutarComando(clave: string): string {
  return execFileSync('npx', ['tsx', 'herramientas/hash-clave.ts', clave], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/**
 * Cambia a mayuscula los caracteres marcados por `semillas`, y solo aquellos
 * cuyo paso a mayuscula vuelve al mismo caracter al pasarlo de nuevo a
 * minuscula. Se excluyen los casos que no dan la vuelta (la 'ß' alemana pasa a
 * 'SS', la 'İ' turca gana una marca diacritica): en ellos el texto original y
 * su variante son claves distintas, no la misma escrita de otro modo.
 */
function variarMayusculas(texto: string, semillas: readonly boolean[]): string {
  let resultado = '';
  let posicion = 0;
  for (const punto of texto) {
    const enMayuscula = punto.toUpperCase();
    const marcado = semillas[posicion % semillas.length] === true;
    resultado += marcado && enMayuscula.toLowerCase() === punto ? enMayuscula : punto;
    posicion += 1;
  }
  return resultado;
}

/** Semillas para `variarMayusculas`: al menos una, para que la variante exista. */
const genSemillas: fc.Arbitrary<readonly boolean[]> = fc.array(fc.boolean(), {
  minLength: 1,
  maxLength: 8,
});

describe('Propiedad 33: el comando de hash y el Portal_Acceso coinciden siempre', () => {
  it('para toda Clave_Acceso, las dos rutas emiten el mismo hexadecimal de 64 caracteres', async () => {
    await fc.assert(
      fc.asyncProperty(
        genClave,
        genRelleno,
        genRelleno,
        genSemillas,
        async (clave, izquierda, derecha, semillas) => {
          const normalizada = normalizarClave(clave);

          // El comando rechaza la clave cuya normalizacion queda vacia
          // (Requisito 1.5), igual que el Portal_Acceso ignora ese envio: no
          // hay Hash_Clave que comparar.
          fc.pre(normalizada.length > 0);

          const porComando = digestoComando(normalizada);
          const porPortal = await digerir(normalizada);

          // 1. Las dos rutas emiten 64 caracteres hexadecimales minusculos.
          expect(porComando).toMatch(HEXADECIMAL_64);
          expect(porPortal).toMatch(HEXADECIMAL_64);

          // 2. Y emiten exactamente el mismo digesto.
          expect(porPortal).toBe(porComando);

          // 3. Las variantes que solo difieren en el espacio en blanco de los
          //    extremos o en el uso de mayusculas producen el mismo Hash_Clave
          //    en las dos rutas.
          const variante = `${izquierda}${variarMayusculas(clave, semillas)}${derecha}`;
          const varianteNormalizada = normalizarClave(variante);
          expect(varianteNormalizada).toBe(normalizada);
          expect(digestoComando(varianteNormalizada)).toBe(porComando);
          expect(await digerir(varianteNormalizada)).toBe(porComando);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Ancla la reproduccion del calculo del comando contra el comando real: sin
  // esto, la propiedad compararia `node:crypto` con Web Crypto sin evidencia de
  // que el comando use esa misma ruta. Se limita a unas pocas claves porque
  // cada ejecucion arranca un proceso.
  it('el comando real emite el mismo hash que la ruta del Portal_Acceso', async () => {
    const claves = ['Clave De Ejemplo', '  KawaValen 2025  ', 'ñÁndeß 🐱 con espacios internos'];

    for (const clave of claves) {
      const normalizada = normalizarClave(clave);
      const salida = ejecutarComando(clave);

      expect(salida).toMatch(HEXADECIMAL_64);
      expect(salida).toBe(digestoComando(normalizada));
      expect(await digerir(normalizada)).toBe(salida);
    }
  }, 60_000);
});
