/**
 * Calculo del digesto SHA-256 en el navegador, sobre Web Crypto.
 *
 * `digerir` recibe el texto **ya normalizado** por `normalizarClave`
 * (`src/nucleo/clave.ts`): la normalizacion del Requisito 1.2 es
 * responsabilidad del Portal_Acceso y del comando `hash-clave`, no de este
 * modulo. Asi el mismo digesto se obtiene en las dos rutas de calculo del
 * Hash_Clave (Requisito 8.6).
 *
 * `crypto.subtle` solo existe en contextos seguros (HTTPS o `localhost`). En
 * lugar de lanzar, `digerir` devuelve `null` para que el Portal_Acceso pase al
 * estado `sin-validacion`, conserve oculta la Pagina_Regalo y avise que la
 * validacion de la clave no esta disponible en ese navegador (Requisito 1.11).
 */

/** Firma de la funcion de digesto, sustituible en pruebas. */
export type Digerir = (texto: string) => Promise<string | null>;

/**
 * Calcula el digesto SHA-256 del texto recibido.
 *
 * @param texto Texto ya normalizado (Requisito 1.2 aplicado por quien llama).
 * @returns Digesto en hexadecimal minuscula de 64 caracteres, o `null` si Web
 *   Crypto no esta disponible, el contexto no es seguro o el calculo falla.
 */
export const digerir: Digerir = async (texto) => {
  const subtle = obtenerSubtle();

  if (subtle === null) {
    return null;
  }

  try {
    const digesto = await subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return aHexadecimalMinuscula(digesto);
  } catch {
    return null;
  }
};

/**
 * Devuelve `crypto.subtle` cuando el entorno puede calcular el digesto, o
 * `null` cuando Web Crypto falta o el contexto no es seguro.
 *
 * `isSecureContext` puede no existir (por ejemplo en Node); en ese caso no se
 * bloquea el calculo y se deja que `subtle.digest` decida.
 */
function obtenerSubtle(): SubtleCrypto | null {
  try {
    if (globalThis.isSecureContext === false) {
      return null;
    }

    const subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle;
    return typeof subtle?.digest === 'function' ? subtle : null;
  } catch {
    return null;
  }
}

/**
 * Convierte los bytes del digesto a hexadecimal minuscula de dos caracteres por
 * byte, que es la representacion que declara el Archivo_Configuracion
 * (Requisitos 1.6 y 8.1).
 */
function aHexadecimalMinuscula(digesto: ArrayBuffer): string {
  return Array.from(new Uint8Array(digesto), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}
