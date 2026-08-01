/**
 * Portal_Acceso: pide la Clave_Acceso, la valida contra el Hash_Clave y concede
 * el acceso a la Pagina_Regalo.
 *
 * Cobertura de requisitos:
 * - 1.1: texto fijo de invitacion, `<input type="password" maxlength="64">` y
 *   boton de ingreso. La Pagina_Regalo no se dibuja aqui: el unico camino a su
 *   revelacion es `alConcederAcceso`, que solo se invoca en el estado
 *   `concedido`; mientras el portal no lo invoque, la Pagina_Regalo sigue
 *   `hidden` fuera del arbol accesible.
 * - 1.2: la normalizacion vive en `normalizarClave` (`src/nucleo/clave.ts`), el
 *   mismo modulo que usa el comando `hash-clave` (Requisito 8.6).
 * - 1.3: al coincidir el digesto registra la sesion, oculta el portal y llama a
 *   `alConcederAcceso` en el mismo turno en que resuelve `digerir`, sin timbres
 *   ni animaciones que retrasen la presentacion.
 * - 1.4: al no coincidir conserva la vista, limpia el campo, le devuelve el foco
 *   y publica el mensaje de reintento en una region `aria-live="polite"` que
 *   permanece hasta el siguiente envio.
 * - 1.5: el boton queda `disabled` y todo envio se ignora mientras la clave
 *   normalizada tiene longitud 0.
 * - 1.7 y 1.9: al montar consulta `sesion.accesoConcedido()`; si la sesion
 *   actual ya tiene el acceso concedido pasa directo a `concedido` sin pedir la
 *   clave, y en una sesion nueva vuelve a pedirla.
 * - 1.8 y 7.10: el envio ocurre sobre un `<form>` real, de modo que Enter en el
 *   campo y Enter o barra espaciadora sobre el boton disparan la misma
 *   validacion sin codigo adicional.
 * - 1.10: no hay contador de intentos, bloqueo ni retardo impuesto; el unico
 *   estado que sobrevive a un intento fallido es el mensaje visible.
 * - 1.11: si `digerir` devuelve `null` pasa a `sin-validacion` y **no** concede
 *   acceso.
 *
 * Comparacion del digesto: exacta, sin plegar mayusculas. El Hash_Clave es
 * hexadecimal minuscula de 64 caracteres por construccion (Requisitos 1.6 y
 * 8.1, verificados en `prebuild` por el validador de configuracion, que detiene
 * la construccion en caso contrario segun el Requisito 8.8) y `digerir` emite
 * esa misma representacion. Plegar mayusculas aqui solo enmascararia un
 * Archivo_Configuracion invalido que el paquete ni siquiera llega a generar.
 */

import type { EstadoSesion } from '../../infra/sesion.js';
import { normalizarClave } from '../../nucleo/clave.js';

/** Texto fijo de invitacion del Portal_Acceso (Requisito 1.1). */
export const TEXTO_INVITACION = 'Si eres KawaValen, por favor digita la clave de acceso';

/** Mensaje de reintento tras una clave que no coincide (Requisito 1.4). */
export const MENSAJE_REINTENTO = 'Esa no es la clave, inténtalo de nuevo';

/** Mensaje cuando el navegador no puede calcular el SHA-256 (Requisito 1.11). */
export const MENSAJE_SIN_VALIDACION =
  'La validación de la clave no está disponible en este navegador';

/** Rotulo del boton de ingreso. */
export const TEXTO_BOTON = 'Ingresar';

/** Etiqueta accesible del campo de la Clave_Acceso. */
export const ETIQUETA_CAMPO = 'Clave de acceso';

/** Longitud maxima del campo de entrada, en caracteres (Requisito 1.1). */
export const LONGITUD_MAXIMA_CLAVE = 64;

/**
 * Clases que el Portal_Acceso escribe en el DOM. Se exportan para que
 * `src/estilos/portal.css` y las pruebas hablen del mismo vocabulario: el DOM
 * es la fuente de verdad y la hoja apunta exactamente a estas clases.
 */
export const CLASES_PORTAL = {
  seccion: 'portal',
  invitacion: 'portal__invitacion',
  formulario: 'portal__formulario',
  campo: 'portal__campo',
  ingreso: 'portal__ingreso',
  mensaje: 'portal__mensaje',
} as const;

