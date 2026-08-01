/**
 * Rotulo de lugar y fecha del Mapa_Estelar y su texto alternativo.
 *
 * Cobertura de requisitos:
 * - 4.6: {@link rotuloLugarFecha} arma un rotulo con el nombre del
 *   Lugar_Graduacion, la fecha del Instante_Graduacion en dia, mes y ano, y su
 *   hora en formato de 24 horas con horas y minutos, seguida del
 *   desplazamiento `-05:00`.
 * - 7.6: {@link textoAlternativo} produce un texto de entre 80 y 500 caracteres
 *   que nombra el lugar, la fecha y la hora con el desplazamiento `-05:00` y
 *   las constelaciones dibujadas. {@link aplicarTextoAlternativo} lo expone en
 *   el `aria-label` del lienzo, con `role="img"`.
 *
 * Modulo puro salvo {@link aplicarTextoAlternativo}, la unica funcion que toca
 * el DOM: asi las Propiedades 21 y 30 pueden comprobarlo sin navegador.
 *
 * **Sin `Intl` ni `toLocaleString`.** El formato no puede depender de la zona
 * horaria ni de los datos de region del equipo que dibuja: el Instante_Graduacion
 * ya trae su desplazamiento fijo `-05:00` y el resultado debe ser identico en
 * todas partes (Requisito 3.6, y Requisito 8.4 para el desplazamiento). Los
 * campos de fecha y hora se obtienen por dos vias, en este orden:
 *
 * 1. **Del propio texto ISO.** Cuando `iso` tiene la forma canonica
 *    `AAAA-MM-DDTHH:MM(:SS(.mmm))?-05:00`, sus campos ya son la hora de reloj
 *    de Colombia: se leen tal cual, sin construir ningun `Date`. Es la via que
 *    recorre el Archivo_Configuracion real.
 * 2. **De `msUtc`, desplazado exactamente cinco horas.** Si el texto no tiene
 *    esa forma (otro desplazamiento, o campos fuera de rango), se resta
 *    `5 h` a `msUtc` y se leen los campos con los captadores **UTC** de `Date`,
 *    nunca con los locales. Es el mismo procedimiento de
 *    `isoConDesplazamientoColombia` en `pruebas/generadores.ts`.
 *
 * Si `msUtc` no fuera finito y `iso` no se pudiera analizar, la segunda via
 * cae en la epoca Unix vista desde Colombia. Los invariantes de
 * `InstanteGraduacion` y el validador de construccion (Requisitos 8.1, 8.4)
 * excluyen ese caso; la rama existe para no lanzar desde la vista.
 *
 * **Los limites de 80 y 500 caracteres del Requisito 7.6 se cumplen por
 * construccion**, contando unidades de codigo de JavaScript (`String.length`):
 * - Por arriba: la lista de constelaciones se llena de forma voraz, en el orden
 *   de `constelacionesDibujadas` (de mas brillante a menos), y se detiene en la
 *   primera que no quepa; las que quedan fuera se resumen con `y N mas`. El
 *   nombre del lugar se recorta a 120 unidades de codigo, el maximo que admite
 *   el Archivo_Configuracion, de modo que los datos reales nunca se recortan.
 *   Ningun recorte parte un par suplente, asi que un emoji nunca queda a medias.
 * - Por abajo: el encabezado mide 64 unidades de codigo en el peor caso (un
 *   caracter de lugar, dia de un digito, el mes mas corto y medianoche), y a el
 *   se suma siempre una oracion mas: la lista de constelaciones, o
 *   {@link SIN_CONSTELACIONES} cuando no hay ninguna. Eso deja el minimo real en
 *   unas 93 unidades con una sola constelacion de un caracter, y en 120 sin
 *   ninguna. Los {@link COMPLEMENTOS} son la red de seguridad: oraciones
 *   informativas sobre la vista que se anaden si algun cambio de redaccion
 *   futuro dejara el texto por debajo de 80; cada una supera por si sola
 *   cualquier faltante posible.
 */

import type { CieloCalculado, InstanteGraduacion, LugarGraduacion } from '../../nucleo/astronomia/modelo.js';

/** Desplazamiento horario del Instante_Graduacion (Requisitos 4.6, 7.6, 8.4). */
export const DESPLAZAMIENTO_COLOMBIA = '-05:00';

/** El mismo desplazamiento en horas, para pasar de UTC a hora de Colombia. */
export const DESPLAZAMIENTO_HORAS = -5;

/** Nombres de los meses en espanol, indexados de 0 (enero) a 11 (diciembre). */
export const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/** Longitud minima del texto alternativo, en unidades de codigo (Requisito 7.6). */
export const MIN_TEXTO_ALTERNATIVO = 80;

