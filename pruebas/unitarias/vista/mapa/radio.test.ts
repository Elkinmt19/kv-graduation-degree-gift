import { describe, expect, it } from 'vitest';

import {
  MAGNITUD_MAXIMA,
  MAGNITUD_MINIMA,
  RADIO_MAXIMO,
  RADIO_MINIMO,
  radioPorMagnitud,
} from '../../../../src/vista/mapa/radio.js';

describe('radioPorMagnitud (Requisito 4.2)', () => {
  it('da 3.5 px en la magnitud minima y 0.6 px en la maxima', () => {
    expect(radioPorMagnitud(MAGNITUD_MINIMA)).toBeCloseTo(RADIO_MAXIMO, 10);
    expect(radioPorMagnitud(MAGNITUD_MAXIMA)).toBeCloseTo(RADIO_MINIMO, 10);
  });

  it('es constante mas alla de los dos extremos', () => {
    for (const magnitud of [-1.51, -4, -26.7, Number.NEGATIVE_INFINITY]) {
      expect(radioPorMagnitud(magnitud)).toBeCloseTo(RADIO_MAXIMO, 10);
    }
    for (const magnitud of [6.01, 9, 15.4, Number.POSITIVE_INFINITY]) {
      expect(radioPorMagnitud(magnitud)).toBeCloseTo(RADIO_MINIMO, 10);
    }
  });

  it('decrece de forma estricta dentro del intervalo util', () => {
    const magnitudes = [-1.5, -1, 0, 0.5, 1.5, 3, 4.5, 6];
    for (let i = 1; i < magnitudes.length; i += 1) {
      expect(radioPorMagnitud(magnitudes[i]!)).toBeLessThan(radioPorMagnitud(magnitudes[i - 1]!));
    }
  });

  it('sigue la curva 0.6 + 2.9 * t^1.6 en el punto medio', () => {
    // Magnitud 2.25 es el centro de [-1.5, 6.0], asi que t = 0.5.
    const esperado = RADIO_MINIMO + 2.9 * Math.pow(0.5, 1.6);
    expect(radioPorMagnitud(2.25)).toBeCloseTo(esperado, 10);
    // El exponente mayor que 1 mantiene el punto medio por debajo del radio medio.
    expect(radioPorMagnitud(2.25)).toBeLessThan((RADIO_MINIMO + RADIO_MAXIMO) / 2);
  });

  it('mantiene todo radio dentro de [0.6, 3.5]', () => {
    for (const magnitud of [-30, -1.5, -0.3, 1, 2.7, 5.99, 6, 100]) {
      const radio = radioPorMagnitud(magnitud);
      expect(radio).toBeGreaterThanOrEqual(RADIO_MINIMO);
      expect(radio).toBeLessThanOrEqual(RADIO_MAXIMO);
    }
  });
});
