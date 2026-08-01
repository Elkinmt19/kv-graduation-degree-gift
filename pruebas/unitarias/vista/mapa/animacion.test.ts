import { describe, expect, it, vi } from 'vitest';

import type {
  CieloCalculado,
  EstrellaCalculada,
  InstanteGraduacion,
} from '../../../../src/nucleo/astronomia/modelo.js';
import {
  AMPLITUD_MAXIMA,
  AMPLITUD_MINIMA,
  CICLO_MAXIMO_MS,
  CICLO_MINIMO_MS,
  FOTOGRAMAS_POR_SEGUNDO_MINIMOS,
  OPACIDAD_ESTATICA,
  OPACIDAD_MAXIMA,
  OPACIDAD_MINIMA,
  PRESUPUESTO_FOTOGRAMA_MS,
  crearTitileo,
  faseDe,
  fasesDelCielo,
  opacidadEn,
  semillaDeInstante,
  type FuenteFotogramas,
} from '../../../../src/vista/mapa/animacion.js';
import type { ConsultaMedios, EventoMedios } from '../../../../src/infra/movimiento-reducido.js';

const INSTANTE: InstanteGraduacion = {
  iso: '2025-12-05T18:30:00-05:00',
  msUtc: Date.parse('2025-12-05T18:30:00-05:00'),
};

/** Consulta de medios manual: la prueba decide el valor y cuando cambia. */
function consultaManual(inicial: boolean): ConsultaMedios & { cambiar(valor: boolean): void } {
  const escuchas = new Set<(evento: EventoMedios) => void>();
  let actual = inicial;

  return {
    get matches(): boolean {
      return actual;
    },
    addEventListener: (_tipo, escucha): void => {
      escuchas.add(escucha);
    },
    removeEventListener: (_tipo, escucha): void => {
      escuchas.delete(escucha);
    },
    cambiar: (valor: boolean): void => {
      actual = valor;
      for (const escucha of [...escuchas]) {
        escucha({ matches: valor });
      }
    },
  };
}

/** Fuente de fotogramas manual: nada corre hasta que la prueba pide un paso. */
function fuenteManual(): FuenteFotogramas & {
  paso(tiempoMs: number): boolean;
  pendientes(): number;
  cancelaciones(): number;
  solicitudes(): number;
} {
  const cola = new Map<number, (tiempoMs: number) => void>();
  let siguiente = 1;
  let cancelaciones = 0;
  let solicitudes = 0;

  return {
    solicitar: (accion) => {
      const identificador = siguiente;
      siguiente += 1;
      solicitudes += 1;
      cola.set(identificador, accion);
      return identificador;
    },
    cancelar: (identificador) => {
      cancelaciones += 1;
      cola.delete(identificador as number);
    },
    paso: (tiempoMs: number): boolean => {
      const primera = [...cola.entries()][0];
      if (primera === undefined) {
        return false;
      }
      cola.delete(primera[0]);
      primera[1](tiempoMs);
      return true;
    },
    pendientes: (): number => cola.size,
    cancelaciones: (): number => cancelaciones,
    solicitudes: (): number => solicitudes,
  };
}

/** Estrella calculada minima; `visible` decide si el bucle la anima. */
function estrella(nombre: string, visible: boolean): EstrellaCalculada {
  return {
    estrella: { nombre, ar: 5.5, dec: -8.2, magnitud: 0.5, constelacion: 'Orion' },
    horizontal: { altitud: visible ? 42 : -42, azimut: 120 },
    visible,
    pantalla: visible ? { x: 200, y: 180 } : null,
    radio: 2,
  };
}

/** Cielo de prueba: dos estrellas visibles y una bajo el horizonte. */
function cieloDePrueba(): CieloCalculado {
  return {
    instante: INSTANTE,
    lugar: { nombre: 'Neiva, Colombia', latitud: 2.9273, longitud: -75.2819 },
    circulo: { cx: 300, cy: 300, radio: 292 },
    estrellas: [estrella('Sirio', true), estrella('Rigel', false), estrella('Vega', true)],
    segmentosVisibles: [],
    constelacionesDibujadas: ['Orion'],
    cardinales: [],
  };
}

