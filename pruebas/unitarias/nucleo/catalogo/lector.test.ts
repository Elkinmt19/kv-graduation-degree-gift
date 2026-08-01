import { afterEach, describe, expect, it, vi } from 'vitest';

import { leerCatalogo } from '../../../../src/nucleo/catalogo/lector';

/** Documento minimo valido, base de las mutaciones de cada caso. */
function documento(
  cambios: {
    estrellas?: unknown[];
    segmentos?: unknown[];
  } = {},
): string {
  return JSON.stringify({
    version: 1,
    epoca: 'J2000.0',
    atribucion: 'HYG Database v3 (CC BY-SA 2.5)',
    estrellas: cambios.estrellas ?? [
      { nombre: 'Sirio', ar: 6.752481, dec: -16.716116, magnitud: -1.44, constelacion: 'Can Mayor' },
      { nombre: 'Mirzam', ar: 6.378329, dec: -17.955918, magnitud: 1.98, constelacion: 'Can Mayor' },
    ],
    segmentos: cambios.segmentos ?? [{ desde: 'Sirio', hasta: 'Mirzam' }],
  });
}

describe('leerCatalogo: documento valido (Requisito 2.1)', () => {
  it('entrega las dos colecciones con todos los campos', () => {
    const resultado = leerCatalogo(documento());

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.catalogo.version).toBe(1);
    expect(resultado.catalogo.epoca).toBe('J2000.0');
    expect(resultado.catalogo.atribucion).toContain('HYG');
    expect(resultado.catalogo.estrellas).toHaveLength(2);
    expect(resultado.catalogo.estrellas[0]).toEqual({
      nombre: 'Sirio',
      ar: 6.752481,
      dec: -16.716116,
      magnitud: -1.44,
      constelacion: 'Can Mayor',
    });
    expect(resultado.catalogo.segmentos).toEqual([{ desde: 'Sirio', hasta: 'Mirzam' }]);
  });

  it('admite un catalogo sin segmentos', () => {
    const resultado = leerCatalogo(documento({ segmentos: [] }));

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.catalogo.segmentos).toHaveLength(0);
  });

  it('acepta los extremos de los intervalos de ar, dec y magnitud', () => {
    const resultado = leerCatalogo(
      documento({
        estrellas: [
          { nombre: 'Limite bajo', ar: 0, dec: -90, magnitud: -1.5, constelacion: 'Prueba' },
          { nombre: 'Limite alto', ar: 23.999999, dec: 90, magnitud: 6, constelacion: 'Prueba' },
        ],
        segmentos: [],
      }),
    );

    expect(resultado.ok).toBe(true);
  });
});

describe('leerCatalogo: sintaxis invalida (Requisito 2.2)', () => {
  it('devuelve la posicion del caracter donde falla y ninguna coleccion', () => {
    const texto = '{"version": 1, "epoca": }';
    const resultado = leerCatalogo(texto);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;

    expect(resultado.error.clase).toBe('sintaxis-invalida');
    if (resultado.error.clase !== 'sintaxis-invalida') return;
    expect(resultado.error.posicion).toBeGreaterThanOrEqual(0);
    expect(resultado.error.posicion).toBeLessThanOrEqual(texto.length);
    expect(texto[resultado.error.posicion]).toBe('}');
    expect(resultado).not.toHaveProperty('catalogo');
  });

  it('acota la posicion cuando el documento se corta a mitad', () => {
    const texto = documento().slice(0, 30);
    const resultado = leerCatalogo(texto);

    expect(resultado.ok).toBe(false);
    if (resultado.ok || resultado.error.clase !== 'sintaxis-invalida') return;
    expect(resultado.error.posicion).toBeLessThanOrEqual(texto.length);
  });

  it('rechaza el texto vacio en la posicion 0', () => {
    const resultado = leerCatalogo('');

    expect(resultado.ok).toBe(false);
    if (resultado.ok || resultado.error.clase !== 'sintaxis-invalida') return;
    expect(resultado.error.posicion).toBe(0);
  });
});

