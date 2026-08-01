import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type {
  CieloCalculado,
  EstrellaCalculada,
} from '../../../../src/nucleo/astronomia/modelo.js';
import { calcularCielo } from '../../../../src/nucleo/astronomia/motor.js';
import { leerCatalogo } from '../../../../src/nucleo/catalogo/lector.js';
import {
  ESTRELLAS_OBSIDIAN,
  MAX_SEGMENTOS,
  MIN_ESTRELLAS_SOBRE_HORIZONTE,
  MIN_SEGMENTOS,
  ROTULO_OBSIDIAN,
  SEGMENTOS_OBSIDIAN,
  dibujarObsidian,
  estrellasSobreHorizonte,
  problemasDeclaracion,
  resolverObsidian,
} from '../../../../src/vista/guinos/obsidian.js';

/** Instante_Graduacion marcador y Lugar_Graduacion de la ceremonia. */
const ISO = '2026-07-31T18:00:00-05:00';
const NEIVA = { nombre: 'Neiva', latitud: 2.9484, longitud: -75.2795 };
const CIRCULO = { cx: 200, cy: 200, radio: 180 };

/** Color dorado ya resuelto, tal como lo pasaria el montaje del mapa. */
const DORADO = 'rgb(212 175 55 / 0.9)';

/** Cielo real del Instante_Graduacion sobre Neiva, calculado una sola vez. */
function cieloReal(): CieloCalculado {
  const documento = readFileSync(
    resolve(process.cwd(), 'public/datos/catalogo-estelar.json'),
    'utf8',
  );
  const leido = leerCatalogo(documento);
  if (!leido.ok) {
    throw new Error(`el Catalogo_Estelar publicado no se pudo leer: ${JSON.stringify(leido.error)}`);
  }
  const resultado = calcularCielo(
    leido.catalogo,
    { iso: ISO, msUtc: Date.parse(ISO) },
    NEIVA,
    CIRCULO,
  );
  if (!resultado.ok) {
    throw new Error(`el motor rechazo las entradas: ${JSON.stringify(resultado.error)}`);
  }
  return resultado.cielo;
}

/** Estrella calculada sintetica con la altitud pedida. */
function calculada(nombre: string, altitud: number, indice: number): EstrellaCalculada {
  const visible = altitud >= 0;
  return {
    estrella: { nombre, ar: 16, dec: -25, magnitud: 2, constelacion: 'Escorpio' },
    horizontal: { altitud, azimut: 140 },
    visible,
    pantalla: visible ? { x: 200 + indice * 10, y: 150 + indice * 12 } : null,
    radio: 2,
  };
}

/** Cielo sintetico con las estrellas de la figura a las altitudes indicadas. */
function cieloSintetico(altitudes: readonly number[]): CieloCalculado {
  return {
    instante: { iso: ISO, msUtc: Date.parse(ISO) },
    lugar: NEIVA,
    circulo: CIRCULO,
    estrellas: ESTRELLAS_OBSIDIAN.map((nombre, indice) =>
      calculada(nombre, altitudes[indice] ?? -30, indice),
    ),
    segmentosVisibles: [{ a: { x: 1, y: 2 }, b: { x: 3, y: 4 } }],
    constelacionesDibujadas: ['Escorpio'],
    cardinales: [],
  };
}

