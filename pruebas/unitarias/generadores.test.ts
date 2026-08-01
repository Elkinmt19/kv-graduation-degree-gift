import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { leerCatalogo, MAX_LONGITUD_TEXTO } from '../../src/nucleo/catalogo/lector.js';
import type { ConfiguracionRegalo } from '../../src/nucleo/configuracion/modelo.js';
import { ANCHO_VENTANA_MAX, ANCHO_VENTANA_MIN } from '../../src/vista/disposicion.js';
import {
  DESPLAZAMIENTO_COLOMBIA,
  genAltitud,
  genAnchoVentana,
  genAscensionRecta,
  genCatalogoValido,
  genClave,
  genDeclinacion,
  genEstrella,
  genInstante,
  genLatitud,
  genLongitud,
  genMagnitud,
  genMutacion,
  genTiempoSidereo,
} from '../generadores.js';

/**
 * Comprobacion de los propios generadores: cada uno debe producir unicamente
 * valores que cumplan los invariantes que documenta. Un generador que se sale
 * de su rango envenena todas las propiedades que lo usen, asi que se verifica
 * aqui una sola vez.
 */

const CONFIGURACION_VALIDA: ConfiguracionRegalo = {
  hashClave: 'a'.repeat(64),
  instanteGraduacion: '2025-12-12T10:00:00-05:00',
  lugarGraduacion: { nombre: 'Neiva, Huila, Colombia', latitud: 2.9273, longitud: -75.2819 },
  carta: {
    saludo: 'Kawa, felicidades',
    parrafos: ['Primer parrafo de la carta.'],
    firma: 'Con carino',
  },
  guinosPersonales: true,
  musica: false,
};

