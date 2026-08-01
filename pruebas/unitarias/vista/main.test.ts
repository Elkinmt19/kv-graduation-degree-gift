import { describe, expect, it, vi } from 'vitest';

import { arrancarAplicacion, CLASES_REGALO, RUTA_CATALOGO } from '../../../src/main.js';
import { CLASES_PORTAL } from '../../../src/vista/portal/portal.js';
import { CLASES_MAPA } from '../../../src/vista/mapa/capas.js';
import { CLASES_CARTA, MENSAJE_CARTA_NO_DISPONIBLE } from '../../../src/vista/carta/lienzo.js';
import { TEXTO_RESPALDO } from '../../../src/vista/mapa/mapa.js';
import type { Reloj, RespuestaRecurso, Traer } from '../../../src/infra/recursos.js';
import type { EstadoSesion } from '../../../src/infra/sesion.js';
import type { ConfiguracionRegalo } from '../../../src/nucleo/configuracion/modelo.js';
import type { CatalogoEstelar } from '../../../src/nucleo/catalogo/modelo.js';

/**
 * Pruebas de integracion del arranque (Tarea 15.2).
 *
 * Cubre en jsdom, a traves de `arrancarAplicacion`, los cuatro recorridos que
 * pide la tarea: clave correcta hasta la Pagina_Regalo con mapa y carta, la
 * recarga en la misma sesion, el respaldo del Mapa_Estelar cuando el
 * Catalogo_Estelar no esta disponible y el respaldo de la Carta sin parrafos
 * utilizables.
 */

const DIGESTO_FALSO = 'digesto-de-prueba';
const CLAVE_CORRECTA = 'KawaValen';

function reloj(): Reloj {
  return { ahora: () => 0 };
}

function digerirFalso(): (texto: string) => Promise<string | null> {
  return (texto: string) => Promise.resolve(texto.trim().toLowerCase() === CLAVE_CORRECTA.toLowerCase() ? DIGESTO_FALSO : 'otro');
}

/** `EstadoSesion` de mentira, sin `sessionStorage` real. */
function sesionFalsa(concedidoDeEntrada = false): EstadoSesion {
  let acceso = concedidoDeEntrada;
  let cartaRevelada = false;
  return {
    accesoConcedido: () => acceso,
    registrarAcceso: () => {
      acceso = true;
    },
    cartaYaRevelada: () => cartaRevelada,
    marcarCartaRevelada: () => {
      cartaRevelada = true;
    },
  };
}

function catalogoMinimo(): CatalogoEstelar {
  return {
    version: 1,
    epoca: 'J2000.0',
    atribucion: 'Prueba',
    estrellas: [{ nombre: 'Sirio', ar: 6.75, dec: -16.7, magnitud: -1.46, constelacion: 'Canis Major' }],
    segmentos: [],
  };
}

function traerQueResponde(catalogo: CatalogoEstelar): Traer {
  return (): Promise<RespuestaRecurso> =>
    Promise.resolve({ ok: true, estado: 200, texto: () => Promise.resolve(JSON.stringify(catalogo)) });
}

function traerQueFalla(): Traer {
  return (): Promise<RespuestaRecurso> => Promise.reject(new Error('sin conexion'));
}

function configuracion(overrides: Partial<ConfiguracionRegalo> = {}): ConfiguracionRegalo {
  return {
    hashClave: DIGESTO_FALSO,
    instanteGraduacion: '2026-07-31T18:00:00-05:00',
    lugarGraduacion: { nombre: 'Neiva, Colombia', latitud: 2.9273, longitud: -75.2819 },
    carta: { saludo: 'Kawa', parrafos: ['Un parrafo con contenido.'], firma: 'Con carino' },
    ...overrides,
  };
}

