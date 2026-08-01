import { describe, expect, it } from 'vitest';

import type { CirculoHorizonte, EstrellaCalculada } from '../../../../src/nucleo/astronomia/modelo.js';
import { seleccionarDibujables } from '../../../../src/nucleo/astronomia/motor.js';
import {
  ALTO_ETIQUETA,
  MAGNITUD_MAXIMA_ETIQUETA,
  MAX_ETIQUETAS,
  RELLENO_ETIQUETA,
  SEPARACION_ETIQUETA,
  TAMANO_FUENTE_ETIQUETA,
  TAMANO_FUENTE_MINIMO,
  colocarEtiquetas,
  dentroDelCirculo,
  solapan,
} from '../../../../src/vista/mapa/etiquetas.js';
import { radioPorMagnitud } from '../../../../src/vista/mapa/radio.js';

const CIRCULO: CirculoHorizonte = { cx: 200, cy: 200, radio: 180 };

/** Medidor sintetico: 7 px por caracter, la costura que evita el navegador. */
const medir = (texto: string): number => texto.length * 7;

/**
 * Estrella calculada de prueba. Solo importan el nombre, la magnitud y la
 * coordenada de pantalla; las horizontales se rellenan de forma coherente con
 * `visible`.
 */
function estrella(
  nombre: string,
  magnitud: number,
  x: number,
  y: number,
  visible = true,
): EstrellaCalculada {
  return {
    estrella: { nombre, ar: 0, dec: 0, magnitud, constelacion: 'Prueba' },
    horizontal: { altitud: visible ? 45 : -45, azimut: 0 },
    visible,
    pantalla: visible ? { x, y } : null,
    radio: radioPorMagnitud(magnitud),
  };
}

