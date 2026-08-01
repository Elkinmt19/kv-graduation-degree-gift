import type { LugarGraduacion } from '../astronomia/modelo.js';

/**
 * Texto dedicado que acompana al Mapa_Estelar (Requisitos 5.1, 5.5, 5.6, 8.1).
 */
export interface CartaConfigurada {
  /** Saludo dirigido a KawaValen: 1..120 caracteres. */
  readonly saludo: string;
  /** Parrafos de la Carta: 1..12 elementos, cada uno <= 1200 caracteres. */
  readonly parrafos: readonly string[];
  /** Firma del autor del regalo: 1..120 caracteres. */
  readonly firma: string;
}

/**
 * Archivo_Configuracion (`regalo.config.json`): unica superficie de ajuste del
 * regalo (Requisito 8.1). Los interruptores son opcionales; su ausencia se trata
 * como desactivado con una advertencia del validador (Requisito 8.10).
 */
export interface ConfiguracionRegalo {
  /** Hash_Clave: hexadecimal minuscula de exactamente 64 caracteres, /^[0-9a-f]{64}$/. */
  readonly hashClave: string;
  /** Instante_Graduacion: ISO 8601 con desplazamiento horario -05:00. */
  readonly instanteGraduacion: string;
  /** Lugar_Graduacion: latitud en [-90, 90], longitud en [-180, 180]. */
  readonly lugarGraduacion: LugarGraduacion;
  readonly carta: CartaConfigurada;
  /** Guinos_Personales; ausente => false mas advertencia (Requisito 8.10). */
  readonly guinosPersonales?: boolean;
  /** Reproduccion del sanjuanero; ausente => false mas advertencia (Requisito 8.10). */
  readonly musica?: boolean;
}
