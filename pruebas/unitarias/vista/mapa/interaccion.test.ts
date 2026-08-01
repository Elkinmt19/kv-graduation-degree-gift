import { describe, expect, it, vi } from 'vitest';

import type { EstrellaCalculada, Punto } from '../../../../src/nucleo/astronomia/modelo.js';
import {
  CLASES_FICHA,
  ETIQUETA_MAGNITUD,
  PRESUPUESTO_RESPUESTA_MS,
  RADIO_DETECCION,
  RADIO_DETECCION_GRUESO,
  TAMANO_CELDA,
  construirRejilla,
  describirEstrella,
  formatearMagnitud,
  montarInteraccion,
  punteroGruesoPorTipo,
  radioDeteccion,
  resolverImpacto,
  type ConversorPunto,
  type ProgramadorFotograma,
} from '../../../../src/vista/mapa/interaccion.js';

/**
 * Interaccion del Mapa_Estelar (Tarea 11.6).
 *
 * - Requisito 4.5: senalar una Estrella dentro de 12 px muestra su nombre, su
 *   constelacion y su magnitud aparente con un decimal, en 150 ms o menos.
 * - Requisito 4.14: salir de la Estrella o tocar vacio oculta la ficha y deja el
 *   cielo dibujado sin cambios.
 *
 * La geometria (`construirRejilla`, `resolverImpacto`) es pura y se ejercita
 * sola; el cableado del DOM recibe un programador de fotogramas manual y un
 * conversor de coordenadas fijo, porque jsdom no tiene eventos de puntero
 * reales ni calcula disposicion.
 */

/** Estrella calculada minima, colocada en `(x, y)` de pantalla. */
function estrella(
  nombre: string,
  x: number | null,
  y = 0,
  magnitud = 2.34,
  constelacion = 'Orion',
): EstrellaCalculada {
  const pantalla: Punto | null = x === null ? null : { x, y };
  return {
    estrella: { nombre, ar: 5.5, dec: -8.2, magnitud, constelacion },
    horizontal: { altitud: pantalla === null ? -10 : 42, azimut: 120 },
    visible: pantalla !== null,
    pantalla,
    radio: 1.5,
  };
}

/** Programador manual: nada se resuelve hasta que la prueba pinta el fotograma. */
function fotogramaManual(): ProgramadorFotograma & { pintar(): void; pedidos(): number } {
  let siguiente = 1;
  const pendientes = new Map<number, () => void>();
  let pedidos = 0;

  return {
    programar: (accion) => {
      const identificador = siguiente;
      siguiente += 1;
      pedidos += 1;
      pendientes.set(identificador, accion);
      return identificador;
    },
    cancelar: (identificador) => {
      pendientes.delete(identificador as number);
    },
    pintar: (): void => {
      for (const [identificador, accion] of [...pendientes]) {
        pendientes.delete(identificador);
        accion();
      }
    },
    pedidos: (): number => pedidos,
  };
}

/** Conversor fijo: el evento ya trae coordenadas locales del lienzo. */
const CONVERSOR_DIRECTO: ConversorPunto = (evento) => ({
  x: evento.clientX ?? 0,
  y: evento.clientY ?? 0,
});

/** Despacha un evento de puntero con las propiedades que lee la interaccion. */
function senalar(
  objetivo: HTMLElement,
  tipo: 'pointermove' | 'pointerdown',
  x: number,
  y: number,
  pointerType?: string,
): void {
  const evento = new Event(tipo, { bubbles: false });
  Object.assign(evento, { clientX: x, clientY: y, ...(pointerType === undefined ? {} : { pointerType }) });
  objetivo.dispatchEvent(evento);
}

// --- Geometria pura: la rejilla ---------------------------------------------

