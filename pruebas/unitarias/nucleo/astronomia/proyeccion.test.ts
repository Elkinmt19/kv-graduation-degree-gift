import { describe, expect, it } from 'vitest';

import { desproyectar, proyectar } from '../../../../src/nucleo/astronomia/proyeccion.js';
import type { CirculoHorizonte, Horizontal } from '../../../../src/nucleo/astronomia/modelo.js';

/** Circulo de prueba descentrado, para que un error de signo no pase inadvertido. */
const CIRCULO: CirculoHorizonte = { cx: 320, cy: 240, radio: 180 };

/** Distancia de un punto proyectado al centro del Circulo_Horizonte. */
function distanciaAlCentro(h: Horizontal, c: CirculoHorizonte = CIRCULO): number {
  const p = proyectar(h, c);
  return Math.hypot(p.x - c.cx, p.y - c.cy);
}

describe('proyectar (Proyeccion_Estereografica)', () => {
  it('lleva el cenit al centro del Circulo_Horizonte', () => {
    expect(proyectar({ altitud: 90, azimut: 0 }, CIRCULO)).toEqual({ x: 320, y: 240 });
    // En el cenit el azimut es indeterminado: cualquiera cae en el mismo punto.
    expect(proyectar({ altitud: 90, azimut: 217.35 }, CIRCULO)).toEqual({ x: 320, y: 240 });
  });

  it('lleva el horizonte al borde, a distancia exactamente igual al radio (Requisito 3.5)', () => {
    for (const azimut of [0, 90, 180, 270]) {
      expect(distanciaAlCentro({ altitud: 0, azimut })).toBe(CIRCULO.radio);
    }
    for (const azimut of [17.5, 45, 123.456, 359.9]) {
      expect(distanciaAlCentro({ altitud: 0, azimut })).toBeCloseTo(CIRCULO.radio, 9);
    }
  });

  it('deja toda altitud positiva estrictamente dentro del circulo (Requisito 3.5)', () => {
    for (const altitud of [0.0001, 1, 30, 45, 89.9]) {
      expect(distanciaAlCentro({ altitud, azimut: 33 })).toBeLessThan(CIRCULO.radio);
    }
  });

  it('crece de forma monotona con la distancia cenital', () => {
    const altitudes = [90, 75, 60, 45, 30, 15, 0];
    const distancias = altitudes.map((altitud) => distanciaAlCentro({ altitud, azimut: 200 }));
    for (let i = 1; i < distancias.length; i += 1) {
      expect(distancias[i]!).toBeGreaterThan(distancias[i - 1]!);
    }
  });

  it('coloca las cuatro marcas cardinales con el norte arriba y el este a la izquierda', () => {
    const { cx, cy, radio } = CIRCULO;
    expect(proyectar({ altitud: 0, azimut: 0 }, CIRCULO)).toEqual({ x: cx, y: cy - radio });
    expect(proyectar({ altitud: 0, azimut: 90 }, CIRCULO)).toEqual({ x: cx - radio, y: cy });
    expect(proyectar({ altitud: 0, azimut: 180 }, CIRCULO)).toEqual({ x: cx, y: cy + radio });
    expect(proyectar({ altitud: 0, azimut: 270 }, CIRCULO)).toEqual({ x: cx + radio, y: cy });
  });

  it('media altura queda a tan(22.5 grados) del radio, no a la mitad', () => {
    // La proyeccion estereografica no es equidistante: alt = 45 -> r = R * tan(22.5).
    expect(distanciaAlCentro({ altitud: 45, azimut: 0 })).toBeCloseTo(
      CIRCULO.radio * Math.tan(Math.PI / 8),
      9,
    );
  });

  it('empuja las altitudes negativas fuera del circulo', () => {
    expect(distanciaAlCentro({ altitud: -1, azimut: 45 })).toBeGreaterThan(CIRCULO.radio);
    expect(distanciaAlCentro({ altitud: -30, azimut: 45 })).toBeGreaterThan(CIRCULO.radio);
  });
});

