/**
 * Validador de construccion del Archivo_Configuracion (`regalo.config.json`).
 *
 * Se ejecuta en el script `prebuild`, antes de `vite build`, de modo que un
 * archivo incompleto o invalido **detiene la construccion** y nunca se genera
 * un `dist/` inconsistente (Requisitos 8.3, 8.4, 8.5, 8.8, 8.9).
 *
 * Falla rapido y con voz alta: nadie mirara esta salida durante el regalo, asi
 * que el informe agrupa **todos** los campos ausentes o invalidos en una sola
 * pasada (Requisito 8.3) y termina con codigo distinto de cero. Los
 * interruptores de Guinos_Personales y de musica son la unica excepcion: su
 * ausencia produce una advertencia que los nombra, se asumen desactivados y la
 * construccion continua (Requisito 8.10).
 *
 * Uso:
 *   npx tsx herramientas/validar-configuracion.ts [ruta-del-archivo]
 *
 * La logica vive en `validarConfiguracion` y `validarDocumentoConfiguracion`,
 * exportadas para que las pruebas la ejerciten sin lanzar un proceso.
 *
 * Requisitos: 8.1, 8.3, 8.4, 8.5, 8.8, 8.9, 8.10.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { ConfiguracionRegalo } from '../src/nucleo/configuracion/modelo.js';

// --- Constantes del formato --------------------------------------------------

/** Hash_Clave: hexadecimal minuscula de exactamente 64 caracteres (Requisito 8.8). */
export const PATRON_HASH_CLAVE = /^[0-9a-f]{64}$/;

/** Longitud exacta del Hash_Clave. */
export const LONGITUD_HASH_CLAVE = 64;

/** Desplazamiento horario obligatorio del Instante_Graduacion (Requisito 8.4). */
export const DESPLAZAMIENTO_COLOMBIA = '-05:00';

/** Ejemplo del formato exigido al Instante_Graduacion, para los mensajes. */
export const EJEMPLO_INSTANTE = `2025-12-12T10:00:00${DESPLAZAMIENTO_COLOMBIA}`;

/** Saludo y firma de la Carta: 1..120 caracteres (Requisitos 5.5, 5.6, 8.1). */
export const MAX_SALUDO = 120;
export const MAX_FIRMA = 120;

/** Nombre del Lugar_Graduacion, rotulo del Mapa_Estelar (Requisito 4.6). */
export const MAX_NOMBRE_LUGAR = 120;

/** Parrafos de la Carta: 1..12 elementos de a lo sumo 1200 caracteres (Requisito 8.1). */
export const MIN_PARRAFOS = 1;
export const MAX_PARRAFOS = 12;
export const MAX_LONGITUD_PARRAFO = 1200;

/** Interruptores opcionales; ausentes => desactivados con advertencia (Requisito 8.10). */
export const INTERRUPTORES = ['guinosPersonales', 'musica'] as const;

/** Marcador de valor pendiente de confirmar con el autor del regalo. */
export const MARCADOR_PENDIENTE = 'PENDIENTE';

/** Clave de comentario del archivo, ignorada por el validador. */
const CLAVE_COMENTARIO = '$comentario';

/** Ruta del Archivo_Configuracion en la raiz del repositorio. */
export const RUTA_CONFIGURACION = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'regalo.config.json',
);

// --- Resultado --------------------------------------------------------------

/** Campo ausente o invalido, con su ruta con puntos (p. ej. `carta.saludo`). */
export interface ProblemaConfiguracion {
  readonly campo: string;
  readonly mensaje: string;
}

/** Aviso que no detiene la construccion (Requisito 8.10). */
export interface AdvertenciaConfiguracion {
  readonly campo: string;
  readonly mensaje: string;
}

/** Configuracion aceptada, con los interruptores ya resueltos a booleanos. */
export interface ConfiguracionNormalizada
  extends Omit<ConfiguracionRegalo, 'guinosPersonales' | 'musica'> {
  readonly guinosPersonales: boolean;
  readonly musica: boolean;
}

