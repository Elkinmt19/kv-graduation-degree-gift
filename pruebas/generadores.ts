/**
 * Generadores de fast-check compartidos por las pruebas basadas en propiedades.
 *
 * Son la pieza que decide si las propiedades encuentran o no los errores
 * interesantes, asi que **todos estan sesgados hacia los casos limite** que el
 * diseno identifico como riesgosos: fronteras exactas de cada intervalo,
 * vecindades de esas fronteras, degeneracion polar, paso por 0 y 360 grados,
 * cambio de ano, texto no ASCII y longitudes maximas exactas.
 *
 * Modulo puro: no toca el DOM, no consulta el reloj y no depende de ningun
 * modulo de vista mas alla de las constantes de disposicion.
 *
 * Requisitos: 2.1, 2.3, 3.2, 3.5.
 */

import fc from 'fast-check';

import type { InstanteGraduacion } from '../src/nucleo/astronomia/modelo.js';
import {
  MAX_ESTRELLAS,
  MAX_LONGITUD_TEXTO,
  MAX_SEGMENTOS,
} from '../src/nucleo/catalogo/lector.js';
import type { CatalogoEstelar, Estrella, Segmento } from '../src/nucleo/catalogo/modelo.js';
import type { ConfiguracionRegalo } from '../src/nucleo/configuracion/modelo.js';
import type { ErrorCatalogo } from '../src/nucleo/errores.js';
import { ANCHO_VENTANA_MAX, ANCHO_VENTANA_MIN } from '../src/vista/disposicion.js';

// --- Utilidades de texto -----------------------------------------------------

/**
 * Recorta un texto a lo sumo a `maximo` unidades de codigo sin partir un par
 * suplente, de modo que un emoji nunca queda a medias.
 */
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
  const recortado = recortarA(texto, longitud);
  return recortado.padEnd(longitud, '·');
}

/**
 * Piezas de texto con las que se arman nombres y constelaciones: ASCII,
 * digitos, acentos, la ese-zeta alemana, comillas, espacios internos y emojis
 * de dos unidades de codigo.
 */
const PIEZAS_TEXTO = [
  'a',
  'z',
  'K',
  'V',
  '7',
  '0',
  ' ',
  ' ',
  'ñ',
  'Ñ',
  'á',
  'Ä',
  'ß',
  'ó',
  '"',
  "'",
  '-',
  '·',
  '🐱',
  '🏍',
] as const;

/** Textos de interes por si mismos, incluidos varios de longitud exacta 64. */
const TEXTOS_LIMITE = [
  'a',
  'ñ',
  '🐱',
  '"Kawa" \'Valen\'',
  'Estrella con espacios internos y acentos: ñ á é í ó ú',
  'K'.repeat(MAX_LONGITUD_TEXTO),
  'ñ'.repeat(MAX_LONGITUD_TEXTO),
  '🐱'.repeat(MAX_LONGITUD_TEXTO / 2),
  aLongitudExacta('Nombre con acentos ñ, comillas " y un gato 🐱 ', MAX_LONGITUD_TEXTO),
  aLongitudExacta('Constelacion de exactamente sesenta y cuatro ', MAX_LONGITUD_TEXTO),
] as const;

/**
 * Nombre o constelacion valido para el Catalogo_Estelar: cadena no vacia de a
 * lo sumo 64 unidades de codigo (Requisito 2.1), con sesgo hacia el texto no
 * ASCII y hacia la longitud maxima exacta.
 */
export const genTextoEstelar: fc.Arbitrary<string> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc
      .array(fc.constantFrom(...PIEZAS_TEXTO), { minLength: 1, maxLength: 12 })
      .map((piezas) => recortarA(piezas.join(''), MAX_LONGITUD_TEXTO)),
  },
  { weight: 2, arbitrary: fc.constantFrom(...TEXTOS_LIMITE) },
);

/** Cadena de atribucion del catalogo; puede ser vacia (el modelo lo permite). */
export const genAtribucion: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.constant('Datos: Hipparcos / Yale BSC · Uso educativo') },
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 1, arbitrary: fc.string({ maxLength: 120 }) },
);

// --- Numeros y angulos -------------------------------------------------------

/** Margen minusculo para acercarse a una frontera sin tocarla. */
const EPSILON = 1e-9;

/**
 * Ascension recta en horas, en [0, 24). Incluye el 0 exacto y valores muy
 * cercanos al 24 excluido, donde vive el paso de 24 h a 0 h (Requisito 2.3).
 */
export const genAscensionRecta: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({ min: 0, max: 24, maxExcluded: true, noNaN: true, noDefaultInfinity: true }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(0, EPSILON, 6, 12, 18, 23.999999, 24 - EPSILON),
  },
);

/**
 * Grados de un angulo polar en [-90, 90]: sirve de declinacion y de latitud.
 * Incluye ±90 exactos, donde la ascension recta y el azimut se degeneran
 * (Requisitos 2.3, 3.9).
 */
const genGradosPolares: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      -90,
      -90 + EPSILON,
      -89.999999,
      -45,
      0,
      2.9273,
      45,
      89.999999,
      90 - EPSILON,
      90,
    ),
  },
);

