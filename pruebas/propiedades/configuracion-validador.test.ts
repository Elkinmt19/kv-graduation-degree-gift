import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { ConfiguracionRegalo } from '../../src/nucleo/configuracion/modelo.js';
import type { LugarGraduacion } from '../../src/nucleo/astronomia/modelo.js';
import {
  DESPLAZAMIENTO_COLOMBIA,
  EJEMPLO_INSTANTE,
  INTERRUPTORES,
  MARCADOR_PENDIENTE,
  MAX_FIRMA,
  MAX_LONGITUD_PARRAFO,
  MAX_NOMBRE_LUGAR,
  MAX_PARRAFOS,
  MAX_SALUDO,
  MIN_PARRAFOS,
  PATRON_HASH_CLAVE,
  validarConfiguracion,
} from '../../herramientas/validar-configuracion.js';
import { genInstante, genLatitud, genLongitud, genMutacion } from '../generadores.js';
import type { DefectoConfiguracion, MutacionConfiguracion } from '../generadores.js';

/**
 * Propiedad 31: Toda configuracion valida se acepta y toda configuracion con un
 * defecto se rechaza senalandolo.
 *
 * **Validates: Requirements 8.1, 8.3, 8.4, 8.8, 8.9**
 *
 * La propiedad tiene dos mitades, y las dos hacen falta: un validador que
 * rechace todo cumpliria la segunda y uno que acepte todo cumpliria la primera.
 *
 * 1. *Para todo* Archivo_Configuracion cuyos campos cumplen sus formatos y
 *    rangos (Requisito 8.1), `validarConfiguracion` lo acepta sin problemas y
 *    devuelve los mismos valores, con los interruptores ausentes resueltos a
 *    `false`.
 * 2. *Para toda* mutacion con **exactamente un** defecto (`genMutacion`), el
 *    validador se detiene, no entrega configuracion alguna y su informe nombra
 *    el campo afectado. Segun la clase de defecto, el mensaje reporta ademas la
 *    cantidad de caracteres recibida en el Hash_Clave (Requisito 8.8), el valor
 *    recibido junto con el formato esperado del Instante_Graduacion
 *    (Requisito 8.4) o el valor fuera de intervalo de la latitud o la longitud
 *    (Requisito 8.9).
 *
 * Una tercera prueba cubre la agregacion del Requisito 8.3: varios defectos a la
 * vez se reportan **todos** en una sola pasada, no solo el primero.
 *
 * `pruebas/generadores.ts` no exporta una generadora de configuraciones
 * validas, asi que se arma aqui con las piezas que si exporta (`genInstante`,
 * que siempre lleva el desplazamiento -05:00, `genLatitud` y `genLongitud`) mas
 * texto y Hash_Clave generados en este modulo. Ningun texto generado contiene el
 * marcador `PENDIENTE`: el validador lo rechaza, y con razon, porque significa
 * que falta confirmar el valor definitivo con el autor del regalo.
 */

// --- Texto sin marcadores pendientes ----------------------------------------

/**
 * Piezas de texto de la Carta y del nombre del Lugar_Graduacion: ASCII,
 * digitos, acentos, comillas, espacios internos y emojis de dos unidades de
 * codigo. Las unicas mayusculas son 'K', 'V' y 'Ñ', de modo que ninguna
 * combinacion puede formar el marcador `PENDIENTE`.
 */
const PIEZAS_TEXTO = [
  'a',
  'z',
  'K',
  'V',
  '7',
  '0',
  ' ',
  'ñ',
  'Ñ',
  'á',
  'ó',
  'ú',
  '"',
  "'",
  '-',
  '·',
  '🐱',
  '🏍',
] as const;

/** Recorta a lo sumo a `maximo` unidades de codigo sin partir un par suplente. */
function recortarA(texto: string, maximo: number): string {
  if (texto.length <= maximo) {
    return texto;
  }
  let resultado = '';
  for (const punto of texto) {
    if (resultado.length + punto.length > maximo) {
      break;
    }
    resultado += punto;
  }
  return resultado;
}

/** Ajusta un texto a exactamente `longitud` unidades de codigo. */
function aLongitudExacta(texto: string, longitud: number): string {
  return recortarA(texto, longitud).padEnd(longitud, '·');
}

/**
 * Texto no vacio de a lo sumo `maximo` unidades de codigo, con sesgo hacia la
 * longitud minima (1) y hacia la longitud maxima exacta, que son las fronteras
 * que el Requisito 8.1 fija.
 */