describe('desproyectar (inversa de la Proyeccion_Estereografica)', () => {
  it('devuelve el cenit con azimut 0 en el centro exacto', () => {
    expect(desproyectar({ x: CIRCULO.cx, y: CIRCULO.cy }, CIRCULO)).toEqual({
      altitud: 90,
      azimut: 0,
    });
  });

  it('devuelve altitud 0 exacta sobre el borde del circulo', () => {
    const { cx, cy, radio } = CIRCULO;
    expect(desproyectar({ x: cx, y: cy - radio }, CIRCULO).altitud).toBe(0);
    expect(desproyectar({ x: cx + radio, y: cy }, CIRCULO).altitud).toBe(0);
  });

  it('lee los cuatro puntos cardinales del borde', () => {
    const { cx, cy, radio } = CIRCULO;
    expect(desproyectar({ x: cx, y: cy - radio }, CIRCULO).azimut).toBe(0);
    expect(desproyectar({ x: cx - radio, y: cy }, CIRCULO).azimut).toBeCloseTo(90, 9);
    expect(desproyectar({ x: cx, y: cy + radio }, CIRCULO).azimut).toBeCloseTo(180, 9);
    expect(desproyectar({ x: cx + radio, y: cy }, CIRCULO).azimut).toBeCloseTo(270, 9);
  });

  it('devuelve altitud negativa fuera del circulo', () => {
    expect(desproyectar({ x: CIRCULO.cx, y: CIRCULO.cy - 2 * CIRCULO.radio }, CIRCULO).altitud)
      .toBeLessThan(0);
  });
});

describe('ida y vuelta de la Proyeccion_Estereografica (Requisito 3.4)', () => {
  const muestras: readonly Horizontal[] = [
    { altitud: 0, azimut: 0 },
    { altitud: 0, azimut: 137.42 },
    { altitud: 0.0001, azimut: 359.9999 },
    { altitud: 12.5, azimut: 45 },
    { altitud: 33.333, azimut: 90 },
    { altitud: 60, azimut: 180 },
    { altitud: 77.7, azimut: 270 },
    { altitud: 89.9999, azimut: 210.125 },
    { altitud: 90, azimut: 0 },
  ];

  it('reproduce altitud y azimut con error menor que 0.01 grados', () => {
    for (const original of muestras) {
      const vuelta = desproyectar(proyectar(original, CIRCULO), CIRCULO);
      expect(Math.abs(vuelta.altitud - original.altitud)).toBeLessThan(0.01);
      const diferenciaAzimut = Math.abs(vuelta.azimut - original.azimut);
      expect(Math.min(diferenciaAzimut, 360 - diferenciaAzimut)).toBeLessThan(0.01);
    }
  });

  it('mantiene el azimut en [0, 360) y la altitud en [-90, 90]', () => {
    for (const original of muestras) {
      const vuelta = desproyectar(proyectar(original, CIRCULO), CIRCULO);
      expect(vuelta.azimut).toBeGreaterThanOrEqual(0);
      expect(vuelta.azimut).toBeLessThan(360);
      expect(vuelta.altitud).toBeGreaterThanOrEqual(-90);
      expect(vuelta.altitud).toBeLessThanOrEqual(90);
    }
  });

  it('tambien vuelve desde pantalla a horizontales y de nuevo a pantalla', () => {
    const punto = { x: CIRCULO.cx - 71.5, y: CIRCULO.cy + 33.25 };
    const ida = proyectar(desproyectar(punto, CIRCULO), CIRCULO);
    expect(ida.x).toBeCloseTo(punto.x, 9);
    expect(ida.y).toBeCloseTo(punto.y, 9);
  });

  it('es determinista: dos invocaciones devuelven valores identicos', () => {
    const h = { altitud: 41.2345, azimut: 289.6789 };
    expect(proyectar(h, CIRCULO)).toEqual(proyectar(h, CIRCULO));
  });
});