/** Longitud maxima del texto alternativo, en unidades de codigo (Requisito 7.6). */
export const MAX_TEXTO_ALTERNATIVO = 500;

/**
 * Longitud maxima del nombre del lugar dentro del texto alternativo. Coincide
 * con `MAX_NOMBRE_LUGAR` del validador de construccion, asi que el nombre real
 * del Archivo_Configuracion nunca se recorta.
 */
export const MAX_LUGAR_TEXTO_ALTERNATIVO = 120;

/** Nombre de respaldo cuando el Lugar_Graduacion llega sin nombre util. */
export const LUGAR_SIN_NOMBRE = 'el lugar de la ceremonia';

/** Oracion que sustituye a la lista cuando no se dibujo ninguna constelacion. */
export const SIN_CONSTELACIONES =
  'Ninguna constelación quedó completa sobre el horizonte.';

/**
 * Oraciones informativas con las que el texto alternativo alcanza el minimo de
 * 80 caracteres cuando el lugar tiene un nombre muy corto. Describen la vista
 * real: proyeccion estereografica centrada en el cenit y marcas cardinales
 * sobre el borde del Circulo_Horizonte (Requisito 4.7).
 */
export const COMPLEMENTOS = [
  'Vista estereográfica centrada en el cenit, con el norte arriba y el este a la izquierda.',
  'El borde del círculo representa el horizonte, con las marcas cardinales N, E, S y O.',
] as const;

/** Milisegundos de una hora. */
const MS_HORA = 3_600_000;

/**
 * Forma canonica del Instante_Graduacion: fecha y hora locales seguidas del
 * desplazamiento `-05:00`. Los segundos y los milisegundos son opcionales
 * porque el rotulo no los muestra.
 */
const PATRON_ISO_COLOMBIA =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?-05:00$/;

/** Campos de reloj del Instante_Graduacion en hora de Colombia. */
export interface PartesInstante {
  /** Ano con cuatro digitos, p. ej. 2026. */
  readonly anio: number;
  /** Mes de 1 (enero) a 12 (diciembre). */
  readonly mes: number;
  /** Dia del mes, de 1 a 31. */
  readonly dia: number;
  /** Hora de 0 a 23, en formato de 24 horas. */
  readonly hora: number;
  /** Minuto de 0 a 59. */
  readonly minuto: number;
}

/** Rotulo de lugar y fecha del Mapa_Estelar (Requisito 4.6). */
export interface RotuloLugarFecha {
  /** Nombre del Lugar_Graduacion, tal como se muestra. */
  readonly lugar: string;
  /** Fecha en dia, mes y ano, p. ej. `31 de julio de 2026`. */
  readonly fecha: string;
  /** Hora en formato de 24 horas con horas y minutos, p. ej. `18:00`. */
  readonly hora: string;
  /** Desplazamiento horario, siempre `-05:00`. */
  readonly desplazamiento: string;
  /** Campos de reloj de los que salen {@link fecha} y {@link hora}. */
  readonly partes: PartesInstante;
  /** Rotulo completo, la cadena que el mapa dibuja. */
  readonly texto: string;
}

/**
 * Datos que necesita el texto alternativo. `CieloCalculado` los cumple, de modo
 * que el mapa puede pasar el cielo entero sin adaptarlo.
 */
export type DatosTextoAlternativo = Pick<
  CieloCalculado,
  'instante' | 'lugar' | 'constelacionesDibujadas'
>;

/** Dos digitos con cero a la izquierda. */
function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

/**
 * Recorta un texto a lo sumo a `maximo` unidades de codigo sin partir un par
 * suplente, de modo que un emoji nunca queda a medias.
 */
