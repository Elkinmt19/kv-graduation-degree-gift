import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  ANCHO_MIN_CARTA,
  ANCHO_MIN_MAPA,
  AREA_TACTIL_MIN,
  SEPARACION_TACTIL_MIN,
  UMBRAL_DOS_COLUMNAS,
  UMBRAL_TACTIL,
  calcularDisposicion,
} from '../../src/vista/disposicion.js';
import { genAnchoVentana } from '../generadores.js';

/**
 * Propiedad 26: La disposicion responsiva respeta los minimos y nunca desborda
 * horizontalmente.
 *
 * **Validates: Requirements 5.9, 7.1, 7.2, 7.3, 7.9**
 *
 * El generador `genAnchoVentana` vive en `pruebas/generadores.ts` y esta
 * sesgado hacia las fronteras 320, 768, 880, 1024 y 1920 y sus vecinos
 * inmediatos, que es donde la disposicion cambia de rama.
 *
 * Sobre el umbral. La aritmetica dice que los dos minimos (480 + 320 px, mas
 * 32 px de separacion) caben desde ~867 px, pero tanto `respuesta.css` como
 * `calcularDisposicion` colocan el umbral en 880 px para dejar ~13 px de margen
 * al ancho de una barra de desplazamiento, que cuenta dentro de
 * `window.innerWidth` pero no dentro del area de contenido. Entre 867 y 879 px
 * la disposicion es de una sola columna a proposito, asi que la rama de dos
 * columnas se comprueba contra la conjuncion de `cabenDosColumnas` y el umbral,
 * no contra un "si y solo si caben los minimos".
 */

/** Ancho a partir del cual el Requisito 7.2 exige dos columnas, en pixeles. */
const UMBRAL_ESCRITORIO = 1024;

describe('Propiedad 26: la disposicion responsiva respeta los minimos y nunca desborda horizontalmente', () => {
  it('para todo ancho de ventana entre 320 y 1920 pixeles', () => {
    fc.assert(
      fc.property(genAnchoVentana, (anchoVentana) => {
        const disposicion = calcularDisposicion(anchoVentana);

        // 1. Sin desplazamiento horizontal: el contenido cabe en la ventana y,
        //    en dos columnas, las pistas mas la separacion suman exactamente el
        //    ancho de contenido, de modo que no hay superposicion ni desborde
        //    (Requisito 7.1).
        expect(disposicion.anchoContenido).toBeLessThanOrEqual(anchoVentana);
        expect(disposicion.anchoMapa).toBeGreaterThan(0);
        expect(disposicion.anchoCarta).toBeGreaterThan(0);

        if (disposicion.columnas === 2) {
          expect(disposicion.anchoMapa + disposicion.separacion + disposicion.anchoCarta).toBe(
            disposicion.anchoContenido,
          );
          expect(disposicion.cartaDebajoDelMapa).toBe(false);
        } else {
          // En una sola columna cada bloque ocupa todo el ancho de contenido.
          expect(disposicion.anchoMapa).toBe(disposicion.anchoContenido);
          expect(disposicion.anchoCarta).toBe(disposicion.anchoContenido);
          expect(disposicion.cartaDebajoDelMapa).toBe(true);
        }

        // 2. La rama de dos columnas se decide por la conjuncion de que los
        //    minimos quepan y de que se alcance el umbral de la hoja de estilos.
        expect(disposicion.columnas === 2).toBe(
          disposicion.cabenDosColumnas && anchoVentana >= UMBRAL_DOS_COLUMNAS,
        );

        if (anchoVentana < UMBRAL_TACTIL) {
          // 3. Por debajo de 768 px: una sola columna con la carta debajo del
          //    mapa (Requisitos 5.9 y 7.9) y areas tactiles minimas
          //    (Requisito 7.11).
          expect(disposicion.columnas).toBe(1);
          expect(disposicion.cartaDebajoDelMapa).toBe(true);
          expect(disposicion.areaTactilMin).toBeGreaterThanOrEqual(AREA_TACTIL_MIN);
          expect(disposicion.separacionTactilMin).toBeGreaterThanOrEqual(SEPARACION_TACTIL_MIN);
        } else if (anchoVentana >= UMBRAL_ESCRITORIO) {
          // 4. Desde 1024 px: dos columnas con los minimos de cada pista
          //    (Requisito 7.2).
          expect(disposicion.columnas).toBe(2);
          expect(disposicion.anchoMapa).toBeGreaterThanOrEqual(ANCHO_MIN_MAPA);
          expect(disposicion.anchoCarta).toBeGreaterThanOrEqual(ANCHO_MIN_CARTA);
        } else {
          // 5. Entre 768 y 1023 px: o dos columnas conservando los 320 px del
          //    Lienzo_Carta (Requisito 7.3), o una sola columna con la carta
          //    debajo del mapa (Requisito 7.9).
          if (disposicion.columnas === 2) {
            expect(disposicion.anchoMapa).toBeGreaterThanOrEqual(ANCHO_MIN_MAPA);
            expect(disposicion.anchoCarta).toBeGreaterThanOrEqual(ANCHO_MIN_CARTA);
          } else {
            expect(disposicion.cartaDebajoDelMapa).toBe(true);
          }
        }
      }),
      { numRuns: 600 },
    );
  });
});
