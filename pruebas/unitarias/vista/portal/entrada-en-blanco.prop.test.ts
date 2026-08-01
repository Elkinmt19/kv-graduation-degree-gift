import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { crearEstadoSesion } from '../../../../src/infra/sesion.js';
import { normalizarClave } from '../../../../src/nucleo/clave.js';
import {
  CLASES_PORTAL,
  MENSAJE_REINTENTO,
  montarPortal,
} from '../../../../src/vista/portal/portal.js';
import { ESPACIOS_UNICODE, genClave, genEspacioInterno, genRelleno } from '../../../generadores.js';

/**
 * Propiedad 3: Toda entrada que se normaliza a longitud cero bloquea el
 * ingreso.
 *
 * **Validates: Requirements 1.5**
 *
 * Para toda cadena compuesta unicamente por caracteres de espacio en blanco
 * (incluida la cadena vacia), el boton de ingreso queda `disabled` y **todo**
 * envio del formulario deja el Portal_Acceso sin cambios.
 *
 * El corazon del requisito es que el envio se **ignora**, no que se trate como
 * clave equivocada: por eso la propiedad no solo comprueba que no se concede el
 * acceso, sino que `digerir` no se llama ni una vez, la sesion no registra nada
 * y el estado sigue en `reposo`, sin pasar por `reintento` ni publicar
 * `MENSAJE_REINTENTO`. Para que la ausencia de concesion sea significativa,
 * `digerir` devuelve siempre el Hash_Clave configurado: si el portal llegara a
 * llamarlo, el acceso se concederia y la propiedad fallaria.
 *
 * La transicion se recorre en las dos direcciones dentro de la misma iteracion:
 * escribir texto real habilita el boton y volver al espacio en blanco lo
 * deshabilita otra vez, que es lo que hace del requisito un «MIENTRAS» y no una
 * condicion de arranque.
 *
 * Vive bajo `pruebas/unitarias/vista/` porque `montarPortal` necesita DOM y ese
 * es el unico proyecto de Vitest que corre sobre jsdom; en
 * `pruebas/propiedades/` quedaria sin `document`, porque el proyecto `nucleo`
 * corre en `node` y excluye este arbol a proposito. El sufijo `.prop.test.ts`
 * la marca como prueba de propiedad para quien recorra el directorio.
 */

/** Hash_Clave configurado: 64 caracteres hexadecimales minusculos. */
const HASH_CLAVE = 'a'.repeat(64);

/** Cantidad de envios por iteracion: «todo envio» no es «el primer envio». */
const ENVIOS = 3;

/**
 * Valor que un `<input type="password">` conserva realmente para este texto.
 * El navegador (y jsdom) sanea los saltos de linea de los campos de una sola
 * linea, asi que las comprobaciones se hacen sobre lo que el campo guarda y no
 * sobre la cadena generada.
 */
function valorEnCampo(texto: string): string {
  const temporal = document.createElement('input');
  temporal.type = 'password';
  temporal.value = texto;
  return temporal.value;
}

/**
 * Entrada que se normaliza a longitud 0: la cadena vacia y las compuestas solo
 * por espacio en blanco, con sesgo hacia los espacios Unicode de
 * `ESPACIOS_UNICODE`, que son los que quedan pegados al copiar y pegar.
 */
const genEnBlanco: fc.Arbitrary<string> = fc.oneof(
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 3, arbitrary: genRelleno },
  { weight: 2, arbitrary: genEspacioInterno },
  { weight: 3, arbitrary: fc.constantFrom(...ESPACIOS_UNICODE) },
  {
    weight: 3,
    arbitrary: fc
      .array(fc.constantFrom(...ESPACIOS_UNICODE), { minLength: 1, maxLength: 64 })
      .map((partes) => partes.join('')),
  },
);

/** Texto real: el que sobrevive al campo con longitud normalizada >= 1. */
const genVisible: fc.Arbitrary<string> = genClave.filter(
  (clave) => normalizarClave(valorEnCampo(clave)).length > 0,
);

