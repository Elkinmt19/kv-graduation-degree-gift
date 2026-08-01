/**
 * Lector_Catalogo: convierte un documento JSON del Catalogo_Estelar en objetos
 * `Estrella` y `Segmento` ya validados.
 *
 * `leerCatalogo` es puro: sin DOM, sin `fetch`, sin reloj y sin azar. Los
 * fallos se devuelven como datos (`ResultadoLectura`), nunca como excepciones,
 * de modo que el compilador obligue a cubrir cada rama.
 *
 * `obtenerCatalogo` es la unica funcion del modulo que toca el borde: recibe la
 * E/S y la medicion de tiempo como parametros (`Traer` y `Reloj`), de modo que
 * en pruebas se sustituyen por dobles deterministas. Aplica los limites de
 * tiempo de los Requisitos 2.8 y 4.13 y devuelve los fallos con la misma forma
 * de datos que la lectura pura.
 *
 * Orden de validacion en cascada (determina que error se reporta primero):
 *
 * 1. Sintaxis JSON, con la posicion del caracter donde falla (Requisito 2.2).
 * 2. Forma del documento y limites de cantidad: 1-5000 estrellas y a lo sumo
 *    20000 segmentos (Requisito 2.1).
 * 3. Por cada estrella, en orden: campos ausentes o cadenas vacias
 *    (Requisito 2.9), rangos de `ar`, `dec` y `magnitud` (Requisito 2.3) y
 *    longitud de `nombre` y `constelacion` de a lo sumo 64 caracteres
 *    (Requisito 2.1).
 * 4. Nombres de estrella duplicados (Requisito 2.10).
 * 5. Por cada segmento: extremos existentes y distintos entre si
 *    (Requisito 2.4).
 *
 * Ante cualquier fallo devuelve `ok: false` y **ninguna** coleccion parcial:
 * las colecciones se construyen en variables locales y solo se publican al
 * final (Requisitos 2.2 y 2.8).
 *
 * Requisitos: 2.1, 2.2, 2.3, 2.4, 2.9, 2.10.
 */

import type { Reloj, RespuestaRecurso, Traer } from '../../infra/recursos';
import type { ErrorCatalogo } from '../errores';
import type { CatalogoEstelar, Estrella, Segmento } from './modelo';

/**
 * Union discriminada con el desenlace de una lectura. En la rama de fallo no
 * viaja ninguna coleccion, ni completa ni parcial.
 */
export type ResultadoLectura =
  | { readonly ok: true; readonly catalogo: CatalogoEstelar }
  | { readonly ok: false; readonly error: ErrorCatalogo };

/** Cantidad minima de estrellas admitida por el Requisito 2.1. */
export const MIN_ESTRELLAS = 1;

/** Cantidad maxima de estrellas admitida por el Requisito 2.1. */
export const MAX_ESTRELLAS = 5000;

/** Cantidad maxima de segmentos admitida por el Requisito 2.1. */
export const MAX_SEGMENTOS = 20000;

/** Longitud maxima de `nombre` y `constelacion` (Requisito 2.1). */
export const MAX_LONGITUD_TEXTO = 64;

/**
 * Indice que acompania a los fallos de la raiz del documento, donde no existe
 * una entrada concreta a la que apuntar. Los indices de entrada son base 0, de
 * modo que -1 no colisiona con ninguno.
 */
export const INDICE_RAIZ = -1;

/** Limite de tiempo para obtener el documento, en milisegundos (Requisito 2.8). */
export const MS_LIMITE_OBTENCION = 3000;

/** Limite de tiempo para la lectura completa, en milisegundos (Requisito 4.13). */
export const MS_LIMITE_LECTURA = 5000;

/**
 * Analiza y valida un documento JSON del Catalogo_Estelar. Funcion pura.
 *
 * @param textoJson Documento completo, tal como se obtuvo del archivo.
 * @returns El `CatalogoEstelar` validado, o el primer `ErrorCatalogo` de la
 *   cascada. En caso de error no se entrega ninguna coleccion parcial.
 */
