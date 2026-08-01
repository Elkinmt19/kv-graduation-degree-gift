import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { CirculoHorizonte, EstrellaCalculada, Punto } from '../../src/nucleo/astronomia/modelo.js';
import {
  ALTO_ETIQUETA,
  MAGNITUD_MAXIMA_ETIQUETA,
  MAX_ETIQUETAS,
  RELLENO_ETIQUETA,
  SEPARACION_ETIQUETA,
  colocarEtiquetas,
  solapan,
  type CajaEtiqueta,
} from '../../src/vista/mapa/etiquetas.js';
import { genEstrella } from '../generadores.js';

/**
 * Propiedad 19: Las etiquetas del mapa nunca se superponen y ceden por
 * magnitud.
 *
 * *Para todo* conjunto de Estrellas visibles con posicion y magnitud, las
 * etiquetas colocadas por el Mapa_Estelar corresponden a Estrellas con
 * magnitud aparente menor o igual a 1.5, no superan las 30, ninguna pareja de
 * sus cajas delimitadoras se interseca y, para todo par en conflicto, la
 * etiqueta descartada es la de mayor magnitud aparente.
 *
 * **Validates: Requirements 4.4**
 *
 * `colocarUna` (interno a `etiquetas.ts`) solo descarta una candidata cuando
 * sus dos posiciones posibles chocan con una etiqueta ya colocada, y solo hay
 * etiquetas ya colocadas de magnitud menor o igual (el recorrido es
 * ascendente). Por eso la cesion por magnitud se comprueba recalculando, con
 * las mismas constantes exportadas ({@link SEPARACION_ETIQUETA},
 * {@link RELLENO_ETIQUETA}, {@link ALTO_ETIQUETA}) y el mismo
 * {@link solapan}, las dos cajas de cada candidata descartada y verificando
 * que ambas chocan con alguna caja ya colocada en ese punto del recorrido —
 * sin reimplementar la preferencia por el lado que mira al centro del
 * Circulo_Horizonte, que solo decide *cual* posicion libre se usa, nunca si
 * una candidata se descarta.
 */

const genCoordenadaEtiqueta: fc.Arbitrary<number> = fc.double({
  min: -150,
  max: 150,
  noNaN: true,
  noDefaultInfinity: true,
});

const genPuntoEtiqueta: fc.Arbitrary<Punto> = fc.record({
  x: genCoordenadaEtiqueta,
  y: genCoordenadaEtiqueta,
});

const genRadioEstrella: fc.Arbitrary<number> = fc.double({
  min: 0.5,
  max: 3,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Circulo amplio: no restringe ninguna caja, solo se necesita como parametro. */
const CIRCULO_AMPLIO: CirculoHorizonte = { cx: 0, cy: 0, radio: 100_000 };

/** Medidor sintetico: geometria pura, sin lienzo (ver cabecera de `etiquetas.ts`). */
function medir(texto: string): number {
  return texto.length * 7;
}

interface EstrellaConIndice {
  readonly indice: number;
  readonly calculada: EstrellaCalculada;
}

const genConjunto: fc.Arbitrary<readonly EstrellaConIndice[]> = fc
  .array(fc.tuple(genEstrella, genPuntoEtiqueta, fc.boolean(), fc.boolean(), genRadioEstrella), {
    maxLength: 45,
  })
  .map((entradas) =>
    entradas.map(([estrella, pantalla, visible, tienePantalla, radio], indice) => ({
      indice,
      calculada: {
        estrella,
        horizontal: { altitud: 45, azimut: 0 },
        visible,
        pantalla: tienePantalla ? pantalla : null,
        radio,
      },
    })),
  );

/** Misma geometria que `posicionLateral` en `etiquetas.ts`, recalculada con las constantes exportadas. */
function cajaLateral(pantalla: Punto, ancho: number, separacion: number, lado: 'derecha' | 'izquierda'): CajaEtiqueta {
  const x = lado === 'derecha' ? pantalla.x + separacion : pantalla.x - separacion - ancho;

  return {
    x: x - RELLENO_ETIQUETA,
    y: pantalla.y - ALTO_ETIQUETA / 2 - RELLENO_ETIQUETA,
    ancho: ancho + 2 * RELLENO_ETIQUETA,
    alto: ALTO_ETIQUETA + 2 * RELLENO_ETIQUETA,
  };
}

describe('Propiedad 19: las etiquetas del mapa nunca se superponen y ceden por magnitud', () => {
  it('para todo conjunto de Estrellas visibles con posicion y magnitud', () => {
    fc.assert(
      fc.property(genConjunto, (conjunto) => {
        const estrellas = conjunto.map((e) => e.calculada);
        const colocadas = colocarEtiquetas(estrellas, CIRCULO_AMPLIO, medir);

        expect(colocadas.length).toBeLessThanOrEqual(MAX_ETIQUETAS);

        for (const etiqueta of colocadas) {
          expect(etiqueta.estrella.visible).toBe(true);
          expect(etiqueta.estrella.pantalla).not.toBeNull();
          expect(etiqueta.estrella.estrella.magnitud).toBeLessThanOrEqual(MAGNITUD_MAXIMA_ETIQUETA);
        }

        for (let i = 0; i < colocadas.length; i += 1) {
          for (let j = i + 1; j < colocadas.length; j += 1) {
            expect(solapan(colocadas[i]!.caja, colocadas[j]!.caja)).toBe(false);
          }
        }

        const elegibles = conjunto
          .filter(
            (e) =>
              e.calculada.visible &&
              e.calculada.pantalla !== null &&
              e.calculada.estrella.magnitud <= MAGNITUD_MAXIMA_ETIQUETA,
          )
          .slice()
          .sort((a, b) => {
            const porMagnitud = a.calculada.estrella.magnitud - b.calculada.estrella.magnitud;
            return porMagnitud !== 0 ? porMagnitud : a.indice - b.indice;
          });

        const previasBoxes: CajaEtiqueta[] = [];
        for (const candidata of elegibles) {
          if (previasBoxes.length >= MAX_ETIQUETAS) {
            // El tope se alcanzo antes de llegar aqui: el recorrido real se
            // detiene sin evaluar el resto de elegibles.
            break;
          }

          const colocada = colocadas.find((c) => c.estrella === candidata.calculada);
          if (colocada !== undefined) {
            previasBoxes.push(colocada.caja);
            continue;
          }

          const pantalla = candidata.calculada.pantalla as Punto;
          const ancho = medir(candidata.calculada.estrella.nombre);
          const separacion = candidata.calculada.radio + SEPARACION_ETIQUETA;
          const cajaDerecha = cajaLateral(pantalla, ancho, separacion, 'derecha');
          const cajaIzquierda = cajaLateral(pantalla, ancho, separacion, 'izquierda');

          const chocaDerecha = previasBoxes.some((caja) => solapan(cajaDerecha, caja));
          const chocaIzquierda = previasBoxes.some((caja) => solapan(cajaIzquierda, caja));
          expect(chocaDerecha && chocaIzquierda).toBe(true);
        }
      }),
      { numRuns: 500 },
    );
  });
});
