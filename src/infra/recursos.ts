/**
 * E/S de red y medicion de tiempo, detras de interfaces sustituibles.
 *
 * La E/S vive en el borde: el nucleo (`Lector_Catalogo`, `Motor_Astronomico`)
 * nunca toca `fetch` ni `performance.now` directamente, sino que recibe un
 * `Traer` y un `Reloj`. En pruebas se sustituyen por dobles deterministas, sin
 * red ni relojes reales.
 *
 * Requisitos: 2.8 (limite de 3000 ms para obtener el catalogo), 4.13 (limite de
 * 5000 ms para la lectura completa), 8.7 (paquete estatico: la unica peticion
 * es al mismo hosting que sirve el HTML).
 */

/** Opciones de una obtencion de recurso. */
export interface OpcionesTraer {
  /** Senal de cancelacion, usada para aplicar los limites de tiempo. */
  readonly senal?: AbortSignal;
}

/**
 * Respuesta minima que necesita la Aplicacion: si la obtencion fue exitosa, el
 * codigo de estado y el cuerpo como texto. Se recorta a proposito la superficie
 * de `Response` para que un doble de prueba quepa en tres lineas.
 */
export interface RespuestaRecurso {
  /** Verdadero cuando el codigo de estado esta en el rango 200-299. */
  readonly ok: boolean;
  /** Codigo de estado HTTP. */
  readonly estado: number;
  /** Cuerpo de la respuesta como texto. */
  texto(): Promise<string>;
}

/**
 * Obtiene un recurso por su ruta. Rechaza la promesa cuando la red falla o
 * cuando la senal de cancelacion se dispara, igual que `fetch`.
 */
export type Traer = (ruta: string, opciones?: OpcionesTraer) => Promise<RespuestaRecurso>;

/**
 * Fuente de tiempo monotonico en milisegundos, para cronometrar operaciones.
 * No sirve para conocer la fecha: el Instante_Graduacion viene del
 * Archivo_Configuracion, nunca del reloj del dispositivo.
 */
export interface Reloj {
  /** Milisegundos transcurridos desde un origen arbitrario pero estable. */
  ahora(): number;
}

/** Implementacion de `Traer` sobre `fetch`. */
export const traerConFetch: Traer = async (ruta, opciones) => {
  const respuesta =
    opciones?.senal !== undefined
      ? await fetch(ruta, { signal: opciones.senal })
      : await fetch(ruta);

  return {
    ok: respuesta.ok,
    estado: respuesta.status,
    texto: () => respuesta.text(),
  };
};

/**
 * Implementacion de `Reloj` sobre `performance.now`, que es monotonico y no se
 * ve afectado por ajustes del reloj del sistema. Si `performance` no esta
 * disponible, cae a `Date.now`, que basta para medir umbrales de segundos.
 */
export const relojDeRendimiento: Reloj = {
  ahora(): number {
    const rendimiento = globalThis.performance;
    return typeof rendimiento?.now === 'function' ? rendimiento.now() : Date.now();
  },
};
