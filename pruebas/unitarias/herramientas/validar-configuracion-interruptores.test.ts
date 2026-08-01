import { describe, expect, it } from 'vitest';

import {
  formatearInforme,
  INTERRUPTORES,
  validarConfiguracion,
  validarDocumentoConfiguracion,
} from '../../../herramientas/validar-configuracion.js';

/**
 * Pruebas unitarias de los interruptores ausentes del Archivo_Configuracion.
 *
 * El Requisito 8.10 pide un trato distinto al del resto de los campos: si se
 * omite el interruptor de Guinos_Personales o el de musica, la construccion
 * **continua**, el interruptor ausente se asume desactivado y se reporta una
 * advertencia que lo identifica por su nombre.
 *
 * Se cubren las cuatro combinaciones de ausencia (ambos presentes, solo
 * `guinosPersonales`, solo `musica`, ninguno). Se comprueba tambien el borde
 * contrario: un interruptor presente con un valor que no es booleano no es una
 * advertencia sino un problema que detiene la construccion, y el informe
 * legible imprime las advertencias, que es la unica via por la que el autor del
 * regalo llega a verlas.
 *
 * Las configuraciones se construyen en memoria: estas pruebas no leen ni
 * escriben `regalo.config.json`.
 */

/** Hash_Clave de prueba: 64 caracteres hexadecimales minusculos. */
const HASH_VALIDO = 'a'.repeat(64);

/**
 * Archivo_Configuracion valido sin los interruptores. Deliberadamente libre del
 * marcador `PENDIENTE`, que el validador trata como problema bloqueante y
 * volveria falsas las afirmaciones de exito por el motivo equivocado.
 */
function baseSinInterruptores(): Record<string, unknown> {
  return {
    hashClave: HASH_VALIDO,
    instanteGraduacion: '2025-12-12T10:00:00-05:00',
    lugarGraduacion: { nombre: 'Neiva, Huila, Colombia', latitud: 2.9273, longitud: -75.2819 },
    carta: {
      saludo: 'Para Valentina',
      parrafos: ['El cielo de tu grado, tal como estaba esa noche.'],
      firma: 'Con carino',
    },
  };
}

/** Base mas los interruptores que se quieran declarar. */
function configuracion(interruptores: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return { ...baseSinInterruptores(), ...interruptores };
}

/** Las cuatro combinaciones de ausencia de los dos interruptores. */
const COMBINACIONES = [
  {
    titulo: 'ambos interruptores presentes',
    declarados: { guinosPersonales: true, musica: true },
    esperados: { guinosPersonales: true, musica: true },
    ausentes: [] as readonly string[],
  },
  {
    titulo: 'solo guinosPersonales presente',
    declarados: { guinosPersonales: true },
    esperados: { guinosPersonales: true, musica: false },
    ausentes: ['musica'],
  },
  {
    titulo: 'solo musica presente',
    declarados: { musica: true },
    esperados: { guinosPersonales: false, musica: true },
    ausentes: ['guinosPersonales'],
  },
  {
    titulo: 'ningun interruptor presente',
    declarados: {},
    esperados: { guinosPersonales: false, musica: false },
    ausentes: ['guinosPersonales', 'musica'],
  },
] as const;

