/**
 * Generador del Catalogo_Estelar publicado (`public/datos/catalogo-estelar.json`).
 *
 * Ejecuta, **sin red** y de forma reproducible, la tuberia del diseno:
 *
 * 1. Filtra el volcado HYG v3 por magnitud aparente <= 5.5 y descarta el Sol.
 * 2. Asigna a cada estrella un `nombre` unico y no vacio con la precedencia
 *    nombre propio -> designacion Bayer -> designacion Flamsteed -> `HIP <n>`,
 *    con un sufijo determinista ante colision (evita el error del Requisito
 *    2.10 de raiz).
 * 3. Copia `ar` (horas), `dec` (grados), `magnitud` y `constelacion` (nombre en
 *    espanol cuando existe traduccion estable; si no, la abreviatura IAU).
 * 4. Resuelve cada par de numeros HIP de las lineas de constelacion a los
 *    nombres del paso 2, **descartando** los segmentos con algun extremo
 *    ausente y los degenerados (evita de raiz los errores de los Requisitos 2.4
 *    y 2.9).
 * 5. Verifica la ida y vuelta **antes** de escribir: serializa con el
 *    Serializador_Catalogo, relee con el Lector_Catalogo, vuelve a serializar y
 *    a releer, y termina con error si alguna relectura falla o no es
 *    equivalente (Requisitos 2.6 y 2.7).
 * 6. Solo entonces escribe `public/datos/catalogo-estelar.json`.
 *
 * Uso:
 *   npm run generar-catalogo
 *
 * Las fuentes viven en `datos-fuente/` y se documentan en
 * `datos-fuente/CREDITOS.md`. Si falta alguna, el guion termina con error e
 * indica la ruta esperada y como obtenerla; nunca inventa datos astronomicos.
 *
 * La logica vive en funciones exportadas para que las pruebas la ejerciten sin
 * lanzar un proceso ni tocar el disco.
 *
 * Requisitos: 2.1, 2.5, 2.6, 2.7.
 */

import { gunzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_ESTRELLAS,
  MAX_LONGITUD_TEXTO,
  MAX_SEGMENTOS,
  MIN_ESTRELLAS,
  leerCatalogo,
} from '../src/nucleo/catalogo/lector.js';
import type { CatalogoEstelar, Estrella, Segmento } from '../src/nucleo/catalogo/modelo.js';
import { serializarCatalogo } from '../src/nucleo/catalogo/serializador.js';

// --- Constantes de la tuberia -----------------------------------------------

/** Corte de magnitud aparente del paso 1 del diseno. */
export const MAGNITUD_MAXIMA = 5.5;

/** Magnitud minima admitida por el Lector_Catalogo (Requisito 2.3). */
export const MAGNITUD_MINIMA = -1.5;

/** Tolerancia de equivalencia de la ida y vuelta (Requisitos 2.6 y 2.7). */
export const TOLERANCIA = 1e-6;

/** Identificador del Sol en HYG v3; se descarta del catalogo (paso 1). */
export const ID_SOL = '0';

/** Raiz del repositorio, deducida de la ubicacion de este modulo. */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Volcado HYG v3, comprimido tal como lo publica el repositorio de origen. */
export const RUTA_HYG_GZ = resolve(RAIZ, 'datos-fuente', 'hyg_v38.csv.gz');

/** Volcado HYG v3 ya descomprimido, si se prefiere tenerlo en claro. */
export const RUTA_HYG_CSV = resolve(RAIZ, 'datos-fuente', 'hyg_v38.csv');

/** Pares de numeros HIP de las figuras de linea de las constelaciones. */
export const RUTA_LINEAS = resolve(RAIZ, 'datos-fuente', 'lineas-constelacion-hip.json');

/** Documento publicado, servido como archivo estatico junto al HTML. */
export const RUTA_SALIDA = resolve(RAIZ, 'public', 'datos', 'catalogo-estelar.json');

/**
 * Linea de creditos que viaja dentro del catalogo. La clausula ShareAlike de
 * CC BY-SA 2.5 obliga a distribuir el archivo generado bajo la misma licencia y
 * con atribucion visible; la Pagina_Regalo la muestra con los colores de la
 * Paleta_Regalo.
 */