describe('leerCatalogo: limites de cantidad (Requisito 2.1)', () => {
  it('rechaza un catalogo sin estrellas', () => {
    const resultado = leerCatalogo(documento({ estrellas: [], segmentos: [] }));

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'cantidad-invalida', campo: 'estrellas', recibido: 0 });
  });

  it('rechaza mas de 5000 estrellas', () => {
    const estrellas = Array.from({ length: 5001 }, (_, indice) => ({
      nombre: `Estrella ${indice}`,
      ar: 1,
      dec: 1,
      magnitud: 1,
      constelacion: 'Prueba',
    }));
    const resultado = leerCatalogo(documento({ estrellas, segmentos: [] }));

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({
      clase: 'cantidad-invalida',
      campo: 'estrellas',
      recibido: 5001,
    });
  });

  it('rechaza mas de 20000 segmentos', () => {
    const segmentos = Array.from({ length: 20001 }, () => ({ desde: 'Sirio', hasta: 'Mirzam' }));
    const resultado = leerCatalogo(documento({ segmentos }));

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({
      clase: 'cantidad-invalida',
      campo: 'segmentos',
      recibido: 20001,
    });
  });
});

describe('leerCatalogo: campos ausentes o vacios (Requisito 2.9)', () => {
  const camposEstrella = ['nombre', 'ar', 'dec', 'magnitud', 'constelacion'] as const;

  it.each(camposEstrella)('identifica la entrada y el campo ausente %s', (campo) => {
    const entrada: Record<string, unknown> = {
      nombre: 'Sirio',
      ar: 6.752481,
      dec: -16.716116,
      magnitud: -1.44,
      constelacion: 'Can Mayor',
    };
    delete entrada[campo];

    const resultado = leerCatalogo(documento({ estrellas: [entrada], segmentos: [] }));

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'campo-ausente', indice: 0, campo });
  });

  it('rechaza el nombre vacio', () => {
    const resultado = leerCatalogo(
      documento({
        estrellas: [{ nombre: '', ar: 1, dec: 1, magnitud: 1, constelacion: 'Prueba' }],
        segmentos: [],
      }),
    );

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'campo-ausente', indice: 0, campo: 'nombre' });
  });

  it('rechaza la constelacion vacia', () => {
    const resultado = leerCatalogo(
      documento({
        estrellas: [{ nombre: 'Sirio', ar: 1, dec: 1, magnitud: 1, constelacion: '' }],
        segmentos: [],
      }),
    );

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'campo-ausente', indice: 0, campo: 'constelacion' });
  });

  it('rechaza un nombre de mas de 64 caracteres', () => {
    const resultado = leerCatalogo(
      documento({
        estrellas: [{ nombre: 'a'.repeat(65), ar: 1, dec: 1, magnitud: 1, constelacion: 'Prueba' }],
        segmentos: [],
      }),
    );

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'campo-ausente', indice: 0, campo: 'nombre' });
  });

  it('senala la posicion de la segunda entrada cuando es la defectuosa', () => {
    const resultado = leerCatalogo(
      documento({
        estrellas: [
          { nombre: 'Sirio', ar: 1, dec: 1, magnitud: 1, constelacion: 'Can Mayor' },
          { nombre: 'Mirzam', ar: 1, dec: 1, constelacion: 'Can Mayor' },
        ],
        segmentos: [],
      }),
    );

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'campo-ausente', indice: 1, campo: 'magnitud' });
  });
});

describe('leerCatalogo: rangos fuera de intervalo (Requisito 2.3)', () => {
  const casos = [
    { campo: 'ar' as const, valor: 24 },
    { campo: 'ar' as const, valor: -0.1 },
    { campo: 'dec' as const, valor: 90.5 },
    { campo: 'dec' as const, valor: -90.5 },
    { campo: 'magnitud' as const, valor: -1.6 },
    { campo: 'magnitud' as const, valor: 6.1 },
  ];

  it.each(casos)('detiene la lectura en $campo = $valor', ({ campo, valor }) => {
    const entrada: Record<string, unknown> = {
      nombre: 'Sirio',
      ar: 6.75,
      dec: -16.7,
      magnitud: -1.44,
      constelacion: 'Can Mayor',
    };
    entrada[campo] = valor;

    const resultado = leerCatalogo(documento({ estrellas: [entrada], segmentos: [] }));

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({
      clase: 'fuera-de-rango',
      nombre: 'Sirio',
      campo,
      recibido: valor,
    });
    expect(resultado).not.toHaveProperty('catalogo');
  });
});

