import { describe, expect, it } from 'vitest';

import {
  CONSULTA_MOVIMIENTO_REDUCIDO,
  consultaDelNavegador,
  observarMovimientoReducido,
  prefiereMovimientoReducido,
  type ConsultaMedios,
  type EventoMedios,
} from '../../../src/infra/movimiento-reducido.js';

/**
 * Pruebas unitarias de la consulta de movimiento reducido (Requisito 7.5).
 *
 * Las hojas de estilo ya anulan sus animaciones con la misma consulta de
 * medios; este modulo la expone al codigo que anima por su cuenta (aparicion de
 * la Carta y titileo del Mapa_Estelar). Las pruebas sustituyen la consulta del
 * navegador por un objeto simple, de modo que no hace falta DOM.
 */

/** Consulta de medios simulada, con control sobre sus escuchas. */
interface ConsultaSimulada {
  readonly consulta: ConsultaMedios;
  /** Cambia el valor y notifica a las escuchas registradas. */
  readonly emitir: (coincide: boolean) => void;
  readonly cantidadDeEscuchas: () => number;
}

function crearConsulta(inicial: boolean): ConsultaSimulada {
  const escuchas = new Set<(evento: EventoMedios) => void>();
  let coincide = inicial;

  const consulta: ConsultaMedios = {
    get matches(): boolean {
      return coincide;
    },
    addEventListener(tipo, escucha) {
      if (tipo === 'change') escuchas.add(escucha);
    },
    removeEventListener(tipo, escucha) {
      if (tipo === 'change') escuchas.delete(escucha);
    },
  };

  return {
    consulta,
    emitir(nuevo: boolean): void {
      coincide = nuevo;
      for (const escucha of [...escuchas]) escucha({ matches: nuevo });
    },
    cantidadDeEscuchas: () => escuchas.size,
  };
}

describe('CONSULTA_MOVIMIENTO_REDUCIDO', () => {
  it('es la consulta de medios estandar de la preferencia', () => {
    expect(CONSULTA_MOVIMIENTO_REDUCIDO).toBe('(prefers-reduced-motion: reduce)');
  });
});

describe('prefiereMovimientoReducido (Requisito 7.5)', () => {
  it('devuelve el valor declarado por la consulta', () => {
    expect(prefiereMovimientoReducido(crearConsulta(true).consulta)).toBe(true);
    expect(prefiereMovimientoReducido(crearConsulta(false).consulta)).toBe(false);
  });

  it('sin consulta disponible asume que no hay preferencia declarada', () => {
    // No privar del movimiento a quien no lo pidio.
    expect(prefiereMovimientoReducido(null)).toBe(false);
  });

  it('no falla cuando el entorno carece de matchMedia', () => {
    // El proyecto `nucleo` de Vitest corre en Node, sin `matchMedia`.
    expect(typeof globalThis.matchMedia).not.toBe('function');
    expect(consultaDelNavegador()).toBeNull();
    expect(prefiereMovimientoReducido()).toBe(false);
  });
});

describe('observarMovimientoReducido (Requisito 7.5)', () => {
  it('avisa de cada cambio de la preferencia', () => {
    const simulada = crearConsulta(false);
    const vistos: boolean[] = [];

    observarMovimientoReducido((reducido) => vistos.push(reducido), simulada.consulta);
    expect(simulada.cantidadDeEscuchas()).toBe(1);

    simulada.emitir(true);
    simulada.emitir(false);

    expect(vistos).toEqual([true, false]);
    // La consulta queda coherente con el ultimo cambio emitido.
    expect(prefiereMovimientoReducido(simulada.consulta)).toBe(false);
  });

  it('cancelar la observacion retira la escucha y detiene los avisos', () => {
    const simulada = crearConsulta(false);
    const vistos: boolean[] = [];

    const cancelar = observarMovimientoReducido(
      (reducido) => vistos.push(reducido),
      simulada.consulta,
    );
    simulada.emitir(true);
    cancelar();
    simulada.emitir(false);

    expect(simulada.cantidadDeEscuchas()).toBe(0);
    expect(vistos).toEqual([true]);
  });

  it('cancelar dos veces no falla', () => {
    const simulada = crearConsulta(true);
    const cancelar = observarMovimientoReducido(() => {}, simulada.consulta);
    cancelar();
    expect(() => cancelar()).not.toThrow();
    expect(simulada.cantidadDeEscuchas()).toBe(0);
  });

  it('sin consulta disponible devuelve una cancelacion inocua', () => {
    const cancelar = observarMovimientoReducido(() => {
      throw new Error('no deberia avisar sin consulta');
    }, null);
    expect(() => cancelar()).not.toThrow();
  });
});