export const ATRIBUCION =
  'Estrellas: HYG Database v3 (astronexus), CC BY-SA 2.5. ' +
  'Lineas de constelacion: d3-celestial (ofrohn), BSD-3-Clause. ' +
  'Este catalogo se distribuye bajo CC BY-SA 2.5.';

/** Instrucciones que acompanan la ausencia de una fuente. */
export const AYUDA_FUENTES = [
  'Fuentes esperadas en datos-fuente/ (ver datos-fuente/CREDITOS.md):',
  `  - ${RUTA_HYG_GZ} (o ${RUTA_HYG_CSV})`,
  '      HYG Database v3, CC BY-SA 2.5. Obtener con:',
  '      curl -sSL -o datos-fuente/hyg_v38.csv.gz \\',
  '        https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/v3/hyg_v38.csv.gz',
  `  - ${RUTA_LINEAS}`,
  '      Pares de numeros HIP derivados de d3-celestial, BSD-3-Clause. Rederivar con:',
  '      curl -sSL -o datos-fuente/constellations.lines.json \\',
  '        https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json',
  '      curl -sSL -o /tmp/stars.8.json \\',
  '        https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/stars.8.json',
  '      node datos-fuente/derivar-lineas-hip.mjs datos-fuente/constellations.lines.json /tmp/stars.8.json',
].join('\n');

// --- Nombres en espanol -----------------------------------------------------

/**
 * Nombre en espanol de las 88 constelaciones IAU, por abreviatura de tres
 * letras. Las que no aparecen conservan su abreviatura (paso 3 del diseno).
 */
export const CONSTELACIONES: Readonly<Record<string, string>> = {
  And: 'Andromeda',
  Ant: 'Maquina Neumatica',
  Aps: 'Ave del Paraiso',
  Aqr: 'Acuario',
  Aql: 'Aguila',
  Ara: 'Altar',
  Ari: 'Aries',
  Aur: 'Auriga',
  Boo: 'Boyero',
  Cae: 'Buril',
  Cam: 'Jirafa',
  Cnc: 'Cancer',
  CVn: 'Lebreles',
  CMa: 'Can Mayor',
  CMi: 'Can Menor',
  Cap: 'Capricornio',
  Car: 'Quilla',
  Cas: 'Casiopea',
  Cen: 'Centauro',
  Cep: 'Cefeo',
  Cet: 'Ballena',
  Cha: 'Camaleon',
  Cir: 'Compas',
  Col: 'Paloma',
  Com: 'Cabellera de Berenice',
  CrA: 'Corona Austral',
  CrB: 'Corona Boreal',
  Crv: 'Cuervo',
  Crt: 'Copa',
  Cru: 'Cruz del Sur',
  Cyg: 'Cisne',
  Del: 'Delfin',
  Dor: 'Dorado',
  Dra: 'Dragon',
  Equ: 'Caballo Menor',
  Eri: 'Eridano',
  For: 'Horno',
  Gem: 'Geminis',
  Gru: 'Grulla',
  Her: 'Hercules',
  Hor: 'Reloj',
  Hya: 'Hidra',
  Hyi: 'Hidra Macho',
  Ind: 'Indio',
  Lac: 'Lagarto',
  Leo: 'Leo',
  LMi: 'Leon Menor',
  Lep: 'Liebre',
  Lib: 'Libra',
  Lup: 'Lobo',
  Lyn: 'Lince',
  Lyr: 'Lira',
  Men: 'Mesa',
  Mic: 'Microscopio',
  Mon: 'Unicornio',
  Mus: 'Mosca',
  Nor: 'Escuadra',
  Oct: 'Octante',
  Oph: 'Ofiuco',
  Ori: 'Orion',
  Pav: 'Pavo',
  Peg: 'Pegaso',
  Per: 'Perseo',
  Phe: 'Fenix',
  Pic: 'Pintor',
  Psc: 'Piscis',
  PsA: 'Pez Austral',
  Pup: 'Popa',
  Pyx: 'Brujula',
  Ret: 'Reticulo',
  Sge: 'Flecha',
  Sgr: 'Sagitario',
  Sco: 'Escorpio',
  Scl: 'Escultor',
  Sct: 'Escudo',
  Ser: 'Serpiente',
  Sex: 'Sextante',
  Tau: 'Tauro',
  Tel: 'Telescopio',
  Tri: 'Triangulo',
  TrA: 'Triangulo Austral',
  Tuc: 'Tucan',
  UMa: 'Osa Mayor',
  UMi: 'Osa Menor',
  Vel: 'Vela',
  Vir: 'Virgo',
  Vol: 'Pez Volador',
  Vul: 'Zorra',
};

