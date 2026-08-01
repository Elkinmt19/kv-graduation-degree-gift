import { describe, expect, it } from 'vitest';
import {
  diaJuliano,
  siglosJulianos,
  tsLocalGrados,
  tsmGreenwichGrados,
} from '../../../../src/nucleo/astronomia/tiempo.js';

/**
 * Valores de referencia: Jean Meeus, *Astronomical Algorithms* (2a ed.),
 * ejemplos 12.a y 12.b.
 *
 * - 1987-04-10T00:00:00Z: JD 2446895.5, GMST 13h 10m 46.3668s = 197.693195 grados.
 * - 1987-04-10T19:21:00Z: JD 2446896.30625, GMST 8h 34m 57.0896s = 128.737873 grados.
 */
const horasAGrados = (h: number, m: number, s: number): number =>
  h * 15 + m * 0.25 + (s * 15) / 3600;

const GMST_MEEUS_12A = horasAGrados(13, 10, 46.3668);
const GMST_MEEUS_12B = horasAGrados(8, 34, 57.0896);

describe('diaJuliano (Requisito 3.1)', () => {
  it('convierte la epoca Unix en su dia juliano', () => {
    expect(diaJuliano(0)).toBe(2440587.5);
  });

  it('reproduce el dia juliano del ejemplo 12.a de Meeus', () => {
    expect(diaJuliano(Date.parse('1987-04-10T00:00:00Z'))).toBe(2446895.5);
  });

  it('reproduce el dia juliano del ejemplo 12.b de Meeus', () => {
    expect(diaJuliano(Date.parse('1987-04-10T19:21:00Z'))).toBeCloseTo(2446896.30625, 9);
  });

  it('interpreta el desplazamiento -05:00 del Instante_Graduacion', () => {
    // 19:00 en Colombia es 00:00 UTC del dia siguiente.
    expect(diaJuliano(Date.parse('2025-06-20T19:00:00-05:00'))).toBe(
      diaJuliano(Date.parse('2025-06-21T00:00:00Z')),
    );
  });
});

describe('siglosJulianos (Requisito 3.1)', () => {
  it('vale 0 exactamente en J2000.0', () => {
    expect(siglosJulianos(2451545.0)).toBe(0);
  });

  it('vale 1 un siglo juliano despues de J2000.0', () => {
    expect(siglosJulianos(2451545.0 + 36525)).toBe(1);
  });

  it('es negativo antes de J2000.0', () => {
    expect(siglosJulianos(2446895.5)).toBeCloseTo(-0.127296, 6);
  });
});

describe('tsmGreenwichGrados (GMST, Meeus 12.4, Requisito 3.1)', () => {
  it('coincide con el ejemplo 12.a de Meeus', () => {
    expect(tsmGreenwichGrados(2446895.5)).toBeCloseTo(GMST_MEEUS_12A, 4);
  });

  it('coincide con el ejemplo 12.b de Meeus, con fraccion de dia', () => {
    expect(tsmGreenwichGrados(2446896.30625)).toBeCloseTo(GMST_MEEUS_12B, 4);
  });

  it('queda siempre en [0, 360) para instantes muy separados', () => {
    const jds = [2415020.5, 2446895.5, 2451545.0, 2460000.25, 2488069.5];
    for (const jd of jds) {
      const gmst = tsmGreenwichGrados(jd);
      expect(Number.isFinite(gmst)).toBe(true);
      expect(gmst).toBeGreaterThanOrEqual(0);
      expect(gmst).toBeLessThan(360);
    }
  });

  it('avanza 360 grados en un dia sidereo y vuelve al mismo valor', () => {
    const jd = 2460846.5;
    const diaSidereoEnDias = (23 * 3600 + 56 * 60 + 4.0905) / 86400;
    const diferencia = Math.abs(tsmGreenwichGrados(jd + diaSidereoEnDias) - tsmGreenwichGrados(jd));
    expect(Math.min(diferencia, 360 - diferencia)).toBeLessThan(0.001);
  });

  it('es determinista: dos invocaciones devuelven el mismo valor', () => {
    expect(tsmGreenwichGrados(2460846.29167)).toBe(tsmGreenwichGrados(2460846.29167));
  });
});

describe('tsLocalGrados (Requisito 3.1)', () => {
  it('suma la longitud positiva al este', () => {
    const jd = 2446895.5;
    expect(tsLocalGrados(jd, 30)).toBeCloseTo(tsmGreenwichGrados(jd) + 30, 9);
  });

  it('resta la longitud negativa al oeste (Neiva, -75.2819)', () => {
    const jd = 2460846.5;
    const esperado = tsmGreenwichGrados(jd) - 75.2819;
    const normalizado = esperado < 0 ? esperado + 360 : esperado;
    expect(tsLocalGrados(jd, -75.2819)).toBeCloseTo(normalizado, 9);
  });

  it('en Greenwich coincide con el GMST', () => {
    const jd = 2460846.5;
    expect(tsLocalGrados(jd, 0)).toBe(tsmGreenwichGrados(jd));
  });

  it('queda siempre en [0, 360) para longitudes en los extremos', () => {
    for (const longitud of [-179.999999, -75.2819, 0, 75.2819, 180]) {
      const tsl = tsLocalGrados(2460846.5, longitud);
      expect(tsl).toBeGreaterThanOrEqual(0);
      expect(tsl).toBeLessThan(360);
    }
  });
});
