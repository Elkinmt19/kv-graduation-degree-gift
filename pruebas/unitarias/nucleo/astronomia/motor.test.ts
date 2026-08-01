import { describe, expect, it } from 'vitest';

import {
  ALTITUD_HORIZONTE,
  MAX_ESTRELLAS_DIBUJADAS,
  calcularCielo,
  seleccionarDibujables,
} from '../../../../src/nucleo/astronomia/motor.js';
import type {
  CirculoHorizonte,
  EstrellaCalculada,
  InstanteGraduacion,
  LugarGraduacion,
} from '../../../../src/nucleo/astronomia/modelo.js';
import type { CatalogoEstelar, Estrella, Segmento } from '../../../../src/nucleo/catalogo/modelo.js';
import { radioPorMagnitud } from '../../../../src/vista/mapa/radio.js';

/** Circulo descentrado, para que un error de signo no pase inadvertido. */
const CIRCULO: CirculoHorizonte = { cx: 320, cy: 240, radio: 180 };

const INSTANTE: InstanteGraduacion = {
  iso: '2025-12-12T10:00:00-05:00',
  msUtc: Date.parse('2025-12-12T10:00:00-05:00'),
};

/** Lugar_Graduacion real del regalo. */
const NEIVA: LugarGraduacion = { nombre: 'Neiva, Huila', latitud: 2.9273, longitud: -75.2819 };

/**
 * Observador a 45 grados de latitud norte. A esa latitud una estrella de
 * declinacion +85 tiene altitud entre 40 y 50 grados para cualquier angulo
 * horario, y una de declinacion -85 la tiene entre -50 y -40: la visibilidad no
 * depende de la hora, asi que las expectativas del caso son estables.
 */
const OBSERVATORIO: LugarGraduacion = {
  nombre: 'Observatorio de prueba',
  latitud: 45,
  longitud: 0,
};

function estrella(
  nombre: string,
  dec: number,
  magnitud: number,
  constelacion: string,
  ar = 0,
): Estrella {
  return { nombre, ar, dec, magnitud, constelacion };
}

/** Dos estrellas circumpolares visibles y dos australes siempre bajo el horizonte. */
const ESTRELLAS_POLARES: readonly Estrella[] = [
  estrella('Boreal brillante', 85, 0.5, 'Osa', 0),
  estrella('Boreal debil', 80, 3.25, 'Osa', 6),
  estrella('Austral brillante', -85, -1.0, 'Octante', 12),
  estrella('Austral debil', -80, 4.5, 'Octante', 18),
];

const SEGMENTOS_POLARES: readonly Segmento[] = [
  // Ambos extremos visibles: se dibuja.
  { desde: 'Boreal brillante', hasta: 'Boreal debil' },
  // Un extremo bajo el horizonte: se omite (Requisito 4.15).
  { desde: 'Boreal brillante', hasta: 'Austral brillante' },
  // Ambos extremos bajo el horizonte: se omite.
  { desde: 'Austral brillante', hasta: 'Austral debil' },
];

function catalogoCon(
  estrellas: readonly Estrella[],
  segmentos: readonly Segmento[] = [],
): CatalogoEstelar {
  return {
    version: 1,
    epoca: 'J2000.0',
    atribucion: 'Datos de prueba',
    estrellas,
    segmentos,
  };
}

const CATALOGO_POLAR = catalogoCon(ESTRELLAS_POLARES, SEGMENTOS_POLARES);

/** Cielo calculado o fallo de la prueba: evita repetir el estrechamiento de tipo. */
function cieloDe(
  catalogo: CatalogoEstelar,
  lugar: LugarGraduacion = OBSERVATORIO,
  instante: InstanteGraduacion = INSTANTE,
) {
  const resultado = calcularCielo(catalogo, instante, lugar, CIRCULO);
  if (!resultado.ok) {
    throw new Error(`se esperaba un calculo exitoso, llego ${resultado.error.clase}`);
  }
  return resultado.cielo;
}