/**
 * Ejemplos obligatorios: cada caracter de `ESPACIOS_UNICODE` por separado y la
 * cadena vacia, para no depender del azar en los espacios menos frecuentes.
 */
const EJEMPLOS: [string, string][] = ['', ...ESPACIOS_UNICODE].map((blanco) => [
  blanco,
  'KawaValen',
]);

/** Espera los turnos de microtareas en que resolveria el digesto. */
async function esperarDigesto(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Propiedad 3: toda entrada que se normaliza a longitud cero bloquea el ingreso', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('para toda cadena de solo espacio en blanco', async () => {
    await fc.assert(
      fc.asyncProperty(genEnBlanco, genVisible, async (enBlanco, visible) => {
        document.body.replaceChildren();

        // La generadora promete entradas que se normalizan a longitud 0: queda
        // escrito aqui para que un cambio en ella no vacie la propiedad.
        expect(normalizarClave(valorEnCampo(enBlanco))).toBe('');
        expect(normalizarClave(valorEnCampo(visible)).length).toBeGreaterThan(0);

        const raiz = document.createElement('div');
        document.body.append(raiz);

        // Si el portal llamara a `digerir`, el digesto coincidiria con el
        // Hash_Clave y el acceso se concederia: la ausencia de concesion es una
        // consecuencia observable de que el envio se ignora.
        const digerir = vi.fn(() => Promise.resolve<string | null>(HASH_CLAVE));
        const alConcederAcceso = vi.fn();
        const sesion = crearEstadoSesion(null);
        const asa = montarPortal(raiz, {
          hashClave: HASH_CLAVE,
          digerir,
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

        /** Comprueba que nada se movio tras uno o varios envios ignorados. */
        const nadaCambio = (): void => {
          // Requisito 1.5: el boton no admite pulsacion.
          expect(boton.disabled).toBe(true);

          // El envio se ignora: `digerir` no se llega a llamar ni una vez.
          expect(digerir).not.toHaveBeenCalled();
          expect(alConcederAcceso).not.toHaveBeenCalled();
          expect(sesion.accesoConcedido()).toBe(false);

          // No es una clave equivocada: el estado sigue en reposo, sin mensaje
          // de reintento y sin marca de invalidez.
          expect(seccion.dataset['estado']).toBe('reposo');
          expect(seccion.hidden).toBe(false);
          expect(mensaje.textContent).toBe('');
          expect(mensaje.textContent).not.toBe(MENSAJE_REINTENTO);
          expect(campo.hasAttribute('aria-invalid')).toBe(false);
        };

        // Campo vacio al montar: el boton arranca deshabilitado.
        expect(boton.disabled).toBe(true);

        campo.value = enBlanco;
        campo.dispatchEvent(new Event('input', { bubbles: true }));
        expect(boton.disabled).toBe(true);

        for (let intento = 0; intento < ENVIOS; intento += 1) {
          formulario.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          await esperarDigesto();
          nadaCambio();
        }

        // Pulsar el boton deshabilitado tampoco desencadena nada.
        boton.click();
        await esperarDigesto();
        nadaCambio();
        expect(campo.value).toBe(valorEnCampo(enBlanco));

        // Ida: con texto real el boton se habilita.
        campo.value = visible;
        campo.dispatchEvent(new Event('input', { bubbles: true }));
        expect(boton.disabled).toBe(false);

        // Vuelta: al borrarlo hasta dejar solo espacio en blanco, se deshabilita
        // de nuevo y el envio vuelve a ignorarse.
        campo.value = enBlanco;
        campo.dispatchEvent(new Event('input', { bubbles: true }));
        formulario.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await esperarDigesto();
        nadaCambio();

        asa.destruir();
      }),
      { numRuns: 200, examples: EJEMPLOS },
    );
  });
});
