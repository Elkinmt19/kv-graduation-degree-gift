import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ANTIRREBOTE_MS,
  DENSIDAD_MAXIMA,
  DIAMETRO_MINIMO,
  MARGEN_MINIMO,
  MARGEN_TOTAL,
  PRESUPUESTO_REDIBUJO_MS,
  RADIO_MINIMO,
  ajustarLienzo,
  antirrebote,
  cabeConMargen,
  calcularCirculo,
  dimensionarLienzo,
  normalizarDensidad,
  observarTamano,
  radioCirculo,
  type FabricaObservador,
  type ObservadorTamano,
  type Reloj,
  type TamanoMapa,
} from '../../../../src/vista/mapa/circulo.js';

/** Reloj manual: nada corre hasta que la prueba avanza el tiempo. */
function relojManual(): Reloj & { avanzar(ms: number): void; pendientes(): number } {
  let siguiente = 1;
  const tareas = new Map<number, { accion: () => void; restante: number }>();

  return {
    programar: (accion, ms) => {
      const identificador = siguiente;
      siguiente += 1;
      tareas.set(identificador, { accion, restante: ms });
      return identificador;
    },
    cancelar: (identificador) => {
      tareas.delete(identificador as number);
    },
    avanzar: (ms: number): void => {
      for (const [identificador, tarea] of [...tareas]) {
        const restante = tarea.restante - ms;
        if (restante <= 0) {
          tareas.delete(identificador);
          tarea.accion();
        } else {
          tareas.set(identificador, { accion: tarea.accion, restante });
        }
      }
    },
    pendientes: (): number => tareas.size,
  };
}

describe('radioCirculo (Requisito 4.12)', () => {
  it('deja 8 px de margen por lado en el lado menor', () => {
    // 800 x 600: manda el alto, R = (600 - 16) / 2 = 292.
    expect(radioCirculo(800, 600)).toBe(292);
    // Cuadrada: R = (480 - 16) / 2 = 232.
    expect(radioCirculo(480, 480)).toBe(232);
    // El ancho manda cuando es el menor.
    expect(radioCirculo(360, 900)).toBe(172);
  });

  it('nunca baja de 140 px, ni con ventanas diminutas', () => {
    for (const [ancho, alto] of [
      [296, 296],
      [200, 400],
      [0, 0],
      [1, 1],
    ] as const) {
      expect(radioCirculo(ancho, alto)).toBeGreaterThanOrEqual(RADIO_MINIMO);
    }
    // 296 px de lado menor es el punto donde la formula alcanza el piso.
    expect(radioCirculo(296, 296)).toBe(RADIO_MINIMO);
  });

  it('coincide con la formula del diseno en los tamanos cubiertos', () => {
    for (const [ancho, alto] of [
      [320, 400],
      [768, 1024],
      [1920, 1200],
      [1024, 600],
    ] as const) {
      expect(radioCirculo(ancho, alto)).toBe(
        Math.max(RADIO_MINIMO, (Math.min(ancho, alto) - MARGEN_TOTAL) / 2),
      );
    }
  });

  it('trata las medidas absurdas como cero y devuelve el piso', () => {
    for (const medida of [Number.NaN, Number.POSITIVE_INFINITY, -500]) {
      expect(radioCirculo(medida, 800)).toBe(RADIO_MINIMO);
      expect(radioCirculo(800, medida)).toBe(RADIO_MINIMO);
    }
  });
});

