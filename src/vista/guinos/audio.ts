/**
 * Control de reproduccion del sanjuanero (Requisitos 6.6 y 6.10).
 *
 * Igual que `decoraciones.ts` y `lienzo.ts`, expone `montarAudio(raiz, ...)`:
 * agrega su propio boton a `raiz` y no toca ningun hermano. Con `musica`
 * desactivado en el Archivo_Configuracion no crea ningun nodo (Requisito
 * 6.8), igual que `decoraciones.ts` con `guinos` desactivado.
 *
 * Con `musica` activado, el boton arranca deshabilitado en estado
 * `cargando` mientras espera el evento `canplay` del elemento `<audio>`. Si
 * llega a tiempo pasa a `detenido` con volumen inicial 50% (Requisito 6.6);
 * si no llega en 5000 ms pasa a `no-disponible` y se queda deshabilitado ahi
 * (Requisito 6.10), sin que eso oculte el Mapa_Estelar ni el Lienzo_Carta —
 * el boton es un nodo mas, ajeno a ambos.
 *
 * El temporizador de 5000 ms usa el mismo `Reloj` inyectable que
 * `src/vista/mapa/circulo.ts` define para su antirrebote: un `programar`/
 * `cancelar` sustituible, para que la prueba no dependa de un `<audio>` real
 * ni de temporizadores reales del entorno.
 */

/** Reloj minimo del temporizador de espera; en pruebas se sustituye por uno manual. */
export interface Reloj {
  programar(accion: () => void, ms: number): unknown;
  cancelar(identificador: unknown): void;
}

/** Reloj por omision, apoyado en `setTimeout` del entorno. */
export const RELOJ_DEL_ENTORNO: Reloj = {
  programar: (accion, ms) => setTimeout(accion, ms),
  cancelar: (identificador) => {
    clearTimeout(identificador as ReturnType<typeof setTimeout>);
  },
};

/** Interfaz minima de un elemento de audio; el navegador la satisface tal cual. */
export interface ElementoAudio {
  volume: number;
  paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(tipo: 'canplay' | 'error', escucha: () => void): void;
  removeEventListener(tipo: 'canplay' | 'error', escucha: () => void): void;
}

/** Espera maxima del recurso de audio, en milisegundos (Requisito 6.10). */
export const ESPERA_DISPONIBILIDAD_MS = 5000;

/** Volumen inicial del sanjuanero en la primera presentacion (Requisito 6.6). */
export const VOLUMEN_INICIAL = 0.5;

/** Ruta del recurso de audio del sanjuanero; marcador hasta que se supla el archivo real. */
export const RUTA_AUDIO_SANJUANERO = '/audio/sanjuanero.mp3';

/** Estado de disponibilidad y reproduccion del control. */
export type EstadoAudio = 'cargando' | 'detenido' | 'reproduciendo' | 'no-disponible';

/** Clases que el modulo escribe en el DOM y que estila `src/estilos/guinos.css`. */
export const CLASES_AUDIO = {
  boton: 'guinos-audio__boton',
  icono: 'guinos-audio__icono',
  texto: 'guinos-audio__texto',
} as const;

/** Rotulo accesible del boton, segun estado (Requisito 6.6). */
export const ETIQUETAS_AUDIO: Record<EstadoAudio, string> = {
  cargando: 'Cargando el sanjuanero',
  detenido: 'Reproducir el sanjuanero',
  reproduciendo: 'Silenciar el sanjuanero',
  'no-disponible': 'Audio del sanjuanero no disponible',
};

/** Texto visible del control, invitando a reproducir la musica (Requisito 6.6). */
export const TEXTO_INVITACION_AUDIO = 'Reproduce la mejor música mientras lees el mensaje';

const ESPACIO_DE_NOMBRES_SVG = 'http://www.w3.org/2000/svg';

/** Trazo del icono de nota musical, en `currentColor` para heredar el color del boton. */
const TRAZO_ICONO_AUDIO = `
  <path d="M9 32V10.5l16-3.2V26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="6" cy="32" r="4.5" fill="none" stroke="currentColor" stroke-width="2.4"/>
  <circle cx="21" cy="26" r="4.5" fill="none" stroke="currentColor" stroke-width="2.4"/>
`;

function crearIconoAudio(): SVGSVGElement {
  const svg = document.createElementNS(ESPACIO_DE_NOMBRES_SVG, 'svg');
  svg.setAttribute('class', CLASES_AUDIO.icono);
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = TRAZO_ICONO_AUDIO;
  return svg;
}