describe('colocarEtiquetas (Requisito 4.4)', () => {
  it('etiqueta solo las estrellas visibles con magnitud menor o igual a 1.5', () => {
    const etiquetas = colocarEtiquetas(
      [
        estrella('Brillante', -1.4, 200, 100),
        estrella('Justa', MAGNITUD_MAXIMA_ETIQUETA, 200, 140),
        estrella('Debil', 1.51, 200, 180),
        estrella('Bajo el horizonte', 0, 200, 220, false),
      ],
      CIRCULO,
      medir,
    );

    expect(etiquetas.map((etiqueta) => etiqueta.texto)).toEqual(['Brillante', 'Justa']);
  });

  it('recorre de la mas brillante a la mas debil aunque la entrada venga desordenada', () => {
    const etiquetas = colocarEtiquetas(
      [
        estrella('Media', 0.8, 200, 100),
        estrella('Debilucha', 1.4, 200, 140),
        estrella('Brillantisima', -0.7, 200, 180),
      ],
      CIRCULO,
      medir,
    );

    expect(etiquetas.map((etiqueta) => etiqueta.texto)).toEqual([
      'Brillantisima',
      'Media',
      'Debilucha',
    ]);
  });

  it('conserva el orden que ya trae seleccionarDibujables', () => {
    const estrellas = [
      estrella('Tercera', 1.2, 200, 100),
      estrella('Primera', -0.5, 200, 140),
      estrella('Segunda', 0.4, 200, 180),
    ];
    const dibujables = seleccionarDibujables(estrellas);

    const desdeElMotor = colocarEtiquetas(dibujables, CIRCULO, medir);
    const desdeElCatalogo = colocarEtiquetas(estrellas, CIRCULO, medir);

    expect(desdeElMotor.map((etiqueta) => etiqueta.texto)).toEqual([
      'Primera',
      'Segunda',
      'Tercera',
    ]);
    expect(desdeElCatalogo).toEqual(desdeElMotor);
  });

  it('prueba el otro lado antes de renunciar a una etiqueta', () => {
    // Dos estrellas en el mismo punto: la segunda no cabe a la derecha, donde
    // esta la primera, pero si a la izquierda.
    const etiquetas = colocarEtiquetas(
      [estrella('Segunda', 1.2, 200, 200), estrella('Primera', -0.9, 200, 200)],
      CIRCULO,
      medir,
    );

    expect(etiquetas.map((etiqueta) => etiqueta.texto)).toEqual(['Primera', 'Segunda']);
    expect(etiquetas[0]!.ancla.x).toBeGreaterThan(200);
    expect(etiquetas[1]!.ancla.x).toBeLessThan(200);
    expect(solapan(etiquetas[0]!.caja, etiquetas[1]!.caja)).toBe(false);
  });

  it('descarta la de mayor magnitud cuando ya no queda lado libre', () => {
    // Tres estrellas en el mismo punto: la mas brillante toma la derecha, la
    // siguiente la izquierda y la tercera, la mas debil, se queda sin sitio.
    const etiquetas = colocarEtiquetas(
      [
        estrella('Cede', 1.2, 200, 200),
        estrella('Manda', -0.9, 200, 200),
        estrella('Aguanta', 0.3, 200, 200),
      ],
      CIRCULO,
      medir,
    );

    expect(etiquetas.map((etiqueta) => etiqueta.texto)).toEqual(['Manda', 'Aguanta']);
  });

  it('no deja ninguna pareja de cajas superpuesta', () => {
    // Rejilla apretada de estrellas brillantes: muchas caeran, las colocadas no
    // pueden solaparse entre si.
    const estrellas: EstrellaCalculada[] = [];
    for (let fila = 0; fila < 8; fila += 1) {
      for (let columna = 0; columna < 8; columna += 1) {
        estrellas.push(
          estrella(
            `E${String(fila)}-${String(columna)}`,
            -1 + (fila * 8 + columna) * 0.03,
            140 + columna * 14,
            140 + fila * 12,
          ),
        );
      }
    }

    const etiquetas = colocarEtiquetas(estrellas, CIRCULO, medir);

    expect(etiquetas.length).toBeGreaterThan(1);
    for (let i = 0; i < etiquetas.length; i += 1) {
      for (let j = i + 1; j < etiquetas.length; j += 1) {
        expect(solapan(etiquetas[i]!.caja, etiquetas[j]!.caja)).toBe(false);
      }
    }
  });

  it('no pasa de 30 etiquetas simultaneas', () => {
    const estrellas: EstrellaCalculada[] = [];
    // 60 estrellas brillantes bien separadas: sin el tope entrarian todas.
    for (let i = 0; i < 60; i += 1) {
      estrellas.push(estrella(`E${String(i)}`, -1 + i * 0.04, 120 + (i % 6) * 46, 60 + i * 4.5));
    }

    const etiquetas = colocarEtiquetas(estrellas, CIRCULO, medir);

    expect(etiquetas).toHaveLength(MAX_ETIQUETAS);
  });

  it('separa la etiqueta del disco de su estrella y la centra en vertical', () => {
    const brillante = estrella('Sirio', -1.4, 150, 200);
    const etiquetas = colocarEtiquetas([brillante], CIRCULO, medir);
    const etiqueta = etiquetas[0];

    expect(etiqueta).toBeDefined();
    // A la izquierda del centro del circulo, la primera posicion probada es la
    // derecha, que es la que mira al centro.
    expect(etiqueta?.ancla.x).toBeCloseTo(150 + brillante.radio + SEPARACION_ETIQUETA, 10);
    expect(etiqueta?.ancla.y).toBe(200);
    expect(etiqueta?.caja.ancho).toBeCloseTo(medir('Sirio') + 2 * RELLENO_ETIQUETA, 10);
    expect(etiqueta?.caja.alto).toBeCloseTo(ALTO_ETIQUETA + 2 * RELLENO_ETIQUETA, 10);
    // La caja no cubre el centro de la estrella.
    expect(etiqueta?.caja.x).toBeGreaterThan(150);
  });

  it('coloca hacia el centro del circulo cuando la estrella esta a la derecha', () => {
    const etiquetas = colocarEtiquetas([estrella('Vega', -0.1, 340, 200)], CIRCULO, medir);
    const etiqueta = etiquetas[0];

    expect(etiqueta).toBeDefined();
    expect(etiqueta?.ancla.x).toBeLessThan(340);
    expect(dentroDelCirculo(etiqueta!.caja, CIRCULO)).toBe(true);
  });

  it('descarta un texto que no mide nada util', () => {
    const etiquetas = colocarEtiquetas([estrella('Sin ancho', 0, 200, 200)], CIRCULO, () => 0);

    expect(etiquetas).toEqual([]);
  });

  it('usa una fuente de al menos 11 px', () => {
    expect(TAMANO_FUENTE_ETIQUETA).toBeGreaterThanOrEqual(TAMANO_FUENTE_MINIMO);
  });
});

describe('solapan', () => {
  it('no cuenta el contacto por el borde como solape', () => {
    const a = { x: 0, y: 0, ancho: 10, alto: 10 };
    expect(solapan(a, { x: 10, y: 0, ancho: 10, alto: 10 })).toBe(false);
    expect(solapan(a, { x: 9.9, y: 0, ancho: 10, alto: 10 })).toBe(true);
    expect(solapan(a, { x: 0, y: 10, ancho: 10, alto: 10 })).toBe(false);
  });
});

describe('dentroDelCirculo', () => {
  it('acepta la caja contenida y rechaza la que asoma', () => {
    expect(dentroDelCirculo({ x: 190, y: 190, ancho: 20, alto: 20 }, CIRCULO)).toBe(true);
    expect(dentroDelCirculo({ x: 370, y: 190, ancho: 20, alto: 20 }, CIRCULO)).toBe(false);
  });
});
