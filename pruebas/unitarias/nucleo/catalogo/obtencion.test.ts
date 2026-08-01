import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Reloj, RespuestaRecurso, Traer } from '../../../../src/infra/recursos';
import {
  MS_LIMITE_LECTURA,
  MS_LIMITE_OBTENCION,
  obtenerCatalogo,
} from '../../../../src/nucleo/catalogo/lector';

/** Documento minimo valido, suficiente para que la lectura tenga exito. */
const DOCUMENTO_VALIDO = JSON.stringify({
  version: 1,
  epoca: 'J2000.0',
  atribucion: 'HYG Database v3 (CC BY-SA 2.5)',
  estrellas: [
    { nombre: 'Sirio', ar: 6.752481, dec: -16.716116, magnitud: -1.44, constelacion: 'Can Mayor' },
    { nombre: 'Mirzam', ar: 6.378329, dec: -17.955918, magnitud: 1.98, constelacion: 'Can Mayor' },
  ],
  segmentos: [{ desde: 'Sirio', hasta: 'Mirzam' }],
});

/**
 * Reloj determinista acoplado a los temporizadores falsos: al avanzar el tiempo
 * simulado avanza tambien la fuente que mide lo transcurrido, de modo que no
 * hay reloj real ni red en ninguna prueba.
 */
function relojControlado(): {
  reloj: Reloj;
  avanzar: (ms: number) => Promise<void>;
} {
  let ms = 0;
  return {
    reloj: { ahora: () => ms },
    async avanzar(delta: number): Promise<void> {
      ms += delta;
      await vi.advanceTimersByTimeAsync(delta);
    },
  };
}

/** Respuesta exitosa cuyo cuerpo se entrega de inmediato. */
function respuestaCon(texto: string): RespuestaRecurso {
  return { ok: true, estado: 200, texto: () => Promise.resolve(texto) };
}

/** `Traer` que nunca responde y solo rechaza cuando la senal se dispara. */
const traerQueNuncaResponde: Traer = (_ruta, opciones) =>
  new Promise((_resolver, rechazar) => {
    opciones?.senal?.addEventListener('abort', () => {
      rechazar(new Error('obtencion cancelada'));
    });
  });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('obtenerCatalogo: obtencion exitosa (Requisito 2.8)', () => {
  it('entrega el catalogo leido cuando el documento llega dentro del presupuesto', async () => {
    const { reloj, avanzar } = relojControlado();
    const traer: Traer = () => Promise.resolve(respuestaCon(DOCUMENTO_VALIDO));

    const promesa = obtenerCatalogo(traer, reloj, 'datos/catalogo-estelar.json');
    await avanzar(0);
    const resultado = await promesa;

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.catalogo.estrellas).toHaveLength(2);
  });

  it('pide la ruta recibida y acompania la peticion con una senal de cancelacion', async () => {
    const { reloj, avanzar } = relojControlado();
    const rutas: string[] = [];
    let senalRecibida: AbortSignal | undefined;
    const traer: Traer = (ruta, opciones) => {
      rutas.push(ruta);
      senalRecibida = opciones?.senal;
      return Promise.resolve(respuestaCon(DOCUMENTO_VALIDO));
    };

    const promesa = obtenerCatalogo(traer, reloj, 'datos/catalogo-estelar.json');
    await avanzar(0);
    await promesa;

    expect(rutas).toEqual(['datos/catalogo-estelar.json']);
    expect(senalRecibida).toBeInstanceOf(AbortSignal);
    expect(senalRecibida?.aborted).toBe(false);
  });

  it('conserva la clase del error de contenido cuando el documento llega completo', async () => {
    const { reloj, avanzar } = relojControlado();
    const traer: Traer = () => Promise.resolve(respuestaCon('{"version": 1, "epoca": }'));

    const promesa = obtenerCatalogo(traer, reloj, 'datos/catalogo-estelar.json');
    await avanzar(0);
    const resultado = await promesa;

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.clase).toBe('sintaxis-invalida');
  });

  it('no deja temporizadores pendientes tras una obtencion exitosa', async () => {
    const { reloj, avanzar } = relojControlado();
    const traer: Traer = () => Promise.resolve(respuestaCon(DOCUMENTO_VALIDO));

    const promesa = obtenerCatalogo(traer, reloj, 'datos/catalogo-estelar.json');
    await avanzar(0);
    await promesa;

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('obtenerCatalogo: catalogo que no puede obtenerse (Requisito 2.8)', () => {
  it('devuelve indisponible por red cuando la peticion falla', async () => {
    const { reloj, avanzar } = relojControlado();
    const traer: Traer = () => Promise.reject(new Error('sin conexion'));

    const promesa = obtenerCatalogo(traer, reloj, 'datos/catalogo-estelar.json');
    await avanzar(120);
    const resultado = await promesa;

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({
      clase: 'indisponible',
      motivo: 'red',
      msTranscurridos: 120,
    });
    expect(resultado).not.toHaveProperty('catalogo');
  });

  it('devuelve indisponible por red ante un codigo de estado fuera de 200-299', async () => {
    const { reloj, avanzar } = relojControlado();
    const traer: Traer = () =>
      Promise.resolve({ ok: false, estado: 404, texto: () => Promise.resolve('') });

    const promesa = obtenerCatalogo(traer, reloj, 'datos/catalogo-estelar.json');
    await avanzar(0);
    const resultado = await promesa;

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'indisponible', motivo: 'red', msTranscurridos: 0 });
  });

  it('devuelve indisponible por red cuando el cuerpo no puede leerse', async () => {
    const { reloj, avanzar } = relojControlado();
    const traer: Traer = () =>
      Promise.resolve({
        ok: true,
        estado: 200,
        texto: () => Promise.reject(new Error('flujo interrumpido')),
      });

    const promesa = obtenerCatalogo(traer, reloj, 'datos/catalogo-estelar.json');
    await avanzar(40);
    const resultado = await promesa;

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'indisponible', motivo: 'red', msTranscurridos: 40 });
  });
});

