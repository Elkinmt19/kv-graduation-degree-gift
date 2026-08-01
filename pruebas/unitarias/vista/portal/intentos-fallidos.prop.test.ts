import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { crearEstadoSesion } from '../../../../src/infra/sesion.js';
import { normalizarClave } from '../../../../src/nucleo/clave.js';
import {
  CLASES_PORTAL,
  MENSAJE_REINTENTO,
  montarPortal,
} from '../../../../src/vista/portal/portal.js';
import { genClave } from '../../../generadores.js';

/**
 * Propiedad 4: Los intentos fallidos no acumulan estado.
 *
 * **Validates: Requirements 1.10**
 *
 * *Para toda* cantidad de intentos fallidos consecutivos, el intento siguiente
 * con la Clave_Acceso correcta concede el acceso, sin bloqueo ni retardo
 * impuesto entre intentos.
 *
 * Cada iteracion envia una secuencia de N claves equivocadas (N entre 1 y 12) y
 * comprueba tres cosas:
 *
 * - **Sin estado acumulado**: lo observable tras el intento N es identico a lo
 *   observable tras el intento 1: `data-estado`, texto del mensaje, campo
 *   vacio, foco en el campo, `aria-invalid`, portal visible, sesion sin acceso
 *   y boton que vuelve a admitir pulsacion en cuanto se escribe. No hay
 *   contador que empeore la vista intento a intento.
 * - **Sin bloqueo**: el intento N+1 con la Clave_Acceso correcta concede el
 *   acceso igual que si fuera el primero. Aqui esta el filo del requisito: por
 *   muchos fallos que haya habido, ningun cierre temporal se activa nunca.
 * - **Sin retardo impuesto**: ningun intento deja agendada una espera. Con
 *   temporizadores falsos, el estado ya es el definitivo tras los mismos dos
 *   turnos de microtareas en que resuelve el digesto, sin avanzar el reloj: si
 *   el portal esperara un `setTimeout`, ahi no habria llegado nada. Ademas se
 *   cuenta cuantos temporizadores con espera real dejo cada intento, y son
 *   cero. No se cuentan los agendados a 0 ms porque son de jsdom, que asi
 *   despacha el evento `select` cuando el campo toma el foco; se drenan antes
 *   de medir. El digesto se pide exactamente una vez por intento.
 *
 * Vive bajo `pruebas/unitarias/vista/` porque `montarPortal` necesita DOM: ese
 * es el unico proyecto de Vitest que corre sobre jsdom (el proyecto `nucleo`
 * corre en `node` y excluye este arbol a proposito). El sufijo `.prop.test.ts`
 * la marca como prueba de propiedad para quien recorra el directorio.
 *
 * El digesto es una funcion falsa y determinista, igual que en la Propiedad 2:
 * lo que se prueba es la ausencia de estado acumulado entre intentos, no el
 * algoritmo SHA-256, que se verifica aparte.
 */

/** Longitud del Hash_Clave, en caracteres (Requisito 1.6). */
const LONGITUD_HASH = 64;

/** Cantidad maxima de intentos fallidos consecutivos por iteracion. */
const MAXIMOS_INTENTOS = 12;

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
 * caracteres en minuscula, determinista y sin depender de `crypto.subtle`.
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
 * Valor que un `<input type="password">` conserva realmente para este texto.
 * El navegador (y jsdom) sanea los saltos de linea de los campos de una sola
 * linea, asi que la clave normalizada se calcula sobre lo que el campo guarda,
 * no sobre la cadena generada.
 */
function valorEnCampo(texto: string): string {
  const temporal = document.createElement('input');
  temporal.type = 'password';
  temporal.value = texto;
  return temporal.value;
}

/** Clave normalizada tal como la vera el Portal_Acceso (Requisito 1.2). */
function claveEfectiva(texto: string): string {
  return normalizarClave(valorEnCampo(texto));
}

/**
 * Clave_Acceso escribible: la que sobrevive al campo con longitud normalizada
 * mayor o igual a 1. Las que se normalizan a longitud 0 ni siquiera llegan a
 * compararse (Requisito 1.5) y son asunto de la Propiedad 3.
 */
const genClaveEscribible: fc.Arbitrary<string> = genClave.filter(
  (clave) => claveEfectiva(clave).length > 0,
);

/** Secuencia de 1 a 12 intentos consecutivos, todos escribibles. */
const genSecuenciaIntentos: fc.Arbitrary<readonly string[]> = fc.array(genClaveEscribible, {
  minLength: 1,
  maxLength: MAXIMOS_INTENTOS,
});

/** Estado observable del Portal_Acceso justo despues de un envio. */
interface Observacion {
  readonly estado: string | undefined;
  readonly mensaje: string | null;
  readonly valorCampo: string;
  readonly campoInvalido: string | null;
  readonly campoEnfocado: boolean;
  readonly seccionOculta: boolean;
  readonly botonDeshabilitado: boolean;
  readonly accesoConcedido: boolean;
  /** El boton admitia pulsacion al escribir la clave de este intento. */
  readonly botonHabilitadoAlEscribir: boolean;
  /** Temporizadores con espera real que dejo el intento (Requisito 1.10). */
  readonly temporizadoresConRetardo: number;
}