/** Contexto 2D de mentira: registra las llamadas que hace el trazo. */
function contextoFalso(): {
  readonly contexto: CanvasRenderingContext2D;
  readonly llamadas: string[];
  readonly textos: string[];
  readonly colores: string[];
} {
  const llamadas: string[] = [];
  const textos: string[] = [];
  const colores: string[] = [];
  const falso = {
    save: () => llamadas.push('save'),
    restore: () => llamadas.push('restore'),
    beginPath: () => llamadas.push('beginPath'),
    moveTo: () => llamadas.push('moveTo'),
    lineTo: () => llamadas.push('lineTo'),
    stroke: () => llamadas.push('stroke'),
    fillText: (texto: string) => {
      llamadas.push('fillText');
      textos.push(texto);
    },
    set strokeStyle(valor: string) {
      colores.push(valor);
    },
    set fillStyle(valor: string) {
      colores.push(valor);
    },
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
  return { contexto: falso as unknown as CanvasRenderingContext2D, llamadas, textos, colores };
}

describe('figura declarada de Obsidian (Requisito 6.4)', () => {
  it('esta bien formada: 4 a 9 segmentos, estrellas unicas y extremos declarados', () => {
    expect(problemasDeclaracion()).toEqual([]);
    expect(SEGMENTOS_OBSIDIAN.length).toBeGreaterThanOrEqual(MIN_SEGMENTOS);
    expect(SEGMENTOS_OBSIDIAN.length).toBeLessThanOrEqual(MAX_SEGMENTOS);
  });

  it('senala los defectos de una figura mal formada', () => {
    const problemas = problemasDeclaracion(
      ['A', 'B', 'C'],
      [
        { desde: 'A', hasta: 'B' },
        { desde: 'A', hasta: 'Z' },
        { desde: 'C', hasta: 'C' },
      ],
    );
    expect(problemas.some((texto) => texto.includes('segmentos'))).toBe(true);
    expect(problemas.some((texto) => texto.includes('extremo no declarado'))).toBe(true);
    expect(problemas.some((texto) => texto.includes('degenerado'))).toBe(true);
  });

  it('sus estrellas existen en el Catalogo_Estelar publicado', () => {
    const nombres = new Set(cieloReal().estrellas.map((entrada) => entrada.estrella.nombre));
    for (const nombre of ESTRELLAS_OBSIDIAN) {
      expect(nombres.has(nombre)).toBe(true);
    }
  });
});

describe('resolverObsidian sobre el cielo real (Requisitos 6.4, 6.9)', () => {
  it('dibuja la figura y su rotulo en el Instante_Graduacion visto desde Neiva', () => {
    const cielo = cieloReal();
    const sobre = estrellasSobreHorizonte(cielo);

    expect(sobre.length).toBeGreaterThanOrEqual(MIN_ESTRELLAS_SOBRE_HORIZONTE);

    const figura = resolverObsidian(cielo, { guinos: true });
    expect(figura.dibujable).toBe(true);
    expect(figura.sobreHorizonte).toBe(ESTRELLAS_OBSIDIAN.length);
    expect(figura.segmentos).toHaveLength(SEGMENTOS_OBSIDIAN.length);
    expect(figura.rotulo?.texto).toBe(ROTULO_OBSIDIAN);
  });
});

describe('omision silenciosa de Obsidian (Requisitos 6.8, 6.9)', () => {
  it('con los guinos desactivados no hay figura ni rotulo', () => {
    const figura = resolverObsidian(cieloSintetico([50, 50, 50, 50, 50, 50, 50, 50]), {
      guinos: false,
    });
    expect(figura.dibujable).toBe(false);
    expect(figura.segmentos).toEqual([]);
    expect(figura.rotulo).toBeNull();
  });

  it('sin Cielo_Calculado no hay figura ni rotulo', () => {
    expect(resolverObsidian(null, { guinos: true }).dibujable).toBe(false);
  });

  it('con 4 estrellas sobre el horizonte omite figura y rotulo, y conserva el cielo', () => {
    const cielo = cieloSintetico([50, 40, 30, 20, -1, -10, -20, -30]);
    const figura = resolverObsidian(cielo, { guinos: true });

    expect(figura.sobreHorizonte).toBe(4);
    expect(figura.dibujable).toBe(false);
    expect(figura.segmentos).toEqual([]);
    expect(figura.rotulo).toBeNull();
    // El resto del cielo sigue intacto: la figura no lo toca.
    expect(cielo.segmentosVisibles).toHaveLength(1);
    expect(cielo.constelacionesDibujadas).toEqual(['Escorpio']);
  });

  it('con 5 estrellas sobre el horizonte ya dibuja, y en el limite exacto', () => {
    const figura = resolverObsidian(cieloSintetico([50, 40, 30, 20, 0, -10, -20, -30]), {
      guinos: true,
    });

    expect(figura.sobreHorizonte).toBe(MIN_ESTRELLAS_SOBRE_HORIZONTE);
    expect(figura.dibujable).toBe(true);
    expect(figura.rotulo).not.toBeNull();
    // Solo los segmentos con ambos extremos sobre el horizonte se trazan.
    expect(figura.segmentos.length).toBeLessThan(SEGMENTOS_OBSIDIAN.length);
    expect(figura.segmentos).toHaveLength(4);
  });

  it('la altitud 0 cuenta como sobre el horizonte y -0.1 no', () => {
    expect(
      resolverObsidian(cieloSintetico([0, 0, 0, 0, 0, -30, -30, -30]), { guinos: true }).dibujable,
    ).toBe(true);
    expect(
      resolverObsidian(cieloSintetico([0, 0, 0, 0, -0.1, -30, -30, -30]), { guinos: true })
        .dibujable,
    ).toBe(false);
  });
});

describe('dibujarObsidian (Requisitos 6.4, 6.9)', () => {
  it('traza los segmentos en dorado y escribe el rotulo', () => {
    const { contexto, llamadas, textos, colores } = contextoFalso();
    const figura = resolverObsidian(cieloSintetico([50, 45, 40, 35, 30, 25, 20, 15]), {
      guinos: true,
    });

    expect(dibujarObsidian(contexto, figura, { color: DORADO })).toBe(true);
    expect(llamadas.filter((nombre) => nombre === 'moveTo')).toHaveLength(
      SEGMENTOS_OBSIDIAN.length,
    );
    expect(llamadas.filter((nombre) => nombre === 'stroke')).toHaveLength(1);
    expect(textos).toEqual([ROTULO_OBSIDIAN]);
    expect(colores).toContain(DORADO);
    // El estado del contexto se devuelve a las capas siguientes.
    expect(llamadas[0]).toBe('save');
    expect(llamadas.at(-1)).toBe('restore');
  });

  it('no toca el lienzo ni lanza nada cuando la figura se omite', () => {
    const { contexto, llamadas } = contextoFalso();
    const figura = resolverObsidian(cieloSintetico([50, 40, 30, 20, -1, -10, -20, -30]), {
      guinos: true,
    });

    expect(dibujarObsidian(contexto, figura, { color: DORADO })).toBe(false);
    expect(llamadas).toEqual([]);
  });

  it('usa un color propio para el rotulo cuando se le da', () => {
    const { contexto, colores } = contextoFalso();
    const figura = resolverObsidian(cieloSintetico([50, 45, 40, 35, 30, 25, 20, 15]), {
      guinos: true,
    });

    dibujarObsidian(contexto, figura, { color: DORADO, colorRotulo: 'rgb(212 175 55 / 0.92)' });
    expect(colores).toContain('rgb(212 175 55 / 0.92)');
  });
});