/** Declinacion en grados, en [-90, 90] (Requisito 2.3). */
export const genDeclinacion: fc.Arbitrary<number> = genGradosPolares;

/** Latitud del Lugar_Graduacion en grados, en [-90, 90] (Requisito 3.9). */
export const genLatitud: fc.Arbitrary<number> = genGradosPolares;

/**
 * Longitud del Lugar_Graduacion en grados, en (-180, 180] (Requisito 3.9). El
 * -180 exacto queda fuera a proposito: el intervalo del requisito es abierto
 * por la izquierda, de modo que cada meridiano tiene una sola representacion.
 */
export const genLongitud: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({
      min: -180,
      max: 180,
      minExcluded: true,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      -180 + EPSILON,
      -179.999999,
      -75.2819,
      -EPSILON,
      0,
      EPSILON,
      179.999999,
      180 - EPSILON,
      180,
    ),
  },
);

/**
 * Magnitud aparente en [-1.5, 6.0], con los dos extremos incluidos
 * (Requisito 2.3).
 */
export const genMagnitud: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({ min: -1.5, max: 6, noNaN: true, noDefaultInfinity: true }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(-1.5, -1.5 + EPSILON, -1.46, 0, 1.5, 3, 5.999999, 6),
  },
);

/**
 * Tiempo sidereo local en grados, en [0, 360). Cubre el paso por 0 y por 360,
 * donde una resta ingenua de angulos se rompe.
 */
export const genTiempoSidereo: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({
      min: 0,
      max: 360,
      maxExcluded: true,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(0, EPSILON, 0.000001, 90, 180, 270, 359.999999, 360 - EPSILON),
  },
);

/**
 * Altitud en grados, en [-90, 90], sesgada hacia el horizonte (0 grados, donde
 * vive el invariante del Requisito 3.5) y hacia el cenit (90 grados, donde el
 * azimut queda indeterminado).
 */
export const genAltitud: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 2,
    arbitrary: fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
  },
  {
    weight: 3,
    arbitrary: fc.constantFrom(
      -90,
      -1,
      -0.000001,
      -EPSILON,
      0,
      EPSILON,
      0.000001,
      1,
      89.999999,
      90 - EPSILON,
      90,
    ),
  },
  {
    // Vecindad del horizonte.
    weight: 2,
    arbitrary: fc.double({ min: -0.5, max: 0.5, noNaN: true, noDefaultInfinity: true }),
  },
  {
    // Vecindad del cenit.
    weight: 2,
    arbitrary: fc.double({ min: 89.5, max: 90, noNaN: true, noDefaultInfinity: true }),
  },
);

/**
 * Ancho de ventana en pixeles, entero en [320, 1920], con sesgo hacia las
 * fronteras de la disposicion y hacia sus vecinos inmediatos (Requisitos 7.1,
 * 7.2, 7.3, 7.9, 7.11).
 */
export const genAnchoVentana: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 2,
    arbitrary: fc.integer({ min: ANCHO_VENTANA_MIN, max: ANCHO_VENTANA_MAX }),
  },
  {
    weight: 3,
    arbitrary: fc.constantFrom(
      ANCHO_VENTANA_MIN,
      321,
      766,
      767,
      768,
      769,
      878,
      879,
      880,
      881,
      1022,
      1023,
      1024,
      1025,
      1919,
      ANCHO_VENTANA_MAX,
    ),
  },
);

// --- Instante_Graduacion -----------------------------------------------------

/** Desplazamiento horario de Colombia, en horas (Requisitos 8.1, 8.4). */
const DESPLAZAMIENTO_HORAS = -5;

/** Sufijo obligatorio del Instante_Graduacion. */
export const DESPLAZAMIENTO_COLOMBIA = '-05:00';

const MS_HORA = 3_600_000;

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

/**
 * Formatea un instante UTC como ISO 8601 con desplazamiento -05:00, al segundo.
 *
 * @param msUtc Milisegundos desde la epoca Unix; se espera multiplo de 1000.
 */
export function isoConDesplazamientoColombia(msUtc: number): string {
  const local = new Date(msUtc + DESPLAZAMIENTO_HORAS * MS_HORA);
  const anio = String(local.getUTCFullYear()).padStart(4, '0');
  const mes = dosDigitos(local.getUTCMonth() + 1);
  const dia = dosDigitos(local.getUTCDate());
  const hora = dosDigitos(local.getUTCHours());
  const minuto = dosDigitos(local.getUTCMinutes());
  const segundo = dosDigitos(local.getUTCSeconds());
  return `${anio}-${mes}-${dia}T${hora}:${minuto}:${segundo}${DESPLAZAMIENTO_COLOMBIA}`;
}

/**
 * Construye un `InstanteGraduacion` truncado al segundo, de modo que
 * `Date.parse(iso) === msUtc` sin residuo de milisegundos.
 */
export function instanteDesdeMs(msUtc: number): InstanteGraduacion {
  const alSegundo = Math.floor(msUtc / 1000) * 1000;
  return { iso: isoConDesplazamientoColombia(alSegundo), msUtc: alSegundo };
}