function recortarA(texto: string, maximo: number): string {
  if (maximo <= 0) {
    return '';
  }
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

/**
 * Colapsa todo espacio en blanco a un solo espacio y quita el de los extremos.
 * Un salto de linea dentro de un `aria-label` o de un rotulo dibujado no aporta
 * nada, y el nombre del lugar viene de un archivo escrito a mano.
 */
function normalizarEspacios(texto: string): string {
  return texto.replace(/\s+/gu, ' ').trim();
}

/** Verdadero cuando los campos leidos describen una fecha y hora posibles. */
function partesEnRango(partes: PartesInstante): boolean {
  return (
    partes.mes >= 1 &&
    partes.mes <= 12 &&
    partes.dia >= 1 &&
    partes.dia <= 31 &&
    partes.hora >= 0 &&
    partes.hora <= 23 &&
    partes.minuto >= 0 &&
    partes.minuto <= 59
  );
}

/**
 * Campos de reloj del Instante_Graduacion en hora de Colombia.
 *
 * Funcion pura y libre de zona horaria: lee los campos del texto ISO canonico
 * y, si no lo es, desplaza `msUtc` cinco horas y usa los captadores UTC. Nunca
 * consulta la region ni el reloj del equipo.
 *
 * @param instante Instante_Graduacion con desplazamiento `-05:00`.
 * @returns Ano, mes, dia, hora y minuto de la hora de reloj de Colombia.
 */
export function partesInstante(instante: InstanteGraduacion): PartesInstante {
  const coincidencia = PATRON_ISO_COLOMBIA.exec(instante.iso);

  if (coincidencia !== null) {
    const desdeIso: PartesInstante = {
      anio: Number(coincidencia[1]),
      mes: Number(coincidencia[2]),
      dia: Number(coincidencia[3]),
      hora: Number(coincidencia[4]),
      minuto: Number(coincidencia[5]),
    };
    if (partesEnRango(desdeIso)) {
      return desdeIso;
    }
  }

  const declarado = instante.msUtc;
  const respaldo = Number.isFinite(declarado) ? declarado : Date.parse(instante.iso);
  const msUtc = Number.isFinite(respaldo) ? respaldo : 0;
  const local = new Date(msUtc + DESPLAZAMIENTO_HORAS * MS_HORA);

  return {
    anio: local.getUTCFullYear(),
    mes: local.getUTCMonth() + 1,
    dia: local.getUTCDate(),
    hora: local.getUTCHours(),
    minuto: local.getUTCMinutes(),
  };
}

/**
 * Fecha en dia, mes y ano, con el mes en palabras: `31 de julio de 2026`
 * (Requisito 4.6).
 */
export function fechaLarga(partes: PartesInstante): string {
  const mes = MESES[partes.mes - 1] ?? MESES[0];
  return `${String(partes.dia)} de ${mes} de ${String(partes.anio)}`;
}

/**
 * Hora en formato de 24 horas con horas y minutos: `18:00`, `00:30`
 * (Requisito 4.6).
 */
export function horaVeinticuatro(partes: PartesInstante): string {
  return `${dosDigitos(partes.hora)}:${dosDigitos(partes.minuto)}`;
}

/** Nombre del lugar ya normalizado, con respaldo cuando llega vacio. */
function nombreDelLugar(lugar: LugarGraduacion): string {
  const nombre = normalizarEspacios(lugar.nombre);
  return nombre.length > 0 ? nombre : LUGAR_SIN_NOMBRE;
}

/**
 * Rotulo de lugar y fecha del Mapa_Estelar (Requisito 4.6).
 *
 * El nombre del lugar se conserva completo: el rotulo dibujado no tiene limite
 * de longitud y el Archivo_Configuracion ya lo acota a 120 caracteres. Solo se
 * normaliza el espacio en blanco.
 *
 * @param instante Instante_Graduacion con desplazamiento `-05:00`.
 * @param lugar Lugar_Graduacion cuyo nombre encabeza el rotulo.
 * @returns Las piezas del rotulo y la cadena completa, p. ej.
 *          `Cra. 1 #26a-47, Neiva, Huila · 31 de julio de 2026, 18:00 -05:00`.
 */
export function rotuloLugarFecha(
  instante: InstanteGraduacion,
  lugar: LugarGraduacion,
): RotuloLugarFecha {
  const partes = partesInstante(instante);
  const nombre = nombreDelLugar(lugar);
  const fecha = fechaLarga(partes);
  const hora = horaVeinticuatro(partes);

  return {
    lugar: nombre,
    fecha,
    hora,
    desplazamiento: DESPLAZAMIENTO_COLOMBIA,
    partes,
    texto: `${nombre} · ${fecha}, ${hora} ${DESPLAZAMIENTO_COLOMBIA}`,
  };
}

/** Rotulo de lugar y fecha de un cielo ya calculado. */
export function rotuloDelCielo(cielo: DatosTextoAlternativo): RotuloLugarFecha {
  return rotuloLugarFecha(cielo.instante, cielo.lugar);
}

/**
 * Nombres de constelacion listos para enumerar: sin espacio en blanco raro, sin
 * vacios y sin repeticiones, conservando el orden recibido (de mas brillante a
 * menos, segun el invariante de `CieloCalculado`).
 */
function nombresUtiles(constelaciones: readonly string[]): string[] {
  const vistas = new Set<string>();
  const utiles: string[] = [];

  for (const bruto of constelaciones) {
    const nombre = normalizarEspacios(bruto);
    if (nombre.length === 0 || vistas.has(nombre)) {
      continue;
    }
    vistas.add(nombre);
    utiles.push(nombre);
  }

  return utiles;
}

/** Enumera nombres con comas y una `y` final, resumiendo los que faltan. */
function enumerar(nombres: readonly string[], restantes: number): string {
  const partes = restantes > 0 ? [...nombres, `${String(restantes)} más`] : [...nombres];

  if (partes.length <= 1) {
    return partes[0] ?? '';
  }

  const ultima = partes[partes.length - 1] ?? '';
  return `${partes.slice(0, -1).join(', ')} y ${ultima}`;
}

/** Encabezado del texto alternativo: lugar, fecha, hora y desplazamiento. */
function encabezadoAlternativo(cielo: DatosTextoAlternativo): string {
  const partes = partesInstante(cielo.instante);
  const nombre = recortarA(nombreDelLugar(cielo.lugar), MAX_LUGAR_TEXTO_ALTERNATIVO);

  return `Mapa del cielo sobre ${nombre}, el ${fechaLarga(partes)} a las ${horaVeinticuatro(
    partes,
  )} ${DESPLAZAMIENTO_COLOMBIA}.`;
}

/** Une el encabezado con la oracion de constelaciones elegida. */
function ensamblar(encabezado: string, nombres: readonly string[], restantes: number): string {
  if (nombres.length === 0) {
    return `${encabezado} ${SIN_CONSTELACIONES}`;
  }
  return `${encabezado} Constelaciones dibujadas: ${enumerar(nombres, restantes)}.`;
}

/**
 * Texto alternativo del Mapa_Estelar (Requisito 7.6).
 *
 * Nombra el Lugar_Graduacion, la fecha y la hora del Instante_Graduacion con el
 * desplazamiento `-05:00` y las constelaciones dibujadas, y mide siempre entre
 * {@link MIN_TEXTO_ALTERNATIVO} y {@link MAX_TEXTO_ALTERNATIVO} unidades de
 * codigo: la lista se recorta con un resumen `y N más` cuando sobran nombres, y
 * se completa con los {@link COMPLEMENTOS} cuando el texto queda corto.
 *
 * @param cielo Cielo calculado, o cualquier objeto con su instante, su lugar y
 *              sus constelaciones dibujadas.
 * @returns El texto alternativo, listo para el `aria-label` del lienzo.
 */
export function textoAlternativo(cielo: DatosTextoAlternativo): string {
  const encabezado = encabezadoAlternativo(cielo);
  const nombres = nombresUtiles(cielo.constelacionesDibujadas);

  // Voraz: se conservan las constelaciones mas brillantes y se detiene en la
  // primera que no quepa, para que el resumen `y N mas` sea el de una cola
  // contigua y el resultado no dependa del orden de prueba.
  const elegidas: string[] = [];
  for (const nombre of nombres) {
    const restantes = nombres.length - (elegidas.length + 1);
    if (ensamblar(encabezado, [...elegidas, nombre], restantes).length <= MAX_TEXTO_ALTERNATIVO) {
      elegidas.push(nombre);
      continue;
    }
    break;
  }

  let texto = ensamblar(encabezado, elegidas, nombres.length - elegidas.length);

  // Con un nombre de lugar desmedido podria no caber ni la primera
  // constelacion; antes de renunciar a nombrar alguna, se recorta esa primera.
  const primera = nombres[0];
  if (elegidas.length === 0 && primera !== undefined) {
    const armazon = ensamblar(encabezado, [''], nombres.length - 1).length;
    const recortada = recortarA(primera, MAX_TEXTO_ALTERNATIVO - armazon);
    if (recortada.length > 0) {
      texto = ensamblar(encabezado, [recortada], nombres.length - 1);
    }
  }

  // Minimo de 80: basta el primer complemento, pero se recorren todos por si el
  // encabezado fuera aun mas corto de lo previsto.
  for (const complemento of COMPLEMENTOS) {
    if (texto.length >= MIN_TEXTO_ALTERNATIVO) {
      break;
    }
    const ampliado = `${texto} ${complemento}`;
    if (ampliado.length <= MAX_TEXTO_ALTERNATIVO) {
      texto = ampliado;
    }
  }

  // Ultimo cinturon de seguridad del maximo: inalcanzable con un nombre de
  // lugar acotado a 120, pero mas vale recortar que devolver un rotulo ilegal.
  return recortarA(texto, MAX_TEXTO_ALTERNATIVO);
}

/**
 * Expone el texto alternativo en el lienzo del mapa: `role="img"` mas
 * `aria-label` (Requisitos 7.6, 7.10).
 *
 * Es la unica funcion del modulo que toca el DOM, para que el resto siga siendo
 * comprobable sin navegador.
 *
 * @param lienzo Lienzo del Mapa_Estelar, o el elemento que lo sustituya en la
 *               ruta de respaldo.
 * @param texto Texto alternativo, normalmente el de {@link textoAlternativo}.
 */
export function aplicarTextoAlternativo(lienzo: Element, texto: string): void {
  lienzo.setAttribute('role', 'img');
  lienzo.setAttribute('aria-label', texto);
}