/** Letra griega en espanol, por la abreviatura de tres letras de HYG. */
export const LETRAS_GRIEGAS: Readonly<Record<string, string>> = {
  Alp: 'Alfa',
  Bet: 'Beta',
  Gam: 'Gamma',
  Del: 'Delta',
  Eps: 'Epsilon',
  Zet: 'Zeta',
  Eta: 'Eta',
  The: 'Theta',
  Iot: 'Iota',
  Kap: 'Kappa',
  Lam: 'Lambda',
  Mu: 'Mu',
  Nu: 'Nu',
  Xi: 'Xi',
  Omi: 'Omicron',
  Pi: 'Pi',
  Rho: 'Rho',
  Sig: 'Sigma',
  Tau: 'Tau',
  Ups: 'Ipsilon',
  Phi: 'Phi',
  Chi: 'Chi',
  Psi: 'Psi',
  Ome: 'Omega',
};

/** Nombre en espanol de la constelacion, o su abreviatura IAU si no hay. */
export function nombreConstelacion(abreviatura: string): string {
  const limpio = abreviatura.trim();
  return CONSTELACIONES[limpio] ?? limpio;
}

/**
 * Designacion Bayer legible: la letra griega en espanol, el indice superior
 * cuando HYG lo declara (`Alp-1` -> `Alfa-1`) y la **abreviatura IAU** de la
 * constelacion, que es la forma estandar de la designacion (`Theta Oct`). El
 * nombre en espanol de la constelacion viaja aparte, en el campo
 * `constelacion`, y mezclarlo aqui produciria hibridos como `Theta Octante`.
 */
export function designacionBayer(bayer: string, abreviaturaIau: string): string | null {
  const limpio = bayer.trim();
  if (limpio.length === 0) return null;
  const partes = limpio.split('-');
  const raiz = partes[0] ?? '';
  const indice = partes[1];
  const letra = LETRAS_GRIEGAS[raiz];
  if (letra === undefined) return null;
  const conIndice = indice === undefined ? letra : `${letra}-${indice}`;
  return `${conIndice} ${abreviaturaIau}`;
}

// --- Lectura del volcado HYG -----------------------------------------------

/** Fila de HYG v3, reducida a los campos que usa la tuberia. */
export interface FilaHyg {
  readonly id: string;
  readonly hip: string;
  readonly hd: string;
  readonly gl: string;
  readonly proper: string;
  readonly bayer: string;
  readonly flam: string;
  readonly con: string;
  readonly ra: number;
  readonly dec: number;
  readonly mag: number;
}

/**
 * Analizador CSV minimo conforme a RFC 4180: comas separadoras, campos entre
 * comillas dobles y `""` como comilla escapada. Devuelve la cabecera y las
 * filas como arreglos de celdas.
 */
export function analizarCsv(texto: string): readonly (readonly string[])[] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let enComillas = false;

  for (let indice = 0; indice < texto.length; indice += 1) {
    const caracter = texto[indice];
    if (enComillas) {
      if (caracter === '"') {
        if (texto[indice + 1] === '"') {
          celda += '"';
          indice += 1;
        } else {
          enComillas = false;
        }
      } else {
        celda += caracter;
      }
      continue;
    }
    if (caracter === '"') {
      enComillas = true;
      continue;
    }
    if (caracter === ',') {
      fila.push(celda);
      celda = '';
      continue;
    }
    if (caracter === '\n' || caracter === '\r') {
      if (caracter === '\r' && texto[indice + 1] === '\n') indice += 1;
      fila.push(celda);
      celda = '';
      filas.push(fila);
      fila = [];
      continue;
    }
    celda += caracter;
  }
  if (celda.length > 0 || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.filter((entrada) => entrada.length > 1);
}