const NOMBRES = ['Sirio', 'Canopus', 'Arturo', 'Vega', 'Capella', 'Rigel', 'Procion', 'Altair'];

describe('faseDe (Requisitos 3.6, 6.1)', () => {
  it('respeta los invariantes de la fase para toda estrella y semilla', () => {
    for (const semilla of [0, 1, 7, 2 ** 31, -5, semillaDeInstante(INSTANTE)]) {
      for (const nombre of NOMBRES) {
        const fase = faseDe(
          { nombre, ar: 0, dec: 0, magnitud: 1, constelacion: 'X' },
          semilla,
        );

        expect(Number.isInteger(fase.periodoMs)).toBe(true);
        expect(fase.periodoMs).toBeGreaterThanOrEqual(CICLO_MINIMO_MS);
        expect(fase.periodoMs).toBeLessThanOrEqual(CICLO_MAXIMO_MS);
        expect(Number.isInteger(fase.desfaseMs)).toBe(true);
        expect(fase.desfaseMs).toBeGreaterThanOrEqual(0);
        expect(fase.desfaseMs).toBeLessThan(fase.periodoMs);
        expect(fase.amplitud).toBeGreaterThanOrEqual(AMPLITUD_MINIMA);
        expect(fase.amplitud).toBeLessThanOrEqual(AMPLITUD_MAXIMA);
        expect(fase.centro - fase.amplitud).toBeGreaterThanOrEqual(OPACIDAD_MINIMA);
        expect(fase.centro + fase.amplitud).toBeLessThanOrEqual(OPACIDAD_MAXIMA);
      }
    }
  });

  it('es determinista por nombre y semilla, e independiente de la posicion', () => {
    const semilla = semillaDeInstante(INSTANTE);
    const suelta = faseDe({ nombre: 'Vega', ar: 0, dec: 0, magnitud: 1, constelacion: 'X' }, semilla);
    const fases = fasesDelCielo(cieloDePrueba(), semilla);

    expect(fasesDelCielo(cieloDePrueba(), semilla)).toEqual(fases);
    // 'Vega' es la tercera del cielo de prueba: su fase no depende del indice.
    expect(fases[2]).toEqual(suelta);
  });

  it('cambia el titileo cuando cambia el Instante_Graduacion', () => {
    const otro: InstanteGraduacion = {
      iso: '2026-01-15T09:00:00-05:00',
      msUtc: Date.parse('2026-01-15T09:00:00-05:00'),
    };
    const a = NOMBRES.map((nombre) =>
      faseDe({ nombre, ar: 0, dec: 0, magnitud: 1, constelacion: 'X' }, semillaDeInstante(INSTANTE)),
    );
    const b = NOMBRES.map((nombre) =>
      faseDe({ nombre, ar: 0, dec: 0, magnitud: 1, constelacion: 'X' }, semillaDeInstante(otro)),
    );

    expect(a).not.toEqual(b);
  });
});

describe('opacidadEn (Requisitos 6.1, 7.8)', () => {
  const fase = faseDe({ nombre: 'Sirio', ar: 0, dec: 0, magnitud: 1, constelacion: 'X' }, 12345);

  it('mantiene la opacidad dentro del intervalo de la paleta', () => {
    for (let tiempo = 0; tiempo <= 20000; tiempo += 17) {
      const opacidad = opacidadEn(fase, tiempo);
      expect(opacidad).toBeGreaterThanOrEqual(OPACIDAD_MINIMA);
      expect(opacidad).toBeLessThanOrEqual(OPACIDAD_MAXIMA);
    }
  });

  it('es periodica en el ciclo de la estrella', () => {
    for (const tiempo of [0, 250, 1234, 5678]) {
      expect(opacidadEn(fase, tiempo)).toBeCloseTo(opacidadEn(fase, tiempo + fase.periodoMs), 10);
    }
  });

  it('oscila de verdad: recorre valores distintos dentro de un ciclo', () => {
    const muestras = new Set<number>();
    for (let tiempo = 0; tiempo < fase.periodoMs; tiempo += fase.periodoMs / 8) {
      muestras.add(Number(opacidadEn(fase, tiempo).toFixed(6)));
    }
    expect(muestras.size).toBeGreaterThan(1);
  });

  it('devuelve el centro del ciclo con tiempos absurdos', () => {
    for (const tiempo of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(opacidadEn(fase, tiempo)).toBe(fase.centro);
    }
  });
});