/** Dependencias del Portal_Acceso, todas sustituibles en pruebas. */
export interface DependenciasPortal {
  /** Hash_Clave configurado: 64 caracteres hexadecimales minusculos. */
  readonly hashClave: string;
  /** Digesto SHA-256 del texto ya normalizado; `null` si no esta disponible. */
  readonly digerir: (texto: string) => Promise<string | null>;
  /** Estado de la sesion actual del navegador. */
  readonly sesion: EstadoSesion;
  /** Se invoca una sola vez, al conceder el acceso, para mostrar el regalo. */
  readonly alConcederAcceso: () => void;
}

/** Estados del Portal_Acceso. */
export type EstadoPortal =
  | { readonly clase: 'reposo' }
  | { readonly clase: 'verificando' }
  | { readonly clase: 'reintento'; readonly mensaje: typeof MENSAJE_REINTENTO }
  | { readonly clase: 'sin-validacion'; readonly mensaje: string }
  | { readonly clase: 'concedido' };

/** Asa devuelta por `montarPortal`. */
export interface PortalMontado {
  /** Quita el portal del DOM y suelta sus escuchas. Idempotente. */
  destruir(): void;
}

/** Contador de montajes, para que los `id` del DOM no se repitan. */
let montajes = 0;

/**
 * Monta el Portal_Acceso dentro de `raiz`.
 *
 * No borra el contenido previo de `raiz`: crea su propia seccion y la agrega,
 * de modo que el contenedor de la Pagina_Regalo pueda convivir como hermano,
 * `hidden` hasta la concesion.
 *
 * @param raiz Elemento contenedor donde vive la vista del portal.
 * @param deps Hash_Clave, funcion de digesto, estado de sesion y callback de
 *   concesion.
 * @returns Asa con `destruir()`.
 */