/**
 * Convierte el CSV de HYG v3 en filas tipadas. Las entradas cuyos campos
 * numericos no son finitos se omiten: el volcado incluye estrellas sin
 * fotometria completa que no pueden dibujarse.
 */
export function leerFilasHyg(textoCsv: string): readonly FilaHyg[] {
  const filas = analizarCsv(textoCsv);
  const cabecera = filas[0];
  if (cabecera === undefined) return [];

  const columna = new Map<string, number>();
  cabecera.forEach((nombre, indice) => {
    columna.set(nombre.trim(), indice);
  });

  const celda = (fila: readonly string[], nombre: string): string => {
    const indice = columna.get(nombre);
    if (indice === undefined) return '';
    return fila[indice] ?? '';
  };

  const resultado: FilaHyg[] = [];
  for (let indice = 1; indice < filas.length; indice += 1) {
    const fila = filas[indice];
    if (fila === undefined) continue;
    const ra = Number(celda(fila, 'ra'));
    const dec = Number(celda(fila, 'dec'));
    const mag = Number(celda(fila, 'mag'));
    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(mag)) continue;
    resultado.push({
      id: celda(fila, 'id').trim(),
      hip: celda(fila, 'hip').trim(),
      hd: celda(fila, 'hd').trim(),
      gl: celda(fila, 'gl').trim(),
      proper: celda(fila, 'proper').trim(),
      bayer: celda(fila, 'bayer').trim(),
      flam: celda(fila, 'flam').trim(),
      con: celda(fila, 'con').trim(),
      ra,
      dec,
      mag,
    });
  }
  return resultado;
}

// --- Pasos 1 a 3: estrellas -------------------------------------------------

/**
 * Paso 1: magnitud aparente en [-1.5, 5.5] y sin el Sol. El limite inferior es
 * el del Lector_Catalogo (Requisito 2.3): el Sol, con magnitud -26.7, es la
 * unica entrada de HYG que lo cruza, y ya se descarta por identificador.
 *
 * El orden de salida es el del volcado (identificador HYG creciente), de modo
 * que la asignacion de nombres del paso 2 sea reproducible.
 */
export function filtrarPorMagnitud(filas: readonly FilaHyg[]): readonly FilaHyg[] {
  return filas.filter(
    (fila) =>
      fila.id !== ID_SOL &&
      fila.proper.toLowerCase() !== 'sol' &&
      fila.mag <= MAGNITUD_MAXIMA &&
      fila.mag >= MAGNITUD_MINIMA,
  );
}

/**
 * Paso 2, primera mitad: nombre base por precedencia, sin resolver colisiones.
 *
 * El diseno cierra la precedencia en `HIP <n>`. Diecisiete entradas de HYG v3
 * dentro del corte de magnitud carecen de numero HIP (provienen de los
 * catalogos Henry Draper y Gliese-Jahreiss), asi que la cadena se prolonga con
 * `HD <n>`, `Gliese <n>` y, como ultimo recurso, `HYG <id>`. Ninguna de esas
 * formas puede quedar vacia, con lo que el Requisito 2.9 esta cubierto.
 */
export function nombreBase(fila: FilaHyg): string {
  if (fila.proper.length > 0) return fila.proper;

  const abreviatura = fila.con.trim();
  const bayer = designacionBayer(fila.bayer, abreviatura);
  if (bayer !== null) return bayer;

  if (fila.flam.length > 0) return `${fila.flam} ${abreviatura}`;
  if (fila.hip.length > 0) return `HIP ${fila.hip}`;
  if (fila.hd.length > 0) return `HD ${fila.hd}`;
  if (fila.gl.length > 0) return `Gliese ${fila.gl}`;
  return `HYG ${fila.id}`;
}

/**
 * Recorta un nombre al maximo del Lector_Catalogo dejando sitio para el sufijo
 * de desambiguacion (Requisito 2.1).
 */
