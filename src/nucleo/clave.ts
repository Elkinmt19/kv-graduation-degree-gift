/**
 * Normalizacion de la Clave_Acceso (Requisito 1.2).
 *
 * Modulo puro, sin DOM y sin dependencias, compartido por el Portal_Acceso y el
 * comando `hash-clave` (Requisito 8.6): al vivir la regla en un solo lugar, las
 * dos rutas de calculo del Hash_Clave no pueden desincronizarse.
 *
 * Decision explicita: **no** se aplica normalizacion Unicode (NFC/NFD), porque
 * el Requisito 1.2 define la normalizacion de forma exhaustiva. Consecuencia:
 * la Clave_Acceso deberia usar solo caracteres ASCII para evitar ambiguedad
 * entre secuencias compuestas y descompuestas.
 */

/**
 * Recorta unicamente los caracteres de espacio en blanco iniciales y finales,
 * conserva intactos los espacios internos y convierte las letras a minusculas.
 *
 * @param entrada Texto tal como lo escribio la persona.
 * @returns La clave normalizada, lista para calcular su hash SHA-256.
 */
export function normalizarClave(entrada: string): string {
  return entrada.trim().toLowerCase();
}
