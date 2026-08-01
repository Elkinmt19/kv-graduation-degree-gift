import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CieloCalculado, EstrellaCalculada } from '../../../../src/nucleo/astronomia/modelo.js';
import { CLASES_MAPA, type ContextoDibujo, type DegradadoDibujo } from '../../../../src/vista/mapa/capas.js';
import { CLASES_FICHA } from '../../../../src/vista/mapa/interaccion.js';
import { montarMapa, TEXTO_RESPALDO, type OpcionesMapa } from '../../../../src/vista/mapa/mapa.js';
import { rotuloLugarFecha } from '../../../../src/vista/mapa/rotulo.js';

/**
 * Pruebas unitarias del Mapa_Estelar (Tarea 11.13).
 *
 * Cubre exactamente lo que pide la tarea: la ruta de respaldo con fondo
 * decorativo y texto (Requisito 4.9), el contexto 2D nulo con fondo plano
 * (Requisito 4.10), la rama sin respaldo cuando el cielo es valido
 * (Requisito 4.11), la retirada del cursor sin tocar el cielo (Requisito 4.14)
 * y el exceso de 5000 ms tratado como el mismo error que un cielo ausente
 * (Requisito 4.13; ver `pruebas/unitarias/infra/recursos.test.ts` para el
 * temporizador en si, que vive en `src/infra/recursos.ts`, no aqui).
 *
 * jsdom no implementa `getContext('2d')`: por omision devuelve `null`, que es
 * exactamente la rama de fondo plano. Para ejercitar la rama con cielo valido
 * se sustituye `lienzo.getContext` por un contexto de mentira que registra las
 * llamadas, igual que `contextoFalso` en `obsidian.test.ts`.
 */

const LUGAR = { nombre: 'Neiva, Colombia', latitud: 2.9273, longitud: -75.2819 };
const INSTANTE = { iso: '2026-07-31T18:00:00-05:00', msUtc: Date.parse('2026-07-31T18:00:00-05:00') };
const ROTULO = rotuloLugarFecha(INSTANTE, LUGAR);

/** Estrella calculada minima, visible o no segun `x`. */
function estrella(nombre: string, x: number | null, y = 0): EstrellaCalculada {
  const pantalla = x === null ? null : { x, y };
  return {
    estrella: { nombre, ar: 5.5, dec: -8.2, magnitud: 2.34, constelacion: 'Orion' },
    horizontal: { altitud: pantalla === null ? -10 : 42, azimut: 120 },
    visible: pantalla !== null,
    pantalla,
    radio: 1.5,
  };
}

/** Cielo sintetico con dos estrellas visibles, listo para dibujar. */
function cielo(): CieloCalculado {
  return {
    instante: INSTANTE,
    lugar: LUGAR,
    circulo: { cx: 300, cy: 300, radio: 292 },
    estrellas: [estrella('Sirio', 320, 280), estrella('Rigel', null), estrella('Vega', 260, 200)],
    segmentosVisibles: [{ a: { x: 320, y: 280 }, b: { x: 260, y: 200 } }],
    constelacionesDibujadas: ['Orion'],
    cardinales: [
      { rotulo: 'N', punto: { x: 300, y: 8 } },
      { rotulo: 'E', punto: { x: 592, y: 300 } },
      { rotulo: 'S', punto: { x: 300, y: 592 } },
      { rotulo: 'O', punto: { x: 8, y: 300 } },
    ],
  };
}