describe('calcularCirculo', () => {
  it('centra el circulo y respeta el invariante del modelo', () => {
    const circulo = calcularCirculo(800, 600);

    expect(circulo).toEqual({ cx: 400, cy: 300, radio: 292 });
    expect(circulo.radio).toBeGreaterThanOrEqual(RADIO_MINIMO);
    expect(2 * circulo.radio).toBeGreaterThanOrEqual(DIAMETRO_MINIMO);
  });

  it('mantiene el margen de 8 px por lado desde 320 x 400 px', () => {
    for (const [ancho, alto] of [
      [320, 400],
      [375, 667],
      [1920, 1200],
    ] as const) {
      const { cx, cy, radio } = calcularCirculo(ancho, alto);

      expect(cx - radio).toBeGreaterThanOrEqual(MARGEN_MINIMO);
      expect(ancho - (cx + radio)).toBeGreaterThanOrEqual(MARGEN_MINIMO);
      expect(cy - radio).toBeGreaterThanOrEqual(MARGEN_MINIMO);
      expect(alto - (cy + radio)).toBeGreaterThanOrEqual(MARGEN_MINIMO);
      expect(cabeConMargen(ancho, alto)).toBe(true);
    }
  });

  it('avisa cuando el piso de 140 px se come el margen', () => {
    expect(cabeConMargen(296, 296)).toBe(true);
    expect(cabeConMargen(295, 295)).toBe(false);
    expect(cabeConMargen(200, 900)).toBe(false);
  });
});

