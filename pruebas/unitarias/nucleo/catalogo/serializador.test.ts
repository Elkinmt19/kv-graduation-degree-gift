import { describe, expect, it } from 'vitest';
import { serializarCatalogo } from '../../../../src/nucleo/catalogo/serializador.js';
import type { CatalogoEstelar } from '../../../../src/nucleo/catalogo/modelo.js';

const catalogoBase: CatalogoEstelar = {
  version: 1,
  epoca: 'J2000.0',
  atribucion: 'HYG v3 (CC BY-SA 2.5)',
  estrellas: [
    { nombre: 'Sirio', ar: 6.75, dec: -16.716116, magnitud: -1.44, constelacion: 'Can Mayor' },
    { nombre: 'Canopus', ar: 6.399195, dec: -52.695661, magnitud: -0.62, constelacion: 'Carina' },
  ],
  segmentos: [{ desde: 'Sirio', hasta: 'Canopus' }],
};

describe('serializarCatalogo (Requisito 2.5)', () => {
  it('produce un documento JSON valido con la forma del Catalogo_Estelar', () => {
    const texto = serializarCatalogo(catalogoBase);
    const documento = JSON.parse(texto) as Record<string, unknown>;

    expect(documento['version']).toBe(1);
    expect(documento['epoca']).toBe('J2000.0');
    expect(documento['atribucion']).toBe('HYG v3 (CC BY-SA 2.5)');
    expect(Object.keys(documento)).toEqual([
      'version',
      'epoca',
      'atribucion',
      'estrellas',
      'segmentos',
    ]);
  });

  it('conserva los cinco campos de cada Estrella y su orden', () => {
    const documento = JSON.parse(serializarCatalogo(catalogoBase)) as {
      estrellas: readonly Record<string, unknown>[];
    };

    expect(documento.estrellas).toHaveLength(2);
    for (const estrella of documento.estrellas) {
      expect(Object.keys(estrella)).toEqual(['nombre', 'ar', 'dec', 'magnitud', 'constelacion']);
    }
    expect(documento.estrellas[0]).toEqual({
      nombre: 'Sirio',
      ar: 6.75,
      dec: -16.716116,
      magnitud: -1.44,
      constelacion: 'Can Mayor',
    });
    expect(documento.estrellas[1]?.['nombre']).toBe('Canopus');
  });

  it('expresa ar, dec y magnitud con exactamente seis decimales', () => {
    const texto = serializarCatalogo(catalogoBase);

    expect(texto).toContain('"ar": 6.750000');
    expect(texto).toContain('"dec": -16.716116');
    expect(texto).toContain('"magnitud": -1.440000');

    const numericos = [...texto.matchAll(/"(?:ar|dec|magnitud)": (-?\d+(?:\.\d+)?)/g)];
    expect(numericos).toHaveLength(6);
    for (const [, literal] of numericos) {
      expect(literal).toMatch(/^-?\d+\.\d{6}$/);
    }
  });

  it('conserva los dos nombres de cada Segmento', () => {
    const documento = JSON.parse(serializarCatalogo(catalogoBase)) as {
      segmentos: readonly Record<string, unknown>[];
    };

    expect(documento.segmentos).toEqual([{ desde: 'Sirio', hasta: 'Canopus' }]);
  });

  it('emite un arreglo vacio cuando no hay segmentos', () => {
    const texto = serializarCatalogo({ ...catalogoBase, segmentos: [] });

    expect(texto).toContain('"segmentos": []');
    expect((JSON.parse(texto) as { segmentos: unknown[] }).segmentos).toEqual([]);
  });

  it('escapa comillas, barras invertidas, saltos de linea y no ASCII en las cadenas', () => {
    const texto = serializarCatalogo({
      ...catalogoBase,
      atribucion: 'linea1\nlinea2\ttab',
      estrellas: [
        {
          nombre: 'a"b\\c',
          ar: 0,
          dec: 0,
          magnitud: 0,
          constelacion: 'Ophiuchus \u2014 Ofiuco',
        },
      ],
      segmentos: [],
    });
    const documento = JSON.parse(texto) as {
      atribucion: string;
      estrellas: readonly { nombre: string; constelacion: string }[];
    };

    expect(documento.atribucion).toBe('linea1\nlinea2\ttab');
    expect(documento.estrellas[0]?.nombre).toBe('a"b\\c');
    expect(documento.estrellas[0]?.constelacion).toBe('Ophiuchus \u2014 Ofiuco');
  });

  it('nunca emite notacion exponencial en los numericos', () => {
    const texto = serializarCatalogo({
      ...catalogoBase,
      estrellas: [
        { nombre: 'diminuta', ar: 1e-9, dec: -1e-9, magnitud: 0.0000004, constelacion: 'X' },
      ],
      segmentos: [],
    });

    expect(texto).not.toMatch(/[eE][+-]?\d/);
    expect(texto).toContain('"ar": 0.000000');
    expect(texto).toContain('"magnitud": 0.000000');
  });

  it('es determinista: la misma entrada produce el mismo texto', () => {
    expect(serializarCatalogo(catalogoBase)).toBe(serializarCatalogo(catalogoBase));
  });
});
