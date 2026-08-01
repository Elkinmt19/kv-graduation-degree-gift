import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { crearEstadoSesion } from '../../../../src/infra/sesion.js';
import { normalizarClave } from '../../../../src/nucleo/clave.js';
import {
  CLASES_PORTAL,
  MENSAJE_REINTENTO,
  MENSAJE_SIN_VALIDACION,
  montarPortal,
} from '../../../../src/vista/portal/portal.js';
import { genClave } from '../../../generadores.js';

/**
 * Propiedad 2: La puerta de acceso se abre exactamente cuando los hashes
 * coinciden.
 *
 * **Validates: Requirements 1.3, 1.4**
 *
 * La propiedad es un «si y solo si», asi que cada iteracion recorre una de las
 * dos direcciones con el mismo par (clave, Hash_Clave):
 *
 * - digesto igual al Hash_Clave: se concede el acceso, se registra la sesion y
 *   el portal pasa a `concedido` (Requisito 1.3).
 * - digesto distinto: no se concede nada, la sesion sigue limpia, el campo
 *   queda vacio y con el foco, el mensaje de reintento queda visible y el
 *   portal sigue en pantalla (Requisito 1.4).
 *
 * Vive bajo `pruebas/unitarias/vista/` porque necesita DOM: ese es el unico
 * proyecto de Vitest que corre sobre jsdom. En `pruebas/propiedades/` quedaria
 * sin `document`, porque el proyecto `nucleo` corre en `node` y excluye este
 * arbol a proposito; el sufijo `.prop.test.ts` la marca como prueba de
 * propiedad para quien recorra el directorio. Por la misma razon no se importa
 * `pruebas/utilidades/estilos.ts`: dentro del proyecto `vista` los modulos se
 * sirven por HTTP y su resolucion de rutas de disco no funciona.
 *
 * El digesto es una funcion falsa y determinista (`digestoFalso`) en lugar de la
 * Web Crypto real: la propiedad habla de la comparacion de dos cadenas
 * hexadecimales, no del algoritmo SHA-256, que ya se verifica aparte. Asi cada
 * iteracion es exacta y no depende de que jsdom exponga `crypto.subtle`. El
 * Hash_Clave configurado se genera en las dos variantes que importan: el propio
 * digesto de la clave (rama que coincide) y un digesto mutado en un solo
 * caracter o en los 64 (rama que no coincide, incluido el casi-acierto).
 */

/** Digitos del Hash_Clave: hexadecimal minuscula (Requisitos 1.6, 8.1). */
const HEX = '0123456789abcdef';

/** Longitud del Hash_Clave, en caracteres. */
const LONGITUD_HASH = 64;

/** FNV-1a de 32 bits sobre las unidades de codigo del texto, con semilla. */
function fnv1a(texto: string, semilla: number): number {
  let acumulado = semilla >>> 0;
  for (let indice = 0; indice < texto.length; indice += 1) {
    acumulado = (acumulado ^ texto.charCodeAt(indice)) >>> 0;
    acumulado = Math.imul(acumulado, 0x01000193) >>> 0;
  }
  return acumulado >>> 0;
}

/**
 * Digesto de juguete con la forma exacta de un SHA-256 hexadecimal: 64
 * caracteres en minuscula. Ocho palabras FNV-1a con semillas distintas, de modo
 * que dos claves parecidas producen digestos muy distintos.
 */
function digestoFalso(texto: string): string {
  let salida = '';
  for (let palabra = 0; palabra < 8; palabra += 1) {
    const semilla = (0x811c9dc5 + Math.imul(palabra, 0x9e3779b9)) >>> 0;
    salida += fnv1a(texto, semilla).toString(16).padStart(8, '0');
  }
  return salida;
}

/**
 * Desplaza `salto` posiciones cada digito hexadecimal indicado. Con `salto` en
 * [1, 15] el resultado difiere del original en **todas** las posiciones
 * tocadas, asi que la rama que no coincide nunca colisiona por azar.
 */
function mutarHex(hash: string, posiciones: readonly number[], salto: number): string {
  const digitos = [...hash];
  for (const posicion of posiciones) {
    const actual = HEX.indexOf(digitos[posicion] ?? '0');
    digitos[posicion] = HEX[(actual + salto) % HEX.length] ?? '0';
  }
  return digitos.join('');
}

/** Forma en que se configura el Hash_Clave frente al digesto de la clave. */
type Configuracion =
  | { readonly clase: 'coincide' }
  | { readonly clase: 'un-caracter'; readonly posicion: number; readonly salto: number }
  | { readonly clase: 'todos-los-caracteres'; readonly salto: number };

/**
 * Hash_Clave configurado: el digesto exacto de la clave, o el mismo digesto
 * alterado en una sola posicion (casi-acierto) o en las 64.
 */
const genConfiguracion: fc.Arbitrary<Configuracion> = fc.oneof(
  { weight: 3, arbitrary: fc.constant<Configuracion>({ clase: 'coincide' }) },
  {
    weight: 3,
    arbitrary: fc.record({
      clase: fc.constant('un-caracter' as const),
      posicion: fc.integer({ min: 0, max: LONGITUD_HASH - 1 }),
      salto: fc.integer({ min: 1, max: 15 }),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      clase: fc.constant('todos-los-caracteres' as const),
      salto: fc.integer({ min: 1, max: 15 }),
    }),
  },
);