describe('normalizarDensidad', () => {
  it('conserva las densidades reales', () => {
    for (const densidad of [1, 1.5, 2, 2.625, 3, 4]) {
      expect(normalizarDensidad(densidad)).toBe(densidad);
    }
  });

  it('sustituye por 1 los valores nulos, negativos o no finitos', () => {
    // Un valor no finito no describe ninguna pantalla: se prefiere la densidad
    // segura de 1 antes que recortarlo al tope.
    for (const densidad of [
      0,
      -2,
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(normalizarDensidad(densidad)).toBe(1);
    }
  });

  it('recorta los valores finitos absurdos al tope de 4', () => {
    expect(normalizarDensidad(12)).toBe(DENSIDAD_MAXIMA);
    expect(normalizarDensidad(1e6)).toBe(DENSIDAD_MAXIMA);
  });
});

describe('dimensionarLienzo (nitidez de los radios de 0.6 px)', () => {
  it('multiplica el almacen de respaldo por la densidad y conserva la caja de CSS', () => {
    const ajuste = dimensionarLienzo(800, 600, 2);

    expect(ajuste.anchoCss).toBe(800);
    expect(ajuste.altoCss).toBe(600);
    expect(ajuste.anchoLienzo).toBe(1600);
    expect(ajuste.altoLienzo).toBe(1200);
    expect(ajuste.densidad).toBe(2);
    expect(ajuste.circulo).toEqual(calcularCirculo(800, 600));
  });

  it('redondea el almacen de respaldo a pixeles enteros con densidades fraccionarias', () => {
    const ajuste = dimensionarLienzo(801, 601, 2.625);

    expect(Number.isInteger(ajuste.anchoLienzo)).toBe(true);
    expect(Number.isInteger(ajuste.altoLienzo)).toBe(true);
    expect(ajuste.anchoLienzo).toBe(Math.round(801 * 2.625));
    expect(ajuste.altoLienzo).toBe(Math.round(601 * 2.625));
  });

  it('no depende del entorno cuando se le pasa la densidad', () => {
    // El valor por omision se lee del entorno; el explicito lo ignora.
    expect(dimensionarLienzo(400, 400, 1).anchoLienzo).toBe(400);
    expect(dimensionarLienzo(400, 400, 3).anchoLienzo).toBe(1200);
  });
});

describe('ajustarLienzo', () => {
  let lienzo: HTMLCanvasElement;

  beforeEach(() => {
    lienzo = document.createElement('canvas');
  });

  it('escribe el almacen de respaldo en pixeles del dispositivo y la caja en pixeles de CSS', () => {
    const ajuste = ajustarLienzo(lienzo, { ancho: 640, alto: 480 }, 2);

    expect(lienzo.width).toBe(1280);
    expect(lienzo.height).toBe(960);
    expect(lienzo.style.width).toBe('640px');
    expect(lienzo.style.height).toBe('480px');
    expect(ajuste.circulo.radio).toBe(232);
  });

  it('vuelve a dimensionar sin acumular escalas', () => {
    ajustarLienzo(lienzo, { ancho: 640, alto: 480 }, 2);
    ajustarLienzo(lienzo, { ancho: 320, alto: 400 }, 2);

    expect(lienzo.width).toBe(640);
    expect(lienzo.height).toBe(800);
    expect(lienzo.style.width).toBe('320px');
  });
});

describe('antirrebote (Requisito 4.12)', () => {
  it('ejecuta la accion una sola vez tras el ultimo disparo', () => {
    const reloj = relojManual();
    const accion = vi.fn();
    const espera = antirrebote(accion, ANTIRREBOTE_MS, reloj);

    espera.disparar();
    reloj.avanzar(100);
    espera.disparar();
    reloj.avanzar(100);
    expect(accion).not.toHaveBeenCalled();
    expect(espera.pendiente()).toBe(true);

    reloj.avanzar(50);
    expect(accion).toHaveBeenCalledTimes(1);
    expect(espera.pendiente()).toBe(false);
  });

  it('cabe holgadamente en el presupuesto de 400 ms', () => {
    expect(ANTIRREBOTE_MS).toBeLessThan(PRESUPUESTO_REDIBUJO_MS);
  });

  it('cancelar impide la ejecucion pendiente', () => {
    const reloj = relojManual();
    const accion = vi.fn();
    const espera = antirrebote(accion, ANTIRREBOTE_MS, reloj);

    espera.disparar();
    espera.cancelar();
    reloj.avanzar(1000);

    expect(accion).not.toHaveBeenCalled();
    expect(reloj.pendientes()).toBe(0);
  });
});

describe('observarTamano (Requisito 4.12)', () => {
  /** Observador de prueba con un aviso que la prueba dispara a mano. */
  function fabricaDePrueba(): {
    fabrica: FabricaObservador;
    avisar(): void;
    observados(): number;
    desconexiones(): number;
  } {
    let avisar = (): void => {};
    let observados = 0;
    let desconexiones = 0;

    const fabrica: FabricaObservador = (alAvisar) => {
      avisar = alAvisar;
      const observador: ObservadorTamano = {
        observe: (): void => {
          observados += 1;
        },
        disconnect: (): void => {
          desconexiones += 1;
        },
      };
      return observador;
    };

    return {
      fabrica,
      avisar: (): void => {
        avisar();
      },
      observados: (): number => observados,
      desconexiones: (): number => desconexiones,
    };
  }

  it('redibuja una sola vez tras una rafaga de avisos', () => {
    const reloj = relojManual();
    const observador = fabricaDePrueba();
    const tamanos: TamanoMapa[] = [];
    const elemento = document.createElement('div');

    const observacion = observarTamano(
      elemento,
      (tamano) => {
        tamanos.push(tamano);
      },
      { reloj, fabrica: observador.fabrica },
    );

    expect(observacion.activa).toBe(true);
    expect(observador.observados()).toBe(1);

    for (let i = 0; i < 20; i += 1) {
      observador.avisar();
      reloj.avanzar(10);
    }
    expect(tamanos).toHaveLength(0);
    expect(observacion.pendiente()).toBe(true);

    reloj.avanzar(ANTIRREBOTE_MS);
    expect(tamanos).toHaveLength(1);
    // jsdom no calcula disposicion: clientWidth y clientHeight valen 0, y la
    // caja se propaga tal cual. Lo que se comprueba aqui es el conteo.
    expect(tamanos[0]).toEqual({ ancho: elemento.clientWidth, alto: elemento.clientHeight });

    observacion.detener();
    expect(observador.desconexiones()).toBe(1);
  });

  it('detener cancela el redibujo pendiente', () => {
    const reloj = relojManual();
    const observador = fabricaDePrueba();
    const redibujar = vi.fn();
    const observacion = observarTamano(document.createElement('div'), redibujar, {
      reloj,
      fabrica: observador.fabrica,
    });

    observador.avisar();
    observacion.detener();
    reloj.avanzar(1000);

    expect(redibujar).not.toHaveBeenCalled();
    expect(observador.desconexiones()).toBe(1);
  });

  it('degrada sin error cuando el entorno no ofrece observador', () => {
    // Es el caso de jsdom, que no implementa ResizeObserver: la fabrica por
    // omision devuelve null y la vista queda sin observacion, no rota.
    const observacion = observarTamano(document.createElement('div'), () => {});

    expect(observacion.activa).toBe(false);
    expect(observacion.pendiente()).toBe(false);
    expect(() => {
      observacion.detener();
    }).not.toThrow();
  });
});