describe('construirRejilla', () => {
  it('indexa solo las Estrellas dibujadas, en el orden recibido', () => {
    const rejilla = construirRejilla([
      estrella('Rigel', 10, 10),
      // Bajo el horizonte: sin coordenadas de pantalla, no puede senalarse.
      estrella('Oculta', null),
      estrella('Betelgeuse', 100, 40),
    ]);

    expect(rejilla.tamanoCelda).toBe(TAMANO_CELDA);
    expect(rejilla.senalables.map((s) => s.calculada.estrella.nombre)).toEqual([
      'Rigel',
      'Betelgeuse',
    ]);
    expect(rejilla.senalables.map((s) => s.indice)).toEqual([0, 1]);
  });

  it('descarta centros no finitos', () => {
    const rota = estrella('Rota', 0, 0);
    const conNaN: EstrellaCalculada = { ...rota, pantalla: { x: Number.NaN, y: 5 } };

    expect(construirRejilla([conNaN]).senalables).toEqual([]);
  });

  it('reparte las Estrellas en celdas de 16 px y agrupa las que comparten celda', () => {
    // (0, 0) y (15, 15) caen en la celda (0, 0); (16, 0) ya en la (1, 0).
    const rejilla = construirRejilla([
      estrella('A', 0, 0),
      estrella('B', 15, 15),
      estrella('C', 16, 0),
    ]);

    expect(rejilla.celdas.get('0:0')).toEqual([0, 1]);
    expect(rejilla.celdas.get('1:0')).toEqual([2]);
    expect(rejilla.celdas.size).toBe(2);
  });

  it('admite coordenadas negativas sin mezclar celdas', () => {
    const rejilla = construirRejilla([estrella('A', -1, -1), estrella('B', 1, 1)]);

    expect(rejilla.celdas.get('-1:-1')).toEqual([0]);
    expect(rejilla.celdas.get('0:0')).toEqual([1]);
  });

  it('cae en el lado del diseno si le dan un tamano absurdo', () => {
    for (const absurdo of [0, -8, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(construirRejilla([], absurdo).tamanoCelda).toBe(TAMANO_CELDA);
    }
  });
});

// --- Geometria pura: el impacto ---------------------------------------------

describe('resolverImpacto (Requisito 4.5)', () => {
  const rejilla = construirRejilla([
    estrella('Lejana', 500, 500),
    estrella('Cercana', 104, 100),
    estrella('Media', 110, 100),
  ]);

  it('devuelve la Estrella mas cercana dentro del radio', () => {
    const impacto = resolverImpacto(rejilla, { x: 100, y: 100 }, RADIO_DETECCION);

    expect(impacto?.senalable.calculada.estrella.nombre).toBe('Cercana');
    expect(impacto?.distancia).toBeCloseTo(4, 10);
  });

  it('encuentra Estrellas de celdas vecinas, no solo de la propia', () => {
    // El punto cae en la celda (5, 6) y la Estrella en la (6, 6): sin consultar
    // las vecinas este impacto se perderia.
    const vecina = construirRejilla([estrella('Vecina', 96, 100)]);
    const impacto = resolverImpacto(vecina, { x: 95, y: 100 }, RADIO_DETECCION);

    expect(impacto?.senalable.calculada.estrella.nombre).toBe('Vecina');
  });

  it('incluye la igualdad: 12.0 px cuenta y 12.5 px no', () => {
    const justa = construirRejilla([estrella('Justa', 112, 100)]);
    expect(resolverImpacto(justa, { x: 100, y: 100 }, RADIO_DETECCION)?.distancia).toBe(12);

    const fuera = construirRejilla([estrella('Fuera', 112.5, 100)]);
    expect(resolverImpacto(fuera, { x: 100, y: 100 }, RADIO_DETECCION)).toBeNull();
  });

  it('el puntero grueso alcanza 14 px donde el fino no llega', () => {
    const trece = construirRejilla([estrella('Trece', 113, 100)]);

    expect(resolverImpacto(trece, { x: 100, y: 100 }, RADIO_DETECCION)).toBeNull();
    expect(resolverImpacto(trece, { x: 100, y: 100 }, RADIO_DETECCION_GRUESO)?.distancia).toBe(13);
    // El barrido de celdas sigue bastando: 14 px no supera el lado de 16 px.
    expect(RADIO_DETECCION_GRUESO).toBeLessThanOrEqual(TAMANO_CELDA);
  });

  it('desempata por posicion en el arreglo indexado', () => {
    // Ambas a 5 px del punto, en celdas distintas: gana la primera del arreglo.
    const empate = construirRejilla([estrella('Primera', 95, 100), estrella('Segunda', 105, 100)]);
    const impacto = resolverImpacto(empate, { x: 100, y: 100 }, RADIO_DETECCION);

    expect(impacto?.senalable.calculada.estrella.nombre).toBe('Primera');
    expect(impacto?.senalable.indice).toBe(0);

    // Y al reves, con el arreglo invertido, para que no sea la geometria la que
    // decide sino el orden recibido.
    const invertida = construirRejilla([estrella('Segunda', 105, 100), estrella('Primera', 95, 100)]);
    expect(
      resolverImpacto(invertida, { x: 100, y: 100 }, RADIO_DETECCION)?.senalable.calculada.estrella
        .nombre,
    ).toBe('Segunda');
  });

  it('devuelve null en el vacio y con entradas absurdas (Requisito 4.14)', () => {
    expect(resolverImpacto(rejilla, { x: 300, y: 300 }, RADIO_DETECCION)).toBeNull();
    expect(resolverImpacto(construirRejilla([]), { x: 0, y: 0 })).toBeNull();

    for (const punto of [
      { x: Number.NaN, y: 0 },
      { x: 0, y: Number.POSITIVE_INFINITY },
    ]) {
      expect(resolverImpacto(rejilla, punto, RADIO_DETECCION)).toBeNull();
    }
    for (const radio of [-1, Number.NaN]) {
      expect(resolverImpacto(rejilla, { x: 104, y: 100 }, radio)).toBeNull();
    }
  });
});

describe('radioDeteccion y punteroGruesoPorTipo', () => {
  it('el radio fino es 12 px y el grueso 14 px', () => {
    expect(radioDeteccion(false)).toBe(RADIO_DETECCION);
    expect(radioDeteccion(true)).toBe(RADIO_DETECCION_GRUESO);
    expect(RADIO_DETECCION).toBeGreaterThanOrEqual(12);
  });

  it('el dedo y el lapiz son punteros gruesos; el raton no', () => {
    expect(punteroGruesoPorTipo('touch')).toBe(true);
    expect(punteroGruesoPorTipo('pen')).toBe(true);
    expect(punteroGruesoPorTipo('mouse')).toBe(false);
    expect(punteroGruesoPorTipo(undefined)).toBe(false);
  });
});

// --- Formato de la ficha ----------------------------------------------------

describe('formatearMagnitud (Requisito 4.5)', () => {
  it('siempre deja exactamente un decimal', () => {
    for (const magnitud of [-1.5, -0.05, 0, 1, 1.44, 2.35, 6]) {
      expect(formatearMagnitud(magnitud)).toMatch(/^-?\d+\.\d$/u);
    }
    expect(formatearMagnitud(1.44)).toBe('1.4');
    expect(formatearMagnitud(-1.5)).toBe('-1.5');
    expect(formatearMagnitud(6)).toBe('6.0');
  });

  it('no muestra un cero negativo', () => {
    // Magnitudes como -0.04 redondean a -0.0, que no informa de nada.
    expect(formatearMagnitud(-0.04)).toBe('0.0');
    expect(formatearMagnitud(-0.05)).toBe('-0.1');
  });

  it('rotula con un guion lo que no es un numero', () => {
    expect(formatearMagnitud(Number.NaN)).toBe('—');
  });
});

describe('describirEstrella', () => {
  it('entrega los tres datos del requisito', () => {
    expect(
      describirEstrella({ nombre: 'Rigel', ar: 5.24, dec: -8.2, magnitud: 0.13, constelacion: 'Orion' }),
    ).toEqual({ nombre: 'Rigel', constelacion: 'Orion', magnitud: '0.1' });
  });
});

// --- Cableado del DOM -------------------------------------------------------

describe('montarInteraccion (Requisitos 4.5 y 4.14)', () => {
  function montar(estrellas: readonly EstrellaCalculada[] = [estrella('Rigel', 100, 100, 0.13)]) {
    const contenedor = document.createElement('div');
    const lienzo = document.createElement('canvas');
    contenedor.append(lienzo);
    document.body.append(contenedor);

    const fotograma = fotogramaManual();
    const interaccion = montarInteraccion(lienzo, {
      rejilla: construirRejilla(estrellas),
      fotograma,
      conversor: CONVERSOR_DIRECTO,
      consultaPuntero: null,
    });

    return { contenedor, lienzo, fotograma, interaccion };
  }

  it('la ficha nace oculta, fuera del lienzo y en el contenedor', () => {
    const { contenedor, lienzo, interaccion } = montar();

    expect(interaccion.ficha.className).toBe(CLASES_FICHA.ficha);
    expect(interaccion.ficha.parentElement).toBe(contenedor);
    expect(lienzo.contains(interaccion.ficha)).toBe(false);
    expect(interaccion.estado()).toBe('oculta');
    expect(interaccion.ficha.hidden).toBe(true);
    expect(interaccion.senalada()).toBeNull();

    interaccion.destruir();
  });

  it('agrupa una rafaga de pointermove en un solo fotograma y usa la ultima posicion', () => {
    const { lienzo, fotograma, interaccion } = montar();

    for (let i = 0; i < 20; i += 1) {
      senalar(lienzo, 'pointermove', 400 + i, 400);
    }
    senalar(lienzo, 'pointermove', 100, 100);

    // Nada resuelto todavia: un unico fotograma pedido para los 21 avisos.
    expect(fotograma.pedidos()).toBe(1);
    expect(interaccion.pendiente()).toBe(true);
    expect(interaccion.estado()).toBe('oculta');

    fotograma.pintar();

    expect(fotograma.pedidos()).toBe(1);
    expect(interaccion.pendiente()).toBe(false);
    expect(interaccion.senalada()?.estrella.nombre).toBe('Rigel');
    // Un fotograma llega muy antes de los 150 ms del requisito.
    expect(PRESUPUESTO_RESPUESTA_MS).toBe(150);

    interaccion.destruir();
  });

  it('muestra nombre, constelacion y magnitud con un decimal', () => {
    const { lienzo, fotograma, interaccion } = montar([
      estrella('Rigel', 100, 100, 0.13, 'Orion'),
    ]);

    senalar(lienzo, 'pointermove', 104, 103);
    fotograma.pintar();

    const ficha = interaccion.ficha;
    expect(interaccion.estado()).toBe('visible');
    expect(ficha.hidden).toBe(false);
    expect(ficha.dataset['estado']).toBe('visible');
    expect(ficha.querySelector(`.${CLASES_FICHA.nombre}`)?.textContent).toBe('Rigel');
    expect(ficha.querySelector(`.${CLASES_FICHA.constelacion}`)?.textContent).toBe('Orion');
    expect(ficha.querySelector(`.${CLASES_FICHA.magnitud}`)?.textContent).toBe(
      `${ETIQUETA_MAGNITUD} 0.1`,
    );
    // La ficha se coloca sobre el centro de la Estrella, en pixeles de CSS.
    expect(ficha.style.left).toBe('100px');
    expect(ficha.style.top).toBe('100px');

    interaccion.destruir();
  });

  it('el toque alcanza 14 px porque el evento declara puntero grueso', () => {
    const { lienzo, fotograma, interaccion } = montar([estrella('Trece', 113, 100)]);

    senalar(lienzo, 'pointerdown', 100, 100, 'mouse');
    fotograma.pintar();
    expect(interaccion.estado()).toBe('oculta');

    senalar(lienzo, 'pointerdown', 100, 100, 'touch');
    fotograma.pintar();
    expect(interaccion.senalada()?.estrella.nombre).toBe('Trece');

    interaccion.destruir();
  });

  it('retirar el cursor oculta la ficha sin tocar el cielo (Requisito 4.14)', () => {
    const { lienzo, fotograma, interaccion } = montar();
    const contexto = vi.spyOn(lienzo, 'getContext');

    senalar(lienzo, 'pointermove', 100, 100);
    fotograma.pintar();
    expect(interaccion.estado()).toBe('visible');

    lienzo.dispatchEvent(new Event('pointerleave'));
    expect(interaccion.pendiente()).toBe(true);
    fotograma.pintar();

    expect(interaccion.estado()).toBe('oculta');
    expect(interaccion.ficha.hidden).toBe(true);
    expect(interaccion.senalada()).toBeNull();
    // Sin texto residual que un lector de pantalla pudiera anunciar.
    expect(interaccion.ficha.textContent).toBe('');
    // El cielo queda intacto: la interaccion nunca pide el contexto de dibujo.
    expect(contexto).not.toHaveBeenCalled();

    contexto.mockRestore();
    interaccion.destruir();
  });

  it('tocar vacio dentro del radio oculta la ficha (Requisito 4.14)', () => {
    const { lienzo, fotograma, interaccion } = montar();

    senalar(lienzo, 'pointerdown', 100, 100, 'touch');
    fotograma.pintar();
    expect(interaccion.estado()).toBe('visible');

    senalar(lienzo, 'pointerdown', 300, 300, 'touch');
    fotograma.pintar();
    expect(interaccion.estado()).toBe('oculta');
    expect(interaccion.senalada()).toBeNull();

    interaccion.destruir();
  });

  it('actualizarRejilla cambia el indice y suelta la Estrella senalada', () => {
    const { lienzo, fotograma, interaccion } = montar();

    senalar(lienzo, 'pointermove', 100, 100);
    fotograma.pintar();
    expect(interaccion.estado()).toBe('visible');

    interaccion.actualizarRejilla(construirRejilla([estrella('Otra', 300, 300)]));
    expect(interaccion.estado()).toBe('oculta');

    senalar(lienzo, 'pointermove', 300, 300);
    fotograma.pintar();
    expect(interaccion.senalada()?.estrella.nombre).toBe('Otra');

    interaccion.destruir();
  });

  it('destruir suelta las escuchas, cancela el fotograma y quita la ficha', () => {
    const { lienzo, fotograma, interaccion } = montar();

    senalar(lienzo, 'pointermove', 100, 100);
    expect(interaccion.pendiente()).toBe(true);

    interaccion.destruir();

    expect(interaccion.pendiente()).toBe(false);
    expect(interaccion.ficha.parentElement).toBeNull();

    // Tras destruir, ningun aviso vuelve a pedir fotograma.
    senalar(lienzo, 'pointermove', 100, 100);
    fotograma.pintar();
    expect(fotograma.pedidos()).toBe(1);
    expect(interaccion.estado()).toBe('oculta');

    // Y es idempotente.
    expect(() => {
      interaccion.destruir();
    }).not.toThrow();
  });
});