/**
 * Instantes de interes: el marcador del Archivo_Configuracion, el cambio de
 * ano en hora de Colombia, la epoca J2000.0 vista desde -05:00 y fechas muy
 * alejadas de J2000, que son las que hacen visible la precesion.
 */
const INSTANTES_LIMITE = [
  '2025-12-12T10:00:00-05:00',
  '2025-12-31T23:59:59-05:00',
  '2026-01-01T00:00:00-05:00',
  '2000-01-01T07:00:00-05:00',
  '2000-01-01T00:00:00-05:00',
  '1950-06-15T03:00:00-05:00',
  '1975-03-21T12:00:00-05:00',
  '2050-09-23T18:30:00-05:00',
  '2099-12-31T23:59:59-05:00',
] as const;

/**
 * Instante_Graduacion valido, siempre con desplazamiento -05:00 y resolucion
 * de un segundo. La rama continua cubre 1950-2099 completo; la rama sesgada
 * cubre el cambio de ano, la medianoche, el mediodia y las fechas lejanas.
 */
export const genInstante: fc.Arbitrary<InstanteGraduacion> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc
      .tuple(
        fc.integer({ min: 1950, max: 2099 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 59 }),
      )
      .map(([anio, mes, dia, hora, minuto, segundo]) =>
        // `Date.UTC` normaliza los dias que se pasan del mes (31 de febrero
        // pasa a marzo), asi que toda combinacion produce un instante real.
        // Sumar 5 horas convierte la hora local de Colombia en hora UTC.
        instanteDesdeMs(Date.UTC(anio, mes - 1, dia, hora - DESPLAZAMIENTO_HORAS, minuto, segundo)),
      ),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(...INSTANTES_LIMITE).map((iso) => instanteDesdeMs(Date.parse(iso))),
  },
);

// --- Clave_Acceso ------------------------------------------------------------

/**
 * Caracteres de espacio en blanco que reconoce `String.prototype.trim`:
 * WhiteSpace, LineTerminator y el ZWNBSP (U+FEFF). Mezcla los ASCII habituales
 * con los Unicode menos frecuentes, que son los que quedan pegados al copiar y
 * pegar una clave.
 */
export const ESPACIOS_UNICODE = [
  ' ',
  '\t',
  '\n',
  '\r',
  '\f',
  '\v',
  '\u00a0',
  '\u1680',
  '\u2000',
  '\u2009',
  '\u2028',
  '\u2029',
  '\u202f',
  '\u205f',
  '\u3000',
  '\ufeff',
] as const;

/**
 * Caracteres visibles: mayusculas y minusculas ASCII, digitos, acentos, la 'I'
 * turca con punto (su minuscula ocupa dos unidades de codigo), comillas y
 * emojis, para ejercitar la normalizacion con texto no ASCII.
 */
export const VISIBLES_CLAVE = [
  'a',
  'z',
  'B',
  'Q',
  'K',
  'V',
  '7',
  '0',
  'ñ',
  'Ñ',
  'á',
  'Ä',
  'ß',
  'İ',
  '"',
  "'",
  '-',
  '🐱',
  '🏍',
] as const;

/** Un caracter de espacio en blanco. */
export const genEspacioEnBlanco: fc.Arbitrary<string> = fc.constantFrom(...ESPACIOS_UNICODE);

/** Relleno de los extremos: posiblemente vacio, solo espacio en blanco. */
export const genRelleno: fc.Arbitrary<string> = fc
  .array(genEspacioEnBlanco, { maxLength: 6 })
  .map((partes) => partes.join(''));

/** Corrida de espacio en blanco interna, de longitud mayor o igual a 1. */
export const genEspacioInterno: fc.Arbitrary<string> = fc
  .array(genEspacioEnBlanco, { minLength: 1, maxLength: 3 })
  .map((partes) => partes.join(''));

/** Trozo visible, sin espacio en blanco, de longitud mayor o igual a 1. */
export const genTrozoVisible: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...VISIBLES_CLAVE), { minLength: 1, maxLength: 8 })
  .map((partes) => partes.join(''));

/**
 * Clave_Acceso en texto claro tal como la escribiria una persona: con espacio
 * en blanco Unicode en los extremos, mayusculas mezcladas, longitud 0,
 * longitud 64 y caracteres no ASCII (Requisitos 1.2, 8.6).
 */
export const genClave: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc.string({ maxLength: 64 }),
  fc.string({ minLength: 64, maxLength: 64 }),
  fc.string({ unit: 'binary', maxLength: 32 }),
  fc
    .tuple(genRelleno, fc.string({ unit: 'binary', maxLength: 24 }), genRelleno)
    .map((partes) => partes.join('')),
  fc.tuple(genRelleno, genTrozoVisible, genEspacioInterno, genTrozoVisible, genRelleno).map((partes) =>
    partes.join(''),
  ),
);

// --- Estrella y Catalogo_Estelar ---------------------------------------------

/**
 * Estrella valida del Catalogo_Estelar: cumple todos los invariantes del
 * modelo (Requisitos 2.1, 2.3). La unicidad del nombre no es asunto de esta
 * generadora, sino de `genCatalogoValido`.
 */