function genTexto(maximo: number): fc.Arbitrary<string> {
  return fc.oneof(
    {
      weight: 4,
      arbitrary: fc
        .array(fc.constantFrom(...PIEZAS_TEXTO), { minLength: 1, maxLength: 24 })
        .map((piezas) => recortarA(piezas.join(''), maximo)),
    },
    { weight: 1, arbitrary: fc.constant('a') },
    { weight: 1, arbitrary: fc.constant(aLongitudExacta('KawaValen ñ 🐱 ', maximo)) },
  );
}

// --- Configuracion valida ----------------------------------------------------

/** Digitos hexadecimales minusculos del Hash_Clave (Requisito 8.8). */
const HEXADECIMALES = '0123456789abcdef'.split('');

/** Hash_Clave valido: hexadecimal minuscula de exactamente 64 caracteres. */
const genHashValido: fc.Arbitrary<string> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc
      .array(fc.constantFrom(...HEXADECIMALES), { minLength: 64, maxLength: 64 })
      .map((digitos) => digitos.join('')),
  },
  {
    weight: 1,
    arbitrary: fc.constantFrom('0'.repeat(64), 'f'.repeat(64), '0123456789abcdef'.repeat(4)),
  },
);

/** Lugar_Graduacion valido: latitud en [-90, 90] y longitud en [-180, 180]. */
const genLugarValido: fc.Arbitrary<LugarGraduacion> = fc.record({
  nombre: genTexto(MAX_NOMBRE_LUGAR),
  latitud: genLatitud,
  longitud: genLongitud,
});