export function montarPortal(raiz: HTMLElement, deps: DependenciasPortal): PortalMontado {
  const sufijo = String((montajes += 1));
  const idCampo = `portal-clave-${sufijo}`;
  const idInvitacion = `portal-invitacion-${sufijo}`;
  const idMensaje = `portal-mensaje-${sufijo}`;

  const seccion = document.createElement('section');
  seccion.className = CLASES_PORTAL.seccion;
  seccion.setAttribute('aria-labelledby', idInvitacion);

  const invitacion = document.createElement('h1');
  invitacion.className = CLASES_PORTAL.invitacion;
  invitacion.id = idInvitacion;
  invitacion.textContent = TEXTO_INVITACION;

  const formulario = document.createElement('form');
  formulario.className = CLASES_PORTAL.formulario;
  formulario.noValidate = true;

  const etiqueta = document.createElement('label');
  etiqueta.className = 'solo-lectores';
  etiqueta.htmlFor = idCampo;
  etiqueta.textContent = ETIQUETA_CAMPO;

  const campo = document.createElement('input');
  campo.className = CLASES_PORTAL.campo;
  campo.id = idCampo;
  campo.name = 'clave';
  campo.type = 'password';
  campo.maxLength = LONGITUD_MAXIMA_CLAVE;
  campo.autocomplete = 'off';
  campo.spellcheck = false;
  campo.setAttribute('autocapitalize', 'off');
  campo.setAttribute('aria-describedby', idMensaje);

  const boton = document.createElement('button');
  boton.className = CLASES_PORTAL.ingreso;
  boton.type = 'submit';
  boton.textContent = TEXTO_BOTON;
  // Requisito 1.5: el campo arranca vacio, asi que el boton arranca deshabilitado.
  boton.disabled = true;

  // Requisito 1.4: la region existe desde el montaje, para que el lector de
  // pantalla anuncie el cambio de texto en lugar de la aparicion del nodo.
  const mensaje = document.createElement('p');
  mensaje.className = CLASES_PORTAL.mensaje;
  mensaje.id = idMensaje;
  mensaje.setAttribute('role', 'status');
  mensaje.setAttribute('aria-live', 'polite');

  formulario.append(invitacion, etiqueta, campo, boton, mensaje);
  seccion.append(formulario);

  let estado: EstadoPortal = { clase: 'reposo' };
  let destruido = false;
  /** Identifica el envio en vuelo: descarta digestos de envios superados. */
  let envioActual = 0;

  /** Clave normalizada que hay ahora en el campo (Requisito 1.2). */
  const claveNormalizada = (): string => normalizarClave(campo.value);

  /**
   * Escribe el estado en el DOM. Unico lugar que toca atributos de la vista,
   * para que la maquina de estados no se disperse en los manejadores.
   */
  const aplicarEstado = (nuevo: EstadoPortal): void => {
    estado = nuevo;
    seccion.dataset['estado'] = nuevo.clase;

    const conMensaje = nuevo.clase === 'reintento' || nuevo.clase === 'sin-validacion';
    mensaje.textContent = conMensaje ? nuevo.mensaje : '';

    if (nuevo.clase === 'reintento') {
      campo.setAttribute('aria-invalid', 'true');
    } else {
      campo.removeAttribute('aria-invalid');
    }

    // Requisito 1.5 y reentrancia: el boton solo admite pulsacion en reposo o
    // tras un reintento, y solo con clave normalizada de longitud >= 1.
    const admiteEnvio = nuevo.clase === 'reposo' || nuevo.clase === 'reintento';
    boton.disabled = !admiteEnvio || claveNormalizada().length === 0;

    if (nuevo.clase === 'concedido') {
      // El portal se retira de la vista; la Pagina_Regalo la muestra quien
      // recibe `alConcederAcceso` (Requisito 1.3).
      seccion.hidden = true;
    }
  };

  /** Concede el acceso: registra la sesion y avisa una sola vez. */
  const conceder = (): void => {
    deps.sesion.registrarAcceso();
    aplicarEstado({ clase: 'concedido' });
    deps.alConcederAcceso();
  };

  const alEscribir = (): void => {
    if (estado.clase === 'reposo' || estado.clase === 'reintento') {
      boton.disabled = claveNormalizada().length === 0;
    }
  };

  /**
   * Valida la clave enviada. Requisito 1.10: no hay contador de intentos, ni
   * bloqueo, ni retardo; cada envio repite exactamente el mismo camino.
   */
  const alEnviar = (evento: Event): void => {
    // Sin servidor que reciba el formulario: el envio nativo solo sirve para
    // que Enter y la barra espaciadora lleguen aqui (Requisitos 1.8 y 7.10).
    evento.preventDefault();

    if (estado.clase === 'verificando' || estado.clase === 'concedido') {
      return;
    }

    const clave = claveNormalizada();

    // Requisito 1.5: con longitud 0 el envio se ignora y el estado no cambia.
    if (clave.length === 0) {
      return;
    }

    const envio = (envioActual += 1);
    aplicarEstado({ clase: 'verificando' });

    void deps.digerir(clave).then((digesto) => {
      if (destruido || envio !== envioActual) {
        return;
      }

      // Requisito 1.11: sin SHA-256 no se concede el acceso.
      if (digesto === null) {
        aplicarEstado({ clase: 'sin-validacion', mensaje: MENSAJE_SIN_VALIDACION });
        return;
      }

      if (digesto === deps.hashClave) {
        conceder();
        return;
      }

      // Requisito 1.4: se limpia el campo, vuelve el foco y queda el mensaje.
      campo.value = '';
      aplicarEstado({ clase: 'reintento', mensaje: MENSAJE_REINTENTO });
      campo.focus();
    });
  };

  campo.addEventListener('input', alEscribir);
  formulario.addEventListener('submit', alEnviar);
  raiz.append(seccion);

  // Requisitos 1.7 y 1.9: el acceso ya concedido en esta sesion no se vuelve a
  // pedir; en una sesion nueva `accesoConcedido()` es falso y el portal queda
  // en reposo pidiendo la Clave_Acceso.
  if (deps.sesion.accesoConcedido()) {
    conceder();
  } else {
    aplicarEstado(estado);
  }

  return {
    destruir(): void {
      if (destruido) {
        return;
      }

      destruido = true;
      campo.removeEventListener('input', alEscribir);
      formulario.removeEventListener('submit', alEnviar);
      seccion.remove();
    },
  };
}
