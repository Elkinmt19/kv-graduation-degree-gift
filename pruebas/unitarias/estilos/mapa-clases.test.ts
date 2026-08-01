import { describe, expect, it } from 'vitest';

import { PALETA_REGALO } from '../../../src/nucleo/diseno/contraste.js';
import {
  CLASES_MAPA,
  PALETA_DE_RESPALDO,
  PROPIEDADES_PALETA,
  type PaletaMapa,
} from '../../../src/vista/mapa/capas.js';
import { CLASES_FICHA } from '../../../src/vista/mapa/interaccion.js';
import {
  interpretarCapaDeToken,
  inventariarLiteralesDeColor,
  leerHojaDeEstilo,
  leerTokens,
} from '../../utilidades/estilos.js';

/**
 * Contrato entre las capas del Mapa_Estelar y `mapa.css` (Tarea 11.3).
 *
 * Corre en Node porque lee la hoja del disco: jsdom no aplica las hojas del
 * proyecto ni resuelve sus propiedades personalizadas. La mitad de
 * comportamiento vive en `pruebas/unitarias/vista/mapa/capas.test.ts`.
 *
 * - El vocabulario de clases coincide en los dos sentidos, igual que en los
 *   contratos del Portal_Acceso y del Lienzo_Carta.
 * - Requisito 6.1: la hoja no declara ningun literal de color, y la paleta de
 *   respaldo del lienzo reproduce exactamente los roles de `tokens.css`, de modo
 *   que un cambio de opacidad en la hoja no deje al lienzo con el color viejo.
 */

const HOJA_MAPA = leerHojaDeEstilo('mapa.css');
const TOKENS = leerTokens();

function sinComentarios(contenido: string): string {
  return contenido.replace(/\/\*[\s\S]*?\*\//gu, ' ');
}

function esClaseDelMapa(clase: string): boolean {
  return clase === CLASES_MAPA.seccion || clase.startsWith(`${CLASES_MAPA.seccion}__`);
}

/** Clases `mapa…` a las que apunta la hoja, leidas de sus selectores reales. */
function clasesDeLaHoja(): Set<string> {
  const halladas = [...sinComentarios(HOJA_MAPA.contenido).matchAll(/\.([a-zA-Z][\w-]*)/gu)].map(
    (coincidencia) => coincidencia[1] ?? '',
  );
  return new Set(halladas.filter(esClaseDelMapa));
}

describe('mapa.css estila exactamente las clases que el Mapa_Estelar emite', () => {
  it('los selectores de la hoja son los del contrato CLASES_MAPA', () => {
    const enLaHoja = clasesDeLaHoja();
    const delContrato = new Set<string>([
      ...Object.values(CLASES_MAPA),
      ...Object.values(CLASES_FICHA),
    ]);

    expect(enLaHoja.size).toBeGreaterThan(0);

    // Sin esto, una clase renombrada en el DOM perderia su estilo en silencio.
    expect([...delContrato].filter((clase) => !enLaHoja.has(clase))).toEqual([]);
    // Y al reves: la hoja no puede conservar selectores huerfanos.
    expect([...enLaHoja].filter((clase) => !delContrato.has(clase))).toEqual([]);
  });

  it('no declara ningun literal de color (Requisito 6.1)', () => {
    const inventario = inventariarLiteralesDeColor([HOJA_MAPA]);
    const detalle = inventario
      .map((hallazgo) => `${hallazgo.archivo}:${String(hallazgo.linea)} ${hallazgo.literal}`)
      .join('\n');
    expect(inventario, detalle).toEqual([]);
  });
});

describe('Requisito 6.1: la paleta del lienzo sale de la Paleta_Regalo', () => {
  const roles = Object.keys(PROPIEDADES_PALETA) as (keyof PaletaMapa)[];

  it('cada rol de dibujo existe en tokens.css', () => {
    expect(roles.length).toBeGreaterThan(0);
    for (const rol of roles) {
      expect(TOKENS.get(PROPIEDADES_PALETA[rol]), PROPIEDADES_PALETA[rol]).toBeDefined();
    }
  });

  it('el respaldo reproduce la capa que declara cada token', () => {
    for (const rol of roles) {
      const propiedad = PROPIEDADES_PALETA[rol];
      const declarado = TOKENS.get(propiedad) ?? '';
      const capa = interpretarCapaDeToken(declarado);
      expect(capa, `${propiedad}: ${declarado}`).not.toBeNull();

      const color = PALETA_REGALO[capa!.nombre];
      const esperado = `rgb(${String(color.r)} ${String(color.g)} ${String(color.b)} / ${String(
        capa!.opacidad,
      )})`;
      expect(PALETA_DE_RESPALDO[rol], propiedad).toBe(esperado);
    }
  });
});