describe('calcularCielo: validacion previa (Requisito 3.9)', () => {
  const catalogo = catalogoCon([estrella('Unica', 0, 1, 'Prueba')]);

  it('rechaza la latitud fuera de [-90, 90] sin producir ninguna coordenada', () => {
    for (const latitud of [90.000001, -90.000001, 91, -1000, Number.NaN, Number.POSITIVE_INFINITY]) {
      const resultado = calcularCielo(
        catalogo,
        INSTANTE,
        { ...NEIVA, latitud },
        CIRCULO,
      );
      expect(resultado.ok).toBe(false);
      expect(resultado).not.toHaveProperty('cielo');
      if (!resultado.ok) {
        expect(resultado.error).toEqual({
          clase: 'lugar-invalido',
          campo: 'latitud',
          recibido: latitud,
        });
      }
    }
  });

  it('acepta los extremos exactos de la latitud', () => {
    for (const latitud of [-90, 90, 0]) {
      expect(calcularCielo(catalogo, INSTANTE, { ...NEIVA, latitud }, CIRCULO).ok).toBe(true);
    }
  });

  it('rechaza la longitud fuera de (-180, 180]', () => {
    for (const longitud of [-180, -180.5, 180.000001, 360, Number.NaN]) {
      const resultado = calcularCielo(catalogo, INSTANTE, { ...NEIVA, longitud }, CIRCULO);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error).toEqual({
          clase: 'lugar-invalido',
          campo: 'longitud',
          recibido: longitud,
        });
      }
    }
  });

  it('acepta el 180 exacto pero no el -180, porque el intervalo es abierto por la izquierda', () => {
    expect(calcularCielo(catalogo, INSTANTE, { ...NEIVA, longitud: 180 }, CIRCULO).ok).toBe(true);
    expect(calcularCielo(catalogo, INSTANTE, { ...NEIVA, longitud: -180 }, CIRCULO).ok).toBe(false);
  });

  it('rechaza el instante que no se interpreta como fecha y hora con desplazamiento', () => {
    const invalidos = [
      '',
      'manana',
      '2025-12-12',
      '2025-12-12T10:00:00',
      '2025-13-45T10:00:00-05:00',
      '12/12/2025 10:00 -05:00',
    ];
    for (const iso of invalidos) {
      const resultado = calcularCielo(catalogo, { iso, msUtc: 0 }, NEIVA, CIRCULO);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.error).toEqual({ clase: 'instante-invalido', recibido: iso });
      }
    }
  });

  it('rechaza el instante cuyos milisegundos no son finitos', () => {
    const resultado = calcularCielo(
      catalogo,
      { iso: INSTANTE.iso, msUtc: Number.NaN },
      NEIVA,
      CIRCULO,
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toEqual({ clase: 'instante-invalido', recibido: INSTANTE.iso });
    }
  });

  it('admite el desplazamiento Z y la fraccion de segundo', () => {
    for (const iso of ['2025-12-12T15:00:00Z', '2025-12-12T10:00-05:00', '2025-12-12T10:00:00.500-05:00']) {
      expect(calcularCielo(catalogo, { iso, msUtc: Date.parse(iso) }, NEIVA, CIRCULO).ok).toBe(true);
    }
  });

  it('reporta el instante antes que el lugar cuando ambos son invalidos', () => {
    const resultado = calcularCielo(
      catalogo,
      { iso: 'no es una fecha', msUtc: 0 },
      { ...NEIVA, latitud: 200, longitud: 400 },
      CIRCULO,
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.clase).toBe('instante-invalido');
    }
  });
});