function recortar(nombre: string, reserva: number): string {
  const maximo = MAX_LONGITUD_TEXTO - reserva;
  return nombre.length <= maximo ? nombre : nombre.slice(0, maximo);
}

/**
 * Paso 2, segunda mitad, y paso 3: estrellas con nombre unico y no vacio, mas
 * el indice de numero HIP a nombre que necesita el paso 4.
 *
 * Ante colision anade el sufijo determinista ` (2)`, ` (3)`, ... segun el orden
 * de entrada, con lo que el documento generado nunca puede violar el Requisito
 * 2.10. Si un nombre base rebasa los 64 caracteres se recorta antes de
 * desambiguar.
 */
export function asignarNombres(filas: readonly FilaHyg[]): {
  readonly estrellas: readonly Estrella[];
  readonly porHip: ReadonlyMap<number, string>;
  readonly colisiones: number;
} {
  const estrellas: Estrella[] = [];
  const porHip = new Map<number, string>();
  const usados = new Set<string>();
  let colisiones = 0;

  for (const fila of filas) {
    const base = recortar(nombreBase(fila), 0);
    let nombre = base;
    if (usados.has(nombre)) {
      colisiones += 1;
      // El sufijo mas largo previsible es ` (99)`: cinco caracteres.
      const raiz = recortar(base, 5);
      let orden = 2;
      do {
        nombre = `${raiz} (${String(orden)})`;
        orden += 1;
      } while (usados.has(nombre));
    }
    usados.add(nombre);

    estrellas.push({
      nombre,
      ar: fila.ra,
      dec: fila.dec,
      magnitud: fila.mag,
      constelacion: recortar(nombreConstelacion(fila.con), 0),
    });

    const hip = Number(fila.hip);
    if (fila.hip.length > 0 && Number.isInteger(hip) && !porHip.has(hip)) {
      porHip.set(hip, nombre);
    }
  }

  return { estrellas, porHip, colisiones };
}

// --- Paso 4: segmentos ------------------------------------------------------

/**
 * Analiza el documento de lineas y devuelve sus pares de numeros HIP.
 *
 * Forma esperada: un objeto con la clave `segmentos`, un arreglo de pares de
 * enteros. Las entradas que no son un par de enteros se ignoran; la ausencia
 * del arreglo es un error, porque significa que la fuente no es la esperada.
 */
export function leerLineasHip(textoJson: string): readonly (readonly [number, number])[] {
  const documento = JSON.parse(textoJson) as unknown;
  if (typeof documento !== 'object' || documento === null) {
    throw new Error('El documento de lineas de constelacion no es un objeto JSON.');
  }
  const crudos = (documento as { segmentos?: unknown }).segmentos;
  if (!Array.isArray(crudos)) {
    throw new Error('El documento de lineas de constelacion no declara el arreglo "segmentos".');
  }

  const pares: [number, number][] = [];
  for (const crudo of crudos as readonly unknown[]) {
    if (!Array.isArray(crudo) || crudo.length !== 2) continue;
    const desde = Number(crudo[0]);
    const hasta = Number(crudo[1]);
    if (!Number.isInteger(desde) || !Number.isInteger(hasta)) continue;
    pares.push([desde, hasta]);
  }
  return pares;
}

/**
 * Paso 4: traduce los pares de numeros HIP a nombres del catalogo.
 *
 * Descarta el segmento si alguno de sus extremos falta del indice (la estrella
 * quedo fuera por el corte de magnitud) y si ambos extremos resuelven al mismo
 * nombre, de modo que el documento generado nunca viole los Requisitos 2.4 ni
 * 2.9. Tambien descarta los duplicados no orientados: un Segmento no tiene
 * direccion, asi que `{a, b}` y `{b, a}` describen la misma linea.
 */