export const genEstrella: fc.Arbitrary<Estrella> = fc.record({
  nombre: genTextoEstelar,
  ar: genAscensionRecta,
  dec: genDeclinacion,
  magnitud: genMagnitud,
  constelacion: genTextoEstelar,
});

/**
 * Vuelve unico un nombre generado anteponiendo su posicion, sin exceder las 64
 * unidades de codigo ni partir un par suplente.
 */
function nombreUnico(base: string, indice: number): string {
  const sufijo = `-${indice}`;
  return `${recortarA(base, MAX_LONGITUD_TEXTO - sufijo.length)}${sufijo}`;
}

/**
 * Pares de indices distintos entre si, con los que se arman Segmentos siempre
 * consistentes. El segundo indice se deriva del primero (`(i + 1 + k) % n`),
 * de modo que nunca coincide con el y no hace falta filtrar.
 */
function genParesDeIndices(cantidad: number): fc.Arbitrary<readonly (readonly [number, number])[]> {
  const vacio = fc.constant<readonly (readonly [number, number])[]>([]);
  if (cantidad < 2) {
    return vacio;
  }
  const genPar = fc
    .tuple(fc.integer({ min: 0, max: cantidad - 1 }), fc.integer({ min: 0, max: cantidad - 2 }))
    .map(([i, k]): readonly [number, number] => [i, (i + 1 + k) % cantidad]);

  return fc.oneof(
    // Sesgo explicito hacia el catalogo sin ningun Segmento.
    { weight: 1, arbitrary: vacio },
    {
      weight: 4,
      arbitrary: fc.array(genPar, { maxLength: Math.min(3 * cantidad, MAX_SEGMENTOS) }),
    },
  );
}

/** Catalogo valido con una cantidad de estrellas en el rango indicado. */
function genCatalogoDeTamano(minimo: number, maximo: number): fc.Arbitrary<CatalogoEstelar> {
  return fc.integer({ min: minimo, max: maximo }).chain((cantidad) =>
    fc
      .tuple(
        fc.array(genEstrella, { minLength: cantidad, maxLength: cantidad }),
        genAtribucion,
        genParesDeIndices(cantidad),
      )
      .map(([base, atribucion, pares]) => {
        const estrellas: Estrella[] = base.map((estrella, indice) => ({
          ...estrella,
          nombre: nombreUnico(estrella.nombre, indice),
        }));

        const segmentos: Segmento[] = [];
        for (const [i, j] of pares) {
          const desde = estrellas[i];
          const hasta = estrellas[j];
          if (desde === undefined || hasta === undefined) {
            continue;
          }
          segmentos.push({ desde: desde.nombre, hasta: hasta.nombre });
        }

        const catalogo: CatalogoEstelar = {
          version: 1,
          epoca: 'J2000.0',
          atribucion,
          estrellas,
          segmentos,
        };
        return catalogo;
      }),
  );
}

/**
 * Catalogo_Estelar valido: nombres unicos garantizados y Segmentos siempre
 * consistentes. El tamano se limita a 300 estrellas por costo de ejecucion, con
 * casos sesgados de una sola estrella, sin Segmentos y de coleccion grande
 * (Requisitos 2.1, 2.4, 2.10).
 */
export const genCatalogoValido: fc.Arbitrary<CatalogoEstelar> = fc.oneof(
  { weight: 1, arbitrary: genCatalogoDeTamano(1, 1) },
  { weight: 5, arbitrary: genCatalogoDeTamano(1, 20) },
  { weight: 2, arbitrary: genCatalogoDeTamano(20, 120) },
  { weight: 1, arbitrary: genCatalogoDeTamano(120, 300) },
);

// --- Mutaciones: un solo defecto a la vez ------------------------------------

/** Clase de defecto que `genMutacion` puede introducir en un documento. */
export type DefectoCatalogo =
  | 'sintaxis'
  | 'campo-ausente'
  | 'campo-vacio'
  | 'fuera-de-rango'
  | 'nombre-duplicado'
  | 'segmento-ausente'
  | 'segmento-repetido';

/**
 * Documento del Catalogo_Estelar con **exactamente un** defecto, junto con el
 * error que el Lector_Catalogo debe devolver (Propiedad 6).
 *
 * Para el defecto `sintaxis`, `esperado.posicion` es el indice donde se
 * introdujo la corrupcion: el analizador puede reportar esa posicion o una
 * posterior, asi que las propiedades comparan la clase y usan la posicion como
 * cota inferior.
 */
export interface MutacionCatalogo {
  readonly defecto: DefectoCatalogo;
  /** Descripcion legible del defecto, util en los mensajes de fallo. */
  readonly descripcion: string;
  /** Texto JSON con el defecto aplicado. */
  readonly documento: string;
  /** Error esperado del Lector_Catalogo. */
  readonly esperado: ErrorCatalogo;
}

type EntradaMutable = Record<string, unknown>;

interface DocumentoMutable {
  version: unknown;
  epoca: unknown;
  atribucion: unknown;
  estrellas: EntradaMutable[];
  segmentos: EntradaMutable[];
}