/** Aplica la configuracion sobre el digesto esperado de la clave. */
function hashConfigurado(esperado: string, configuracion: Configuracion): string {
  if (configuracion.clase === 'coincide') {
    return esperado;
  }
  if (configuracion.clase === 'un-caracter') {
    return mutarHex(esperado, [configuracion.posicion], configuracion.salto);
  }
  return mutarHex(
    esperado,
    Array.from({ length: LONGITUD_HASH }, (_, indice) => indice),
    configuracion.salto,
  );
}

/**
 * Valor que un `<input type="password">` conserva realmente para este texto.
 * El navegador (y jsdom) sanea los saltos de linea de los campos de una sola
 * linea, asi que el digesto esperado se calcula sobre lo que el campo guarda,
 * no sobre la cadena generada.
 */
function valorEnCampo(texto: string): string {
  const temporal = document.createElement('input');
  temporal.type = 'password';
  temporal.value = texto;
  return temporal.value;
}

/**
 * Clave_Acceso escribible: la que sobrevive al campo con longitud normalizada
 * mayor o igual a 1. Las que se normalizan a longitud 0 no llegan a compararse
 * (Requisito 1.5) y son asunto de la Propiedad 3.
 */
const genClaveEscribible: fc.Arbitrary<string> = genClave.filter(
  (clave) => normalizarClave(valorEnCampo(clave)).length > 0,
);

/** Espera los turnos de microtareas en que resuelve el digesto. */
async function esperarDigesto(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Propiedad 2: la puerta de acceso se abre exactamente cuando los hashes coinciden', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('para toda Clave_Acceso y todo Hash_Clave configurado', async () => {
    // Un bicondicional que solo viera una de sus dos ramas no probaria nada, asi
    // que al final se comprueba que ambas se ejercitaron de verdad.
    let concesiones = 0;
    let reintentos = 0;

    await fc.assert(
      fc.asyncProperty(genClaveEscribible, genConfiguracion, async (clave, configuracion) => {
        document.body.replaceChildren();

        const claveNormalizada = normalizarClave(valorEnCampo(clave));
        const esperado = digestoFalso(claveNormalizada);
        const hashClave = hashConfigurado(esperado, configuracion);
        const coincide = hashClave === esperado;

        // Los dos lados del «si y solo si» quedan escritos por construccion.
        expect(coincide).toBe(configuracion.clase === 'coincide');
        expect(hashClave).toHaveLength(LONGITUD_HASH);

        const raiz = document.createElement('div');
        document.body.append(raiz);

        const recibidos: string[] = [];
        const alConcederAcceso = vi.fn();
        const sesion = crearEstadoSesion(null);
        const asa = montarPortal(raiz, {
          hashClave,
          digerir: (texto: string) => {
            recibidos.push(texto);
            return Promise.resolve(digestoFalso(texto));
          },
          sesion,
          alConcederAcceso,
        });

        const seccion = raiz.querySelector('section');
        const formulario = raiz.querySelector('form');
        const campo = raiz.querySelector('input');
        const mensaje = raiz.querySelector(`.${CLASES_PORTAL.mensaje}`);
        if (seccion === null || formulario === null || campo === null || mensaje === null) {
          throw new Error('el Portal_Acceso no monto su formulario');
        }

        // Sesion nueva: nada concedido antes del envio (Requisito 1.9).
        expect(alConcederAcceso).not.toHaveBeenCalled();
        expect(sesion.accesoConcedido()).toBe(false);

        campo.value = clave;
        campo.dispatchEvent(new Event('input', { bubbles: true }));
        formulario.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await esperarDigesto();

        // El digesto se calcula sobre el texto ya normalizado, una sola vez.
        expect(recibidos).toEqual([claveNormalizada]);

        if (coincide) {
          concesiones += 1;

          // Requisito 1.3: concede una sola vez, registra la sesion y se retira.
          expect(alConcederAcceso).toHaveBeenCalledTimes(1);
          expect(sesion.accesoConcedido()).toBe(true);
          expect(seccion.dataset['estado']).toBe('concedido');
          expect(seccion.hidden).toBe(true);
          expect(mensaje.textContent).toBe('');
        } else {
          reintentos += 1;

          // Requisito 1.4: conserva la vista, limpia, devuelve el foco y avisa.
          expect(alConcederAcceso).not.toHaveBeenCalled();
          expect(sesion.accesoConcedido()).toBe(false);
          expect(campo.value).toBe('');
          expect(document.activeElement).toBe(campo);
          expect(mensaje.textContent).toBe(MENSAJE_REINTENTO);
          expect(mensaje.textContent).not.toBe(MENSAJE_SIN_VALIDACION);
          expect(seccion.dataset['estado']).toBe('reintento');
          expect(seccion.hidden).toBe(false);
        }

        asa.destruir();
      }),
      { numRuns: 200 },
    );

    expect(concesiones).toBeGreaterThan(0);
    expect(reintentos).toBeGreaterThan(0);
  });
});
