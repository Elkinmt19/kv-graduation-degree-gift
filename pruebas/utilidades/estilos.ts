/**
 * Utilidad de pruebas que lee las hojas de estilo del sistema de diseno.
 *
 * Requisito 6.1: `tokens.css` es la unica hoja autorizada para declarar
 * literales de color; fuera de ella el unico color admitido es `var(--…)`. Esta
 * utilidad recorre `src/estilos/*.css`, extrae las declaraciones e inventaria
 * todo literal de color hallado fuera de `tokens.css`, para que una prueba
 * pueda exigir que el inventario este vacio.
 *
 * Requisito 6.2: tambien interpreta los valores `rgb(var(--x-rgb) / a)` de los
 * tokens como capas de la Paleta_Regalo, de modo que el calculo de contraste
 * (`src/nucleo/diseno/contraste.ts`) se aplique a los valores realmente
 * declarados y no a copias escritas a mano en la prueba.
 *
 * No usa DOM: lee los archivos con `node:fs`, con rutas resueltas desde este
 * modulo, de manera que el resultado no depende del directorio de trabajo.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { NombrePaleta } from '../../src/nucleo/diseno/contraste.js';

/** Directorio de las hojas de estilo de la Aplicacion. */
export const DIRECTORIO_ESTILOS = fileURLToPath(new URL('../../src/estilos/', import.meta.url));

/** Unica hoja autorizada a declarar literales de color (Requisito 6.1). */
export const HOJA_DE_TOKENS = 'tokens.css';

/** Hoja de estilo leida del disco. */
export interface HojaDeEstilo {
  /** Nombre del archivo, relativo a `src/estilos/`. */
  readonly archivo: string;
  readonly contenido: string;
}

/** Declaracion CSS `propiedad: valor` con su ubicacion. */
export interface Declaracion {
  readonly archivo: string;
  /** Linea de la propiedad, base 1. */
  readonly linea: number;
  readonly propiedad: string;
  readonly valor: string;
}

/**
 * Forma en que un literal de color aparece en la hoja: hexadecimal, funcion de
 * color de CSS o nombre de color de CSS.
 */
export type ClaseDeLiteral = 'hexadecimal' | 'funcion-de-color' | 'nombre-css';

/** Literal de color hallado fuera de `tokens.css`. */
export interface LiteralDeColor extends Declaracion {
  readonly literal: string;
  readonly clase: ClaseDeLiteral;
}

/** Capa de la Paleta_Regalo tal como la declara un token de color. */
export interface CapaDeToken {
  readonly nombre: NombrePaleta;
  readonly opacidad: number;
}

/**
 * Palabras clave que no introducen ningun color nuevo y por eso no cuentan como
 * literales: `transparent` no aporta color y `currentColor` reutiliza el que ya
 * heredo el elemento de un token.
 */
const PALABRAS_SIN_COLOR = new Set(['transparent', 'currentcolor']);

/** Funciones de color de CSS, de la mas especifica a la mas general. */
const FUNCIONES_DE_COLOR =
  /\b(color-mix|light-dark|device-cmyk|rgba?|hsla?|hwb|oklab|oklch|lab|lch|color)\s*\(/gi;

/** Literales hexadecimales de 3, 4, 6 u 8 digitos. */
const HEXADECIMALES = /#[0-9a-fA-F]{3,8}\b/g;

/** Nombres de color de CSS (Color Module Level 4), en minuscula. */
const NOMBRES_CSS = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
  'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
  'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow',
  'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
  'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple',
  'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell',
  'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen',
  'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white',
  'whitesmoke', 'yellow', 'yellowgreen',
] as const;

const EXPRESION_NOMBRES_CSS = new RegExp(`\\b(${NOMBRES_CSS.join('|')})\\b`, 'gi');

/** Nombres de la Paleta_Regalo aceptados en `rgb(var(--<nombre>-rgb) / a)`. */
const NOMBRES_PALETA: readonly NombrePaleta[] = [
  'negro-profundo',
  'azul-noche',
  'azul-electrico',
  'dorado',
];