/** Contexto 2D de mentira: registra llamadas, colores y textos. */
function contextoFalso(): {
  readonly contexto: CanvasRenderingContext2D;
  readonly llamadas: string[];
} {
  const llamadas: string[] = [];
  const degradado: DegradadoDibujo = { addColorStop: (): void => {} };
  const falso: ContextoDibujo & { measureText(texto: string): { width: number } } = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    save: (): void => {
      llamadas.push('save');
    },
    restore: (): void => {
      llamadas.push('restore');
    },
    setTransform: (): void => {
      llamadas.push('setTransform');
    },
    clearRect: (): void => {
      llamadas.push('clearRect');
    },
    fillRect: (): void => {
      llamadas.push('fillRect');
    },
    beginPath: (): void => {
      llamadas.push('beginPath');
    },
    moveTo: (): void => {
      llamadas.push('moveTo');
    },
    lineTo: (): void => {
      llamadas.push('lineTo');
    },
    arc: (): void => {
      llamadas.push('arc');
    },
    fill: (): void => {
      llamadas.push('fill');
    },
    stroke: (): void => {
      llamadas.push('stroke');
    },
    fillText: (): void => {
      llamadas.push('fillText');
    },
    createLinearGradient: (): DegradadoDibujo => degradado,
    createRadialGradient: (): DegradadoDibujo => degradado,
    drawImage: (): void => {
      llamadas.push('drawImage');
    },
    measureText: (texto: string): { width: number } => ({ width: texto.length * 7 }),
  };
  return { contexto: falso as unknown as CanvasRenderingContext2D, llamadas };
}

/** Raiz con lienzo hijo, como el contenedor `.mapa` real. */
function preparar(): { contenedor: HTMLElement; lienzo: HTMLCanvasElement } {
  const contenedor = document.createElement('div');
  const lienzo = document.createElement('canvas');
  lienzo.className = CLASES_MAPA.lienzo;
  contenedor.append(lienzo);
  document.body.append(contenedor);
  return { contenedor, lienzo };
}

function opciones(op: Partial<OpcionesMapa> = {}): OpcionesMapa {
  return {
    cielo: null,
    rotulo: ROTULO,
    guinos: false,
    movimientoReducido: true,
    ...op,
  };
}

