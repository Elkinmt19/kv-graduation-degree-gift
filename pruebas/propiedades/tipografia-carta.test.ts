import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { genAnchoVentana } from '../generadores.js';
import {
  extraerDeclaraciones,
  leerHojaDeEstilo,
  leerTokens,
  HOJA_DE_TOKENS,
} from '../utilidades/estilos.js';

/**
 * Propiedad 25: La tipografia de la Carta nunca baja de sus minimos.
 *
 * *Para todo* ancho de ventana entre 320 y 1920 pixeles, el tamano de fuente
 * resultante para el texto de la Carta es mayor o igual a 16 pixeles y su
 * altura de linea es mayor o igual a 1.6.
 *
 * **Validates: Requirements 5.8**
 *
 * La prueba no repite los valores de los tokens: los lee de `tokens.css` con
 * `leerTokens` y evalua la expresion realmente declarada para cada ancho
 * generado. Asi, bajar el minimo del `clamp()` o el alto de linea hace fallar
 * la propiedad, que es el objeto del Requisito 5.8.
 */

/** Minimos del Requisito 5.8. */
const TAMANO_MIN_PX = 16;
const ALTO_LINEA_MIN = 1.6;

/**
 * Tamano de fuente de la raiz. `base.css` declara `html { font-size: 100% }`,
 * es decir el tamano preferido del navegador, cuyo valor por omision es 16 px.
 * La prueba lo comprueba mas abajo para no apoyarse en un supuesto silencioso.
 */
const RAIZ_PX = 16;

// --- Evaluador minimo de expresiones de longitud de CSS ----------------------

/** Contexto de resolucion: lo que hace falta para pasar de unidades a pixeles. */
interface Contexto {
  /** Ancho de la ventana en pixeles (unidad `vw`). */
  readonly anchoVentana: number;
  /** Tamano de fuente de la raiz en pixeles (unidad `rem`). */
  readonly raizPx: number;
  /** Tamano de fuente heredado en pixeles (unidad `em` y porcentaje). */
  readonly heredadoPx: number;
}

/**
 * Convierte una cantidad con unidad a pixeles. Las unidades que no se
 * reconocen provocan un error a proposito: es preferible que la prueba falle a
 * que apruebe un token que no sabe evaluar.
 */
function aPixeles(cantidad: number, unidad: string, contexto: Contexto): number {
  switch (unidad.toLowerCase()) {
    case '':
      // Numero sin unidad: valido para `line-height` (multiplicador) y para 0.
      return cantidad;
    case 'px':
      return cantidad;
    case 'rem':
      return cantidad * contexto.raizPx;
    case 'em':
      return cantidad * contexto.heredadoPx;
    case '%':
      return (cantidad / 100) * contexto.heredadoPx;
    case 'vw':
      return (cantidad / 100) * contexto.anchoVentana;
    default:
      throw new Error(`Unidad de CSS no soportada por la prueba: "${unidad}"`);
  }
}

/**
 * Evalua una expresion de longitud de CSS reducida a lo que el sistema de
 * diseno usa: numeros con unidad, sumas y restas, productos y divisiones por
 * numeros sin unidad, parentesis y las funciones `calc()`, `clamp()`, `min()`
 * y `max()`.
 */