/**
 * Lee todas las hojas de estilo de `src/estilos/`, en orden alfabetico, de modo
 * que las hojas que se agreguen mas adelante entren al inventario sin cambiar
 * esta utilidad.
 */
export function leerHojasDeEstilo(): HojaDeEstilo[] {
  return readdirSync(DIRECTORIO_ESTILOS)
    .filter((archivo) => archivo.endsWith('.css'))
    .sort((primero, segundo) => primero.localeCompare(segundo))
    .map((archivo) => ({
      archivo,
      contenido: readFileSync(DIRECTORIO_ESTILOS + archivo, 'utf8'),
    }));
}

/** Lee una hoja concreta de `src/estilos/`. */
export function leerHojaDeEstilo(archivo: string): HojaDeEstilo {
  return { archivo, contenido: readFileSync(DIRECTORIO_ESTILOS + archivo, 'utf8') };
}

/**
 * Sustituye los comentarios por espacios, conservando los saltos de linea para
 * que los numeros de linea sigan siendo los del archivo original.
 */
function borrarComentarios(contenido: string): string {
  return contenido.replace(/\/\*[\s\S]*?\*\//g, (comentario) =>
    comentario.replace(/[^\n]/g, ' '),
  );
}

/**
 * Extrae las declaraciones `propiedad: valor` de una hoja, descartando
 * selectores, preludios de reglas `@` y comentarios. Reconoce cadenas y
 * parentesis, de modo que un `;` dentro de `url(...)` o de una cadena no parte
 * la declaracion.
 */
export function extraerDeclaraciones(hoja: HojaDeEstilo): Declaracion[] {
  const contenido = borrarComentarios(hoja.contenido);
  const declaraciones: Declaracion[] = [];

  let acumulado = '';
  let lineaActual = 1;
  let lineaDeclaracion: number | null = null;
  let comilla: string | null = null;
  let parentesis = 0;

  const reiniciar = (): void => {
    acumulado = '';
    lineaDeclaracion = null;
  };

  const registrar = (): void => {
    const texto = acumulado.trim();
    reiniciar();
    if (texto.length === 0 || texto.startsWith('@')) return;

    const separador = texto.indexOf(':');
    if (separador <= 0) return;

    const propiedad = texto.slice(0, separador).trim();
    if (!/^(--)?[a-zA-Z_][\w-]*$/.test(propiedad)) return;

    declaraciones.push({
      archivo: hoja.archivo,
      linea: lineaDeclaracion ?? lineaActual,
      propiedad,
      valor: texto.slice(separador + 1).trim(),
    });
  };

  for (const caracter of contenido) {
    if (lineaDeclaracion === null && caracter.trim().length > 0) lineaDeclaracion = lineaActual;

    if (comilla !== null) {
      acumulado += caracter;
      if (caracter === comilla) comilla = null;
    } else if (caracter === '"' || caracter === "'") {
      comilla = caracter;
      acumulado += caracter;
    } else if (caracter === '(') {
      parentesis += 1;
      acumulado += caracter;
    } else if (caracter === ')') {
      parentesis = Math.max(0, parentesis - 1);
      acumulado += caracter;
    } else if (parentesis === 0 && caracter === '{') {
      // El texto acumulado es un selector o un preludio `@`: se descarta.
      reiniciar();
    } else if (parentesis === 0 && (caracter === ';' || caracter === '}')) {
      // `registrar` usa `lineaDeclaracion`, por eso se llama antes de avanzar.
      registrar();
    } else {
      acumulado += caracter;
    }

    if (caracter === '\n') lineaActual += 1;
  }

  registrar();
  return declaraciones;
}

/**
 * Deja el valor listo para buscar literales: quita las cadenas (familias
 * tipograficas) y el contenido de `url(...)`, que pueden traer `#` o palabras
 * que no son colores.
 */