export function leerCatalogo(textoJson: string): ResultadoLectura {
  const analisis = analizarJson(textoJson);
  if (!analisis.ok) {
    return { ok: false, error: analisis.error };
  }

  const raiz = analisis.valor;
  if (!esObjeto(raiz)) {
    return falla({ clase: 'campo-ausente', indice: INDICE_RAIZ, campo: 'documento' });
  }

  if (raiz['version'] !== 1) {
    return falla({ clase: 'campo-ausente', indice: INDICE_RAIZ, campo: 'version' });
  }
  if (raiz['epoca'] !== 'J2000.0') {
    return falla({ clase: 'campo-ausente', indice: INDICE_RAIZ, campo: 'epoca' });
  }

  const atribucion = raiz['atribucion'];
  if (typeof atribucion !== 'string') {
    return falla({ clase: 'campo-ausente', indice: INDICE_RAIZ, campo: 'atribucion' });
  }

  const entradasEstrellas = raiz['estrellas'];
  if (!Array.isArray(entradasEstrellas)) {
    return falla({ clase: 'campo-ausente', indice: INDICE_RAIZ, campo: 'estrellas' });
  }
  const entradasSegmentos = raiz['segmentos'];
  if (!Array.isArray(entradasSegmentos)) {
    return falla({ clase: 'campo-ausente', indice: INDICE_RAIZ, campo: 'segmentos' });
  }

  if (entradasEstrellas.length < MIN_ESTRELLAS || entradasEstrellas.length > MAX_ESTRELLAS) {
    return falla({
      clase: 'cantidad-invalida',
      campo: 'estrellas',
      recibido: entradasEstrellas.length,
    });
  }
  if (entradasSegmentos.length > MAX_SEGMENTOS) {
    return falla({
      clase: 'cantidad-invalida',
      campo: 'segmentos',
      recibido: entradasSegmentos.length,
    });
  }

  const estrellas: Estrella[] = [];
  for (let indice = 0; indice < entradasEstrellas.length; indice += 1) {
    const leida = leerEstrella(entradasEstrellas[indice], indice);
    if (!leida.ok) {
      return falla(leida.error);
    }
    estrellas.push(leida.estrella);
  }

  const nombres = new Set<string>();
  for (const estrella of estrellas) {
    if (nombres.has(estrella.nombre)) {
      return falla({ clase: 'nombre-duplicado', nombre: estrella.nombre });
    }
    nombres.add(estrella.nombre);
  }

  const segmentos: Segmento[] = [];
  for (let posicion = 0; posicion < entradasSegmentos.length; posicion += 1) {
    const leido = leerSegmento(entradasSegmentos[posicion], posicion, nombres);
    if (!leido.ok) {
      return falla(leido.error);
    }
    segmentos.push(leido.segmento);
  }

  // Publicacion unica: hasta aqui nada salio del ambito local.
  return {
    ok: true,
    catalogo: { version: 1, epoca: 'J2000.0', atribucion, estrellas, segmentos },
  };
}

/**
 * Obtiene el documento del Catalogo_Estelar y lo lee, con dos cronometros
 * independientes:
 *
 * - La obtencion se cancela con un `AbortController` a los
 *   `MS_LIMITE_OBTENCION` milisegundos (Requisito 2.8). Cubre tanto la
 *   respuesta como la lectura de su cuerpo, que forman parte de la obtencion.
 * - La operacion completa, obtencion mas analisis, se abandona a los
 *   `MS_LIMITE_LECTURA` milisegundos contados desde el inicio (Requisito 4.13).
 *   Es independiente del anterior: se aplica incluso si la obtencion respondio
 *   dentro de su presupuesto.
 *
 * Cualquier fallo de red, un codigo de estado fuera del rango 200-299 o el
 * vencimiento de un limite devuelven `indisponible` con el `motivo` y los
 * milisegundos transcurridos, y **ninguna** coleccion parcial. Si el documento
 * llega completo, el desenlace es el de `leerCatalogo` sobre su texto, con lo
 * que los errores de contenido conservan su clase original.
 *
 * @param traer Obtencion de recursos del borde; en pruebas, un doble.
 * @param reloj Fuente de tiempo monotonico para medir lo transcurrido.
 * @param ruta Ruta relativa del documento, servida por el mismo hosting.
 */