/** Copia el catalogo como estructura JSON mutable, sin compartir referencias. */
function documentoDesde(catalogo: CatalogoEstelar): DocumentoMutable {
  return {
    version: catalogo.version,
    epoca: catalogo.epoca,
    atribucion: catalogo.atribucion,
    estrellas: catalogo.estrellas.map((estrella) => ({
      nombre: estrella.nombre,
      ar: estrella.ar,
      dec: estrella.dec,
      magnitud: estrella.magnitud,
      constelacion: estrella.constelacion,
    })),
    segmentos: catalogo.segmentos.map((segmento) => ({
      desde: segmento.desde,
      hasta: segmento.hasta,
    })),
  };
}

function textoDe(documento: DocumentoMutable): string {
  return JSON.stringify(documento, null, 2);
}

/** Nombre garantizadamente ausente del catalogo. */
function nombreAusente(nombres: readonly string[]): string {
  const usados = new Set(nombres);
  let candidato = 'Estrella-ausente';
  while (usados.has(candidato)) {
    candidato += '·';
  }
  return candidato;
}

/**
 * Indices de los caracteres estructurales (`{}[]:,`) fuera de toda cadena.
 * Eliminar uno de ellos, o insertar un cierre sobrante en su lugar, rompe la
 * sintaxis JSON con certeza; hacerlo dentro de una cadena no siempre la rompe.
 */
function posicionesEstructurales(texto: string): number[] {
  const posiciones: number[] = [];
  let dentroDeCadena = false;
  let escapando = false;

  for (let indice = 0; indice < texto.length; indice += 1) {
    const caracter = texto[indice];
    if (escapando) {
      escapando = false;
      continue;
    }
    if (caracter === '\\') {
      escapando = dentroDeCadena;
      continue;
    }
    if (caracter === '"') {
      dentroDeCadena = !dentroDeCadena;
      continue;
    }
    if (dentroDeCadena) {
      continue;
    }
    if (
      caracter === '{' ||
      caracter === '}' ||
      caracter === '[' ||
      caracter === ']' ||
      caracter === ':' ||
      caracter === ','
    ) {
      posiciones.push(indice);
    }
  }

  return posiciones;
}

/** Valores fuera de rango por campo numerico (Requisito 2.3). */
const VALORES_FUERA_DE_RANGO: Record<'ar' | 'dec' | 'magnitud', readonly number[]> = {
  ar: [24, 24.000001, -0.000001, -1, 48],
  dec: [90.000001, -90.000001, 91, -91, 180],
  magnitud: [-1.500001, 6.000001, -20, 30],
};

/**
 * Introduce en un Catalogo_Estelar valido exactamente uno de los defectos que
 * enumera la Propiedad 6: sintaxis corrupta, rango invalido, campo ausente o
 * vacio, nombre duplicado o Segmento inconsistente.
 *
 * Las mutaciones que tocan un nombre de Estrella se restringen a las Estrellas
 * que ningun Segmento referencia, de modo que el documento resultante nunca
 * acumula un segundo defecto.
 */