describe('calcularCielo: visibilidad y coordenadas de pantalla (Requisito 3.10)', () => {
  const cielo = cieloDe(CATALOGO_POLAR);

  it('conserva el orden del catalogo', () => {
    expect(cielo.estrellas.map((e) => e.estrella.nombre)).toEqual(
      ESTRELLAS_POLARES.map((e) => e.nombre),
    );
  });

  it('marca visible exactamente cuando la altitud es mayor o igual a 0', () => {
    for (const calculada of cielo.estrellas) {
      expect(calculada.visible).toBe(calculada.horizontal.altitud >= ALTITUD_HORIZONTE);
    }
    expect(cielo.estrellas.map((e) => e.visible)).toEqual([true, true, false, false]);
  });

  it('omite las coordenadas de pantalla de las estrellas bajo el horizonte', () => {
    for (const calculada of cielo.estrellas) {
      expect(calculada.pantalla === null).toBe(!calculada.visible);
    }
  });

  it('deja toda estrella visible dentro del Circulo_Horizonte (Requisito 3.5)', () => {
    for (const calculada of cielo.estrellas) {
      if (calculada.pantalla === null) {
        continue;
      }
      const distancia = Math.hypot(
        calculada.pantalla.x - CIRCULO.cx,
        calculada.pantalla.y - CIRCULO.cy,
      );
      expect(distancia).toBeLessThanOrEqual(CIRCULO.radio);
    }
  });

  it('produce altitud en [-90, 90] y azimut en [0, 360) para toda estrella (Requisito 3.2)', () => {
    for (const { horizontal } of cielo.estrellas) {
      expect(Number.isFinite(horizontal.altitud)).toBe(true);
      expect(horizontal.altitud).toBeGreaterThanOrEqual(-90);
      expect(horizontal.altitud).toBeLessThanOrEqual(90);
      expect(horizontal.azimut).toBeGreaterThanOrEqual(0);
      expect(horizontal.azimut).toBeLessThan(360);
    }
  });

  it('asigna el radio que dicta la magnitud aparente (Requisito 4.2)', () => {
    for (const calculada of cielo.estrellas) {
      expect(calculada.radio).toBe(radioPorMagnitud(calculada.estrella.magnitud));
    }
  });

  it('devuelve el instante, el lugar y el circulo recibidos', () => {
    expect(cielo.instante).toEqual(INSTANTE);
    expect(cielo.lugar).toEqual(OBSERVATORIO);
    expect(cielo.circulo).toEqual(CIRCULO);
  });
});

describe('calcularCielo: segmentos y constelaciones (Requisito 4.15)', () => {
  const cielo = cieloDe(CATALOGO_POLAR);

  it('dibuja solo los segmentos con ambos extremos visibles', () => {
    const [boreal, borealDebil] = cielo.estrellas;
    expect(cielo.segmentosVisibles).toEqual([
      { a: boreal?.pantalla, b: borealDebil?.pantalla },
    ]);
  });

  it('omite el segmento que referencia un nombre ausente', () => {
    const conAusente = catalogoCon(ESTRELLAS_POLARES, [
      { desde: 'Boreal brillante', hasta: 'Nombre que no existe' },
    ]);
    expect(cieloDe(conAusente).segmentosVisibles).toEqual([]);
  });

  it('nombra las constelaciones dibujadas sin repeticiones', () => {
    expect(cielo.constelacionesDibujadas).toEqual(['Osa']);
  });

  it('no nombra constelaciones cuyas estrellas estan todas bajo el horizonte', () => {
    expect(cielo.constelacionesDibujadas).not.toContain('Octante');
  });

  it('ordena las constelaciones de la mas brillante a la mas debil', () => {
    const catalogo = catalogoCon([
      estrella('Debil', 85, 5, 'Tenue'),
      estrella('Brillante', 85, -1, 'Fulgor'),
      estrella('Media', 85, 2, 'Intermedia'),
    ]);
    expect(cieloDe(catalogo).constelacionesDibujadas).toEqual(['Fulgor', 'Intermedia', 'Tenue']);
  });
});

describe('calcularCielo: marcas cardinales (Requisito 4.7)', () => {
  const { cardinales } = cieloDe(CATALOGO_POLAR);

  it('produce exactamente cuatro marcas rotuladas N, E, S y O', () => {
    expect(cardinales.map((c) => c.rotulo)).toEqual(['N', 'E', 'S', 'O']);
  });

  it('las coloca sobre el borde del circulo, sin desviacion alguna', () => {
    const { cx, cy, radio } = CIRCULO;
    expect(cardinales.map((c) => c.punto)).toEqual([
      { x: cx, y: cy - radio },
      { x: cx - radio, y: cy },
      { x: cx, y: cy + radio },
      { x: cx + radio, y: cy },
    ]);
    for (const { punto } of cardinales) {
      expect(Math.hypot(punto.x - cx, punto.y - cy)).toBe(radio);
    }
  });
});

