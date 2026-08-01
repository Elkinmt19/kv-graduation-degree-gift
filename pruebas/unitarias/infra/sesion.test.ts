import { afterEach, describe, expect, it } from 'vitest';

import {
  almacenDeSesionDelNavegador,
  CLAVE_ACCESO,
  CLAVE_CARTA_REVELADA,
  crearEstadoSesion,
  type AlmacenSesion,
} from '../../../src/infra/sesion';

/**
 * Pruebas unitarias del estado de sesion del navegador.
 *
 * Cubren las tres situaciones del borde: el acceso concedido que sobrevive
 * dentro de la misma sesion (Requisito 1.7), la sesion nueva que vuelve a pedir
 * la Clave_Acceso (Requisito 1.9) y el `sessionStorage` inaccesible, donde el
 * estado se degrada a memoria y las escrituras siguen siendo legibles en la
 * vista actual.
 *
 * El almacen se sustituye por objetos simples: no hace falta DOM ni el
 * `sessionStorage` real, que en el proyecto `nucleo` de Vitest no existe.
 */

/** Almacen en memoria con la forma de `sessionStorage`. */
function almacenSimulado(inicial: Readonly<Record<string, string>> = {}): {
  almacen: AlmacenSesion;
  datos: Map<string, string>;
} {
  const datos = new Map<string, string>(Object.entries(inicial));
  return {
    datos,
    almacen: {
      getItem: (clave) => datos.get(clave) ?? null,
      setItem: (clave, valor) => {
        datos.set(clave, valor);
      },
    },
  };
}

/** Almacen que lanza en la operacion indicada, como un modo privado restringido. */
function almacenQueLanza(operacion: 'getItem' | 'setItem' | 'ambas'): AlmacenSesion {
  const falla = (): never => {
    throw new Error('almacenamiento bloqueado por politica');
  };
  const datos = new Map<string, string>();

  return {
    getItem: (clave) =>
      operacion === 'getItem' || operacion === 'ambas' ? falla() : (datos.get(clave) ?? null),
    setItem: (clave, valor) => {
      if (operacion === 'setItem' || operacion === 'ambas') falla();
      datos.set(clave, valor);
    },
  };
}

describe('crearEstadoSesion: acceso concedido en la sesion actual (Requisito 1.7)', () => {
  it('registrar el acceso lo deja legible en la misma sesion', () => {
    const { almacen } = almacenSimulado();
    const sesion = crearEstadoSesion(almacen);

    expect(sesion.accesoConcedido()).toBe(false);
    sesion.registrarAcceso();

    expect(sesion.accesoConcedido()).toBe(true);
  });

  it('el acceso registrado sobrevive a una recarga de la misma pestana', () => {
    // Una recarga descarta el estado en memoria y vuelve a leer el mismo
    // almacen: es un `crearEstadoSesion` nuevo sobre el almacen ya escrito.
    const { almacen } = almacenSimulado();
    crearEstadoSesion(almacen).registrarAcceso();

    const trasRecarga = crearEstadoSesion(almacen);

    expect(trasRecarga.accesoConcedido()).toBe(true);
  });

  it('escribe la marca del acceso bajo la clave declarada', () => {
    const { almacen, datos } = almacenSimulado();

    crearEstadoSesion(almacen).registrarAcceso();

    expect([...datos.keys()]).toEqual([CLAVE_ACCESO]);
    expect(datos.get(CLAVE_ACCESO)).toBe('1');
  });

  it('registrar el acceso dos veces no cambia el estado', () => {
    const { almacen, datos } = almacenSimulado();
    const sesion = crearEstadoSesion(almacen);

    sesion.registrarAcceso();
    sesion.registrarAcceso();

    expect(sesion.accesoConcedido()).toBe(true);
    expect(datos.size).toBe(1);
  });

  it('un valor distinto de la marca no concede el acceso', () => {
    const { almacen } = almacenSimulado({ [CLAVE_ACCESO]: 'true' });

    expect(crearEstadoSesion(almacen).accesoConcedido()).toBe(false);
  });
});

