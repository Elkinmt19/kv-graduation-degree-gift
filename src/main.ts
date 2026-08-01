/**
 * Punto de entrada de la Aplicacion: cablea el arranque completo.
 *
 * Secuencia (Requisitos 1.3, 1.7, 1.9, 4.8, 4.11, 8.2, 8.7):
 * 1. Lee el estado de sesion y arranca la precarga del Catalogo_Estelar en
 *    paralelo al montaje del Portal_Acceso; ninguno espera al otro.
 * 2. Monta el Portal_Acceso. Si el acceso ya estaba concedido en esta sesion,
 *    `montarPortal` pasa directo a `concedido` y llama `alConcederAcceso`.
 * 3. Al conceder el acceso, espera la precarga (si aun no habia terminado),
 *    calcula el Cielo_Calculado si el catalogo llego bien, y monta la
 *    Pagina_Regalo: Mapa_Estelar, Lienzo_Carta y Guinos_Personales segun los
 *    interruptores de `regalo.config.json`.
 *
 * `regalo.config.json` se consume como modulo importado (Requisito 8.2): sus
 * valores quedan incrustados en el paquete de construccion y no generan
 * ninguna peticion en tiempo de ejecucion.
 */

import './estilos/fuentes.css';
import './estilos/base.css';
import './estilos/portal.css';
import './estilos/mapa.css';
import './estilos/carta.css';
import './estilos/guinos.css';
import './estilos/respuesta.css';

import configuracionCruda from '../regalo.config.json';
import { digerir as digerirReal, type Digerir } from './infra/hash.js';
import { obtenerCatalogo } from './nucleo/catalogo/lector.js';
import { traerConFetch, relojDeRendimiento, type Reloj, type Traer } from './infra/recursos.js';
import { crearEstadoSesion, type EstadoSesion } from './infra/sesion.js';
import type { ConfiguracionRegalo } from './nucleo/configuracion/modelo.js';
import { resolverCarta } from './nucleo/carta/resolver.js';
import { calcularCielo } from './nucleo/astronomia/motor.js';
import type { CieloCalculado, InstanteGraduacion } from './nucleo/astronomia/modelo.js';
import { prefiereMovimientoReducido } from './infra/movimiento-reducido.js';
import { montarPortal } from './vista/portal/portal.js';
import { montarCieloFondo, semillaDesdeTexto } from './vista/portal/cielo-fondo.js';
import { montarMapa } from './vista/mapa/mapa.js';
import { calcularCirculo } from './vista/mapa/circulo.js';
import { rotuloLugarFecha, rotuloDelCielo } from './vista/mapa/rotulo.js';
import { montarCarta } from './vista/carta/lienzo.js';
import { montarDecoraciones } from './vista/guinos/decoraciones.js';
import { montarAudio } from './vista/guinos/audio.js';

/** Ruta del Catalogo_Estelar publicado, relativa al sitio servido. */
export const RUTA_CATALOGO = 'datos/catalogo-estelar.json';

/** Clases de la rejilla de la Pagina_Regalo (`src/estilos/respuesta.css`). */
export const CLASES_REGALO = {
  contenedor: 'regalo',
  mapa: 'regalo__mapa',
  carta: 'regalo__carta',
} as const;

/**
 * Dependencias sustituibles del arranque, todas con una lectura por omision
 * apoyada en el entorno real. Una prueba de integracion fija `traer` y
 * `digerir` para no depender de la red ni de Web Crypto.
 */
export interface DependenciasAplicacion {
  readonly traer?: Traer;
  readonly reloj?: Reloj;
  readonly digerir?: Digerir;
  readonly sesion?: EstadoSesion;
}

/**
 * Arranca la Aplicacion dentro de `raiz`: precarga el Catalogo_Estelar en
 * paralelo al Portal_Acceso y, al conceder el acceso, monta la Pagina_Regalo.
 *
 * @param raiz Contenedor `#aplicacion` del documento.
 * @param config `regalo.config.json`, importado como modulo por quien llama.
 * @param deps Dependencias de borde sustituibles; por omision las reales.
 */
export function arrancarAplicacion(
  raiz: HTMLElement,
  config: ConfiguracionRegalo,
  deps: DependenciasAplicacion = {},
): void {
  const traer = deps.traer ?? traerConFetch;
  const reloj = deps.reloj ?? relojDeRendimiento;
  const digerir = deps.digerir ?? digerirReal;
  const sesion = deps.sesion ?? crearEstadoSesion();

  const precargaCatalogo = obtenerCatalogo(traer, reloj, RUTA_CATALOGO);

  const cieloFondo = montarCieloFondo(raiz, { semilla: semillaDesdeTexto(config.instanteGraduacion) });

  montarPortal(raiz, {
    hashClave: config.hashClave,
    digerir,
    sesion,
    alConcederAcceso: () => {
      cieloFondo.destruir();
      void mostrarPaginaRegalo(raiz, config, sesion, precargaCatalogo);
    },
  });
}

async function mostrarPaginaRegalo(
  raiz: HTMLElement,
  config: ConfiguracionRegalo,
  sesion: EstadoSesion,
  precargaCatalogo: ReturnType<typeof obtenerCatalogo>,
): Promise<void> {
  const guinos = config.guinosPersonales ?? false;
  const musica = config.musica ?? false;

  const resultadoCatalogo = await precargaCatalogo;
  const catalogo = resultadoCatalogo.ok ? resultadoCatalogo.catalogo : null;
  const cielo = calcularCieloSiPosible(catalogo, config);

  const contenedor = document.createElement('div');
  contenedor.className = CLASES_REGALO.contenedor;

  const seccionMapa = document.createElement('section');
  seccionMapa.className = `mapa ${CLASES_REGALO.mapa}`;
  const lienzo = document.createElement('canvas');
  lienzo.className = 'mapa__lienzo';
  seccionMapa.append(lienzo);

  const seccionCarta = document.createElement('div');
  seccionCarta.className = CLASES_REGALO.carta;

  contenedor.append(seccionMapa, seccionCarta);
  raiz.append(contenedor);

  const rotulo =
    cielo === null
      ? rotuloLugarFecha(instanteDesdeConfig(config.instanteGraduacion), config.lugarGraduacion)
      : rotuloDelCielo(cielo);

  montarMapa(lienzo, {
    cielo,
    rotulo,
    guinos,
    movimientoReducido: prefiereMovimientoReducido(),
  });

  montarCarta(seccionCarta, resolverCarta(config.carta), { sesion });
  montarDecoraciones(seccionCarta, { guinos });
  montarAudio(seccionCarta, { musica });
}

function instanteDesdeConfig(iso: string): InstanteGraduacion {
  return { iso, msUtc: Date.parse(iso) };
}

function calcularCieloSiPosible(
  catalogo: Parameters<typeof calcularCielo>[0] | null,
  config: ConfiguracionRegalo,
): CieloCalculado | null {
  if (catalogo === null) {
    return null;
  }

  const instante = instanteDesdeConfig(config.instanteGraduacion);
  const circulo = calcularCirculo(0, 0);
  const resultado = calcularCielo(catalogo, instante, config.lugarGraduacion, circulo);
  return resultado.ok ? resultado.cielo : null;
}

const raiz = document.querySelector<HTMLDivElement>('#aplicacion');

if (raiz !== null) {
  arrancarAplicacion(raiz, configuracionCruda as ConfiguracionRegalo);
}
