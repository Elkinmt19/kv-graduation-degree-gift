import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type {
  Cardinal,
  CieloCalculado,
  EstrellaCalculada,
  LugarGraduacion,
  SegmentoVisible,
} from '../../src/nucleo/astronomia/modelo.js';
import {
  ESTRELLAS_OBSIDIAN,
  MIN_ESTRELLAS_SOBRE_HORIZONTE,
  SEGMENTOS_OBSIDIAN,
  resolverObsidian,
} from '../../src/vista/guinos/obsidian.js';
import { genAltitud, genInstante, genLatitud, genLongitud, genTextoEstelar } from '../generadores.js';

/**
 * Propiedad 29: La constelacion Obsidian se dibuja exactamente cuando hay
 * estrellas suficientes.
 *
 * *Para todo* Instante_Graduacion valido y *para todo* Lugar_Graduacion
 * valido, con los Guinos_Personales activados el Mapa_Estelar dibuja la
 * constelacion Obsidian y su rotulo si y solo si al menos 5 de sus Estrellas
 * tienen altitud mayor o igual a 0 grados, y en ambos casos el resto del
 * cielo se conserva y no se presenta ningun mensaje de error.
 *
 * **Validates: Requirements 6.9**
 *
 * `resolverObsidian` es pura y solo lee `cielo.estrellas`: el Instante_Graduacion
 * y el Lugar_Graduacion no entran en su decision, asi que el "para todo" de la
 * propiedad se satisface con un Cielo_Calculado sintetico cuyas ocho Estrellas
 * de la figura llevan la altitud que decide fast-check, y cuyo resto del cielo
 * (`segmentosVisibles`, `constelacionesDibujadas`, `cardinales`) es un valor
 * fijo cuya identidad se comprueba conservada.
 */

const genLugar: fc.Arbitrary<LugarGraduacion> = fc.record({
  nombre: genTextoEstelar,
  latitud: genLatitud,
  longitud: genLongitud,
});

/** Estrella calculada sintetica de la figura Obsidian, con la altitud dada. */
function estrellaObsidian(nombre: string, altitud: number, indice: number): EstrellaCalculada {
  const visible = altitud >= 0;
  return {
    estrella: { nombre, ar: 16, dec: -25, magnitud: 2, constelacion: 'Escorpio' },
    horizontal: { altitud, azimut: 140 },
    visible,
    pantalla: visible ? { x: 200 + indice * 10, y: 150 + indice * 12 } : null,
    radio: 2,
  };
}

/** Resto del cielo: ajeno a la figura, para comprobar que se conserva. */
const RESTO_SEGMENTOS: readonly SegmentoVisible[] = [{ a: { x: 1, y: 2 }, b: { x: 3, y: 4 } }];
const RESTO_CONSTELACIONES: readonly string[] = ['Escorpio', 'Sagitario'];
const RESTO_CARDINALES: readonly Cardinal[] = [
  { rotulo: 'N', punto: { x: 200, y: 20 } },
  { rotulo: 'E', punto: { x: 380, y: 200 } },
  { rotulo: 'S', punto: { x: 200, y: 380 } },
  { rotulo: 'O', punto: { x: 20, y: 200 } },
];

function cieloSintetico(
  instante: CieloCalculado['instante'],
  lugar: LugarGraduacion,
  altitudes: readonly number[],
): CieloCalculado {
  return {
    instante,
    lugar,
    circulo: { cx: 200, cy: 200, radio: 180 },
    estrellas: ESTRELLAS_OBSIDIAN.map((nombre, indice) =>
      estrellaObsidian(nombre, altitudes[indice] ?? -30, indice),
    ),
    segmentosVisibles: RESTO_SEGMENTOS,
    constelacionesDibujadas: RESTO_CONSTELACIONES,
    cardinales: RESTO_CARDINALES,
  };
}

const genAltitudes: fc.Arbitrary<readonly number[]> = fc.array(genAltitud, {
  minLength: ESTRELLAS_OBSIDIAN.length,
  maxLength: ESTRELLAS_OBSIDIAN.length,
});

describe('Propiedad 29: la constelacion Obsidian se dibuja exactamente cuando hay estrellas suficientes', () => {
  it('para todo Instante_Graduacion y todo Lugar_Graduacion, con los guinos activados', () => {
    fc.assert(
      fc.property(genInstante, genLugar, genAltitudes, (instante, lugar, altitudes) => {
        const cielo = cieloSintetico(instante, lugar, altitudes);
        const sobreHorizonte = altitudes.filter((altitud) => altitud >= 0).length;

        const figura = resolverObsidian(cielo, { guinos: true });

        expect(figura.sobreHorizonte).toBe(sobreHorizonte);
        expect(figura.dibujable).toBe(sobreHorizonte >= MIN_ESTRELLAS_SOBRE_HORIZONTE);
        expect(figura.rotulo !== null).toBe(figura.dibujable);

        if (!figura.dibujable) {
          expect(figura.segmentos).toEqual([]);
        } else {
          // Con al menos 5 de las 8 estrellas de una cadena lineal de 7
          // segmentos, el mayor conjunto independiente posible es de 4, asi
          // que al menos un segmento tiene sus dos extremos sobre el
          // horizonte.
          expect(figura.segmentos.length).toBeGreaterThan(0);
          expect(figura.segmentos.length).toBeLessThanOrEqual(SEGMENTOS_OBSIDIAN.length);
        }

        // El resto del cielo se conserva intacto: la figura no lo toca, y no
        // se lanza ni registra ningun error en ningun caso.
        expect(cielo.segmentosVisibles).toBe(RESTO_SEGMENTOS);
        expect(cielo.constelacionesDibujadas).toBe(RESTO_CONSTELACIONES);
        expect(cielo.cardinales).toBe(RESTO_CARDINALES);
      }),
      { numRuns: 500 },
    );
  });

  it('con los guinos desactivados nunca dibuja, sin importar cuantas estrellas esten sobre el horizonte', () => {
    fc.assert(
      fc.property(genInstante, genLugar, genAltitudes, (instante, lugar, altitudes) => {
        const cielo = cieloSintetico(instante, lugar, altitudes);
        const figura = resolverObsidian(cielo, { guinos: false });

        expect(figura.dibujable).toBe(false);
        expect(figura.segmentos).toEqual([]);
        expect(figura.rotulo).toBeNull();
        expect(cielo.segmentosVisibles).toBe(RESTO_SEGMENTOS);
      }),
      { numRuns: 200 },
    );
  });
});
