/**
 * Consulta de la preferencia de movimiento reducido del sistema.
 *
 * Las hojas de estilo ya anulan sus animaciones con
 * `@media (prefers-reduced-motion: reduce)`; este modulo expone la misma
 * preferencia al codigo que anima por su cuenta: la aparicion progresiva de la
 * Carta y el bucle de titileo del Mapa_Estelar, que con movimiento reducido
 * dibuja un unico fotograma estatico (Requisito 7.5).
 */

/** Consulta de medios que declara la preferencia de movimiento reducido. */
export const CONSULTA_MOVIMIENTO_REDUCIDO = '(prefers-reduced-motion: reduce)';

/** Evento minimo de cambio de una consulta de medios. */
export interface EventoMedios {
  readonly matches: boolean;
}

/**
 * Consulta de medios minima, con la forma de `MediaQueryList`. Se recorta a
 * proposito para poder sustituirla en pruebas por un objeto simple.
 */
export interface ConsultaMedios {
  readonly matches: boolean;
  addEventListener(tipo: 'change', escucha: (evento: EventoMedios) => void): void;
  removeEventListener(tipo: 'change', escucha: (evento: EventoMedios) => void): void;
}

/**
 * Devuelve la consulta de movimiento reducido del navegador, o `null` cuando
 * `matchMedia` no esta disponible.
 */
export function consultaDelNavegador(): ConsultaMedios | null {
  try {
    const coincidir = globalThis.matchMedia;
    return typeof coincidir === 'function'
      ? coincidir.call(globalThis, CONSULTA_MOVIMIENTO_REDUCIDO)
      : null;
  } catch {
    return null;
  }
}

/**
 * Indica si el navegador declara la preferencia de movimiento reducido.
 *
 * @param consulta Consulta a leer; por omision la del navegador. Cuando no hay
 *   consulta disponible se asume que no hay preferencia declarada, para no
 *   privar del movimiento a quien no lo pidio.
 */
export function prefiereMovimientoReducido(
  consulta: ConsultaMedios | null = consultaDelNavegador(),
): boolean {
  return consulta?.matches === true;
}

/**
 * Observa los cambios de la preferencia durante la vida de la vista, para que
 * activarla o desactivarla surta efecto sin recargar.
 *
 * @param alCambiar Se invoca con el nuevo valor de la preferencia en cada cambio.
 * @param consulta Consulta a observar; por omision la del navegador.
 * @returns Funcion que cancela la observacion.
 */
export function observarMovimientoReducido(
  alCambiar: (reducido: boolean) => void,
  consulta: ConsultaMedios | null = consultaDelNavegador(),
): () => void {
  if (consulta === null) {
    return () => {};
  }

  const escucha = (evento: EventoMedios): void => {
    alCambiar(evento.matches);
  };

  consulta.addEventListener('change', escucha);

  return () => {
    consulta.removeEventListener('change', escucha);
  };
}