function evaluarLongitud(expresion: string, contexto: Contexto): number {
  let posicion = 0;

  const saltarEspacios = (): void => {
    while (posicion < expresion.length && /\s/u.test(expresion[posicion] ?? '')) posicion += 1;
  };

  const consumir = (caracter: string): boolean => {
    saltarEspacios();
    if (expresion[posicion] === caracter) {
      posicion += 1;
      return true;
    }
    return false;
  };

  /** Lista de argumentos separados por comas hasta el parentesis de cierre. */
  const listaDeArgumentos = (): number[] => {
    const argumentos: number[] = [suma()];
    while (consumir(',')) argumentos.push(suma());
    if (!consumir(')')) throw new Error(`Falta ")" en "${expresion}"`);
    return argumentos;
  };

  function factor(): number {
    saltarEspacios();

    if (consumir('(')) {
      const valor = suma();
      if (!consumir(')')) throw new Error(`Falta ")" en "${expresion}"`);
      return valor;
    }

    const funcion = /^(calc|clamp|min|max)\s*\(/iu.exec(expresion.slice(posicion));
    if (funcion !== null) {
      posicion += funcion[0].length;
      const nombre = (funcion[1] ?? '').toLowerCase();
      const argumentos = listaDeArgumentos();

      if (nombre === 'calc') {
        const unico = argumentos[0];
        if (argumentos.length !== 1 || unico === undefined) {
          throw new Error(`calc() admite un solo argumento en "${expresion}"`);
        }
        return unico;
      }
      if (nombre === 'min') return Math.min(...argumentos);
      if (nombre === 'max') return Math.max(...argumentos);

      // clamp(MIN, PREFERIDO, MAX) === max(MIN, min(PREFERIDO, MAX)).
      const [minimo, preferido, maximo] = argumentos;
      if (
        argumentos.length !== 3 ||
        minimo === undefined ||
        preferido === undefined ||
        maximo === undefined
      ) {
        throw new Error(`clamp() exige tres argumentos en "${expresion}"`);
      }
      return Math.max(minimo, Math.min(preferido, maximo));
    }

    const numero = /^([+-]?(?:\d+\.?\d*|\.\d+))([a-zA-Z]*|%)/u.exec(expresion.slice(posicion));
    if (numero === null) throw new Error(`No se pudo leer un valor en "${expresion}"`);
    posicion += numero[0].length;
    return aPixeles(Number.parseFloat(numero[1] ?? ''), numero[2] ?? '', contexto);
  }

  function producto(): number {
    let valor = factor();
    for (;;) {
      saltarEspacios();
      const operador = expresion[posicion];
      if (operador !== '*' && operador !== '/') return valor;
      posicion += 1;
      const derecha = factor();
      valor = operador === '*' ? valor * derecha : valor / derecha;
    }
  }

  function suma(): number {
    let valor = producto();
    for (;;) {
      saltarEspacios();
      const operador = expresion[posicion];
      // En CSS `+` y `-` exigen espacios alrededor, de modo que un signo pegado
      // al numero pertenece al numero y ya lo consumio `factor`.
      if (operador !== '+' && operador !== '-') return valor;
      posicion += 1;
      const derecha = producto();
      valor = operador === '+' ? valor + derecha : valor - derecha;
    }
  }

  const resultado = suma();
  saltarEspacios();
  if (posicion !== expresion.length) {
    throw new Error(`Sobra texto sin evaluar en "${expresion}"`);
  }
  return resultado;
}

/**
 * Resuelve un `line-height` a multiplicador del tamano de fuente: los numeros
 * sin unidad ya lo son; las longitudes y los porcentajes se dividen por el
 * tamano de fuente resuelto.
 */
function altoDeLineaComoRazon(valor: string, tamanoPx: number, contexto: Contexto): number {
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/u.test(valor.trim())) return Number.parseFloat(valor);
  return evaluarLongitud(valor, { ...contexto, heredadoPx: tamanoPx }) / tamanoPx;
}

// --- Lectura de los estilos reales ------------------------------------------

const tokens = leerTokens();

function token(nombre: string): string {
  const valor = tokens.get(nombre);
  if (valor === undefined) {
    throw new Error(`${HOJA_DE_TOKENS} no declara ${nombre}`);
  }
  return valor;
}

const CUERPO_CARTA = token('--cuerpo-carta');
const ALTO_LINEA_CARTA = token('--alto-linea-carta');

/** Declaraciones de `base.css`, para atar los tokens al texto de la Carta. */
const declaracionesBase = extraerDeclaraciones(leerHojaDeEstilo('base.css'));

function declara(propiedad: string, valor: string): boolean {
  return declaracionesBase.some(
    (declaracion) => declaracion.propiedad === propiedad && declaracion.valor === valor,
  );
}

describe('Propiedad 25: la tipografia de la Carta nunca baja de sus minimos', () => {
  it('el texto de la Carta toma su tamano y su alto de linea de los tokens', () => {
    // Sin esta union, la propiedad podria pasar mientras el texto de la Carta
    // usa otros valores: `.texto-carta` es la regla que declara ambos tokens.
    expect(declara('font-size', 'var(--cuerpo-carta)')).toBe(true);
    expect(declara('line-height', 'var(--alto-linea-carta)')).toBe(true);
    // La raiz no reduce el rem: `font-size: 100%` conserva el tamano preferido
    // del navegador, de 16 px por omision.
    expect(declara('font-size', '100%')).toBe(true);
  });

  it('para todo ancho de ventana entre 320 y 1920 pixeles', () => {
    fc.assert(
      fc.property(genAnchoVentana, (anchoVentana) => {
        const contexto: Contexto = { anchoVentana, raizPx: RAIZ_PX, heredadoPx: RAIZ_PX };

        const tamanoPx = evaluarLongitud(CUERPO_CARTA, contexto);
        expect(tamanoPx).toBeGreaterThanOrEqual(TAMANO_MIN_PX);

        const altoLinea = altoDeLineaComoRazon(ALTO_LINEA_CARTA, tamanoPx, contexto);
        expect(altoLinea).toBeGreaterThanOrEqual(ALTO_LINEA_MIN);

        // El alto de linea en pixeles tampoco baja del minimo compuesto.
        expect(tamanoPx * altoLinea).toBeGreaterThanOrEqual(TAMANO_MIN_PX * ALTO_LINEA_MIN);
      }),
      { numRuns: 400 },
    );
  });
});