describe('crearEstadoSesion: sesion nueva del navegador (Requisito 1.9)', () => {
  it('una sesion nueva no hereda el acceso concedido en otra', () => {
    const anterior = almacenSimulado();
    crearEstadoSesion(anterior.almacen).registrarAcceso();

    // Otra pestana o el navegador reabierto: `sessionStorage` parte vacio.
    const nueva = crearEstadoSesion(almacenSimulado().almacen);

    expect(nueva.accesoConcedido()).toBe(false);
    expect(anterior.datos.get(CLAVE_ACCESO)).toBe('1');
  });

  it('una sesion nueva tampoco hereda la Carta ya revelada', () => {
    crearEstadoSesion(almacenSimulado().almacen).marcarCartaRevelada();

    expect(crearEstadoSesion(almacenSimulado().almacen).cartaYaRevelada()).toBe(false);
  });

  it('sin almacen disponible el estado parte vacio', () => {
    expect(crearEstadoSesion(null).accesoConcedido()).toBe(false);
    // En el proyecto `nucleo` no existe `sessionStorage`, de modo que el valor
    // por omision tambien parte de un estado en memoria vacio.
    expect(crearEstadoSesion().accesoConcedido()).toBe(false);
  });
});

describe('crearEstadoSesion: Carta ya revelada (Requisitos 5.2 y 5.3)', () => {
  it('marcar la Carta la deja revelada bajo su propia clave', () => {
    const { almacen, datos } = almacenSimulado();
    const sesion = crearEstadoSesion(almacen);

    expect(sesion.cartaYaRevelada()).toBe(false);
    sesion.marcarCartaRevelada();

    expect(sesion.cartaYaRevelada()).toBe(true);
    expect([...datos.keys()]).toEqual([CLAVE_CARTA_REVELADA]);
  });

  it('las dos marcas son independientes entre si', () => {
    const { almacen } = almacenSimulado();
    const sesion = crearEstadoSesion(almacen);

    sesion.registrarAcceso();

    expect(sesion.accesoConcedido()).toBe(true);
    expect(sesion.cartaYaRevelada()).toBe(false);

    sesion.marcarCartaRevelada();

    expect(sesion.accesoConcedido()).toBe(true);
    expect(sesion.cartaYaRevelada()).toBe(true);
  });
});

describe('crearEstadoSesion: sessionStorage inaccesible (Requisitos 1.7 y 1.9)', () => {
  it('con un almacen cuyo setItem lanza, la escritura sigue siendo legible', () => {
    const sesion = crearEstadoSesion(almacenQueLanza('setItem'));

    expect(() => sesion.registrarAcceso()).not.toThrow();
    expect(sesion.accesoConcedido()).toBe(true);
  });

  it('con un almacen cuyo getItem lanza, la lectura no falla y responde en falso', () => {
    const sesion = crearEstadoSesion(almacenQueLanza('getItem'));

    expect(sesion.accesoConcedido()).toBe(false);
    sesion.registrarAcceso();
    expect(sesion.accesoConcedido()).toBe(true);
  });

  it('con un almacen que lanza en ambas operaciones, el estado vive en memoria', () => {
    const sesion = crearEstadoSesion(almacenQueLanza('ambas'));

    sesion.registrarAcceso();
    sesion.marcarCartaRevelada();

    expect(sesion.accesoConcedido()).toBe(true);
    expect(sesion.cartaYaRevelada()).toBe(true);
  });

  it('el estado degradado no sobrevive a una recarga: se vuelve a pedir la clave', () => {
    const almacen = almacenQueLanza('ambas');
    crearEstadoSesion(almacen).registrarAcceso();

    // Degradado aceptable del diseno: la vista actual funciona, la recarga no.
    expect(crearEstadoSesion(almacen).accesoConcedido()).toBe(false);
  });
});

describe('almacenDeSesionDelNavegador', () => {
  const descriptorOriginal = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');

  afterEach(() => {
    if (descriptorOriginal === undefined) {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    } else {
      Object.defineProperty(globalThis, 'sessionStorage', descriptorOriginal);
    }
  });

  it('devuelve null cuando el entorno carece de sessionStorage', () => {
    expect(almacenDeSesionDelNavegador()).toBeNull();
  });

  it('devuelve null cuando el simple acceso a la propiedad lanza', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('acceso al almacenamiento denegado');
      },
    });

    expect(almacenDeSesionDelNavegador()).toBeNull();
    // Y el estado construido por omision sigue siendo utilizable.
    const sesion = crearEstadoSesion(almacenDeSesionDelNavegador());
    sesion.registrarAcceso();
    expect(sesion.accesoConcedido()).toBe(true);
  });

  it('devuelve el almacen del navegador cuando existe', () => {
    const { almacen } = almacenSimulado();
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get: () => almacen,
    });

    expect(almacenDeSesionDelNavegador()).toBe(almacen);
  });
});