export function genMutacionCatalogo(catalogo: CatalogoEstelar): fc.Arbitrary<MutacionCatalogo> {
  const nombres = catalogo.estrellas.map((estrella) => estrella.nombre);
  const referenciados = new Set<string>();
  for (const segmento of catalogo.segmentos) {
    referenciados.add(segmento.desde);
    referenciados.add(segmento.hasta);
  }
  const indicesLibres = nombres
    .map((nombre, indice) => ({ nombre, indice }))
    .filter(({ nombre }) => !referenciados.has(nombre))
    .map(({ indice }) => indice);
  const ausente = nombreAusente(nombres);
  const ultimaEstrella = catalogo.estrellas.length - 1;
  const ultimoSegmento = catalogo.segmentos.length - 1;

  const ramas: fc.WeightedArbitrary<MutacionCatalogo>[] = [];

  // 1. Sintaxis JSON corrupta en una posicion concreta (Requisito 2.2).
  const base = textoDe(documentoDesde(catalogo));
  const posiciones = posicionesEstructurales(base);
  if (posiciones.length > 0) {
    ramas.push({
      weight: 2,
      arbitrary: fc
        .tuple(
          fc.integer({ min: 0, max: posiciones.length - 1 }),
          fc.constantFrom('eliminar', 'cierre-sobrante'),
        )
        .map(([cual, operacion]): MutacionCatalogo => {
          const posicion = posiciones[cual] ?? 0;
          const documento =
            operacion === 'eliminar'
              ? `${base.slice(0, posicion)}${base.slice(posicion + 1)}`
              : `${base.slice(0, posicion)}}${base.slice(posicion)}`;
          return {
            defecto: 'sintaxis',
            descripcion: `${operacion} el caracter estructural de la posicion ${String(posicion)}`,
            documento,
            esperado: { clase: 'sintaxis-invalida', posicion },
          };
        }),
    });
  }

  // 2. Ascension recta, declinacion o magnitud fuera de rango (Requisito 2.3).
  ramas.push({
    weight: 3,
    arbitrary: fc
      .tuple(
        fc.integer({ min: 0, max: ultimaEstrella }),
        fc.constantFrom('ar' as const, 'dec' as const, 'magnitud' as const),
      )
      .chain(([indice, campo]) =>
        fc.constantFrom(...VALORES_FUERA_DE_RANGO[campo]).map((recibido): MutacionCatalogo => {
          const documento = documentoDesde(catalogo);
          const entrada = documento.estrellas[indice];
          const nombre = nombres[indice] ?? '';
          if (entrada !== undefined) {
            entrada[campo] = recibido;
          }
          return {
            defecto: 'fuera-de-rango',
            descripcion: `${campo} de la estrella ${String(indice)} fuera de rango`,
            documento: textoDe(documento),
            esperado: { clase: 'fuera-de-rango', nombre, campo, recibido },
          };
        }),
      ),
  });

  // 3. Campo obligatorio ausente en una Estrella (Requisito 2.9).
  ramas.push({
    weight: 2,
    arbitrary: fc.integer({ min: 0, max: ultimaEstrella }).chain((indice) =>
      fc
        .constantFrom(
          ...(indicesLibres.includes(indice)
            ? (['nombre', 'ar', 'dec', 'magnitud', 'constelacion'] as const)
            : (['ar', 'dec', 'magnitud', 'constelacion'] as const)),
        )
        .map((campo): MutacionCatalogo => {
          const documento = documentoDesde(catalogo);
          const entrada = documento.estrellas[indice];
          if (entrada !== undefined) {
            delete entrada[campo];
          }
          return {
            defecto: 'campo-ausente',
            descripcion: `estrella ${String(indice)} sin el campo ${campo}`,
            documento: textoDe(documento),
            esperado: { clase: 'campo-ausente', indice, campo },
          };
        }),
    ),
  });

  // 4. Nombre o constelacion declarados como cadena vacia (Requisito 2.9).
  ramas.push({
    weight: 2,
    arbitrary: fc.integer({ min: 0, max: ultimaEstrella }).chain((indice) =>
      fc
        .constantFrom(
          ...(indicesLibres.includes(indice)
            ? (['nombre', 'constelacion'] as const)
            : (['constelacion'] as const)),
        )
        .map((campo): MutacionCatalogo => {
          const documento = documentoDesde(catalogo);
          const entrada = documento.estrellas[indice];
          if (entrada !== undefined) {
            entrada[campo] = '';
          }
          return {
            defecto: 'campo-vacio',
            descripcion: `estrella ${String(indice)} con ${campo} vacio`,
            documento: textoDe(documento),
            esperado: { clase: 'campo-ausente', indice, campo },
          };
        }),
    ),
  });

  // 5. Nombre de Estrella duplicado (Requisito 2.10). Se anade una copia de una
  //    Estrella existente: asi los Segmentos siguen siendo consistentes y el
  //    unico defecto es la repeticion del nombre.
  if (catalogo.estrellas.length < MAX_ESTRELLAS) {
    ramas.push({
      weight: 2,
      arbitrary: fc.integer({ min: 0, max: ultimaEstrella }).map((indice): MutacionCatalogo => {
        const documento = documentoDesde(catalogo);
        const original = documento.estrellas[indice];
        const nombre = nombres[indice] ?? '';
        if (original !== undefined) {
          documento.estrellas.push({ ...original });
        }
        return {
          defecto: 'nombre-duplicado',
          descripcion: `copia de la estrella ${String(indice)} al final del catalogo`,
          documento: textoDe(documento),
          esperado: { clase: 'nombre-duplicado', nombre },
        };
      }),
    });
  }

  // 6. Segmento que referencia un nombre ausente (Requisito 2.4).
  const segmentoAusenteAnadido = fc
    .integer({ min: 0, max: ultimaEstrella })
    .map((indice): MutacionCatalogo => {
      const documento = documentoDesde(catalogo);
      const posicion = documento.segmentos.length;
      documento.segmentos.push({ desde: nombres[indice] ?? ausente, hasta: ausente });
      return {
        defecto: 'segmento-ausente',
        descripcion: `segmento nuevo hacia el nombre ausente ${ausente}`,
        documento: textoDe(documento),
        esperado: { clase: 'segmento-invalido', posicion, nombre: ausente, motivo: 'ausente' },
      };
    });

  if (catalogo.segmentos.length > 0 && catalogo.segmentos.length < MAX_SEGMENTOS) {
    ramas.push({
      weight: 2,
      arbitrary: fc.oneof(
        segmentoAusenteAnadido,
        fc
          .tuple(
            fc.integer({ min: 0, max: ultimoSegmento }),
            fc.constantFrom('desde' as const, 'hasta' as const),
          )
          .map(([posicion, extremo]): MutacionCatalogo => {
            const documento = documentoDesde(catalogo);
            const entrada = documento.segmentos[posicion];
            if (entrada !== undefined) {
              entrada[extremo] = ausente;
            }
            return {
              defecto: 'segmento-ausente',
              descripcion: `segmento ${String(posicion)} con ${extremo} ausente`,
              documento: textoDe(documento),
              esperado: { clase: 'segmento-invalido', posicion, nombre: ausente, motivo: 'ausente' },
            };
          }),
      ),
    });
  } else if (catalogo.segmentos.length < MAX_SEGMENTOS) {
    ramas.push({ weight: 2, arbitrary: segmentoAusenteAnadido });
  }

  // 7. Segmento degenerado, con el mismo nombre en sus dos extremos
  //    (Requisito 2.4).
  if (catalogo.segmentos.length < MAX_SEGMENTOS) {
    ramas.push({
      weight: 2,
      arbitrary: fc.integer({ min: 0, max: ultimaEstrella }).map((indice): MutacionCatalogo => {
        const documento = documentoDesde(catalogo);
        const nombre = nombres[indice] ?? '';
        const posicion = documento.segmentos.length;
        documento.segmentos.push({ desde: nombre, hasta: nombre });
        return {
          defecto: 'segmento-repetido',
          descripcion: `segmento degenerado sobre ${nombre}`,
          documento: textoDe(documento),
          esperado: { clase: 'segmento-invalido', posicion, nombre, motivo: 'repetido' },
        };
      }),
    });
  }

  return fc.oneof(...ramas);
}