describe('leerCatalogo: nombres duplicados (Requisito 2.10)', () => {
  it('identifica el nombre repetido', () => {
    const resultado = leerCatalogo(
      documento({
        estrellas: [
          { nombre: 'Sirio', ar: 1, dec: 1, magnitud: 1, constelacion: 'Can Mayor' },
          { nombre: 'Sirio', ar: 2, dec: 2, magnitud: 2, constelacion: 'Can Mayor' },
        ],
        segmentos: [],
      }),
    );

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'nombre-duplicado', nombre: 'Sirio' });
  });
});

describe('leerCatalogo: segmentos inconsistentes (Requisito 2.4)', () => {
  it('rechaza un extremo ausente del catalogo indicando nombre y posicion', () => {
    const resultado = leerCatalogo(
      documento({
        segmentos: [
          { desde: 'Sirio', hasta: 'Mirzam' },
          { desde: 'Sirio', hasta: 'Adhara' },
        ],
      }),
    );

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({
      clase: 'segmento-invalido',
      posicion: 1,
      nombre: 'Adhara',
      motivo: 'ausente',
    });
  });

  it('rechaza un segmento con el mismo nombre en sus dos extremos', () => {
    const resultado = leerCatalogo(documento({ segmentos: [{ desde: 'Sirio', hasta: 'Sirio' }] }));

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({
      clase: 'segmento-invalido',
      posicion: 0,
      nombre: 'Sirio',
      motivo: 'repetido',
    });
  });

  it('rechaza un segmento sin el campo hasta', () => {
    const resultado = leerCatalogo(documento({ segmentos: [{ desde: 'Sirio' }] }));

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'campo-ausente', indice: 0, campo: 'hasta' });
  });
});

describe('leerCatalogo: forma de la raiz del documento', () => {
  it('rechaza una version distinta de 1', () => {
    const texto = documento().replace('"version":1', '"version":2');
    const resultado = leerCatalogo(texto);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'campo-ausente', indice: -1, campo: 'version' });
  });

  it('rechaza una epoca distinta de J2000.0', () => {
    const texto = documento().replace('"J2000.0"', '"B1950.0"');
    const resultado = leerCatalogo(texto);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'campo-ausente', indice: -1, campo: 'epoca' });
  });

  it('rechaza un documento que no es objeto', () => {
    const resultado = leerCatalogo('[]');

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'campo-ausente', indice: -1, campo: 'documento' });
  });
});

describe('leerCatalogo: posicion de sintaxis con mensajes de otros motores (Requisito 2.2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Simula un motor cuyo mensaje de error no declara la posicion. */
  function conMensaje(mensaje: string): void {
    vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new SyntaxError(mensaje);
    });
  }

  it('localiza el desajuste con el recorrido propio cuando el mensaje no trae posicion', () => {
    conMensaje('JSON Parse error: Unexpected token');

    const resultado = leerCatalogo('{"a": }');

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'sintaxis-invalida', posicion: 6 });
  });

  it('senala el sobrante posterior al valor con el recorrido propio', () => {
    conMensaje('JSON Parse error: Unexpected token');

    const resultado = leerCatalogo('{"a":1} x');

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'sintaxis-invalida', posicion: 8 });
  });

  it('convierte linea y columna del mensaje en un indice de caracter', () => {
    conMensaje('JSON.parse: unexpected character at line 2 column 3 of the JSON data');

    const resultado = leerCatalogo('{\n  }');

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toEqual({ clase: 'sintaxis-invalida', posicion: 4 });
  });
});