describe('validarConfiguracion: interruptores ausentes (Requisito 8.10)', () => {
  it.each(COMBINACIONES)(
    'con $titulo la validacion es exitosa y resuelve los interruptores a booleanos',
    ({ declarados, esperados, ausentes }) => {
      const resultado = validarConfiguracion(configuracion(declarados));

      // 1. La construccion continua: la ausencia no es un problema.
      expect(resultado.valido).toBe(true);
      expect(resultado.problemas).toEqual([]);
      if (!resultado.valido) {
        return;
      }

      // 2. El interruptor ausente queda resuelto a `false`, y a un booleano
      //    siempre: la Aplicacion nunca recibe `undefined`.
      expect(resultado.configuracion.guinosPersonales).toBe(esperados.guinosPersonales);
      expect(resultado.configuracion.musica).toBe(esperados.musica);
      expect(typeof resultado.configuracion.guinosPersonales).toBe('boolean');
      expect(typeof resultado.configuracion.musica).toBe('boolean');

      // 3. Una advertencia por interruptor ausente, ninguna de mas, y cada una
      //    identifica el interruptor que falta.
      expect(resultado.advertencias.map((advertencia) => advertencia.campo)).toEqual(ausentes);
      for (const advertencia of resultado.advertencias) {
        expect(advertencia.mensaje).not.toBe('');
      }
    },
  );

  it('el interruptor presente con valor falso no produce advertencia', () => {
    // `false` declarado y ausencia coinciden en el valor resuelto, pero solo la
    // ausencia se reporta: no hay nada que confirmarle al autor del regalo.
    const resultado = validarConfiguracion(
      configuracion({ guinosPersonales: false, musica: false }),
    );

    expect(resultado.valido).toBe(true);
    expect(resultado.advertencias).toEqual([]);
  });

  it('las advertencias solo nombran interruptores conocidos', () => {
    const resultado = validarConfiguracion(baseSinInterruptores());

    expect(resultado.advertencias).toHaveLength(INTERRUPTORES.length);
    for (const advertencia of resultado.advertencias) {
      expect(INTERRUPTORES).toContain(advertencia.campo);
    }
  });

  it('la ausencia de los dos interruptores tambien se acepta leyendo el documento', () => {
    const resultado = validarDocumentoConfiguracion(JSON.stringify(baseSinInterruptores()));

    expect(resultado.valido).toBe(true);
    expect(resultado.advertencias.map((advertencia) => advertencia.campo)).toEqual([
      'guinosPersonales',
      'musica',
    ]);
  });
});

describe('validarConfiguracion: interruptor declarado con un valor que no es booleano', () => {
  it.each([
    { titulo: 'cadena', valor: 'true' },
    { titulo: 'numero', valor: 1 },
    { titulo: 'nulo', valor: null },
  ])('$titulo en guinosPersonales es problema, no advertencia', ({ valor }) => {
    const resultado = validarConfiguracion(configuracion({ guinosPersonales: valor, musica: true }));

    // La ausencia se perdona; el valor equivocado detiene la construccion
    // (Requisito 8.3), y no se degrada a advertencia.
    expect(resultado.valido).toBe(false);
    expect(resultado.problemas.map((problema) => problema.campo)).toEqual(['guinosPersonales']);
    expect(resultado.advertencias).toEqual([]);
  });

  it('un interruptor invalido y el otro ausente producen un problema y una advertencia', () => {
    const resultado = validarConfiguracion(configuracion({ guinosPersonales: 'si' }));

    expect(resultado.valido).toBe(false);
    expect(resultado.problemas.map((problema) => problema.campo)).toEqual(['guinosPersonales']);
    expect(resultado.advertencias.map((advertencia) => advertencia.campo)).toEqual(['musica']);
  });
});

describe('formatearInforme: las advertencias llegan a la salida (Requisito 8.10)', () => {
  it('imprime la seccion de advertencias con el nombre de cada interruptor ausente', () => {
    const resultado = validarConfiguracion(baseSinInterruptores());
    const informe = formatearInforme(resultado, 'regalo.config.json (en memoria)');

    expect(informe).toContain('Archivo_Configuracion valido');
    expect(informe).toContain('Advertencias:');
    for (const interruptor of INTERRUPTORES) {
      expect(informe).toContain(`- ${interruptor}: `);
    }
    for (const advertencia of resultado.advertencias) {
      expect(informe).toContain(advertencia.mensaje);
    }
  });

  it('no imprime la seccion cuando los dos interruptores estan declarados', () => {
    const resultado = validarConfiguracion(configuracion({ guinosPersonales: true, musica: false }));

    expect(formatearInforme(resultado, 'origen')).not.toContain('Advertencias:');
  });

  it('imprime las advertencias tambien en un informe con problemas', () => {
    const resultado = validarConfiguracion({ ...baseSinInterruptores(), hashClave: 'corto' });
    const informe = formatearInforme(resultado, 'origen');

    expect(informe).toContain('Archivo_Configuracion invalido');
    expect(informe).toContain('Advertencias:');
    expect(informe).toContain('- guinosPersonales: ');
    expect(informe).toContain('- musica: ');
  });
});