describe('generadores compartidos de fast-check', () => {
  it('genEstrella cumple los invariantes del modelo', () => {
    fc.assert(
      fc.property(genEstrella, (estrella) => {
        expect(estrella.nombre.length).toBeGreaterThan(0);
        expect(estrella.nombre.length).toBeLessThanOrEqual(MAX_LONGITUD_TEXTO);
        expect(estrella.constelacion.length).toBeGreaterThan(0);
        expect(estrella.constelacion.length).toBeLessThanOrEqual(MAX_LONGITUD_TEXTO);
        expect(estrella.ar).toBeGreaterThanOrEqual(0);
        expect(estrella.ar).toBeLessThan(24);
        expect(estrella.dec).toBeGreaterThanOrEqual(-90);
        expect(estrella.dec).toBeLessThanOrEqual(90);
        expect(estrella.magnitud).toBeGreaterThanOrEqual(-1.5);
        expect(estrella.magnitud).toBeLessThanOrEqual(6);
      }),
      { numRuns: 300 },
    );
  });

  it('los angulos se mantienen dentro de sus intervalos', () => {
    fc.assert(
      fc.property(
        genAscensionRecta,
        genDeclinacion,
        genLatitud,
        genLongitud,
        genTiempoSidereo,
        genAltitud,
        genMagnitud,
        (ar, dec, latitud, longitud, tsl, altitud, magnitud) => {
          expect(ar >= 0 && ar < 24).toBe(true);
          expect(dec >= -90 && dec <= 90).toBe(true);
          expect(latitud >= -90 && latitud <= 90).toBe(true);
          expect(longitud > -180 && longitud <= 180).toBe(true);
          expect(tsl >= 0 && tsl < 360).toBe(true);
          expect(altitud >= -90 && altitud <= 90).toBe(true);
          expect(magnitud >= -1.5 && magnitud <= 6).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('genAnchoVentana produce enteros dentro del rango de los requisitos', () => {
    fc.assert(
      fc.property(genAnchoVentana, (ancho) => {
        expect(Number.isInteger(ancho)).toBe(true);
        expect(ancho).toBeGreaterThanOrEqual(ANCHO_VENTANA_MIN);
        expect(ancho).toBeLessThanOrEqual(ANCHO_VENTANA_MAX);
      }),
      { numRuns: 200 },
    );
  });

  it('genInstante siempre declara el desplazamiento -05:00 y un msUtc coherente', () => {
    fc.assert(
      fc.property(genInstante, (instante) => {
        expect(instante.iso.endsWith(DESPLAZAMIENTO_COLOMBIA)).toBe(true);
        expect(Date.parse(instante.iso)).toBe(instante.msUtc);
        expect(Number.isFinite(instante.msUtc)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('genClave produce cadenas, incluidas la vacia y las de 64 caracteres', () => {
    fc.assert(
      fc.property(genClave, (clave) => {
        expect(typeof clave).toBe('string');
      }),
      { numRuns: 100 },
    );
  });

  it('genCatalogoValido produce catalogos que el Lector_Catalogo acepta', () => {
    fc.assert(
      fc.property(genCatalogoValido, (catalogo) => {
        expect(catalogo.estrellas.length).toBeGreaterThanOrEqual(1);
        expect(catalogo.estrellas.length).toBeLessThanOrEqual(300);

        const nombres = catalogo.estrellas.map((estrella) => estrella.nombre);
        expect(new Set(nombres).size).toBe(nombres.length);

        for (const segmento of catalogo.segmentos) {
          expect(nombres).toContain(segmento.desde);
          expect(nombres).toContain(segmento.hasta);
          expect(segmento.desde).not.toBe(segmento.hasta);
        }

        // Se compone el documento con `JSON.stringify`, que conserva los
        // valores exactos. El Serializador_Catalogo redondea a seis decimales
        // (Requisito 2.5) y por tanto una ascension recta a menos de 5e-7 de 24
        // se emitiria como `24.000000`, fuera del intervalo del Requisito 2.3.
        // Esa tension es asunto de las propiedades de ida y vuelta, no del
        // generador, cuyo contrato es producir catalogos validos segun el modelo.
        const resultado = leerCatalogo(JSON.stringify(catalogo));
        expect(resultado.ok).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('genMutacion sobre un catalogo introduce un defecto que el Lector_Catalogo rechaza', () => {
    fc.assert(
      fc.property(
        genCatalogoValido.chain((catalogo) => genMutacion(catalogo)),
        (mutacion) => {
          const resultado = leerCatalogo(mutacion.documento);
          expect(resultado.ok, mutacion.descripcion).toBe(false);
          if (resultado.ok) {
            return;
          }
          expect(resultado.error.clase, mutacion.descripcion).toBe(mutacion.esperado.clase);
          if (mutacion.defecto === 'sintaxis') {
            // La posicion declarada es donde se corrompio el texto; el
            // analizador puede detectarlo en ese punto o mas adelante.
            expect(resultado.error).toHaveProperty('posicion');
          } else {
            expect(resultado.error).toEqual(mutacion.esperado);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('genMutacion sobre la configuracion altera exactamente el campo declarado', () => {
    fc.assert(
      fc.property(genMutacion(CONFIGURACION_VALIDA), (mutacion) => {
        const original = JSON.parse(JSON.stringify(CONFIGURACION_VALIDA)) as Record<string, unknown>;
        const rutas = [
          'hashClave',
          'instanteGraduacion',
          'lugarGraduacion',
          'lugarGraduacion.nombre',
          'lugarGraduacion.latitud',
          'lugarGraduacion.longitud',
          'carta.saludo',
          'carta.parrafos',
          'carta.firma',
          'guinosPersonales',
          'musica',
        ];

        const diferentes = rutas.filter(
          (ruta) =>
            JSON.stringify(valorEn(original, ruta)) !==
            JSON.stringify(valorEn(mutacion.configuracion, ruta)),
        );

        // El campo declarado debe estar entre los que cambiaron; omitir
        // `lugarGraduacion` arrastra tambien a sus hijos, de ahi el subconjunto.
        expect(diferentes, mutacion.descripcion).toContain(mutacion.campo);
        for (const ruta of diferentes) {
          expect(ruta.startsWith(mutacion.campo) || mutacion.campo.startsWith(ruta)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});

/** Lee una ruta con puntos dentro de una estructura JSON. */
function valorEn(objeto: Record<string, unknown>, ruta: string): unknown {
  let actual: unknown = objeto;
  for (const parte of ruta.split('.')) {
    if (typeof actual !== 'object' || actual === null) {
      return undefined;
    }
    actual = (actual as Record<string, unknown>)[parte];
  }
  return actual;
}
