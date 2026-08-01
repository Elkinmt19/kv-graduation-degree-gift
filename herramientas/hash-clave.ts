/**
 * Comando de calculo del Hash_Clave (Requisitos 8.6 y 1.6).
 *
 * Recibe la Clave_Acceso en texto claro por argumento, le aplica la misma
 * normalizacion que el Portal_Acceso (`normalizarClave`, Requisito 1.2) y
 * escribe en la salida estandar unicamente los 64 caracteres hexadecimales
 * minusculos del digesto SHA-256, listos para pegar en `regalo.config.json`.
 *
 * Uso:
 *   npm run hash-clave -- "<clave en texto claro>"
 *
 * La clave viaja solo por el argumento del proceso: este comando nunca la
 * escribe en disco, no la imprime de vuelta y no la guarda en ningun archivo
 * del repositorio (Requisito 1.6). Los mensajes de uso y de error van a la
 * salida de error, de modo que la salida estandar quede limpia y se pueda
 * canalizar hacia otro comando.
 */

import { createHash } from 'node:crypto';
import { normalizarClave } from '../src/nucleo/clave.js';

const USO = 'Uso: npm run hash-clave -- "<clave en texto claro>"';

const clave = process.argv.slice(2).join(' ');
if (clave.length === 0) {
  console.error(USO);
  process.exit(1);
}

const claveNormalizada = normalizarClave(clave);
if (claveNormalizada.length === 0) {
  console.error(
    'La clave normalizada quedo vacia: solo contiene espacios en blanco. El Portal_Acceso ignora ese caso (Requisito 1.5).',
  );
  console.error(USO);
  process.exit(1);
}

const hashClave = createHash('sha256').update(claveNormalizada, 'utf8').digest('hex');
console.log(hashClave);