function valorInspeccionable(valor: string): string {
  return valor
    .replace(/"[^"]*"|'[^']*'/g, ' ')
    .replace(/url\([^)]*\)/gi, ' ');
}

/** Longitudes validas de un literal hexadecimal de color. */
const LARGOS_HEXADECIMALES = new Set([3, 4, 6, 8]);

/** Halla los literales de color presentes en el valor de una declaracion. */
function literalesDelValor(valor: string): { literal: string; clase: ClaseDeLiteral }[] {
  const texto = valorInspeccionable(valor);
  const hallazgos: { literal: string; clase: ClaseDeLiteral }[] = [];

  for (const coincidencia of texto.matchAll(HEXADECIMALES)) {
    const literal = coincidencia[0];
    if (LARGOS_HEXADECIMALES.has(literal.length - 1)) {
      hallazgos.push({ literal, clase: 'hexadecimal' });
    }
  }

  for (const coincidencia of texto.matchAll(FUNCIONES_DE_COLOR)) {
    hallazgos.push({ literal: `${coincidencia[1] ?? coincidencia[0]}()`, clase: 'funcion-de-color' });
  }

  for (const coincidencia of texto.matchAll(EXPRESION_NOMBRES_CSS)) {
    const literal = coincidencia[0];
    if (!PALABRAS_SIN_COLOR.has(literal.toLowerCase())) {
      hallazgos.push({ literal, clase: 'nombre-css' });
    }
  }

  return hallazgos;
}

/**
 * Inventaria todo literal de color declarado fuera de `tokens.css`
 * (Requisito 6.1). Un inventario vacio significa que las demas hojas solo usan
 * `var(--…)`.
 *
 * @param hojas Hojas a revisar; por omision, todas las de `src/estilos/`.
 */
export function inventariarLiteralesDeColor(
  hojas: readonly HojaDeEstilo[] = leerHojasDeEstilo(),
): LiteralDeColor[] {
  return hojas
    .filter((hoja) => hoja.archivo !== HOJA_DE_TOKENS)
    .flatMap((hoja) =>
      extraerDeclaraciones(hoja).flatMap((declaracion) =>
        literalesDelValor(declaracion.valor).map((hallazgo) => ({ ...declaracion, ...hallazgo })),
      ),
    );
}

/**
 * Lee las propiedades personalizadas declaradas en una hoja y las devuelve como
 * mapa `nombre -> valor`. Cuando un token se redeclara (por ejemplo dentro de
 * `@media (prefers-reduced-motion: reduce)`), gana la ultima declaracion, igual
 * que en la cascada de CSS para reglas de la misma especificidad.
 */
export function leerTokens(hoja: HojaDeEstilo = leerHojaDeEstilo(HOJA_DE_TOKENS)): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const declaracion of extraerDeclaraciones(hoja)) {
    if (declaracion.propiedad.startsWith('--')) tokens.set(declaracion.propiedad, declaracion.valor);
  }
  return tokens;
}

/**
 * Interpreta un valor de token con la forma `rgb(var(--<nombre>-rgb) / a)` o
 * `rgb(var(--<nombre>-rgb))` y devuelve el color de la Paleta_Regalo con su
 * opacidad. Devuelve `null` cuando el valor no sigue esa forma, de acuerdo con
 * la convencion del nucleo de tratar los fallos como datos.
 */
export function interpretarCapaDeToken(valor: string): CapaDeToken | null {
  const coincidencia =
    /^rgb\(\s*var\(\s*--([a-z-]+)-rgb\s*\)\s*(?:\/\s*([0-9]*\.?[0-9]+)\s*)?\)$/i.exec(valor.trim());
  if (coincidencia === null) return null;

  const declarado = coincidencia[1];
  const nombre = NOMBRES_PALETA.find((candidato) => candidato === declarado);
  if (nombre === undefined) return null;

  const opacidad = coincidencia[2] === undefined ? 1 : Number.parseFloat(coincidencia[2]);
  if (!Number.isFinite(opacidad)) return null;

  return { nombre, opacidad };
}