describe('crearTitileo: un unico bucle (Requisito 7.8)', () => {
  it('mantiene una sola solicitud pendiente y pinta un fotograma por paso', () => {
    const fuente = fuenteManual();
    const pintar = vi.fn();
    const titileo = crearTitileo({ cielo: cieloDePrueba(), pintar, fuente, consulta: null });

    titileo.iniciar();
    expect(titileo.activo()).toBe(true);
    expect(fuente.pendientes()).toBe(1);
    expect(pintar).not.toHaveBeenCalled();

    for (let indice = 1; indice <= 5; indice += 1) {
      fuente.paso(indice * 16);
      // Una sola solicitud viva en todo momento: nunca una por estrella.
      expect(fuente.pendientes()).toBe(1);
      expect(pintar).toHaveBeenCalledTimes(indice);
      expect(titileo.fotogramas()).toBe(indice);
    }

    // Tres estrellas en el cielo, dos sobre el horizonte: solo esas se animan.
    expect(titileo.estrellasAnimadas()).toBe(2);
    expect(fuente.solicitudes()).toBe(6);

    titileo.destruir();
  });

  it('solo recalcula las estrellas visibles y deja las demas en su estado final', () => {
    const fuente = fuenteManual();
    const registradas: number[][] = [];
    const titileo = crearTitileo({
      cielo: cieloDePrueba(),
      pintar: (opacidades) => {
        registradas.push(Array.from({ length: opacidades.length }, (_, i) => opacidades[i] ?? 0));
      },
      fuente,
      consulta: null,
    });

    titileo.iniciar();
    fuente.paso(0);
    fuente.paso(1500);

    for (const fotograma of registradas) {
      expect(fotograma).toHaveLength(3);
      // 'Rigel' esta bajo el horizonte: su opacidad no la toca el bucle.
      expect(fotograma[1]).toBe(OPACIDAD_ESTATICA);
      for (const opacidad of fotograma) {
        expect(opacidad).toBeGreaterThanOrEqual(OPACIDAD_MINIMA);
        expect(opacidad).toBeLessThanOrEqual(OPACIDAD_MAXIMA);
      }
    }
    // Con 1500 ms de diferencia el titileo tuvo que moverse.
    expect(registradas[0]?.[0]).not.toBe(registradas[1]?.[0]);

    titileo.destruir();
  });

  it('produce la misma animacion con el mismo instante y la misma linea de tiempo', () => {
    const tiempos = [0, 16, 33, 50, 900, 4321];

    const correr = (): number[][] => {
      const fuente = fuenteManual();
      const fotogramas: number[][] = [];
      const titileo = crearTitileo({
        cielo: cieloDePrueba(),
        pintar: (opacidades) => {
          fotogramas.push(Array.from({ length: opacidades.length }, (_, i) => opacidades[i] ?? 0));
        },
        fuente,
        consulta: null,
      });
      titileo.iniciar();
      for (const tiempo of tiempos) {
        fuente.paso(tiempo);
      }
      titileo.destruir();
      return fotogramas;
    };

    expect(correr()).toEqual(correr());
  });

  it('iniciar dos veces no crea un segundo bucle', () => {
    const fuente = fuenteManual();
    const titileo = crearTitileo({
      cielo: cieloDePrueba(),
      pintar: () => {},
      fuente,
      consulta: null,
    });

    titileo.iniciar();
    titileo.iniciar();

    expect(fuente.pendientes()).toBe(1);
    expect(fuente.solicitudes()).toBe(1);

    titileo.destruir();
  });

  it('detener y destruir cancelan la solicitud pendiente', () => {
    const fuente = fuenteManual();
    const pintar = vi.fn();
    const titileo = crearTitileo({ cielo: cieloDePrueba(), pintar, fuente, consulta: null });

    titileo.iniciar();
    titileo.detener();

    expect(titileo.activo()).toBe(false);
    expect(fuente.pendientes()).toBe(0);
    expect(fuente.cancelaciones()).toBe(1);
    expect(fuente.paso(100)).toBe(false);
    expect(pintar).not.toHaveBeenCalled();

    expect(() => {
      titileo.destruir();
    }).not.toThrow();
  });

  it('deja margen de sobra frente al presupuesto de 30 fps', () => {
    expect(PRESUPUESTO_FOTOGRAMA_MS * FOTOGRAMAS_POR_SEGUNDO_MINIMOS).toBeGreaterThanOrEqual(990);
  });
});