export async function obtenerCatalogo(
  traer: Traer,
  reloj: Reloj,
  ruta: string,
): Promise<ResultadoLectura> {
  const inicio = reloj.ahora();
  const transcurridos = (): number => Math.max(0, reloj.ahora() - inicio);
  const indisponible = (motivo: 'red' | 'tiempo-excedido'): ResultadoLectura =>
    falla({ clase: 'indisponible', motivo, msTranscurridos: transcurridos() });

  const controlador = new AbortController();
  // Distingue una cancelacion propia de un fallo de red: ambos llegan como
  // promesa rechazada, pero solo la primera es 'tiempo-excedido'.
  let limiteVencido = false;

  const temporizadorObtencion = setTimeout(() => {
    limiteVencido = true;
    controlador.abort();
  }, MS_LIMITE_OBTENCION);

  let temporizadorLectura: ReturnType<typeof setTimeout> | undefined;
  const limiteDeLectura = new Promise<ResultadoLectura>((resolver) => {
    temporizadorLectura = setTimeout(() => {
      limiteVencido = true;
      controlador.abort();
      resolver(indisponible('tiempo-excedido'));
    }, MS_LIMITE_LECTURA);
  });

  // Nunca rechaza: cada await tiene su rama de fallo, de modo que perder la
  // carrera contra el limite no deja un rechazo sin atender.
  const lectura = (async (): Promise<ResultadoLectura> => {
    let respuesta: RespuestaRecurso;
    try {
      respuesta = await traer(ruta, { senal: controlador.signal });
    } catch {
      return indisponible(limiteVencido ? 'tiempo-excedido' : 'red');
    }

    if (!respuesta.ok) {
      return indisponible('red');
    }

    let texto: string;
    try {
      texto = await respuesta.texto();
    } catch {
      return indisponible(limiteVencido ? 'tiempo-excedido' : 'red');
    }

    return leerCatalogo(texto);
  })();

  try {
    return await Promise.race([lectura, limiteDeLectura]);
  } finally {
    clearTimeout(temporizadorObtencion);
    clearTimeout(temporizadorLectura);
  }
}

// --- Entradas del documento --------------------------------------------------

type LecturaEstrella =
  | { readonly ok: true; readonly estrella: Estrella }
  | { readonly ok: false; readonly error: ErrorCatalogo };

/**
 * Valida una entrada de estrella con la cascada del paso 3: presencia de los
 * cinco campos, rangos numericos y longitud de las cadenas.
 */
function leerEstrella(entrada: unknown, indice: number): LecturaEstrella {
  if (!esObjeto(entrada)) {
    return { ok: false, error: { clase: 'campo-ausente', indice, campo: 'nombre' } };
  }

  const nombre = entrada['nombre'];
  if (!esTextoConContenido(nombre)) {
    return { ok: false, error: { clase: 'campo-ausente', indice, campo: 'nombre' } };
  }
  const ar = entrada['ar'];
  if (!esNumero(ar)) {
    return { ok: false, error: { clase: 'campo-ausente', indice, campo: 'ar' } };
  }
  const dec = entrada['dec'];
  if (!esNumero(dec)) {
    return { ok: false, error: { clase: 'campo-ausente', indice, campo: 'dec' } };
  }
  const magnitud = entrada['magnitud'];
  if (!esNumero(magnitud)) {
    return { ok: false, error: { clase: 'campo-ausente', indice, campo: 'magnitud' } };
  }
  const constelacion = entrada['constelacion'];
  if (!esTextoConContenido(constelacion)) {
    return { ok: false, error: { clase: 'campo-ausente', indice, campo: 'constelacion' } };
  }

  if (!(ar >= 0 && ar < 24)) {
    return { ok: false, error: { clase: 'fuera-de-rango', nombre, campo: 'ar', recibido: ar } };
  }
  if (!(dec >= -90 && dec <= 90)) {
    return { ok: false, error: { clase: 'fuera-de-rango', nombre, campo: 'dec', recibido: dec } };
  }
  if (!(magnitud >= -1.5 && magnitud <= 6)) {
    return {
      ok: false,
      error: { clase: 'fuera-de-rango', nombre, campo: 'magnitud', recibido: magnitud },
    };
  }

  // Una cadena mas larga que el maximo es inutilizable como nombre o como
  // constelacion; se reporta con la misma clase que un campo ausente, que es la
  // que identifica la entrada y el campo (Requisito 2.1).
  if (nombre.length > MAX_LONGITUD_TEXTO) {
    return { ok: false, error: { clase: 'campo-ausente', indice, campo: 'nombre' } };
  }
  if (constelacion.length > MAX_LONGITUD_TEXTO) {
    return { ok: false, error: { clase: 'campo-ausente', indice, campo: 'constelacion' } };
  }

  return { ok: true, estrella: { nombre, ar, dec, magnitud, constelacion } };
}

type LecturaSegmento =
  | { readonly ok: true; readonly segmento: Segmento }
  | { readonly ok: false; readonly error: ErrorCatalogo };

/**
 * Valida una entrada de segmento: sus dos extremos deben estar presentes,
 * referenciar nombres del catalogo y ser distintos entre si (Requisito 2.4).
 */
