/**
 * Verificador del paquete publicable en `dist/` (Requisitos 1.6, 8.5, 8.7).
 *
 * Se ejecuta despues de `vite build`, nunca antes: revisa el resultado ya
 * escrito en disco, no el codigo fuente. Comprueba tres invariantes de
 * seguridad del diseno sobre los archivos de texto de `dist/` (`.html`, `.js`,
 * `.css`):
 *
 * 1. El Hash_Clave del Archivo_Configuracion aparece en el paquete con el
 *    formato exigido: 64 caracteres hexadecimales minusculos.
 * 2. Ninguna variante de la Clave_Acceso en texto claro esta presente. La
 *    clave real nunca se escribe en el repositorio (Requisito 1.6), asi que
 *    este comando la recibe solo como argumento opcional, para que las
 *    pruebas puedan ejercitar la deteccion sin depender de que exista una en
 *    disco.
 * 3. Ninguna referencia a un origen ajeno (`http://`/`https://` que no sea el
 *    espacio de nombres XML de SVG, que no es una peticion de red).
 *
 * Uso:
 *   npx tsx herramientas/verificar-paquete.ts [ruta-de-dist] [clave-en-texto-claro]
 *
 * La logica vive en `verificarPaquete`, exportada junto con sus piezas para
 * que las pruebas la ejerciten sin lanzar un proceso.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizarClave } from '../src/nucleo/clave.js';
import { PATRON_HASH_CLAVE } from './validar-configuracion.js';

// --- Constantes --------------------------------------------------------------

/** Extensiones de texto revisadas: son las unicas que `vite build` produce con contenido inspeccionable. */
export const EXTENSIONES_REVISADAS = ['.html', '.js', '.css'] as const;

/**
 * Origenes que no son una peticion de red y por eso no cuentan como ajenos:
 * el espacio de nombres XML de SVG, requerido por `createElementNS` y que
 * nunca se resuelve por la red.
 */
export const ORIGENES_PERMITIDOS = ['http://www.w3.org/2000/svg'] as const;

