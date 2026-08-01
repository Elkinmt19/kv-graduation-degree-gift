import { describe, expect, it } from 'vitest';

import {
  aEcuatoriales,
  aHorizontales,
} from '../../../../src/nucleo/astronomia/horizontales.js';
import type { Ecuatorial, Horizontal } from '../../../../src/nucleo/astronomia/modelo.js';

/** Latitud del Lugar_Graduacion por defecto (Neiva, Huila). */
const LAT_NEIVA = 2.9273;

/** Tiempo sidereo local de prueba, en grados, deliberadamente no redondo. */
const TSL = 137.5;

/** Ascension recta, en horas, de una estrella que cruza el meridiano con `tsl`. */
function arEnMeridiano(tsl: number): number {
  return tsl / 15;
}

/** Diferencia angular minima entre dos azimuts, en grados. */
function diferenciaAzimut(a: number, b: number): number {
  const bruta = Math.abs(a - b) % 360;
  return Math.min(bruta, 360 - bruta);
}

describe('aHorizontales (ecuatoriales -> Coordenadas_Horizontales)', () => {
  it('coloca en el cenit la estrella cuya declinacion iguala la latitud y esta en el meridiano', () => {
    const cenit = aHorizontales({ ar: arEnMeridiano(TSL), dec: LAT_NEIVA }, LAT_NEIVA, TSL);
    expect(cenit.altitud).toBeCloseTo(90, 9);
    // En el cenit el azimut es indeterminado, pero debe seguir siendo un valor
    // valido del intervalo [0, 360) (Requisito 3.2).
    expect(cenit.azimut).toBeGreaterThanOrEqual(0);
    expect(cenit.azimut).toBeLessThan(360);
  });

  it('coloca en el horizonte la estrella del ecuador celeste a seis horas del meridiano', () => {
    // Observador en el ecuador: dec = 0 y angulo horario 90 grados -> altitud 0.
    const poniente = aHorizontales({ ar: arEnMeridiano(TSL - 90), dec: 0 }, 0, TSL);
    expect(poniente.altitud).toBe(0);
    expect(poniente.azimut).toBeCloseTo(270, 9); // se pone por el oeste

    const naciente = aHorizontales({ ar: arEnMeridiano(TSL + 90), dec: 0 }, 0, TSL);
    expect(naciente.altitud).toBe(0);
    expect(naciente.azimut).toBeCloseTo(90, 9); // sale por el este
  });

  it('en el meridiano da altitud 90 - |dec - lat| y azimut exactamente norte o sur', () => {
    const lat = 40;
    const ar = arEnMeridiano(TSL);

    const alNorteDelCenit = aHorizontales({ ar, dec: 60 }, lat, TSL);
    expect(alNorteDelCenit.altitud).toBeCloseTo(70, 9);
    expect(alNorteDelCenit.azimut).toBe(0);

    const alSurDelCenit = aHorizontales({ ar, dec: 20 }, lat, TSL);
    expect(alSurDelCenit.altitud).toBeCloseTo(70, 9);
    expect(alSurDelCenit.azimut).toBe(180);
  });

  it('deja bajo el horizonte una estrella que nunca sale para esa latitud', () => {
    // Desde +40 de latitud, una declinacion de -80 no alcanza el horizonte ni
    // en su paso por el meridiano: altitud maxima 90 - 120 = -30.
    const maxima = aHorizontales({ ar: arEnMeridiano(TSL), dec: -80 }, 40, TSL);
    expect(maxima.altitud).toBeCloseTo(-30, 9);
    for (const horas of [0, 3, 6, 9, 12, 15, 18, 21]) {
      const h = aHorizontales({ ar: arEnMeridiano(TSL + horas * 15), dec: -80 }, 40, TSL);
      expect(h.altitud).toBeLessThan(0);
    }
  });

  it('trata los dos hemisferios con la misma formula, con el azimut reflejado', () => {
    const norte = aHorizontales({ ar: arEnMeridiano(TSL - 47.5), dec: 23.4 }, 40, TSL);
    const sur = aHorizontales({ ar: arEnMeridiano(TSL - 47.5), dec: -23.4 }, -40, TSL);

    // Reflejar latitud y declinacion conserva la altitud y refleja el azimut
    // respecto del eje norte-sur.
    expect(sur.altitud).toBeCloseTo(norte.altitud, 9);
    expect(diferenciaAzimut(sur.azimut, 180 - norte.azimut)).toBeLessThan(1e-9);
  });

  it('pone la Polar sobre el polo elevado en el hemisferio sur y bajo el horizonte', () => {
    const polarDesdeSantiago = aHorizontales({ ar: 2.53, dec: 89.26 }, -33.45, TSL);
    expect(polarDesdeSantiago.altitud).toBeLessThan(0);

    // La Polar no esta en el polo exacto: dista 0.74 grados de el, asi que su
    // altitud oscila alrededor de la latitud dentro de ese margen.
    const polarDesdeNeiva = aHorizontales({ ar: 2.53, dec: 89.26 }, LAT_NEIVA, TSL);
    expect(Math.abs(polarDesdeNeiva.altitud - LAT_NEIVA)).toBeLessThan(0.75);
    expect(diferenciaAzimut(polarDesdeNeiva.azimut, 0)).toBeLessThan(1);
  });

  it('mantiene altitud en [-90, 90] y azimut en [0, 360) para un barrido completo', () => {
    for (const lat of [-89, -33.45, 0, LAT_NEIVA, 51.5, 89]) {
      for (const dec of [-90, -45, 0, 23.4, 90]) {
        for (const horas of [0, 4.5, 9, 13.7, 18, 23.99]) {
          const h = aHorizontales({ ar: horas, dec }, lat, TSL);
          expect(Number.isFinite(h.altitud)).toBe(true);
          expect(h.altitud).toBeGreaterThanOrEqual(-90);
          expect(h.altitud).toBeLessThanOrEqual(90);
          expect(h.azimut).toBeGreaterThanOrEqual(0);
          expect(h.azimut).toBeLessThan(360);
        }
      }
    }
  });

  it('no devuelve azimut 360 cuando atan2 produce un subnormal negativo', () => {
    // Regresion del contraejemplo de la Propiedad 10: con el observador en el
    // polo sur `cos(lat)` vale 0 y los argumentos de `atan2` degeneran, de modo
    // que el azimut sale como un subnormal negativo. Sumarle 360 lo pierde y
    // el resultado redondea a 360 exacto, fuera del intervalo semiabierto del
    // Requisito 3.2, dando al norte dos representaciones.
    const tslSubnormal = 1.43e-322;
    const h = aHorizontales({ ar: 0, dec: 0 }, -90, tslSubnormal);

    expect(h.azimut).toBeGreaterThanOrEqual(0);
    expect(h.azimut).toBeLessThan(360);
    expect(Object.is(h.azimut, -0)).toBe(false);
  });

  it('es determinista: dos invocaciones devuelven valores identicos', () => {
    const eq: Ecuatorial = { ar: 6.7525, dec: -16.7161 };
    expect(aHorizontales(eq, LAT_NEIVA, TSL)).toEqual(aHorizontales(eq, LAT_NEIVA, TSL));
  });
});