async function ingresarClave(raiz: HTMLElement, clave: string): Promise<void> {
  const campo = raiz.querySelector<HTMLInputElement>(`.${CLASES_PORTAL.campo}`);
  const formulario = raiz.querySelector<HTMLFormElement>(`.${CLASES_PORTAL.formulario}`);
  if (campo === null || formulario === null) {
    throw new Error('Portal_Acceso no montado');
  }
  campo.value = clave;
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  formulario.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => {
    if (raiz.querySelector(`.${CLASES_REGALO.contenedor}`) === null) {
      throw new Error('Pagina_Regalo todavia no aparece');
    }
  });
}

describe('arrancarAplicacion (Tarea 15.2)', () => {
  it('con la clave correcta revela la Pagina_Regalo con Mapa_Estelar y Carta', async () => {
    const raiz = document.createElement('div');
    const traer = traerQueResponde(catalogoMinimo());

    arrancarAplicacion(raiz, configuracion(), { traer, reloj: reloj(), digerir: digerirFalso(), sesion: sesionFalsa() });

    await ingresarClave(raiz, CLAVE_CORRECTA);

    expect(raiz.querySelector(`.${CLASES_REGALO.mapa}`)).not.toBeNull();
    expect(raiz.querySelector(`.${CLASES_REGALO.carta}`)).not.toBeNull();

    const parrafo = raiz.querySelector(`.${CLASES_CARTA.parrafo}`);
    expect(parrafo?.textContent).toBe('Un parrafo con contenido.');
  });

  it('en una recarga con el acceso ya concedido en la sesion, muestra la Pagina_Regalo sin pedir la clave', async () => {
    const raiz = document.createElement('div');
    const traer = traerQueResponde(catalogoMinimo());

    arrancarAplicacion(raiz, configuracion(), {
      traer,
      reloj: reloj(),
      digerir: digerirFalso(),
      sesion: sesionFalsa(true),
    });

    const seccionPortal = raiz.querySelector<HTMLElement>(`.${CLASES_PORTAL.seccion}`);
    expect(seccionPortal?.hidden).toBe(true);
    await vi.waitFor(() => {
      expect(raiz.querySelector(`.${CLASES_REGALO.mapa}`)).not.toBeNull();
    });
  });

  it('con el Catalogo_Estelar indisponible, el Mapa_Estelar cae en la ruta de respaldo', async () => {
    const raiz = document.createElement('div');

    arrancarAplicacion(raiz, configuracion(), {
      traer: traerQueFalla(),
      reloj: reloj(),
      digerir: digerirFalso(),
      sesion: sesionFalsa(),
    });

    await ingresarClave(raiz, CLAVE_CORRECTA);

    await vi.waitFor(() => {
      const respaldo = raiz.querySelector(`.${CLASES_MAPA.respaldo}`);
      expect(respaldo?.textContent).toBe(TEXTO_RESPALDO);
    });
  });

  it('con la Carta sin parrafos utilizables, se muestra el mensaje de respaldo y el mapa sigue presente', async () => {
    const raiz = document.createElement('div');
    const traer = traerQueResponde(catalogoMinimo());

    arrancarAplicacion(
      raiz,
      configuracion({ carta: { saludo: 'Kawa', parrafos: ['   ', ''], firma: 'Con carino' } }),
      { traer, reloj: reloj(), digerir: digerirFalso(), sesion: sesionFalsa() },
    );

    await ingresarClave(raiz, CLAVE_CORRECTA);

    await vi.waitFor(() => {
      const respaldo = raiz.querySelector(`.${CLASES_CARTA.respaldo}`);
      expect(respaldo?.textContent).toBe(MENSAJE_CARTA_NO_DISPONIBLE);
    });
    expect(raiz.querySelector(`.${CLASES_REGALO.mapa}`)).not.toBeNull();
  });

  it('llama a traer con la RUTA_CATALOGO publicada', () => {
    const raiz = document.createElement('div');
    const traer = vi.fn(traerQueFalla());

    arrancarAplicacion(raiz, configuracion(), { traer, reloj: reloj(), digerir: digerirFalso(), sesion: sesionFalsa() });

    expect(traer).toHaveBeenCalledWith(RUTA_CATALOGO, expect.anything());
  });
});