/** Clase de defecto que `genMutacion` puede introducir en la configuracion. */
export type DefectoConfiguracion =
  | 'campo-ausente'
  | 'instante-formato'
  | 'instante-desplazamiento'
  | 'hash-invalido'
  | 'latitud-fuera-de-rango'
  | 'longitud-fuera-de-rango';

/**
 * Archivo_Configuracion con **exactamente un** defecto, para la Propiedad 31.
 * El validador de construccion debe detenerse y nombrar `campo`.
 */
export interface MutacionConfiguracion {
  readonly defecto: DefectoConfiguracion;
  /** Descripcion legible del defecto. */
  readonly descripcion: string;
  /** Ruta del campo afectado, p. ej. `carta.saludo` o `lugarGraduacion.latitud`. */
  readonly campo: string;
  /** Valor tras la mutacion; `undefined` cuando el campo se omitio. */
  readonly recibido: unknown;
  /** Configuracion mutada, lista para entregarsela al validador. */
  readonly configuracion: Record<string, unknown>;
}

/** Campos cuya ausencia detiene la construccion (Requisito 8.3). */
const CAMPOS_OBLIGATORIOS = [
  'hashClave',
  'instanteGraduacion',
  'lugarGraduacion',
  'carta.saludo',
  'carta.parrafos',
  'carta.firma',
] as const;

/** Desplazamientos horarios distintos de -05:00 (Requisito 8.4). */
const DESPLAZAMIENTOS_AJENOS = ['Z', '+00:00', '-04:00', '-06:00', '+05:00', '-05:30'] as const;

/** Instantes que no cumplen el formato ISO 8601 con desplazamiento. */
const INSTANTES_MAL_FORMADOS = [
  '',
  'ayer por la tarde',
  '12/12/2025 10:00',
  '2025-12-12',
  '2025-12-12T10:00:00',
  '2025-12-12 10:00:00-05:00',
  '2025-12-12T10:00:00-5:00',
  '2025-13-45T10:00:00-05:00',
] as const;

function clonarConfiguracion(configuracion: ConfiguracionRegalo): Record<string, unknown> {
  return JSON.parse(JSON.stringify(configuracion)) as Record<string, unknown>;
}

/** Recorre una ruta con puntos y devuelve el objeto que contiene la hoja. */
function contenedorDe(objeto: Record<string, unknown>, ruta: string): Record<string, unknown> | null {
  const partes = ruta.split('.');
  let actual = objeto;
  for (const parte of partes.slice(0, -1)) {
    const siguiente = actual[parte];
    if (typeof siguiente !== 'object' || siguiente === null || Array.isArray(siguiente)) {
      return null;
    }
    actual = siguiente as Record<string, unknown>;
  }
  return actual;
}

function hojaDe(ruta: string): string {
  const partes = ruta.split('.');
  return partes[partes.length - 1] ?? ruta;
}

function fijarEn(objeto: Record<string, unknown>, ruta: string, valor: unknown): void {
  const contenedor = contenedorDe(objeto, ruta);
  if (contenedor !== null) {
    contenedor[hojaDe(ruta)] = valor;
  }
}

function omitirEn(objeto: Record<string, unknown>, ruta: string): void {
  const contenedor = contenedorDe(objeto, ruta);
  if (contenedor !== null) {
    delete contenedor[hojaDe(ruta)];
  }
}

/**
 * Sustituye el desplazamiento horario final de un Instante_Graduacion. Si la
 * cadena no termina en `-05:00`, se compone un instante valido de referencia
 * para que la mutacion siga siendo un solo defecto.
 */
function conOtroDesplazamiento(iso: string, desplazamiento: string): string {
  const fecha = iso.endsWith(DESPLAZAMIENTO_COLOMBIA)
    ? iso.slice(0, -DESPLAZAMIENTO_COLOMBIA.length)
    : '2025-12-12T10:00:00';
  return `${fecha}${desplazamiento}`;
}

/**
 * Introduce en un Archivo_Configuracion valido exactamente uno de los defectos
 * que enumera la Propiedad 31: omitir un campo obligatorio, romper el formato o
 * el desplazamiento del Instante_Graduacion, invalidar el Hash_Clave o sacar de
 * rango la latitud o la longitud.
 */