/** Opciones del montaje. */
export interface OpcionesAudio {
  /** Interruptor de la reproduccion de musica del Archivo_Configuracion. */
  readonly musica: boolean;
  /**
   * Elemento de audio a controlar. Por omision se crea un `HTMLAudioElement`
   * real apuntando a {@link RUTA_AUDIO_SANJUANERO}; una prueba puede pasar un
   * doble que cumpla {@link ElementoAudio}.
   */
  readonly elemento?: ElementoAudio;
  /** Reloj del temporizador de espera; por omision el del entorno. */
  readonly reloj?: Reloj;
  /** Espera maxima antes de `no-disponible`; por omision {@link ESPERA_DISPONIBILIDAD_MS}. */
  readonly esperaMs?: number;
}

/** Asa devuelta por `montarAudio`. */
export interface AudioMontado {
  /** Boton que el modulo agrego a la raiz. */
  readonly boton: HTMLButtonElement;
  /** Estado actual del control. */
  estado(): EstadoAudio;
  /** Quita el boton del DOM, cancela la espera pendiente y suelta escuchas. Idempotente. */
  destruir(): void;
}

/**
 * Monta el control de reproduccion del sanjuanero dentro de `raiz`.
 *
 * Con la musica desactivada no crea ningun nodo y devuelve `null` (Requisito
 * 6.8). Activada, crea un boton deshabilitado en estado `cargando`: pasa a
 * `detenido` (con volumen al 50%) en cuanto el elemento de audio dispara
 * `canplay`, o a `no-disponible` si no lo hace dentro de `esperaMs`.
 *
 * @param raiz Elemento contenedor donde vive el control.
 * @param opciones Interruptor de la musica y, opcionalmente, el elemento de
 *   audio y el reloj a usar.
 * @returns El asa del montaje, o `null` si no se creo ningun nodo.
 */
export function montarAudio(raiz: HTMLElement, opciones: OpcionesAudio): AudioMontado | null {
  if (!opciones.musica) {
    return null;
  }

  const reloj = opciones.reloj ?? RELOJ_DEL_ENTORNO;
  const esperaMs = opciones.esperaMs ?? ESPERA_DISPONIBILIDAD_MS;
  const elemento = opciones.elemento ?? crearElementoAudioReal();

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = CLASES_AUDIO.boton;
  boton.disabled = true;
  boton.append(crearIconoAudio());

  const texto = document.createElement('span');
  texto.className = CLASES_AUDIO.texto;
  texto.textContent = TEXTO_INVITACION_AUDIO;
  boton.append(texto);

  let estado: EstadoAudio = 'cargando';
  let destruido = false;
  let espera: unknown = null;

  const aplicarEstado = (nuevo: EstadoAudio): void => {
    estado = nuevo;
    boton.dataset['estado'] = nuevo;
    boton.setAttribute('aria-label', ETIQUETAS_AUDIO[nuevo]);
    boton.disabled = nuevo === 'cargando' || nuevo === 'no-disponible';
  };

  const cancelarEspera = (): void => {
    if (espera !== null) {
      reloj.cancelar(espera);
      espera = null;
    }
  };

  const alEstarListo = (): void => {
    if (destruido || estado !== 'cargando') {
      return;
    }
    cancelarEspera();
    elemento.volume = VOLUMEN_INICIAL;
    aplicarEstado('detenido');
  };

  const alFallar = (): void => {
    if (destruido || estado !== 'cargando') {
      return;
    }
    cancelarEspera();
    aplicarEstado('no-disponible');
  };

  elemento.addEventListener('canplay', alEstarListo);
  elemento.addEventListener('error', alFallar);

  espera = reloj.programar(() => {
    espera = null;
    alFallar();
  }, esperaMs);

  const alHacerClic = (): void => {
    if (estado === 'detenido') {
      void elemento.play();
      aplicarEstado('reproduciendo');
    } else if (estado === 'reproduciendo') {
      elemento.pause();
      aplicarEstado('detenido');
    }
  };

  boton.addEventListener('click', alHacerClic);

  aplicarEstado(estado);
  raiz.append(boton);

  return {
    boton,
    estado: () => estado,
    destruir(): void {
      if (destruido) {
        return;
      }
      destruido = true;
      cancelarEspera();
      boton.removeEventListener('click', alHacerClic);
      elemento.removeEventListener('canplay', alEstarListo);
      elemento.removeEventListener('error', alFallar);
      boton.remove();
    },
  };
}

function crearElementoAudioReal(): ElementoAudio {
  const audio = new Audio(RUTA_AUDIO_SANJUANERO);
  audio.preload = 'auto';
  return audio;
}