describe('montarMapa', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  describe('ruta de respaldo sin Cielo_Calculado (Requisitos 4.9, 4.13)', () => {
    it('pinta un fondo decorativo y muestra el texto de respaldo', () => {
      const { contenedor, lienzo } = preparar();
      const { contexto, llamadas } = contextoFalso();
      vi.spyOn(lienzo, 'getContext').mockReturnValue(contexto);

      const asa = montarMapa(lienzo, opciones({ cielo: null }));

      expect(asa.textoAlternativo()).toBe(TEXTO_RESPALDO);
      expect(contenedor.querySelector(`.${CLASES_MAPA.respaldo}`)?.textContent).toBe(TEXTO_RESPALDO);
      expect(contenedor.querySelector(`.${CLASES_MAPA.rotulo}`)?.textContent).toBe(ROTULO.texto);
      // jsdom no calcula disposicion: el contenedor mide 0x0, asi que el fondo
      // decorativo limpia y rellena la caja pero no llega a colocar puntos
      // (misma limitacion que anota circulo.test.ts sobre clientWidth/Height).
      expect(llamadas).toContain('clearRect');
      expect(llamadas).toContain('fillRect');

      asa.destruir();
    });

    it('con una caja visible, dibuja el numero de puntos decorativos esperado', () => {
      const { lienzo } = preparar();
      const { contexto, llamadas } = contextoFalso();
      vi.spyOn(lienzo, 'getContext').mockReturnValue(contexto);
      Object.defineProperty(lienzo.parentElement, 'clientWidth', { value: 600, configurable: true });
      Object.defineProperty(lienzo, 'clientHeight', { value: 400, configurable: true });

      const asa = montarMapa(lienzo, opciones({ cielo: null }));

      expect(llamadas.filter((l) => l === 'arc').length).toBe(120);
      expect(llamadas.filter((l) => l === 'fill').length).toBe(120);

      asa.destruir();
    });
  });

  describe('contexto 2D nulo: fondo plano (Requisito 4.10)', () => {
    it('sin cielo, sustituye el lienzo por un nodo plano con el texto de respaldo', () => {
      const { contenedor, lienzo } = preparar();
      // jsdom no implementa getContext('2d'): devuelve null por omision.

      const asa = montarMapa(lienzo, opciones({ cielo: null }));

      expect(contenedor.contains(lienzo)).toBe(false);
      const nodoPlano = contenedor.querySelector(`.${CLASES_MAPA.lienzo}`);
      expect(nodoPlano).not.toBeNull();
      expect(nodoPlano?.getAttribute('role')).toBe('img');
      expect(nodoPlano?.getAttribute('aria-label')).toBe(TEXTO_RESPALDO);
      expect(asa.textoAlternativo()).toBe(TEXTO_RESPALDO);

      expect(() => {
        asa.redibujar();
        asa.redimensionar(400, 400);
      }).not.toThrow();

      asa.destruir();
      expect(contenedor.querySelector(`.${CLASES_MAPA.respaldo}`)).toBeNull();
    });

    it('con cielo valido tambien sustituye por un nodo plano cuando no hay contexto 2D', () => {
      const { contenedor, lienzo } = preparar();

      const asa = montarMapa(lienzo, opciones({ cielo: cielo() }));

      expect(contenedor.contains(lienzo)).toBe(false);
      expect(contenedor.querySelector(`.${CLASES_MAPA.lienzo}`)).not.toBeNull();
      expect(asa.textoAlternativo()).toBe(TEXTO_RESPALDO);

      asa.destruir();
    });
  });

  describe('rama sin respaldo cuando el cielo es valido (Requisito 4.11)', () => {
    it('pinta el fotograma completo y no crea el mensaje de respaldo', () => {
      const { contenedor, lienzo } = preparar();
      const { contexto, llamadas } = contextoFalso();
      vi.spyOn(lienzo, 'getContext').mockReturnValue(contexto);

      const asa = montarMapa(lienzo, opciones({ cielo: cielo(), guinos: false }));

      expect(contenedor.contains(lienzo)).toBe(true);
      expect(contenedor.querySelector(`.${CLASES_MAPA.respaldo}`)).toBeNull();
      // El fotograma dibuja las estrellas visibles y los cardinales.
      expect(llamadas).toContain('fillText');
      expect(llamadas.filter((l) => l === 'arc').length).toBeGreaterThan(0);
      expect(asa.textoAlternativo()).not.toBe(TEXTO_RESPALDO);

      asa.destruir();
    });

    it('redibujar repinta sin lanzar y redimensionar reproyecta sobre el nuevo Circulo_Horizonte', () => {
      const { lienzo } = preparar();
      const { contexto, llamadas } = contextoFalso();
      vi.spyOn(lienzo, 'getContext').mockReturnValue(contexto);

      const asa = montarMapa(lienzo, opciones({ cielo: cielo() }));
      llamadas.length = 0;

      expect(() => {
        asa.redibujar();
      }).not.toThrow();
      expect(llamadas.length).toBeGreaterThan(0);

      llamadas.length = 0;
      expect(() => {
        asa.redimensionar(800, 600);
      }).not.toThrow();
      expect(llamadas.length).toBeGreaterThan(0);

      asa.destruir();
    });
  });

  describe('retirada del cursor: la ficha se oculta sin tocar el cielo (Requisito 4.14)', () => {
    it('un pointerleave sobre el lienzo no vuelve a pedir el contexto 2D', () => {
      const { lienzo } = preparar();
      const { contexto } = contextoFalso();
      const espia = vi.spyOn(lienzo, 'getContext').mockReturnValue(contexto);

      const asa = montarMapa(lienzo, opciones({ cielo: cielo() }));
      espia.mockClear();

      lienzo.dispatchEvent(new Event('pointerleave', { bubbles: false }));

      expect(espia).not.toHaveBeenCalled();
      // La ficha de la Estrella senalada vive fuera del lienzo, como overlay.
      const ficha = lienzo.parentElement?.querySelector(`.${CLASES_FICHA.ficha}`);
      expect(ficha).not.toBeNull();
      expect((ficha as HTMLElement | null)?.hidden).toBe(true);

      asa.destruir();
    });
  });
});
