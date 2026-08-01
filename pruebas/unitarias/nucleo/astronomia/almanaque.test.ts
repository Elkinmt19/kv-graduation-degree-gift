import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { calcularCielo } from '../../../../src/nucleo/astronomia/motor.js';
import { leerCatalogo } from '../../../../src/nucleo/catalogo/lector.js';

/**
 * Requisito 3.8: el Motor_Astronomico se compara contra un conjunto fijo de
 * valores de referencia para las 20 Estrellas de menor magnitud aparente, en
 * el Instante_Graduacion y el Lugar_Graduacion reales. Los valores viven en
 * `pruebas/referencia/almanaque.json`, junto con su fuente y fecha de
 * consulta (ver el `$comentario` de ese archivo para la discusion sobre por
 * que la fuente es Skyfield/JPL DE421 y no la transcripcion de un almanaque
 * impreso). Son GEOMETRICOS, sin refraccion atmosferica, igual que la
 * altitud que produce el motor (Requisito 3.2).
 */
interface EstrellaReferencia {
  readonly nombre: string;
  readonly magnitud: number;
  readonly altitud: number;
  readonly azimut: number;
}

interface Almanaque {
  readonly instanteGraduacion: string;
  readonly lugarGraduacion: { readonly nombre: string; readonly latitud: number; readonly longitud: number };
  readonly toleranciaGrados: number;
  readonly estrellas: readonly EstrellaReferencia[];
}

/** Distancia angular entre dos azimutes en grados, con envoltura de 360. */
function distanciaAngular(a: number, b: number): number {
  const bruta = Math.abs(a - b) % 360;
  return Math.min(bruta, 360 - bruta);
}

function leerAlmanaque(): Almanaque {
  const documento = readFileSync(
    resolve(process.cwd(), 'pruebas/referencia/almanaque.json'),
    'utf8',
  );
  return JSON.parse(documento) as Almanaque;
}

function cieloEnElInstanteDelAlmanaque(almanaque: Almanaque) {
  const documento = readFileSync(
    resolve(process.cwd(), 'public/datos/catalogo-estelar.json'),
    'utf8',
  );
  const leido = leerCatalogo(documento);
  if (!leido.ok) {
    throw new Error(`el Catalogo_Estelar publicado no se pudo leer: ${JSON.stringify(leido.error)}`);
  }
  const resultado = calcularCielo(
    leido.catalogo,
    { iso: almanaque.instanteGraduacion, msUtc: Date.parse(almanaque.instanteGraduacion) },
    almanaque.lugarGraduacion,
    { cx: 200, cy: 200, radio: 180 },
  );
  if (!resultado.ok) {
    throw new Error(`el motor rechazo las entradas: ${JSON.stringify(resultado.error)}`);
  }
  return resultado.cielo;
}

describe('Motor_Astronomico frente al almanaque de referencia (Requisito 3.8)', () => {
  const almanaque = leerAlmanaque();

  it('declara las 20 Estrellas de menor magnitud aparente', () => {
    expect(almanaque.estrellas).toHaveLength(20);
  });

  it.each(leerAlmanaque().estrellas.map((referencia) => [referencia.nombre, referencia] as const))(
    'calcula %s dentro de %s grados de la referencia',
    (_nombre, referencia) => {
      const cielo = cieloEnElInstanteDelAlmanaque(almanaque);
      const entrada = cielo.estrellas.find((e) => e.estrella.nombre === referencia.nombre);
      expect(entrada).toBeDefined();

      expect(
        distanciaAngular(entrada!.horizontal.altitud, referencia.altitud),
      ).toBeLessThanOrEqual(almanaque.toleranciaGrados);
      expect(
        distanciaAngular(entrada!.horizontal.azimut, referencia.azimut),
      ).toBeLessThanOrEqual(almanaque.toleranciaGrados);
    },
  );
});