export function resolverSegmentos(
  pares: readonly (readonly [number, number])[],
  porHip: ReadonlyMap<number, string>,
): {
  readonly segmentos: readonly Segmento[];
  readonly descartadosPorExtremoAusente: number;
  readonly descartadosPorDegenerado: number;
  readonly descartadosPorDuplicado: number;
} {
  const segmentos: Segmento[] = [];
  const vistos = new Set<string>();
  let descartadosPorExtremoAusente = 0;
  let descartadosPorDegenerado = 0;
  let descartadosPorDuplicado = 0;

  for (const [hipDesde, hipHasta] of pares) {
    const desde = porHip.get(hipDesde);
    const hasta = porHip.get(hipHasta);
    if (desde === undefined || hasta === undefined) {
      descartadosPorExtremoAusente += 1;
      continue;
    }
    if (desde === hasta) {
      descartadosPorDegenerado += 1;
      continue;
    }
    const llave = desde < hasta ? `${desde}\u0000${hasta}` : `${hasta}\u0000${desde}`;
    if (vistos.has(llave)) {
      descartadosPorDuplicado += 1;
      continue;
    }
    vistos.add(llave);
    segmentos.push({ desde, hasta });
  }

  return {
    segmentos,
    descartadosPorExtremoAusente,
    descartadosPorDegenerado,
    descartadosPorDuplicado,
  };
}

// --- Paso 5: verificacion de ida y vuelta -----------------------------------

/** Clave no orientada de un Segmento, para comparar conjuntos de lineas. */
function llaveSegmento(segmento: Segmento): string {
  return segmento.desde < segmento.hasta
    ? `${segmento.desde}\u0000${segmento.hasta}`
    : `${segmento.hasta}\u0000${segmento.desde}`;
}

/**
 * Criterio de equivalencia de los Requisitos 2.6 y 2.7: misma cantidad de
 * elementos, mismo conjunto de nombres de estrella, mismo conjunto de pares de
 * nombres de segmento y diferencia absoluta <= 1e-6 en `ar`, `dec` y
 * `magnitud`.
 *
 * @returns Las diferencias encontradas; vacio significa equivalentes.
 */
export function diferencias(
  esperado: CatalogoEstelar,
  obtenido: CatalogoEstelar,
): readonly string[] {
  const problemas: string[] = [];

  if (esperado.estrellas.length !== obtenido.estrellas.length) {
    problemas.push(
      `cantidad de estrellas: se esperaban ${String(esperado.estrellas.length)}, se leyeron ${String(obtenido.estrellas.length)}`,
    );
  }
  if (esperado.segmentos.length !== obtenido.segmentos.length) {
    problemas.push(
      `cantidad de segmentos: se esperaban ${String(esperado.segmentos.length)}, se leyeron ${String(obtenido.segmentos.length)}`,
    );
  }
  if (esperado.atribucion !== obtenido.atribucion) {
    problemas.push('la atribucion no sobrevivio la ida y vuelta');
  }

  const porNombre = new Map(obtenido.estrellas.map((estrella) => [estrella.nombre, estrella]));
  for (const estrella of esperado.estrellas) {
    const releida = porNombre.get(estrella.nombre);
    if (releida === undefined) {
      problemas.push(`estrella ausente tras la relectura: ${estrella.nombre}`);
      continue;
    }
    const campos: readonly (readonly ['ar' | 'dec' | 'magnitud', number, number])[] = [
      ['ar', estrella.ar, releida.ar],
      ['dec', estrella.dec, releida.dec],
      ['magnitud', estrella.magnitud, releida.magnitud],
    ];
    for (const [campo, original, leido] of campos) {
      const delta = Math.abs(original - leido);
      if (!(delta <= TOLERANCIA)) {
        problemas.push(
          `${estrella.nombre}: ${campo} difiere en ${delta.toExponential(3)} (> ${TOLERANCIA.toExponential(0)})`,
        );
      }
    }
  }

  const llavesLeidas = new Set(obtenido.segmentos.map(llaveSegmento));
  for (const segmento of esperado.segmentos) {
    if (!llavesLeidas.has(llaveSegmento(segmento))) {
      problemas.push(`segmento ausente tras la relectura: ${segmento.desde} - ${segmento.hasta}`);
    }
  }

  return problemas;
}

/** Desenlace de la verificacion del paso 5. */
export type ResultadoVerificacion =
  | { readonly ok: true; readonly documento: string }
  | { readonly ok: false; readonly problemas: readonly string[] };