describe('obtenerCatalogo: limite de 3000 ms para la obtencion (Requisito 2.8)', () => {
  it('cancela la peticion y devuelve tiempo-excedido con los ms transcurridos', async () => {
    const { reloj, avanzar } = relojControlado();
    let senal: AbortSignal | undefined;
    const traer: Traer = (ruta, opciones) => {
      senal = opciones?.senal;
      return traerQueNuncaResponde(ruta, opciones);
    };

    const promesa = obtenerCatalogo(traer, reloj, 'datos/catalogo-estelar.json');
    await avanzar(MS_LIMITE_OBTENCION);
    const resultado = await promesa;

    expect(senal?.aborted).toBe(true);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({
      clase: 'indisponible',
      motivo: 'tiempo-excedido',
      msTranscurridos: MS_LIMITE_OBTENCION,
    });
    expect(resultado).not.toHaveProperty('catalogo');
  });

  it('no cancela una obtencion que responde justo antes del limite', async () => {
    const { reloj, avanzar } = relojControlado();
    const traer: Traer = () =>
      new Promise((resolver) => {
        setTimeout(() => resolver(respuestaCon(DOCUMENTO_VALIDO)), MS_LIMITE_OBTENCION - 1);
      });

    const promesa = obtenerCatalogo(traer, reloj, 'datos/catalogo-estelar.json');
    await avanzar(MS_LIMITE_OBTENCION - 1);
    const resultado = await promesa;

    expect(resultado.ok).toBe(true);
  });
});

describe('obtenerCatalogo: limite de 5000 ms para la lectura completa (Requisito 4.13)', () => {
  it('abandona la lectura al vencer el cronometro independiente', async () => {
    const { reloj, avanzar } = relojControlado();
    let senal: AbortSignal | undefined;
    // La respuesta llega dentro del presupuesto de obtencion, pero su cuerpo
    // sigue pendiente: el limite de la lectura completa es el que decide.
    const traer: Traer = (_ruta, opciones) => {
      senal = opciones?.senal;
      return Promise.resolve({
        ok: true,
        estado: 200,
        texto: () =>
          new Promise<string>((resolver) => {
            setTimeout(() => resolver(DOCUMENTO_VALIDO), MS_LIMITE_LECTURA + 500);
          }),
      });
    };

    const promesa = obtenerCatalogo(traer, reloj, 'datos/catalogo-estelar.json');
    await avanzar(MS_LIMITE_LECTURA);
    const resultado = await promesa;

    expect(senal?.aborted).toBe(true);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({
      clase: 'indisponible',
      motivo: 'tiempo-excedido',
      msTranscurridos: MS_LIMITE_LECTURA,
    });
    expect(resultado).not.toHaveProperty('catalogo');
  });

  it('no deja temporizadores pendientes tras vencer el limite de la lectura', async () => {
    const { reloj, avanzar } = relojControlado();
    const traer: Traer = traerQueNuncaResponde;

    const promesa = obtenerCatalogo(traer, reloj, 'datos/catalogo-estelar.json');
    await avanzar(MS_LIMITE_OBTENCION);
    await promesa;

    expect(vi.getTimerCount()).toBe(0);
  });
});