const PATRON_URL_ABSOLUTA = /https?:\/\/[^\s"'()<>]+/g;

/** Ruta de `dist/` en la raiz del repositorio, por omision. */
export const RUTA_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

// --- Resultado ----------------------------------------------------------------

export interface ProblemaPaquete {
  readonly mensaje: string;
}

export interface ResultadoVerificacionPaquete {
  readonly valido: boolean;
  readonly problemas: readonly ProblemaPaquete[];
  readonly archivosRevisados: readonly string[];
}

// --- Lectura del paquete -------------------------------------------------------

/** Lista, en orden determinista, las rutas absolutas de los archivos de texto de `dist/`. */
export function listarArchivosDeTexto(rutaDist: string): string[] {
  const archivos: string[] = [];

  function recorrer(ruta: string): void {
    for (const entrada of readdirSync(ruta, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const rutaCompleta = join(ruta, entrada.name);
      if (entrada.isDirectory()) {
        recorrer(rutaCompleta);
        continue;
      }
      if (EXTENSIONES_REVISADAS.some((extension) => entrada.name.endsWith(extension))) {
        archivos.push(rutaCompleta);
      }
    }
  }

  recorrer(rutaDist);
  return archivos;
}

// --- Comprobaciones individuales ----------------------------------------------

/**
 * El Hash_Clave esperado debe tener el formato exigido y aparecer en el
 * contenido concatenado del paquete.
 */
export function verificarHashClave(
  contenido: string,
  hashClaveEsperado: string,
): ProblemaPaquete[] {
  const problemas: ProblemaPaquete[] = [];

  if (!PATRON_HASH_CLAVE.test(hashClaveEsperado)) {
    problemas.push({
      mensaje: `El Hash_Clave configurado no tiene el formato exigido (64 hexadecimales minusculos): ${hashClaveEsperado}`,
    });
  }

  if (!contenido.includes(hashClaveEsperado)) {
    problemas.push({
      mensaje: 'El Hash_Clave configurado no aparece en ningun archivo del paquete construido.',
    });
  }

  return problemas;
}

/**
 * Ninguna variante (tal cual, normalizada, mayuscula/minuscula) de la clave en
 * texto claro puede estar presente. Sin una clave para comprobar, no hay nada
 * que verificar: no es un problema, porque la clave real nunca vive en el
 * repositorio (Requisito 1.6).
 */
export function verificarAusenciaDeClaveEnTextoClaro(
  contenido: string,
  claveTextoClaro: string | undefined,
): ProblemaPaquete[] {
  if (claveTextoClaro === undefined || claveTextoClaro.length === 0) {
    return [];
  }

  const variantes = new Set([
    claveTextoClaro,
    normalizarClave(claveTextoClaro),
    claveTextoClaro.toLowerCase(),
    claveTextoClaro.toUpperCase(),
  ]);

  const contenidoEnMinuscula = contenido.toLowerCase();
  const encontrada = [...variantes].some((variante) =>
    contenidoEnMinuscula.includes(variante.toLowerCase()),
  );

  return encontrada
    ? [{ mensaje: 'La Clave_Acceso en texto claro aparece en el paquete construido.' }]
    : [];
}

/** Ninguna URL absoluta del paquete debe apuntar a un origen distinto de los permitidos. */
export function listarOrigenesAjenos(contenido: string): string[] {
  const encontradas = contenido.match(PATRON_URL_ABSOLUTA) ?? [];
  const ajenas = encontradas.filter(
    (url) => !ORIGENES_PERMITIDOS.some((permitido) => url.startsWith(permitido)),
  );
  return [...new Set(ajenas)];
}

export function verificarOrigenesAjenos(contenido: string): ProblemaPaquete[] {
  return listarOrigenesAjenos(contenido).map((url) => ({
    mensaje: `Referencia a un origen ajeno al paquete estatico: ${url}`,
  }));
}

// --- Verificacion completa -----------------------------------------------------

export interface OpcionesVerificacionPaquete {
  readonly rutaDist: string;
  readonly hashClaveEsperado: string;
  readonly claveTextoClaro?: string;
}

/**
 * Revisa todos los archivos de texto de `dist/` y devuelve **todos** los
 * problemas encontrados en una sola pasada.
 */
export function verificarPaquete(opciones: OpcionesVerificacionPaquete): ResultadoVerificacionPaquete {
  const archivos = listarArchivosDeTexto(opciones.rutaDist);
  const contenido = archivos.map((archivo) => readFileSync(archivo, 'utf8')).join('\n');

  const problemas = [
    ...verificarHashClave(contenido, opciones.hashClaveEsperado),
    ...verificarAusenciaDeClaveEnTextoClaro(contenido, opciones.claveTextoClaro),
    ...verificarOrigenesAjenos(contenido),
  ];

  return { valido: problemas.length === 0, problemas, archivosRevisados: archivos };
}

// --- Informe --------------------------------------------------------------

export function formatearInformePaquete(resultado: ResultadoVerificacionPaquete): string {
  if (resultado.valido) {
    return `Paquete valido: ${String(resultado.archivosRevisados.length)} archivos revisados en dist/.`;
  }

  const lineas = [
    `Paquete invalido: se encontraron ${String(resultado.problemas.length)} problema(s).`,
    '',
  ];
  resultado.problemas.forEach((problema, indice) => {
    lineas.push(`  ${String(indice + 1)}. ${problema.mensaje}`);
  });
  return lineas.join('\n');
}

// --- Comando ----------------------------------------------------------------

function leerHashClaveDesdeConfiguracion(): string {
  const rutaConfig = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'regalo.config.json');
  const configuracion = JSON.parse(readFileSync(rutaConfig, 'utf8')) as { hashClave?: unknown };
  return typeof configuracion.hashClave === 'string' ? configuracion.hashClave : '';
}

export function ejecutar(
  rutaDist: string = RUTA_DIST,
  claveTextoClaro: string | undefined = undefined,
): number {
  const resultado = verificarPaquete({
    rutaDist,
    hashClaveEsperado: leerHashClaveDesdeConfiguracion(),
    ...(claveTextoClaro === undefined ? {} : { claveTextoClaro }),
  });
  const informe = formatearInformePaquete(resultado);
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
  const clavePedida = process.argv[3];
  process.exit(ejecutar(rutaPedida === undefined ? RUTA_DIST : resolve(rutaPedida), clavePedida));
}