export function genMutacionConfiguracion(
  configuracion: ConfiguracionRegalo,
): fc.Arbitrary<MutacionConfiguracion> {
  const hashValido = configuracion.hashClave;

  const genHashInvalido: fc.Arbitrary<string> = fc.oneof(
    fc.constant(hashValido.slice(0, hashValido.length - 1)),
    fc.constant(`${hashValido}0`),
    fc.constant(''),
    fc.constantFrom(
      'F0'.repeat(32),
      'ABCDEF0123456789'.repeat(4),
      'z'.repeat(64),
      '0123456789abcdef'.repeat(3),
      '0123456789abcdef'.repeat(5),
    ),
    fc
      .integer({ min: 0, max: Math.max(0, hashValido.length - 1) })
      .map(
        (indice) =>
          `${hashValido.slice(0, indice)}z${hashValido.slice(indice + 1)}`,
      ),
  );

  return fc.oneof(
    {
      weight: 3,
      arbitrary: fc.constantFrom(...CAMPOS_OBLIGATORIOS).map((campo): MutacionConfiguracion => {
        const mutada = clonarConfiguracion(configuracion);
        omitirEn(mutada, campo);
        return {
          defecto: 'campo-ausente',
          descripcion: `sin el campo obligatorio ${campo}`,
          campo,
          recibido: undefined,
          configuracion: mutada,
        };
      }),
    },
    {
      weight: 2,
      arbitrary: fc.constantFrom(...INSTANTES_MAL_FORMADOS).map((recibido): MutacionConfiguracion => {
        const mutada = clonarConfiguracion(configuracion);
        fijarEn(mutada, 'instanteGraduacion', recibido);
        return {
          defecto: 'instante-formato',
          descripcion: `instanteGraduacion mal formado: ${JSON.stringify(recibido)}`,
          campo: 'instanteGraduacion',
          recibido,
          configuracion: mutada,
        };
      }),
    },
    {
      weight: 2,
      arbitrary: fc
        .constantFrom(...DESPLAZAMIENTOS_AJENOS)
        .map((desplazamiento): MutacionConfiguracion => {
          const recibido = conOtroDesplazamiento(configuracion.instanteGraduacion, desplazamiento);
          const mutada = clonarConfiguracion(configuracion);
          fijarEn(mutada, 'instanteGraduacion', recibido);
          return {
            defecto: 'instante-desplazamiento',
            descripcion: `instanteGraduacion con desplazamiento ${desplazamiento}`,
            campo: 'instanteGraduacion',
            recibido,
            configuracion: mutada,
          };
        }),
    },
    {
      weight: 2,
      arbitrary: genHashInvalido.map((recibido): MutacionConfiguracion => {
        const mutada = clonarConfiguracion(configuracion);
        fijarEn(mutada, 'hashClave', recibido);
        return {
          defecto: 'hash-invalido',
          descripcion: `hashClave de ${String(recibido.length)} caracteres o con caracteres no hexadecimales minusculos`,
          campo: 'hashClave',
          recibido,
          configuracion: mutada,
        };
      }),
    },
    {
      weight: 2,
      arbitrary: fc
        .constantFrom(90.000001, -90.000001, 91, -91, 180, 1000)
        .map((recibido): MutacionConfiguracion => {
          const mutada = clonarConfiguracion(configuracion);
          fijarEn(mutada, 'lugarGraduacion.latitud', recibido);
          return {
            defecto: 'latitud-fuera-de-rango',
            descripcion: `latitud ${String(recibido)}`,
            campo: 'lugarGraduacion.latitud',
            recibido,
            configuracion: mutada,
          };
        }),
    },
    {
      weight: 2,
      arbitrary: fc
        .constantFrom(180.000001, -180.000001, 181, -181, 360, -1000)
        .map((recibido): MutacionConfiguracion => {
          const mutada = clonarConfiguracion(configuracion);
          fijarEn(mutada, 'lugarGraduacion.longitud', recibido);
          return {
            defecto: 'longitud-fuera-de-rango',
            descripcion: `longitud ${String(recibido)}`,
            campo: 'lugarGraduacion.longitud',
            recibido,
            configuracion: mutada,
          };
        }),
    },
  );
}

/**
 * Toma un Catalogo_Estelar o un Archivo_Configuracion **validos** y devuelve un
 * generador de versiones con exactamente un defecto. Es la generadora que usan
 * la Propiedad 6 (catalogo) y la Propiedad 31 (configuracion).
 */
export function genMutacion(catalogo: CatalogoEstelar): fc.Arbitrary<MutacionCatalogo>;
export function genMutacion(configuracion: ConfiguracionRegalo): fc.Arbitrary<MutacionConfiguracion>;
export function genMutacion(
  objetivo: CatalogoEstelar | ConfiguracionRegalo,
): fc.Arbitrary<MutacionCatalogo> | fc.Arbitrary<MutacionConfiguracion> {
  return 'estrellas' in objetivo
    ? genMutacionCatalogo(objetivo)
    : genMutacionConfiguracion(objetivo);
}
