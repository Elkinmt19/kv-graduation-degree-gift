import { afterEach, describe, expect, it, vi } from 'vitest';

import { relojDeRendimiento, traerConFetch } from '../../../src/infra/recursos';

/**
 * Pruebas unitarias de los adaptadores del borde: `Traer` sobre `fetch` y
 * `Reloj` sobre `performance.now`.
 *
 * Son los dos objetos reales que la Aplicacion entrega a `obtenerCatalogo`, de
 * modo que los limites de tiempo de los Requisitos 2.8 y 4.13 dependen de que
 * la senal de cancelacion llegue a `fetch` y de que el reloj sea utilizable.
 * `fetch` se sustituye siempre: ninguna prueba toca la red.
 */

/** Argumentos con los que se llamo al `fetch` sustituido. */
interface LlamadaFetch {
  readonly ruta: unknown;
  readonly inicio: RequestInit | undefined;
  readonly cantidadDeArgumentos: number;
}

/** Sustituye `fetch` por uno que devuelve la respuesta indicada. */
function fetchSimulado(respuesta: Partial<Response>): LlamadaFetch[] {
  const llamadas: LlamadaFetch[] = [];

  vi.stubGlobal('fetch', (...argumentos: unknown[]) => {
    llamadas.push({
      ruta: argumentos[0],
      inicio: argumentos[1] as RequestInit | undefined,
      cantidadDeArgumentos: argumentos.length,
    });
    return Promise.resolve(respuesta as Response);
  });

  return llamadas;
}

/** Respuesta minima con la superficie que consume `traerConFetch`. */
function respuesta(estado: number, cuerpo: string): Partial<Response> {
  return {
    ok: estado >= 200 && estado <= 299,
    status: estado,
    text: () => Promise.resolve(cuerpo),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('traerConFetch: recorte de la respuesta (Requisito 8.7)', () => {
  it('entrega ok, estado y el cuerpo como texto de una respuesta exitosa', async () => {
    const llamadas = fetchSimulado(respuesta(200, '{"version":1}'));

    const recurso = await traerConFetch('datos/catalogo-estelar.json');

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.ruta).toBe('datos/catalogo-estelar.json');
    expect(recurso.ok).toBe(true);
    expect(recurso.estado).toBe(200);
    expect(await recurso.texto()).toBe('{"version":1}');
  });

  it('un codigo fuera de 200-299 llega como ok falso con su estado', async () => {
    fetchSimulado(respuesta(404, 'no encontrado'));

    const recurso = await traerConFetch('datos/catalogo-estelar.json');

    expect(recurso.ok).toBe(false);
    expect(recurso.estado).toBe(404);
  });

  it('un error del servidor tampoco lanza: llega como ok falso', async () => {
    fetchSimulado(respuesta(500, ''));

    const recurso = await traerConFetch('datos/catalogo-estelar.json');

    expect(recurso.ok).toBe(false);
    expect(recurso.estado).toBe(500);
  });

  it('propaga el rechazo cuando la red falla, igual que fetch', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('sin conexion')));

    await expect(traerConFetch('datos/catalogo-estelar.json')).rejects.toThrow('sin conexion');
  });

  it('propaga el rechazo cuando el cuerpo no puede leerse', async () => {
    fetchSimulado({
      ok: true,
      status: 200,
      text: () => Promise.reject(new Error('flujo interrumpido')),
    });

    const recurso = await traerConFetch('datos/catalogo-estelar.json');

    await expect(recurso.texto()).rejects.toThrow('flujo interrumpido');
  });
});

describe('traerConFetch: senal de cancelacion (Requisitos 2.8 y 4.13)', () => {
  it('reenvia la senal recibida a fetch', async () => {
    const llamadas = fetchSimulado(respuesta(200, ''));
    const controlador = new AbortController();

    await traerConFetch('datos/catalogo-estelar.json', { senal: controlador.signal });

    expect(llamadas[0]?.inicio).toEqual({ signal: controlador.signal });
  });

  it('sin senal no inventa opciones para fetch', async () => {
    const llamadas = fetchSimulado(respuesta(200, ''));

    await traerConFetch('datos/catalogo-estelar.json');
    await traerConFetch('datos/catalogo-estelar.json', {});

    expect(llamadas.map((llamada) => llamada.cantidadDeArgumentos)).toEqual([1, 1]);
    expect(llamadas[0]?.inicio).toBeUndefined();
    expect(llamadas[1]?.inicio).toBeUndefined();
  });

  it('una senal ya disparada llega abortada a fetch', async () => {
    const llamadas = fetchSimulado(respuesta(200, ''));
    const controlador = new AbortController();
    controlador.abort();

    await traerConFetch('datos/catalogo-estelar.json', { senal: controlador.signal });

    const senal = (llamadas[0]?.inicio as { signal?: AbortSignal } | undefined)?.signal;
    expect(senal?.aborted).toBe(true);
  });
});

describe('relojDeRendimiento (Requisitos 2.8 y 4.13)', () => {
  it('entrega milisegundos finitos y no decrecientes', () => {
    const primero = relojDeRendimiento.ahora();
    const segundo = relojDeRendimiento.ahora();

    expect(Number.isFinite(primero)).toBe(true);
    expect(primero).toBeGreaterThanOrEqual(0);
    expect(segundo).toBeGreaterThanOrEqual(primero);
  });

  it('cae a Date.now cuando performance no esta disponible', () => {
    vi.stubGlobal('performance', undefined);

    const antes = Date.now();
    const medido = relojDeRendimiento.ahora();
    const despues = Date.now();

    expect(medido).toBeGreaterThanOrEqual(antes);
    expect(medido).toBeLessThanOrEqual(despues);
  });

  it('cae a Date.now cuando performance no expone now', () => {
    vi.stubGlobal('performance', {});

    const antes = Date.now();
    const medido = relojDeRendimiento.ahora();

    expect(medido).toBeGreaterThanOrEqual(antes);
    expect(medido).toBeLessThanOrEqual(Date.now());
  });

  it('vuelve a usar performance tras restaurar el global', () => {
    // Confirma que los sustitutos no se filtran a otros archivos de prueba.
    expect(typeof globalThis.performance?.now).toBe('function');
    expect(relojDeRendimiento.ahora()).toBeLessThan(Date.now());
  });
});
