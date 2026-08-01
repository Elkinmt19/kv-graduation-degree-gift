/**
 * Estado de la sesion del navegador, sobre `sessionStorage`.
 *
 * `sessionStorage` es exactamente la semantica que piden los Requisitos 1.7 y
 * 1.9: el acceso concedido sobrevive a una recarga de la misma pestana y
 * desaparece en otra pestana o al cerrar el navegador. Guarda ademas si la
 * Carta ya se revelo, para no repetir su animacion de aparicion en la misma
 * sesion (Requisitos 5.2 y 5.3).
 *
 * Si `sessionStorage` lanza (modo privado restringido, cookies bloqueadas), se
 * cae a un objeto en memoria: el acceso sigue funcionando dentro de la vista
 * actual y la recarga vuelve a pedir la Clave_Acceso, degradado aceptable.
 */

/** Clave de almacenamiento del acceso concedido. */
export const CLAVE_ACCESO = 'kv.acceso';

/** Clave de almacenamiento de la Carta ya revelada. */
export const CLAVE_CARTA_REVELADA = 'kv.carta.revelada';

/** Valor unico que se escribe en ambas claves; solo importa su presencia. */
const VALOR_MARCA = '1';

/** Estado de la sesion actual del navegador. */
export interface EstadoSesion {
  /** Verdadero si el acceso ya se concedio en esta sesion (Requisito 1.7). */
  accesoConcedido(): boolean;
  /** Registra el acceso concedido para la sesion actual (Requisito 1.3). */
  registrarAcceso(): void;
  /** Verdadero si la Carta ya se revelo en esta sesion (Requisito 5.3). */
  cartaYaRevelada(): boolean;
  /** Marca la Carta como revelada en esta sesion (Requisito 5.2). */
  marcarCartaRevelada(): void;
}

/**
 * Almacen clave-valor minimo, con la forma de `sessionStorage`. Permite
 * sustituirlo en pruebas por un objeto trivial o por uno que lanza.
 */
export interface AlmacenSesion {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

/**
 * Crea el estado de sesion sobre el almacen recibido.
 *
 * @param almacen Almacen a usar; por omision el `sessionStorage` del navegador,
 *   o `null` cuando no existe. Con `null` todo el estado vive en memoria.
 */
export function crearEstadoSesion(
  almacen: AlmacenSesion | null = almacenDeSesionDelNavegador(),
): EstadoSesion {
  const seguro = conRespaldoEnMemoria(almacen);

  return {
    accesoConcedido: () => seguro.getItem(CLAVE_ACCESO) === VALOR_MARCA,
    registrarAcceso: () => {
      seguro.setItem(CLAVE_ACCESO, VALOR_MARCA);
    },
    cartaYaRevelada: () => seguro.getItem(CLAVE_CARTA_REVELADA) === VALOR_MARCA,
    marcarCartaRevelada: () => {
      seguro.setItem(CLAVE_CARTA_REVELADA, VALOR_MARCA);
    },
  };
}

/**
 * Devuelve el `sessionStorage` del navegador, o `null` si no existe o si el
 * simple acceso a la propiedad lanza (algunos navegadores lo hacen cuando el
 * almacenamiento esta bloqueado por politica).
 */
export function almacenDeSesionDelNavegador(): AlmacenSesion | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Envuelve un almacen para que ninguna operacion lance. Al primer fallo el
 * envoltorio queda degradado y sirve todas las lecturas y escrituras desde
 * memoria, de modo que lo que se registra se pueda volver a leer dentro de la
 * vista actual.
 */
function conRespaldoEnMemoria(almacen: AlmacenSesion | null): AlmacenSesion {
  const memoria = new Map<string, string>();
  let degradado = almacen === null;

  return {
    getItem(clave: string): string | null {
      if (!degradado && almacen !== null) {
        try {
          return almacen.getItem(clave);
        } catch {
          degradado = true;
        }
      }

      return memoria.get(clave) ?? null;
    },

    setItem(clave: string, valor: string): void {
      if (!degradado && almacen !== null) {
        try {
          almacen.setItem(clave, valor);
          return;
        } catch {
          degradado = true;
        }
      }

      memoria.set(clave, valor);
    },
  };
}