/**
 * Paso 5: serializa, relee, vuelve a serializar y a releer.
 *
 * La primera vuelta es la propiedad del Requisito 2.6 (objetos -> documento ->
 * objetos) y la segunda la del Requisito 2.7 (documento -> objetos ->
 * documento -> objetos). Solo si ambas son equivalentes devuelve el documento
 * listo para escribir.
 */
export function verificarIdaYVuelta(catalogo: CatalogoEstelar): ResultadoVerificacion {
  const documento = serializarCatalogo(catalogo);

  const primera = leerCatalogo(documento);
  if (!primera.ok) {
    return {
      ok: false,
      problemas: [`la relectura del documento fallo: ${JSON.stringify(primera.error)}`],
    };
  }

  const problemas = [...diferencias(catalogo, primera.catalogo)];

  const reserializado = serializarCatalogo(primera.catalogo);
  const segunda = leerCatalogo(reserializado);
  if (!segunda.ok) {
    problemas.push(`la segunda relectura fallo: ${JSON.stringify(segunda.error)}`);
    return { ok: false, problemas };
  }
  problemas.push(...diferencias(primera.catalogo, segunda.catalogo));
  if (reserializado !== documento) {
    problemas.push('la reserializacion no reprodujo el mismo documento');
  }

  if (problemas.length > 0) {
    return { ok: false, problemas };
  }
  return { ok: true, documento };
}

// --- Tuberia completa -------------------------------------------------------

/** Cuentas de la generacion, para el informe en consola. */
export interface InformeGeneracion {
  readonly estrellas: number;
  readonly segmentos: number;
  readonly colisionesDeNombre: number;
  readonly segmentosDescartadosPorExtremoAusente: number;
  readonly segmentosDescartadosPorDegenerado: number;
  readonly segmentosDescartadosPorDuplicado: number;
}

export type ResultadoGeneracion =
  | {
      readonly ok: true;
      readonly catalogo: CatalogoEstelar;
      readonly documento: string;
      readonly informe: InformeGeneracion;
    }
  | { readonly ok: false; readonly problemas: readonly string[] };

/**
 * Ejecuta los pasos 1 a 5 sobre los textos de las fuentes. Funcion pura: sin
 * E/S, para que las pruebas la ejerciten con muestras pequenas.
 */
export function generarCatalogo(textoCsvHyg: string, textoLineasHip: string): ResultadoGeneracion {
  const filas = filtrarPorMagnitud(leerFilasHyg(textoCsvHyg));
  if (filas.length < MIN_ESTRELLAS) {
    return {
      ok: false,
      problemas: [
        `el volcado HYG no aporto ninguna estrella con magnitud en [${String(MAGNITUD_MINIMA)}, ${String(MAGNITUD_MAXIMA)}]`,
      ],
    };
  }
  if (filas.length > MAX_ESTRELLAS) {
    return {
      ok: false,
      problemas: [
        `el corte de magnitud dejo ${String(filas.length)} estrellas, por encima del maximo de ${String(MAX_ESTRELLAS)} del Lector_Catalogo`,
      ],
    };
  }

  const { estrellas, porHip, colisiones } = asignarNombres(filas);

  let pares: readonly (readonly [number, number])[];
  try {
    pares = leerLineasHip(textoLineasHip);
  } catch (error: unknown) {
    const detalle = error instanceof Error ? error.message : String(error);
    return { ok: false, problemas: [detalle] };
  }

  const resueltos = resolverSegmentos(pares, porHip);
  if (resueltos.segmentos.length > MAX_SEGMENTOS) {
    return {
      ok: false,
      problemas: [
        `se resolvieron ${String(resueltos.segmentos.length)} segmentos, por encima del maximo de ${String(MAX_SEGMENTOS)} del Lector_Catalogo`,
      ],
    };
  }

  const catalogo: CatalogoEstelar = {
    version: 1,
    epoca: 'J2000.0',
    atribucion: ATRIBUCION,
    estrellas,
    segmentos: resueltos.segmentos,
  };

  const verificacion = verificarIdaYVuelta(catalogo);
  if (!verificacion.ok) {
    return { ok: false, problemas: verificacion.problemas };
  }

  return {
    ok: true,
    catalogo,
    documento: verificacion.documento,
    informe: {
      estrellas: estrellas.length,
      segmentos: resueltos.segmentos.length,
      colisionesDeNombre: colisiones,
      segmentosDescartadosPorExtremoAusente: resueltos.descartadosPorExtremoAusente,
      segmentosDescartadosPorDegenerado: resueltos.descartadosPorDegenerado,
      segmentosDescartadosPorDuplicado: resueltos.descartadosPorDuplicado,
    },
  };
}