function leerSegmento(
  entrada: unknown,
  posicion: number,
  nombres: ReadonlySet<string>,
): LecturaSegmento {
  if (!esObjeto(entrada)) {
    return { ok: false, error: { clase: 'campo-ausente', indice: posicion, campo: 'desde' } };
  }

  const desde = entrada['desde'];
  if (!esTextoConContenido(desde)) {
    return { ok: false, error: { clase: 'campo-ausente', indice: posicion, campo: 'desde' } };
  }
  const hasta = entrada['hasta'];
  if (!esTextoConContenido(hasta)) {
    return { ok: false, error: { clase: 'campo-ausente', indice: posicion, campo: 'hasta' } };
  }

  if (!nombres.has(desde)) {
    return {
      ok: false,
      error: { clase: 'segmento-invalido', posicion, nombre: desde, motivo: 'ausente' },
    };
  }
  if (!nombres.has(hasta)) {
    return {
      ok: false,
      error: { clase: 'segmento-invalido', posicion, nombre: hasta, motivo: 'ausente' },
    };
  }
  if (desde === hasta) {
    return {
      ok: false,
      error: { clase: 'segmento-invalido', posicion, nombre: desde, motivo: 'repetido' },
    };
  }

  return { ok: true, segmento: { desde, hasta } };
}

// --- Sintaxis JSON -----------------------------------------------------------

type AnalisisJson =
  | { readonly ok: true; readonly valor: unknown }
  | { readonly ok: false; readonly error: ErrorCatalogo };

/**
 * Analiza el documento con `JSON.parse` y, ante un fallo de sintaxis, resuelve
 * la posicion del caracter culpable (Requisito 2.2). Primero la lee del mensaje
 * del motor y, si el navegador no la incluye, la localiza con un recorrido
 * propio del texto.
 */
function analizarJson(textoJson: string): AnalisisJson {
  try {
    return { ok: true, valor: JSON.parse(textoJson) as unknown };
  } catch (fallo: unknown) {
    const mensaje = fallo instanceof Error ? fallo.message : '';
    const delMensaje = posicionDesdeMensaje(mensaje, textoJson);
    const posicion = delMensaje ?? posicionPorRecorrido(textoJson);
    return {
      ok: false,
      error: { clase: 'sintaxis-invalida', posicion: acotar(posicion, textoJson.length) },
    };
  }
}

/**
 * Extrae la posicion del mensaje de error del motor. Reconoce las dos formas
 * habituales: `... at position 12` y `... at line 3 column 5 ...`.
 *
 * @returns El indice del caracter, o `null` si el mensaje no lo declara.
 */
function posicionDesdeMensaje(mensaje: string, textoJson: string): number | null {
  const porPosicion = /position (\d+)/i.exec(mensaje);
  const indicePosicion = porPosicion?.[1];
  if (indicePosicion !== undefined) {
    return Number(indicePosicion);
  }

  const porLineaColumna = /line (\d+) column (\d+)/i.exec(mensaje);
  const linea = porLineaColumna?.[1];
  const columna = porLineaColumna?.[2];
  if (linea !== undefined && columna !== undefined) {
    return indiceDesdeLineaColumna(textoJson, Number(linea), Number(columna));
  }

  return null;
}

/** Convierte una linea y columna base 1 en un indice de caracter base 0. */
function indiceDesdeLineaColumna(textoJson: string, linea: number, columna: number): number {
  let indice = 0;
  for (let restantes = linea - 1; restantes > 0; restantes -= 1) {
    const salto = textoJson.indexOf('\n', indice);
    if (salto < 0) {
      break;
    }
    indice = salto + 1;
  }
  return indice + columna - 1;
}

/** Acota un indice al intervalo [0, longitud]. */
function acotar(posicion: number, longitud: number): number {
  if (!Number.isFinite(posicion) || posicion < 0) {
    return 0;
  }
  return Math.min(Math.trunc(posicion), longitud);
}

/**
 * Recorrido propio del texto que localiza el primer desajuste de sintaxis JSON.
 * Sirve de respaldo cuando el mensaje del motor no declara la posicion.
 *
 * @returns El indice del primer caracter que rompe la gramatica, o la longitud
 *   del texto si el recorrido no halla desajuste alguno.
 */
