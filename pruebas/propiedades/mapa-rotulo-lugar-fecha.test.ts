import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { LugarGraduacion } from '../../src/nucleo/astronomia/modelo.js';
import { DESPLAZAMIENTO_COLOMBIA, rotuloLugarFecha } from '../../src/vista/mapa/rotulo.js';
import { genInstante, genLatitud, genLongitud, genTextoEstelar } from '../generadores.js';

/**
 * Propiedad 21: El rotulo de lugar y fecha contiene siempre sus componentes.
 *
 * *Para todo* Instante_Graduacion valido con desplazamiento -05:00 y *para
 * todo* Lugar_Graduacion, el rotulo del Mapa_Estelar contiene el nombre del
 * lugar, el dia, el mes y el ano de la fecha, la hora y los minutos en
 * formato de 24 horas, y el sufijo del desplazamiento -05:00.
 *
 * **Validates: Requirements 4.6**
 *
 * `genInstante` (en `pruebas/generadores.ts`) solo produce Instantes con
 * desplazamiento `-05:00`, que es exactamente el dominio de esta propiedad.
 */

const genLugar: fc.Arbitrary<LugarGraduacion> = fc.record({
  nombre: genTextoEstelar,
  latitud: genLatitud,
  longitud: genLongitud,
});

describe('Propiedad 21: el rotulo de lugar y fecha contiene siempre sus componentes', () => {
  it('para todo Instante_Graduacion con desplazamiento -05:00 y todo Lugar_Graduacion', () => {
    fc.assert(
      fc.property(genInstante, genLugar, (instante, lugar) => {
        const rotulo = rotuloLugarFecha(instante, lugar);

        expect(rotulo.desplazamiento).toBe(DESPLAZAMIENTO_COLOMBIA);
        expect(rotulo.texto).toContain(rotulo.lugar);
        expect(rotulo.texto).toContain(String(rotulo.partes.dia));
        expect(rotulo.texto).toContain(rotulo.fecha);
        expect(rotulo.fecha).toContain(String(rotulo.partes.anio));
        expect(rotulo.texto).toContain(rotulo.hora);
        expect(rotulo.hora).toMatch(/^\d{2}:\d{2}$/);
        expect(rotulo.texto).toContain(DESPLAZAMIENTO_COLOMBIA);

        // Sus componentes numericos reflejan exactamente los campos leidos del
        // Instante_Graduacion, no una reconstruccion aparte.
        expect(rotulo.partes.hora).toBeGreaterThanOrEqual(0);
        expect(rotulo.partes.hora).toBeLessThanOrEqual(23);
        expect(rotulo.partes.minuto).toBeGreaterThanOrEqual(0);
        expect(rotulo.partes.minuto).toBeLessThanOrEqual(59);
        expect(rotulo.hora).toBe(
          `${String(rotulo.partes.hora).padStart(2, '0')}:${String(rotulo.partes.minuto).padStart(2, '0')}`,
        );
      }),
      { numRuns: 600 },
    );
  });
});