describe('crearTitileo: movimiento reducido (Requisito 7.5)', () => {
  it('no inicia el bucle y pinta un unico fotograma estatico', () => {
    const fuente = fuenteManual();
    const pintar = vi.fn();
    const titileo = crearTitileo({
      cielo: cieloDePrueba(),
      pintar,
      fuente,
      consulta: consultaManual(true),
    });

    titileo.iniciar();

    expect(titileo.activo()).toBe(false);
    expect(fuente.pendientes()).toBe(0);
    expect(fuente.solicitudes()).toBe(0);
    expect(pintar).toHaveBeenCalledTimes(1);

    const [opacidades, tiempo] = pintar.mock.calls[0] as [ArrayLike<number>, number];
    expect(tiempo).toBe(0);
    for (let indice = 0; indice < opacidades.length; indice += 1) {
      expect(opacidades[indice]).toBe(OPACIDAD_ESTATICA);
    }

    titileo.destruir();
  });

  it('se detiene y se asienta en el fotograma estatico si la preferencia se activa', () => {
    const fuente = fuenteManual();
    const consulta = consultaManual(false);
    const pintar = vi.fn();
    const titileo = crearTitileo({ cielo: cieloDePrueba(), pintar, fuente, consulta });

    titileo.iniciar();
    fuente.paso(500);
    expect(titileo.activo()).toBe(true);

    consulta.cambiar(true);

    expect(titileo.activo()).toBe(false);
    expect(fuente.pendientes()).toBe(0);
    const ultimas = pintar.mock.calls.at(-1) as [ArrayLike<number>, number];
    expect(ultimas[1]).toBe(0);
    for (let indice = 0; indice < ultimas[0].length; indice += 1) {
      expect(ultimas[0][indice]).toBe(OPACIDAD_ESTATICA);
    }

    titileo.destruir();
  });

  it('reanuda el bucle si la preferencia se desactiva', () => {
    const fuente = fuenteManual();
    const consulta = consultaManual(true);
    const titileo = crearTitileo({
      cielo: cieloDePrueba(),
      pintar: () => {},
      fuente,
      consulta,
    });

    titileo.iniciar();
    expect(titileo.activo()).toBe(false);

    consulta.cambiar(false);
    expect(titileo.activo()).toBe(true);
    expect(fuente.pendientes()).toBe(1);

    // Tras detener a mano, un cambio de preferencia no revive el bucle.
    titileo.detener();
    consulta.cambiar(true);
    consulta.cambiar(false);
    expect(titileo.activo()).toBe(false);

    titileo.destruir();
  });

  it('sin fuente de fotogramas se comporta como con movimiento reducido', () => {
    const pintar = vi.fn();
    const titileo = crearTitileo({
      cielo: cieloDePrueba(),
      pintar,
      fuente: null,
      consulta: null,
    });

    titileo.iniciar();

    expect(titileo.activo()).toBe(false);
    expect(pintar).toHaveBeenCalledTimes(1);

    titileo.destruir();
  });
});