function posicionPorRecorrido(textoJson: string): number {
  const largo = textoJson.length;
  let cursor = 0;
  let posFallo = -1;

  function fallar(posicion: number): false {
    if (posFallo < 0) {
      posFallo = Math.min(posicion, largo);
    }
    return false;
  }

  function esBlanco(caracter: string | undefined): boolean {
    return caracter === ' ' || caracter === '\t' || caracter === '\n' || caracter === '\r';
  }

  function esDigito(caracter: string | undefined): boolean {
    return caracter !== undefined && caracter >= '0' && caracter <= '9';
  }

  function saltarBlancos(): void {
    while (cursor < largo && esBlanco(textoJson[cursor])) {
      cursor += 1;
    }
  }

  function literal(palabra: string): boolean {
    if (textoJson.startsWith(palabra, cursor)) {
      cursor += palabra.length;
      return true;
    }
    return fallar(cursor);
  }

  function cadena(): boolean {
    if (textoJson[cursor] !== '"') {
      return fallar(cursor);
    }
    cursor += 1;
    while (cursor < largo) {
      const caracter = textoJson[cursor];
      if (caracter === '"') {
        cursor += 1;
        return true;
      }
      if (caracter === '\\') {
        const escape = textoJson[cursor + 1];
        if (escape === undefined) {
          return fallar(largo);
        }
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(textoJson.slice(cursor + 2, cursor + 6))) {
            return fallar(cursor + 2);
          }
          cursor += 6;
          continue;
        }
        if ('"\\/bfnrt'.includes(escape)) {
          cursor += 2;
          continue;
        }
        return fallar(cursor + 1);
      }
      if (caracter !== undefined && caracter < '\u0020') {
        return fallar(cursor);
      }
      cursor += 1;
    }
    return fallar(largo);
  }

  function numero(): boolean {
    if (textoJson[cursor] === '-') {
      cursor += 1;
    }
    if (textoJson[cursor] === '0') {
      cursor += 1;
    } else if (esDigito(textoJson[cursor])) {
      while (esDigito(textoJson[cursor])) {
        cursor += 1;
      }
    } else {
      return fallar(cursor);
    }
    if (textoJson[cursor] === '.') {
      cursor += 1;
      if (!esDigito(textoJson[cursor])) {
        return fallar(cursor);
      }
      while (esDigito(textoJson[cursor])) {
        cursor += 1;
      }
    }
    if (textoJson[cursor] === 'e' || textoJson[cursor] === 'E') {
      cursor += 1;
      if (textoJson[cursor] === '+' || textoJson[cursor] === '-') {
        cursor += 1;
      }
      if (!esDigito(textoJson[cursor])) {
        return fallar(cursor);
      }
      while (esDigito(textoJson[cursor])) {
        cursor += 1;
      }
    }
    return true;
  }

  function objeto(): boolean {
    cursor += 1; // consume '{'
    saltarBlancos();
    if (textoJson[cursor] === '}') {
      cursor += 1;
      return true;
    }
    for (;;) {
      saltarBlancos();
      if (!cadena()) {
        return false;
      }
      saltarBlancos();
      if (textoJson[cursor] !== ':') {
        return fallar(cursor);
      }
      cursor += 1;
      if (!valor()) {
        return false;
      }
      saltarBlancos();
      if (textoJson[cursor] === ',') {
        cursor += 1;
        continue;
      }
      if (textoJson[cursor] === '}') {
        cursor += 1;
        return true;
      }
      return fallar(cursor);
    }
  }

  function arreglo(): boolean {
    cursor += 1; // consume '['
    saltarBlancos();
    if (textoJson[cursor] === ']') {
      cursor += 1;
      return true;
    }
    for (;;) {
      if (!valor()) {
        return false;
      }
      saltarBlancos();
      if (textoJson[cursor] === ',') {
        cursor += 1;
        continue;
      }
      if (textoJson[cursor] === ']') {
        cursor += 1;
        return true;
      }
      return fallar(cursor);
    }
  }

  function valor(): boolean {
    saltarBlancos();
    const caracter = textoJson[cursor];
    if (caracter === undefined) {
      return fallar(largo);
    }
    if (caracter === '{') {
      return objeto();
    }
    if (caracter === '[') {
      return arreglo();
    }
    if (caracter === '"') {
      return cadena();
    }
    if (caracter === 't') {
      return literal('true');
    }
    if (caracter === 'f') {
      return literal('false');
    }
    if (caracter === 'n') {
      return literal('null');
    }
    if (caracter === '-' || esDigito(caracter)) {
      return numero();
    }
    return fallar(cursor);
  }

  if (!valor()) {
    return posFallo < 0 ? 0 : posFallo;
  }
  saltarBlancos();
  if (cursor < largo) {
    return cursor;
  }
  return largo;
}

// --- Utilidades --------------------------------------------------------------

/** Envuelve un `ErrorCatalogo` en la rama de fallo, sin coleccion alguna. */
function falla(error: ErrorCatalogo): ResultadoLectura {
  return { ok: false, error };
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esTextoConContenido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0;
}

function esNumero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}