describe('calcularCielo: determinismo (Requisito 3.6)', () => {
  it('devuelve resultados identicos en dos invocaciones con las mismas entradas', () => {
    const primero = cieloDe(CATALOGO_POLAR, NEIVA);
    const segundo = cieloDe(CATALOGO_POLAR, NEIVA);
    expect(primero).toEqual(segundo);
    for (let i = 0; i < primero.estrellas.length; i += 1) {
      const a = primero.estrellas[i];
      const b = segundo.estrellas[i];
      expect(a?.horizontal.altitud).toBe(b?.horizontal.altitud);
      expect(a?.horizontal.azimut).toBe(b?.horizontal.azimut);
      expect(a?.pantalla?.x).toBe(b?.pantalla?.x);
      expect(a?.pantalla?.y).toBe(b?.pantalla?.y);
    }
  });

  it('responde al cambio de instante y de lugar', () => {
    const otroInstante: InstanteGraduacion = {
      iso: '2025-06-12T10:00:00-05:00',
      msUtc: Date.parse('2025-06-12T10:00:00-05:00'),
    };
    const base = cieloDe(CATALOGO_POLAR, NEIVA);
    expect(cieloDe(CATALOGO_POLAR, NEIVA, otroInstante)).not.toEqual(base);
    expect(cieloDe(CATALOGO_POLAR, { ...NEIVA, latitud: -33.5 })).not.toEqual(base);
  });
});

describe('seleccionarDibujables (Requisito 4.1)', () => {
  function calculada(magnitud: number, visible: boolean): EstrellaCalculada {
    return {
      estrella: estrella(`Estrella ${String(magnitud)} ${String(visible)}`, 0, magnitud, 'Prueba'),
      horizontal: { altitud: visible ? 30 : -30, azimut: 0 },
      visible,
      pantalla: visible ? { x: 0, y: 0 } : null,
      radio: radioPorMagnitud(magnitud),
    };
  }

  it('toma las visibles con magnitud menor o igual a 6.0 y descarta el resto', () => {
    const entrada = [calculada(1, true), calculada(1, false), calculada(6, true), calculada(6.5, true)];
    const seleccion = seleccionarDibujables(entrada);
    expect(seleccion.map((e) => e.estrella.magnitud)).toEqual([1, 6]);
  });

  it('ordena de la mas brillante a la mas debil', () => {
    const seleccion = seleccionarDibujables([
      calculada(4, true),
      calculada(-1, true),
      calculada(2, true),
    ]);
    expect(seleccion.map((e) => e.estrella.magnitud)).toEqual([-1, 2, 4]);
  });

  it('devuelve una coleccion vacia cuando no hay estrellas visibles', () => {
    expect(seleccionarDibujables([calculada(1, false)])).toEqual([]);
  });

  it('recorta a 3000 estrellas conservando las mas brillantes', () => {
    const total = MAX_ESTRELLAS_DIBUJADAS + 500;
    const estrellas: EstrellaCalculada[] = [];
    for (let i = 0; i < total; i += 1) {
      // Magnitudes crecientes: la estrella i es mas brillante que la i + 1.
      estrellas.push(calculada(-1.5 + (7.5 * i) / (total - 1), true));
    }
    const seleccion = seleccionarDibujables(estrellas);
    expect(seleccion).toHaveLength(MAX_ESTRELLAS_DIBUJADAS);
    expect(seleccion[0]?.estrella.magnitud).toBe(estrellas[0]?.estrella.magnitud);
    const ultima = seleccion[MAX_ESTRELLAS_DIBUJADAS - 1]?.estrella.magnitud ?? 0;
    const primeraDescartada = estrellas[MAX_ESTRELLAS_DIBUJADAS]?.estrella.magnitud ?? 0;
    expect(ultima).toBeLessThanOrEqual(primeraDescartada);
  });
});

describe('calcularCielo: coste (Requisito 3.11)', () => {
  it('resuelve 3000 estrellas en menos de 300 milisegundos', () => {
    const estrellas: Estrella[] = [];
    for (let i = 0; i < MAX_ESTRELLAS_DIBUJADAS; i += 1) {
      estrellas.push(
        estrella(
          `Estrella ${String(i)}`,
          -90 + (180 * i) / (MAX_ESTRELLAS_DIBUJADAS - 1),
          -1.5 + (7.5 * i) / (MAX_ESTRELLAS_DIBUJADAS - 1),
          `Constelacion ${String(i % 88)}`,
          (24 * i) / MAX_ESTRELLAS_DIBUJADAS,
        ),
      );
    }
    const catalogo = catalogoCon(estrellas);

    const inicio = performance.now();
    const cielo = cieloDe(catalogo, NEIVA);
    const transcurrido = performance.now() - inicio;

    expect(cielo.estrellas).toHaveLength(MAX_ESTRELLAS_DIBUJADAS);
    expect(transcurrido).toBeLessThan(300);
  });
});