// --- Comando ----------------------------------------------------------------

/** Lee el volcado HYG, comprimido o en claro, desde `datos-fuente/`. */
export function leerFuenteHyg(): string {
  if (existsSync(RUTA_HYG_CSV)) {
    return readFileSync(RUTA_HYG_CSV, 'utf8');
  }
  if (existsSync(RUTA_HYG_GZ)) {
    return gunzipSync(readFileSync(RUTA_HYG_GZ)).toString('utf8');
  }
  throw new Error(
    `No se encontro el volcado HYG v3 en datos-fuente/.\n\n${AYUDA_FUENTES}\n\n` +
      'El guion no genera datos astronomicos por su cuenta: sin la fuente real no hay catalogo.',
  );
}

/** Lee el documento de lineas de constelacion desde `datos-fuente/`. */
export function leerFuenteLineas(): string {
  if (!existsSync(RUTA_LINEAS)) {
    throw new Error(
      `No se encontro el archivo de lineas de constelacion en datos-fuente/.\n\n${AYUDA_FUENTES}`,
    );
  }
  return readFileSync(RUTA_LINEAS, 'utf8');
}

/** Informe legible de una generacion exitosa. */
export function formatearInforme(informe: InformeGeneracion, destino: string): string {
  return [
    `Catalogo_Estelar generado: ${destino}`,
    `  estrellas: ${String(informe.estrellas)} (magnitud aparente <= ${String(MAGNITUD_MAXIMA)}, sin el Sol)`,
    `  segmentos: ${String(informe.segmentos)}`,
    `  colisiones de nombre resueltas con sufijo: ${String(informe.colisionesDeNombre)}`,
    `  segmentos descartados por extremo ausente: ${String(informe.segmentosDescartadosPorExtremoAusente)}`,
    `  segmentos descartados por degenerados: ${String(informe.segmentosDescartadosPorDegenerado)}`,
    `  segmentos descartados por duplicados: ${String(informe.segmentosDescartadosPorDuplicado)}`,
    '  ida y vuelta verificada antes de escribir (Requisitos 2.6 y 2.7)',
  ].join('\n');
}

/**
 * Lee las fuentes, genera, verifica y escribe. Devuelve el codigo de salida del
 * proceso: 0 cuando el catalogo quedo publicado y 1 cuando no se escribio nada.
 */
export function ejecutar(destino: string = RUTA_SALIDA): number {
  let textoCsv: string;
  let textoLineas: string;
  try {
    textoCsv = leerFuenteHyg();
    textoLineas = leerFuenteLineas();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const resultado = generarCatalogo(textoCsv, textoLineas);
  if (!resultado.ok) {
    console.error('No se genero el Catalogo_Estelar:');
    for (const problema of resultado.problemas.slice(0, 20)) {
      console.error(`  - ${problema}`);
    }
    if (resultado.problemas.length > 20) {
      console.error(`  ... y ${String(resultado.problemas.length - 20)} problemas mas`);
    }
    console.error('\nNo se escribio ningun archivo.');
    return 1;
  }

  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, resultado.documento, 'utf8');
  console.log(formatearInforme(resultado.informe, destino));
  return 0;
}

const rutaDeEsteModulo = fileURLToPath(import.meta.url);
const rutaInvocada = process.argv[1] === undefined ? '' : resolve(process.argv[1]);
if (rutaInvocada === rutaDeEsteModulo) {
  const rutaPedida = process.argv[2];
  process.exit(ejecutar(rutaPedida === undefined ? RUTA_SALIDA : resolve(rutaPedida)));
}