describe('aEcuatoriales (Coordenadas_Horizontales -> ecuatoriales)', () => {
  it('devuelve la declinacion de la latitud para el cenit', () => {
    const eq = aEcuatoriales({ altitud: 90, azimut: 0 }, LAT_NEIVA, TSL);
    expect(eq.dec).toBeCloseTo(LAT_NEIVA, 9);
    expect(eq.ar).toBeCloseTo(arEnMeridiano(TSL), 9);
  });

  it('lee el polo celeste elevado mirando al norte con altitud igual a la latitud', () => {
    const eq = aEcuatoriales({ altitud: 40, azimut: 0 }, 40, TSL);
    // `asin` pierde precision cuando su argumento roza 1: el residuo es del
    // orden de 1e-6 grados, cien veces menor que el margen de 0.01 grados del
    // Requisito 3.3.
    expect(Math.abs(eq.dec - 90)).toBeLessThan(1e-5);
  });

  it('mantiene ar en [0, 24) y dec en [-90, 90]', () => {
    for (const lat of [-89, -33.45, 0, LAT_NEIVA, 51.5, 89]) {
      for (const altitud of [-90, -12, 0, 33.3, 90]) {
        for (const azimut of [0, 45, 90, 187.5, 270, 359.99]) {
          const eq = aEcuatoriales({ altitud, azimut }, lat, TSL);
          expect(eq.ar).toBeGreaterThanOrEqual(0);
          expect(eq.ar).toBeLessThan(24);
          expect(eq.dec).toBeGreaterThanOrEqual(-90);
          expect(eq.dec).toBeLessThanOrEqual(90);
        }
      }
    }
  });
});

describe('ida y vuelta ecuatorial <-> horizontal (Requisito 3.3)', () => {
  const muestras: readonly Ecuatorial[] = [
    { ar: 0, dec: 0 },
    { ar: 6.7525, dec: -16.7161 }, // Sirio
    { ar: 5.2423, dec: -8.2016 }, // Rigel
    { ar: 14.2612, dec: 19.1824 }, // Arturo
    { ar: 2.5303, dec: 89.2641 }, // Polar
    { ar: 12.5, dec: -60 },
    { ar: 18.6156, dec: 38.7837 }, // Vega
    { ar: 23.9999, dec: 45 },
  ];

  const latitudes = [-33.45, -2.9273, 0, LAT_NEIVA, 51.5];

  it('reproduce ascension recta y declinacion con error menor que 0.01 grados', () => {
    for (const lat of latitudes) {
      for (const original of muestras) {
        const vuelta = aEcuatoriales(aHorizontales(original, lat, TSL), lat, TSL);
        expect(Math.abs(vuelta.dec - original.dec)).toBeLessThan(0.01);
        // La ascension recta se compara en grados y por el camino corto.
        expect(diferenciaAzimut(vuelta.ar * 15, original.ar * 15)).toBeLessThan(0.01);
      }
    }
  });

  it('tambien vuelve desde horizontales a ecuatoriales y de nuevo a horizontales', () => {
    const muestrasHorizontales: readonly Horizontal[] = [
      { altitud: 0, azimut: 0 },
      { altitud: 15.25, azimut: 47.5 },
      { altitud: 62.125, azimut: 213.75 },
      { altitud: -25, azimut: 300 },
    ];

    for (const original of muestrasHorizontales) {
      const vuelta = aHorizontales(aEcuatoriales(original, LAT_NEIVA, TSL), LAT_NEIVA, TSL);
      expect(Math.abs(vuelta.altitud - original.altitud)).toBeLessThan(0.01);
      expect(diferenciaAzimut(vuelta.azimut, original.azimut)).toBeLessThan(0.01);
    }
  });
});
