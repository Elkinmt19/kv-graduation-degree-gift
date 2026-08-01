import { describe, expect, it } from 'vitest';
import {
  precesarDesdeJ2000,
  precesarHaciaJ2000,
} from '../../../../src/nucleo/astronomia/precesion.js';
import type { Ecuatorial } from '../../../../src/nucleo/astronomia/modelo.js';

/** Dia juliano de la epoca J2000.0. */
const JD_J2000 = 2451545.0;

/** Dia juliano aproximado del 2025-12-05 (fecha del orden del Instante_Graduacion). */
const JD_2025 = 2461014.5;

/**
 * Diferencia entre dos ascensiones rectas en horas, envuelta a [-12, 12): la
 * ascension recta es circular, asi que 0 h y 24 h son la misma direccion.
 */
function diferenciaHoras(a: number, b: number): number {
  return ((((a - b) % 24) + 36) % 24) - 12;
}

/** Muestra de posiciones J2000.0 repartidas por el cielo, `ar` en horas. */
const MUESTRA: readonly Ecuatorial[] = [
  { ar: 0, dec: 0 },
  { ar: 6.752481, dec: -16.716116 }, // Sirio
  { ar: 5.919529, dec: 7.407064 }, // Betelgeuse
  { ar: 2.53030, dec: 89.264109 }, // Polaris
  { ar: 14.261, dec: 19.182 }, // Arturo
  { ar: 23.999, dec: -70.5 },
  { ar: 12.5, dec: -89.5 },
  { ar: 18.615649, dec: 38.783689 }, // Vega
];

describe('precesion (Requisitos 3.1, 3.3)', () => {
  describe('identidad en J2000.0', () => {
    it('precesarDesdeJ2000 no mueve las coordenadas cuando jd es J2000.0', () => {
      for (const eq of MUESTRA) {
        const precesada = precesarDesdeJ2000(eq, JD_J2000);
        expect(precesada.dec).toBeCloseTo(eq.dec, 9);
        // La ascension recta no esta definida en los polos exactos.
        if (Math.abs(eq.dec) < 89.9) {
          expect(diferenciaHoras(precesada.ar, eq.ar)).toBeCloseTo(0, 9);
        }
      }
    });

    it('precesarHaciaJ2000 no mueve las coordenadas cuando jd es J2000.0', () => {
      for (const eq of MUESTRA) {
        const precesada = precesarHaciaJ2000(eq, JD_J2000);
        expect(precesada.dec).toBeCloseTo(eq.dec, 9);
        if (Math.abs(eq.dec) < 89.9) {
          expect(diferenciaHoras(precesada.ar, eq.ar)).toBeCloseTo(0, 9);
        }
      }
    });
  });

  describe('ida y vuelta', () => {
    it('precesar hacia la fecha y volver reproduce el origen', () => {
      for (const eq of MUESTRA) {
        const vuelta = precesarHaciaJ2000(precesarDesdeJ2000(eq, JD_2025), JD_2025);
        expect(vuelta.dec).toBeCloseTo(eq.dec, 8);
        if (Math.abs(eq.dec) < 89.9) {
          expect(diferenciaHoras(vuelta.ar, eq.ar)).toBeCloseTo(0, 8);
        }
      }
    });

    it('precesar desde la fecha y volver reproduce el origen', () => {
      for (const eq of MUESTRA) {
        const vuelta = precesarDesdeJ2000(precesarHaciaJ2000(eq, JD_2025), JD_2025);
        expect(vuelta.dec).toBeCloseTo(eq.dec, 8);
        if (Math.abs(eq.dec) < 89.9) {
          expect(diferenciaHoras(vuelta.ar, eq.ar)).toBeCloseTo(0, 8);
        }
      }
    });
  });

  describe('valores de referencia', () => {
    it('reproduce el ejemplo 21.b de Meeus (theta Persei)', () => {
      // Meeus, Astronomical Algorithms, ejemplo 21.b: posicion de theta Persei
      // ya corregida por movimiento propio (2h44m12.975s, +49o13'39.90")
      // precesada al JD 2462088.69.
      const origen: Ecuatorial = {
        ar: 2 + 44 / 60 + 12.975 / 3600,
        dec: 49 + 13 / 60 + 39.9 / 3600,
      };
      const esperado: Ecuatorial = {
        ar: 2 + 46 / 60 + 11.331 / 3600,
        dec: 49 + 20 / 60 + 54.54 / 3600,
      };

      const obtenido = precesarDesdeJ2000(origen, 2462088.69);

      // Tolerancia de medio segundo de arco, el redondeo del propio ejemplo.
      const medioSegundoEnHoras = 0.5 / 3600 / 15;
      const medioSegundoEnGrados = 0.5 / 3600;
      expect(Math.abs(diferenciaHoras(obtenido.ar, esperado.ar))).toBeLessThan(
        medioSegundoEnHoras,
      );
      expect(Math.abs(obtenido.dec - esperado.dec)).toBeLessThan(medioSegundoEnGrados);
    });

    it('desplaza las posiciones de 2025 en el orden de 0.3 grados', () => {
      const sirio: Ecuatorial = { ar: 6.752481, dec: -16.716116 };
      const precesada = precesarDesdeJ2000(sirio, JD_2025);

      const desplazamientoGrados = Math.hypot(
        diferenciaHoras(precesada.ar, sirio.ar) * 15 * Math.cos((sirio.dec * Math.PI) / 180),
        precesada.dec - sirio.dec,
      );

      expect(desplazamientoGrados).toBeGreaterThan(0.2);
      expect(desplazamientoGrados).toBeLessThan(0.5);
    });
  });

  describe('rangos y determinismo', () => {
    it('devuelve ar en [0, 24) y dec en [-90, 90]', () => {
      for (const eq of MUESTRA) {
        for (const resultado of [
          precesarDesdeJ2000(eq, JD_2025),
          precesarHaciaJ2000(eq, JD_2025),
        ]) {
          expect(resultado.ar).toBeGreaterThanOrEqual(0);
          expect(resultado.ar).toBeLessThan(24);
          expect(resultado.dec).toBeGreaterThanOrEqual(-90);
          expect(resultado.dec).toBeLessThanOrEqual(90);
        }
      }
    });

    it('normaliza la ascension recta que cruza las 24 horas', () => {
      const casiCompleta: Ecuatorial = { ar: 23.9999, dec: 0 };
      const precesada = precesarDesdeJ2000(casiCompleta, JD_2025);

      expect(precesada.ar).toBeGreaterThanOrEqual(0);
      expect(precesada.ar).toBeLessThan(1);
    });

    it('produce bits identicos en dos invocaciones iguales', () => {
      const eq: Ecuatorial = { ar: 14.261, dec: 19.182 };
      expect(precesarDesdeJ2000(eq, JD_2025)).toEqual(precesarDesdeJ2000(eq, JD_2025));
    });
  });
});