export interface ValidacionExitosa {
  readonly valido: true;
  readonly configuracion: ConfiguracionNormalizada;
  readonly problemas: readonly ProblemaConfiguracion[];
  readonly advertencias: readonly AdvertenciaConfiguracion[];
}

export interface ValidacionFallida {
  readonly valido: false;
  readonly problemas: readonly ProblemaConfiguracion[];
  readonly advertencias: readonly AdvertenciaConfiguracion[];
}

export type ResultadoValidacion = ValidacionExitosa | ValidacionFallida;

// --- Instante_Graduacion ----------------------------------------------------

/**
 * ISO 8601 con desplazamiento exactamente `-05:00`. Los segundos y los
 * milisegundos son opcionales; el desplazamiento no lo es y no admite otra
 * forma (ni `Z`, ni `-04:00`, ni `-5:00`).
 */
const PATRON_INSTANTE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?-05:00$/;

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

function diasDelMes(anio: number, mes: number): number {
  const dias = [31, esBisiesto(anio) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dias[mes - 1] ?? 0;
}

/**
 * Decide si un texto es un Instante_Graduacion aceptable: formato ISO 8601,
 * desplazamiento `-05:00` y fecha del calendario real (Requisitos 8.1, 8.4).
 */
export function esInstanteGraduacionValido(valor: string): boolean {
  const coincidencia = PATRON_INSTANTE.exec(valor);
  if (coincidencia === null) {
    return false;
  }
  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const dia = Number(coincidencia[3]);
  const hora = Number(coincidencia[4]);
  const minuto = Number(coincidencia[5]);
  const segundo = Number(coincidencia[6] ?? '0');

  if (mes < 1 || mes > 12) {
    return false;
  }
  if (dia < 1 || dia > diasDelMes(anio, mes)) {
    return false;
  }
  if (hora > 23 || minuto > 59 || segundo > 59) {
    return false;
  }
  return Number.isFinite(Date.parse(valor));
}

// --- Esquema Zod ------------------------------------------------------------

/**
 * Mensaje de un fallo de tipo: distingue el campo ausente (Requisito 8.3) del
 * campo presente con el tipo equivocado, y en ambos casos recuerda que se
 * espera de el.
 */
function tipo(expectativa: string) {
  return (incidencia: { readonly input?: unknown }): string =>
    incidencia.input === undefined ? `campo obligatorio ausente. ${expectativa}` : expectativa;
}

const EXPECTATIVA_HASH = `El Hash_Clave debe ser una cadena hexadecimal minuscula de exactamente ${String(
  LONGITUD_HASH_CLAVE,
)} caracteres (${String(PATRON_HASH_CLAVE)}). Generalo con: npm run hash-clave -- "<clave>".`;

const EXPECTATIVA_INSTANTE = `El Instante_Graduacion debe cumplir el formato ISO 8601 con desplazamiento horario exactamente ${DESPLAZAMIENTO_COLOMBIA} (p. ej. ${EJEMPLO_INSTANTE}) y corresponder a una fecha real.`;

const EXPECTATIVA_LATITUD = 'La latitud debe ser un numero en el intervalo [-90, 90] grados.';

const EXPECTATIVA_LONGITUD = 'La longitud debe ser un numero en el intervalo [-180, 180] grados.';

const EXPECTATIVA_NOMBRE_LUGAR = `El nombre del Lugar_Graduacion debe ser texto de 1 a ${String(
  MAX_NOMBRE_LUGAR,
)} caracteres.`;

const EXPECTATIVA_SALUDO = `El saludo debe ser texto de 1 a ${String(MAX_SALUDO)} caracteres.`;

const EXPECTATIVA_FIRMA = `La firma debe ser texto de 1 a ${String(MAX_FIRMA)} caracteres.`;

const EXPECTATIVA_PARRAFOS = `La Carta debe declarar entre ${String(MIN_PARRAFOS)} y ${String(
  MAX_PARRAFOS,
)} parrafos.`;

const EXPECTATIVA_PARRAFO = `Cada parrafo de la Carta debe ser texto de a lo sumo ${String(
  MAX_LONGITUD_PARRAFO,
)} caracteres.`;

const EXPECTATIVA_INTERRUPTOR =
  'El interruptor debe declararse como verdadero o falso; si se omite, se asume desactivado.';

const esquemaLugar = z.object({
  nombre: z
    .string({ error: tipo(EXPECTATIVA_NOMBRE_LUGAR) })
    .min(1, { error: EXPECTATIVA_NOMBRE_LUGAR })
    .max(MAX_NOMBRE_LUGAR, { error: EXPECTATIVA_NOMBRE_LUGAR }),
  latitud: z
    .number({ error: tipo(EXPECTATIVA_LATITUD) })
    .refine((valor) => Number.isFinite(valor), { error: EXPECTATIVA_LATITUD })
    .refine((valor) => valor >= -90 && valor <= 90, { error: EXPECTATIVA_LATITUD }),
  longitud: z
    .number({ error: tipo(EXPECTATIVA_LONGITUD) })
    .refine((valor) => Number.isFinite(valor), { error: EXPECTATIVA_LONGITUD })
    .refine((valor) => valor >= -180 && valor <= 180, { error: EXPECTATIVA_LONGITUD }),
});

const esquemaCarta = z.object({
  saludo: z
    .string({ error: tipo(EXPECTATIVA_SALUDO) })
    .min(1, { error: EXPECTATIVA_SALUDO })
    .max(MAX_SALUDO, { error: EXPECTATIVA_SALUDO }),
  parrafos: z
    .array(z.string({ error: tipo(EXPECTATIVA_PARRAFO) }).max(MAX_LONGITUD_PARRAFO, {
      error: EXPECTATIVA_PARRAFO,
    }), { error: tipo(EXPECTATIVA_PARRAFOS) })
    .min(MIN_PARRAFOS, { error: EXPECTATIVA_PARRAFOS })
    .max(MAX_PARRAFOS, { error: EXPECTATIVA_PARRAFOS }),
  firma: z
    .string({ error: tipo(EXPECTATIVA_FIRMA) })
    .min(1, { error: EXPECTATIVA_FIRMA })
    .max(MAX_FIRMA, { error: EXPECTATIVA_FIRMA }),
});

const esquemaConfiguracion = z.object({
  hashClave: z
    .string({ error: tipo(EXPECTATIVA_HASH) })
    .refine((valor) => PATRON_HASH_CLAVE.test(valor), { error: EXPECTATIVA_HASH }),
  instanteGraduacion: z
    .string({ error: tipo(EXPECTATIVA_INSTANTE) })
    .refine(esInstanteGraduacionValido, { error: EXPECTATIVA_INSTANTE }),
  lugarGraduacion: z.object(esquemaLugar.shape, {
    error: tipo('El Lugar_Graduacion debe ser un objeto con nombre, latitud y longitud.'),
  }),
  carta: z.object(esquemaCarta.shape, {
    error: tipo('La Carta debe ser un objeto con saludo, parrafos y firma.'),
  }),
  guinosPersonales: z.boolean({ error: EXPECTATIVA_INTERRUPTOR }).optional(),
  musica: z.boolean({ error: EXPECTATIVA_INTERRUPTOR }).optional(),
});

// --- Descripcion de los valores recibidos -----------------------------------

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/** Recorre una ruta de propiedades y devuelve el valor que hay al final. */
function valorEnRuta(raiz: unknown, ruta: readonly PropertyKey[]): unknown {
  let actual: unknown = raiz;
  for (const paso of ruta) {
    if (!esObjeto(actual)) {
      return undefined;
    }
    actual = (actual as Record<PropertyKey, unknown>)[paso];
  }
  return actual;
}

function rutaTexto(ruta: readonly PropertyKey[]): string {
  return ruta.map((paso) => String(paso)).join('.');
}

/** Representacion corta y legible de un valor recibido. */
function describirValor(valor: unknown): string {
  if (valor === undefined) {
    return 'ausente';
  }
  if (typeof valor === 'string') {
    const recortado = valor.length > 140 ? `${valor.slice(0, 140)}…` : valor;
    return JSON.stringify(recortado);
  }
  if (typeof valor === 'number' || typeof valor === 'boolean' || valor === null) {
    return String(valor);
  }
  if (Array.isArray(valor)) {
    return `arreglo de ${String(valor.length)} elementos`;
  }
  if (typeof valor === 'object') {
    return `objeto con las claves ${Object.keys(valor).join(', ')}`;
  }
  return typeof valor;
}

/**
 * Anade al mensaje el valor recibido. Para el Hash_Clave anade tambien la
 * cantidad de caracteres, que es lo que el Requisito 8.8 exige reportar.
 */
function conValorRecibido(campo: string, mensaje: string, recibido: unknown): string {
  if (recibido === undefined) {
    return mensaje;
  }
  if (campo === 'hashClave' && typeof recibido === 'string') {
    return `${mensaje} Se recibieron ${String(recibido.length)} caracteres: ${describirValor(
      recibido,
    )}.`;
  }
  return `${mensaje} Valor recibido: ${describirValor(recibido)}.`;
}

// --- Marcadores PENDIENTE ---------------------------------------------------

/**
 * Reune las rutas cuyo texto conserva el marcador `PENDIENTE`. El archivo se
 * publica con marcadores visibles en el Hash_Clave y en la Carta, y la
 * construccion no debe generar el paquete mientras sigan ahi.
 */
function rutasPendientes(valor: unknown, ruta: readonly PropertyKey[] = []): string[] {
  if (typeof valor === 'string') {
    return valor.includes(MARCADOR_PENDIENTE) ? [rutaTexto(ruta)] : [];
  }
  if (Array.isArray(valor)) {
    return valor.flatMap((elemento, indice) => rutasPendientes(elemento, [...ruta, indice]));
  }
  if (esObjeto(valor)) {
    return Object.entries(valor)
      .filter(([clave]) => !(ruta.length === 0 && clave === CLAVE_COMENTARIO))
      .flatMap(([clave, anidado]) => rutasPendientes(anidado, [...ruta, clave]));
  }
  return [];
}

// --- Validacion -------------------------------------------------------------

/**
 * Valida un Archivo_Configuracion ya analizado y devuelve **todos** sus
 * problemas en una sola pasada, junto con las advertencias de los interruptores
 * ausentes (Requisitos 8.1, 8.3, 8.4, 8.8, 8.9, 8.10).
 */
export function validarConfiguracion(entrada: unknown): ResultadoValidacion {
  if (!esObjeto(entrada) || Array.isArray(entrada)) {
    return {
      valido: false,
      problemas: [
        {
          campo: '(documento)',
          mensaje: `El Archivo_Configuracion debe ser un objeto JSON. Valor recibido: ${describirValor(
            entrada,
          )}.`,
        },
      ],
      advertencias: [],
    };
  }

  const analisis = esquemaConfiguracion.safeParse(entrada);

  const problemas: ProblemaConfiguracion[] = [];
  const camposConProblema = new Set<string>();
  if (!analisis.success) {
    for (const incidencia of analisis.error.issues) {
      const campo = rutaTexto(incidencia.path);
      if (camposConProblema.has(campo)) {
        // Un campo, un problema: el primer diagnostico ya nombra la expectativa.
        continue;
      }
      camposConProblema.add(campo);
      problemas.push({
        campo,
        mensaje: conValorRecibido(
          campo,
          incidencia.message,
          valorEnRuta(entrada, incidencia.path),
        ),
      });
    }
  }

  for (const campo of rutasPendientes(entrada)) {
    if (camposConProblema.has(campo)) {
      continue;
    }
    camposConProblema.add(campo);
    problemas.push({
      campo,
      mensaje: `Conserva el marcador ${MARCADOR_PENDIENTE}: falta confirmar su valor definitivo con el autor del regalo. Valor recibido: ${describirValor(
        valorEnRuta(entrada, campo.split('.')),
      )}.`,
    });
  }

  const advertencias: AdvertenciaConfiguracion[] = [];
  for (const interruptor of INTERRUPTORES) {
    if (entrada[interruptor] === undefined) {
      advertencias.push({
        campo: interruptor,
        mensaje: `Interruptor ausente: se asume desactivado (false). ${EXPECTATIVA_INTERRUPTOR}`,
      });
    }
  }

  if (problemas.length > 0 || !analisis.success) {
    return { valido: false, problemas, advertencias };
  }

  return {
    valido: true,
    configuracion: {
      hashClave: analisis.data.hashClave,
      instanteGraduacion: analisis.data.instanteGraduacion,
      lugarGraduacion: analisis.data.lugarGraduacion,
      carta: analisis.data.carta,
      guinosPersonales: analisis.data.guinosPersonales ?? false,
      musica: analisis.data.musica ?? false,
    },
    problemas,
    advertencias,
  };
}

/**
 * Analiza el texto del Archivo_Configuracion y lo valida. Una sintaxis JSON
 * invalida es un problema del documento completo, no de un campo.
 */
export function validarDocumentoConfiguracion(texto: string): ResultadoValidacion {
  let entrada: unknown;
  try {
    entrada = JSON.parse(texto);
  } catch (error: unknown) {
    const detalle = error instanceof Error ? error.message : String(error);
    return {
      valido: false,
      problemas: [{ campo: '(documento)', mensaje: `Sintaxis JSON invalida: ${detalle}` }],
      advertencias: [],
    };
  }
  return validarConfiguracion(entrada);
}

// --- Informe ----------------------------------------------------------------

/** Informe legible con todos los problemas y advertencias en una sola salida. */
export function formatearInforme(resultado: ResultadoValidacion, origen: string): string {
  const lineas: string[] = [];

  if (resultado.valido) {
    lineas.push(`Archivo_Configuracion valido: ${origen}`);
  } else {
    const cantidad = resultado.problemas.length;
    lineas.push(`Archivo_Configuracion invalido: ${origen}`);
    lineas.push('');
    lineas.push(
      `Se ${cantidad === 1 ? 'encontro 1 problema' : `encontraron ${String(cantidad)} problemas`}:`,
    );
    resultado.problemas.forEach((problema, indice) => {
      lineas.push(`  ${String(indice + 1)}. ${problema.campo}: ${problema.mensaje}`);
    });
  }

  if (resultado.advertencias.length > 0) {
    lineas.push('');
    lineas.push('Advertencias:');
    for (const advertencia of resultado.advertencias) {
      lineas.push(`  - ${advertencia.campo}: ${advertencia.mensaje}`);
    }
  }

  if (!resultado.valido) {
    lineas.push('');
    lineas.push(
      'La construccion se detuvo: no se genero el paquete de archivos estaticos. Corrige los campos anteriores y vuelve a ejecutarla.',
    );
  }

  return lineas.join('\n');
}

// --- Comando ----------------------------------------------------------------

/**
 * Lee, valida e informa. Devuelve el codigo de salida del proceso: 0 cuando la
 * construccion puede continuar y 1 cuando debe detenerse.
 */
export function ejecutar(ruta: string = RUTA_CONFIGURACION): number {
  let texto: string;
  try {
    texto = readFileSync(ruta, 'utf8');
  } catch (error: unknown) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error(`No se pudo leer el Archivo_Configuracion: ${detalle}`);
    return 1;
  }

  const resultado = validarDocumentoConfiguracion(texto);
  const informe = formatearInforme(resultado, ruta);
  if (resultado.valido) {
    console.log(informe);
    return 0;
  }
  console.error(informe);
  return 1;
}

const rutaDeEsteModulo = fileURLToPath(import.meta.url);
const rutaInvocada = process.argv[1] === undefined ? '' : resolve(process.argv[1]);
if (rutaInvocada === rutaDeEsteModulo) {
  const rutaPedida = process.argv[2];
  process.exit(ejecutar(rutaPedida === undefined ? RUTA_CONFIGURACION : resolve(rutaPedida)));
}