/** Parrafos de la Carta: entre 1 y 12, cada uno de a lo sumo 1200 caracteres. */
const genParrafosValidos: fc.Arbitrary<string[]> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.array(genTexto(MAX_LONGITUD_PARRAFO), {
      minLength: MIN_PARRAFOS,
      maxLength: MAX_PARRAFOS,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.array(genTexto(MAX_LONGITUD_PARRAFO), {
      minLength: MIN_PARRAFOS,
      maxLength: MIN_PARRAFOS,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.array(genTexto(MAX_LONGITUD_PARRAFO), {
      minLength: MAX_PARRAFOS,
      maxLength: MAX_PARRAFOS,
    }),
  },
);

/** Carta valida: saludo, parrafos y firma dentro de sus limites. */
const genCartaValida = fc.record({
  saludo: genTexto(MAX_SALUDO),
  parrafos: genParrafosValidos,
  firma: genTexto(MAX_FIRMA),
});

/**
 * Archivo_Configuracion valido. Los interruptores aparecen presentes en ambos
 * valores y tambien ausentes, porque su ausencia es legitima: produce una
 * advertencia, no un problema (Requisito 8.10).
 */
const genConfiguracionValida: fc.Arbitrary<ConfiguracionRegalo> = fc
  .tuple(
    genHashValido,
    genInstante,
    genLugarValido,
    genCartaValida,
    fc.option(fc.boolean(), { nil: undefined }),
    fc.option(fc.boolean(), { nil: undefined }),
  )
  .map(([hashClave, instante, lugarGraduacion, carta, guinos, musica]): ConfiguracionRegalo => {
    const base = {
      hashClave,
      instanteGraduacion: instante.iso,
      lugarGraduacion,
      carta,
    };
    if (guinos === undefined && musica === undefined) {
      return base;
    }
    if (guinos === undefined) {
      return { ...base, musica: musica === true };
    }
    if (musica === undefined) {
      return { ...base, guinosPersonales: guinos };
    }
    return { ...base, guinosPersonales: guinos, musica };
  });

// --- Mitad 1: toda configuracion valida se acepta ----------------------------

describe('Propiedad 31: toda configuracion valida se acepta', () => {
  it('para toda configuracion cuyos campos cumplen sus formatos y rangos', () => {
    fc.assert(
      fc.property(genConfiguracionValida, (configuracion) => {
        const contexto = JSON.stringify({
          hashClave: configuracion.hashClave,
          instanteGraduacion: configuracion.instanteGraduacion,
          lugar: configuracion.lugarGraduacion,
        });

        // Ninguna configuracion generada conserva el marcador pendiente.
        expect(JSON.stringify(configuracion).includes(MARCADOR_PENDIENTE), contexto).toBe(false);
        expect(PATRON_HASH_CLAVE.test(configuracion.hashClave), contexto).toBe(true);

        const resultado = validarConfiguracion(configuracion);

        expect(resultado.problemas, contexto).toEqual([]);
        expect(resultado.valido, contexto).toBe(true);
        if (!resultado.valido) {
          return;
        }

        // Requisito 8.1: los valores llegan intactos al resto de la aplicacion.
        expect(resultado.configuracion.hashClave, contexto).toBe(configuracion.hashClave);
        expect(resultado.configuracion.instanteGraduacion, contexto).toBe(
          configuracion.instanteGraduacion,
        );
        expect(resultado.configuracion.lugarGraduacion, contexto).toEqual(
          configuracion.lugarGraduacion,
        );
        expect(resultado.configuracion.carta, contexto).toEqual(configuracion.carta);

        // Requisito 8.10: el interruptor ausente se asume desactivado y se
        // nombra en una advertencia, sin detener la construccion.
        expect(resultado.configuracion.guinosPersonales, contexto).toBe(
          configuracion.guinosPersonales ?? false,
        );
        expect(resultado.configuracion.musica, contexto).toBe(configuracion.musica ?? false);
        const ausentes = INTERRUPTORES.filter(
          (interruptor) => configuracion[interruptor] === undefined,
        );
        expect(
          resultado.advertencias.map((advertencia) => advertencia.campo).sort(),
          contexto,
        ).toEqual([...ausentes].sort());
      }),
      { numRuns: 300 },
    );
  });
});

// --- Mitad 2: toda configuracion con un defecto se rechaza senalandolo -------

/** Configuracion con exactamente un defecto, sobre una configuracion valida. */
const genConfiguracionInvalida: fc.Arbitrary<MutacionConfiguracion> = genConfiguracionValida.chain(
  (configuracion) => genMutacion(configuracion),
);

/** Clases de defecto que la propiedad debe ejercitar. */
const DEFECTOS_ESPERADOS: readonly DefectoConfiguracion[] = [
  'campo-ausente',
  'instante-formato',
  'instante-desplazamiento',
  'hash-invalido',
  'latitud-fuera-de-rango',
  'longitud-fuera-de-rango',
];

describe('Propiedad 31: toda configuracion con un defecto se rechaza senalandolo', () => {
  it('para toda mutacion con exactamente un defecto', () => {
    const defectosVistos = new Set<DefectoConfiguracion>();

    fc.assert(
      fc.property(genConfiguracionInvalida, (mutacion) => {
        defectosVistos.add(mutacion.defecto);
        const contexto = `${mutacion.defecto}: ${mutacion.descripcion}`;

        const resultado = validarConfiguracion(mutacion.configuracion);

        // 1. La construccion se detiene y no viaja configuracion alguna, ni
        //    completa ni parcial: en la rama de fallo no existe la propiedad.
        expect(resultado.valido, contexto).toBe(false);
        if (resultado.valido) {
          return;
        }
        expect(resultado, contexto).not.toHaveProperty('configuracion');

        // 2. El informe nombra el campo afectado. Omitir un campo compuesto
        //    como `lugarGraduacion` puede aflorar tambien en sus hijos, asi que
        //    se admite el propio campo o cualquiera de sus descendientes.
        const relevantes = resultado.problemas.filter(
          (problema) =>
            problema.campo === mutacion.campo ||
            problema.campo.startsWith(`${mutacion.campo}.`),
        );
        expect(
          relevantes.length,
          `${contexto} | campos reportados: ${resultado.problemas
            .map((problema) => problema.campo)
            .join(', ')}`,
        ).toBeGreaterThan(0);

        const mensajes = relevantes.map((problema) => problema.mensaje).join(' ');

        switch (mutacion.defecto) {
          case 'campo-ausente':
            // Requisito 8.3: el informe declara que el campo esta ausente.
            expect(mensajes, contexto).toContain('ausente');
            return;

          case 'hash-invalido': {
            // Requisito 8.8: se reporta la cantidad de caracteres recibida.
            const recibido = mutacion.recibido;
            if (typeof recibido !== 'string') {
              throw new Error(`hashClave mutado deberia ser texto: ${contexto}`);
            }
            expect(mensajes, contexto).toContain(
              `Se recibieron ${String(recibido.length)} caracteres`,
            );
            return;
          }

          case 'instante-formato':
          case 'instante-desplazamiento':
            // Requisito 8.4: se reporta el valor recibido junto con el formato
            // esperado, incluido el desplazamiento horario obligatorio.
            expect(mensajes, contexto).toContain(
              `Valor recibido: ${JSON.stringify(mutacion.recibido)}`,
            );
            expect(mensajes, contexto).toContain(DESPLAZAMIENTO_COLOMBIA);
            expect(mensajes, contexto).toContain(EJEMPLO_INSTANTE);
            return;

          case 'latitud-fuera-de-rango':
          case 'longitud-fuera-de-rango':
            // Requisito 8.9: se reporta el campo invalido con el valor recibido.
            expect(mensajes, contexto).toContain(`Valor recibido: ${String(mutacion.recibido)}`);
            return;
        }
      }),
      { numRuns: 400 },
    );

    // Los cinco requisitos se cubren a traves de las clases de mutacion: si
    // alguna no aparecio, la propiedad no ejercito su requisito.
    for (const defecto of DEFECTOS_ESPERADOS) {
      expect(defectosVistos.has(defecto), `no se genero ningun defecto ${defecto}`).toBe(true);
    }
  });
});

// --- Agregacion: todos los defectos en una sola pasada (Requisito 8.3) ------

/** Defecto sobre un campo distinto, aplicable junto con los demas. */
interface DefectoIndependiente {
  readonly campo: string;
  readonly descripcion: string;
  readonly aplicar: (configuracion: Record<string, unknown>) => void;
}

/** Devuelve el objeto anidado en `clave`, o `null` si no lo hay. */
function objetoEn(raiz: Record<string, unknown>, clave: string): Record<string, unknown> | null {
  const valor = raiz[clave];
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    return null;
  }
  return valor as Record<string, unknown>;
}

/**
 * Defectos sobre campos disjuntos: ninguno tapa a otro, de modo que el informe
 * debe nombrarlos todos.
 */
const DEFECTOS_INDEPENDIENTES: readonly DefectoIndependiente[] = [
  {
    campo: 'hashClave',
    descripcion: 'hashClave con mayusculas',
    aplicar: (configuracion) => {
      configuracion['hashClave'] = 'AB'.repeat(32);
    },
  },
  {
    campo: 'instanteGraduacion',
    descripcion: 'instanteGraduacion en prosa',
    aplicar: (configuracion) => {
      configuracion['instanteGraduacion'] = 'ayer por la tarde';
    },
  },
  {
    campo: 'lugarGraduacion.latitud',
    descripcion: 'latitud 91',
    aplicar: (configuracion) => {
      const lugar = objetoEn(configuracion, 'lugarGraduacion');
      if (lugar !== null) {
        lugar['latitud'] = 91;
      }
    },
  },
  {
    campo: 'lugarGraduacion.longitud',
    descripcion: 'longitud -181',
    aplicar: (configuracion) => {
      const lugar = objetoEn(configuracion, 'lugarGraduacion');
      if (lugar !== null) {
        lugar['longitud'] = -181;
      }
    },
  },
  {
    campo: 'carta.saludo',
    descripcion: 'saludo ausente',
    aplicar: (configuracion) => {
      const carta = objetoEn(configuracion, 'carta');
      if (carta !== null) {
        delete carta['saludo'];
      }
    },
  },
  {
    campo: 'carta.parrafos',
    descripcion: 'parrafos ausentes',
    aplicar: (configuracion) => {
      const carta = objetoEn(configuracion, 'carta');
      if (carta !== null) {
        delete carta['parrafos'];
      }
    },
  },
  {
    campo: 'carta.firma',
    descripcion: 'firma ausente',
    aplicar: (configuracion) => {
      const carta = objetoEn(configuracion, 'carta');
      if (carta !== null) {
        delete carta['firma'];
      }
    },
  },
];

describe('Propiedad 31: el informe agrupa todos los defectos en una sola pasada', () => {
  it('para toda configuracion con dos o mas defectos en campos distintos', () => {
    fc.assert(
      fc.property(
        genConfiguracionValida,
        fc.uniqueArray(fc.constantFrom(...DEFECTOS_INDEPENDIENTES), {
          minLength: 2,
          maxLength: DEFECTOS_INDEPENDIENTES.length,
        }),
        (configuracion, defectos) => {
          const mutada = JSON.parse(JSON.stringify(configuracion)) as Record<string, unknown>;
          for (const defecto of defectos) {
            defecto.aplicar(mutada);
          }
          const contexto = defectos.map((defecto) => defecto.descripcion).join(' + ');

          const resultado = validarConfiguracion(mutada);

          expect(resultado.valido, contexto).toBe(false);
          if (resultado.valido) {
            return;
          }

          // Requisito 8.3: una sola pasada nombra cada campo defectuoso, no
          // solo el primero que se encontro.
          const reportados = resultado.problemas.map((problema) => problema.campo);
          for (const defecto of defectos) {
            expect(
              reportados,
              `${contexto} | campos reportados: ${reportados.join(', ')}`,
            ).toContain(defecto.campo);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