/** Espera los turnos de microtareas en que resuelve el digesto. */
async function esperarDigesto(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Propiedad 4: los intentos fallidos no acumulan estado', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    // Requisito 1.10: con temporizadores falsos, y sin avanzar nunca el reloj
    // antes de observar, cualquier retardo impuesto se delata solo.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('para toda secuencia de intentos fallidos consecutivos', async () => {
    await fc.assert(
      fc.asyncProperty(
        genClaveEscribible,
        genSecuenciaIntentos,
        async (claveCorrecta, intentosFallidos) => {
          const correcta = claveEfectiva(claveCorrecta);
          const hashClave = digestoFalso(correcta);
          expect(hashClave).toHaveLength(LONGITUD_HASH);

          // Una clave «fallida» que coincidiera con la correcta contradiria el
          // enunciado, no al portal: se descarta la iteracion.
          fc.pre(intentosFallidos.every((clave) => claveEfectiva(clave) !== correcta));

          document.body.replaceChildren();
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
          const boton = raiz.querySelector('button');
          const mensaje = raiz.querySelector(`.${CLASES_PORTAL.mensaje}`);
          if (
            seccion === null ||
            formulario === null ||
            campo === null ||
            boton === null ||
            mensaje === null
          ) {
            throw new Error('el Portal_Acceso no monto su formulario');
          }

          /**
           * Escribe la clave y envia el formulario, como haria una persona, y
           * devuelve lo observable sin haber avanzado el reloj.
           */
          const enviar = async (clave: string): Promise<Observacion> => {
            campo.value = clave;
            campo.dispatchEvent(new Event('input', { bubbles: true }));
            // El boton vuelve a admitir pulsacion sin importar cuantos fallos
            // hubo antes (Requisito 1.10).
            const botonHabilitadoAlEscribir = !boton.disabled;

            // Linea base: se drena lo agendado a 0 ms para que al medir solo
            // queden temporizadores con espera real, sean del portal o ajenos.
            vi.advanceTimersByTime(0);
            const antes = vi.getTimerCount();

            formulario.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await esperarDigesto();

            // Se observa antes de tocar el reloj: el estado ya tiene que estar.
            const observacionSinRetardos = {
              estado: seccion.dataset['estado'],
              mensaje: mensaje.textContent,
              valorCampo: campo.value,
              campoInvalido: campo.getAttribute('aria-invalid'),
              campoEnfocado: document.activeElement === campo,
              seccionOculta: seccion.hidden,
              botonDeshabilitado: boton.disabled,
              accesoConcedido: sesion.accesoConcedido(),
              botonHabilitadoAlEscribir,
            };

            // Se drenan los agendados a 0 ms y se cuenta lo que queda: eso es
            // lo que impondria una espera. Los de 0 ms son de jsdom, que agenda
            // asi el evento `select` cuando el campo toma el foco.
            vi.advanceTimersByTime(0);
            const conRetardo = vi.getTimerCount() - antes;

            return { ...observacionSinRetardos, temporizadoresConRetardo: conRetardo };
          };

          const observaciones: Observacion[] = [];
          for (const clave of intentosFallidos) {
            observaciones.push(await enviar(clave));
          }

          const primera = observaciones[0];
          if (primera === undefined) {
            throw new Error('la secuencia de intentos llego vacia');
          }

          // Estado esperado tras un fallo, escrito una sola vez (Requisito 1.4).
          expect(primera).toEqual<Observacion>({
            estado: 'reintento',
            mensaje: MENSAJE_REINTENTO,
            valorCampo: '',
            campoInvalido: 'true',
            campoEnfocado: true,
            seccionOculta: false,
            botonDeshabilitado: true,
            accesoConcedido: false,
            botonHabilitadoAlEscribir: true,
            temporizadoresConRetardo: 0,
          });

          // El nucleo de la propiedad: el intento N se ve igual que el intento 1.
          for (const observacion of observaciones) {
            expect(observacion).toEqual(primera);
          }

          // Ni concesion ni bloqueo por el camino: un digesto por intento.
          expect(alConcederAcceso).not.toHaveBeenCalled();
          expect(recibidos).toEqual(intentosFallidos.map((clave) => claveEfectiva(clave)));

          // Requisito 1.10: la Clave_Acceso correcta sigue abriendo la puerta
          // despues de cualquier cantidad de fallos.
          const ultima = await enviar(claveCorrecta);
          expect(ultima.botonHabilitadoAlEscribir).toBe(true);
          expect(ultima.estado).toBe('concedido');
          expect(ultima.seccionOculta).toBe(true);
          expect(ultima.mensaje).toBe('');
          expect(ultima.campoInvalido).toBeNull();
          expect(ultima.accesoConcedido).toBe(true);
          // La concesion tampoco impone espera alguna (Requisitos 1.3 y 1.10).
          expect(ultima.temporizadoresConRetardo).toBe(0);
          expect(alConcederAcceso).toHaveBeenCalledTimes(1);
          expect(recibidos).toHaveLength(intentosFallidos.length + 1);

          asa.destruir();
        },
      ),
      { numRuns: 100 },
    );
  });
});
