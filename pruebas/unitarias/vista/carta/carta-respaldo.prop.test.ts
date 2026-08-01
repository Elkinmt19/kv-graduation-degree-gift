import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';

import { resolverCarta } from '../../../../src/nucleo/carta/resolver.js';
import type { CartaConfigurada } from '../../../../src/nucleo/configuracion/modelo.js';
import {
  CLASES_CARTA,
  MENSAJE_CARTA_NO_DISPONIBLE,
  montarCarta,
  type EstadoCarta,
} from '../../../../src/vista/carta/lienzo.js';
import { ESPACIOS_UNICODE, VISIBLES_CLAVE } from '../../../generadores.js';

/**
 * Propiedad 24: Una Carta sin contenido produce el mensaje de respaldo y
 * conserva el mapa.
 *
 * **Validates: Requirements 5.7**
 *
 * El Requisito 5.7 es un condicional con dos obligaciones, y `resolverCarta`
 * lo endurece a un **bicondicional**: `disponible` es falso *exactamente*
 * cuando ningun parrafo declarado tiene caracteres visibles, y nunca por efecto
 * del tope de 6000 caracteres. Esta propiedad recorre las dos direcciones con
 * el mismo generador de Cartas:
 *
 * - todos los parrafos en blanco (o ninguno) => `disponible: false`, el
 *   Lienzo_Carta muestra `MENSAJE_CARTA_NO_DISPONIBLE`, no dibuja ningun
 *   parrafo y el Mapa_Estelar hermano sigue en el arbol y visible;
 * - al menos un parrafo con un solo caracter visible => `disponible: true`, sin
 *   mensaje de respaldo. Un unico caracter no blanco basta: ese es el filo del
 *   requisito.
 *
 * Lo «en blanco» no se decide con `trim()` (eso seria repetir la
 * implementacion) sino por construccion: cada parrafo se arma con piezas
 * rotuladas `blanco` o `visible`, y la expectativa se deriva de esos rotulos.
 * Los espacios en blanco salen de `ESPACIOS_UNICODE`, que incluye el espacio
 * duro, los espacios tipograficos y el ZWNBSP, no solo el espacio ASCII.
 *
 * Vive bajo `pruebas/unitarias/vista/` porque necesita DOM para comprobar que
 * el mapa sigue visible: ese es el unico proyecto de Vitest que corre sobre
 * jsdom. El sufijo `.prop.test.ts` la marca como prueba de propiedad, igual que
 * `puerta-acceso.prop.test.ts`. Por la misma razon no se importa
 * `pruebas/utilidades/estilos.ts`: dentro del proyecto `vista` su resolucion de
 * rutas de disco no funciona.
 */

/** Tope de caracteres del texto de la Carta (Requisito 5.1). */
const MAX_CARACTERES = 6000;

/** Corrida de espacio en blanco Unicode; puede ser vacia. */
const genEnBlanco: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...ESPACIOS_UNICODE), { maxLength: 8 })
  .map((partes) => partes.join(''));

/** Corrida de espacio en blanco de longitud mayor o igual a 1. */
const genEnBlancoNoVacio: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...ESPACIOS_UNICODE), { minLength: 1, maxLength: 8 })
  .map((partes) => partes.join(''));

/**
 * Parrafo con al menos un caracter visible. La rama de un solo caracter es el
 * caso limite del Requisito 5.7; la rama larga excede el tope de 6000 para
 * comprobar que el recorte no vuelve la Carta no disponible.
 */
const genParrafoVisible: fc.Arbitrary<string> = fc.oneof(
  {
    // Filo del requisito: un unico caracter visible, sin nada alrededor.
    weight: 3,
    arbitrary: fc.constantFrom(...VISIBLES_CLAVE),
  },
  {
    // Un caracter visible ahogado entre espacios en blanco Unicode.
    weight: 3,
    arbitrary: fc
      .tuple(genEnBlancoNoVacio, fc.constantFrom(...VISIBLES_CLAVE), genEnBlancoNoVacio)
      .map((partes) => partes.join('')),
  },
  {
    weight: 3,
    arbitrary: fc
      .array(fc.constantFrom(...VISIBLES_CLAVE, ...ESPACIOS_UNICODE), {
        minLength: 1,
        maxLength: 24,
      })
      .chain((piezas) =>
        // Se garantiza un visible: si el azar dio solo espacios, se antepone uno.
        fc.constantFrom(...VISIBLES_CLAVE).map((visible) => `${visible}${piezas.join('')}`),
      ),
  },
  {
    // Parrafo que por si solo excede el tope: `resolverCarta` lo recorta, pero
    // la Carta sigue disponible (Requisitos 5.1, 5.7).
    weight: 1,
    arbitrary: fc.constantFrom(
      'ñ'.repeat(MAX_CARACTERES - 1),
      'K'.repeat(MAX_CARACTERES),
      'a'.repeat(MAX_CARACTERES + 1),
      '🐱'.repeat(MAX_CARACTERES),
    ),
  },
);

/** Un parrafo declarado, con el rotulo que decide la expectativa. */
type Pieza = { readonly clase: 'blanco' | 'visible'; readonly texto: string };

const genPiezaEnBlanco: fc.Arbitrary<Pieza> = genEnBlanco.map((texto) => ({
  clase: 'blanco' as const,
  texto,
}));

const genPiezaVisible: fc.Arbitrary<Pieza> = genParrafoVisible.map((texto) => ({
  clase: 'visible' as const,
  texto,
}));

/**
 * Lista de parrafos declarados en el Archivo_Configuracion, con sesgo hacia los
 * dos extremos que decide la propiedad: sin parrafos, todos en blanco, y mezcla
 * con al menos uno visible. Se generan listas de mas de 20 elementos porque el
 * descarte de parrafos vacios ocurre **antes** del tope de 20.
 */
const genPiezas: fc.Arbitrary<readonly Pieza[]> = fc.oneof(
  // Ninguno declarado: el antecedente literal del Requisito 5.7.
  { weight: 2, arbitrary: fc.constant<readonly Pieza[]>([]) },
  // Todos en blanco, incluida la lista de cadenas vacias.
  { weight: 4, arbitrary: fc.array(genPiezaEnBlanco, { minLength: 1, maxLength: 24 }) },
  // Mezcla arbitraria: la expectativa la fijan los rotulos.
  {
    weight: 5,
    arbitrary: fc.array(fc.oneof(genPiezaEnBlanco, genPiezaVisible), {
      minLength: 1,
      maxLength: 24,
    }),
  },
  // Muchos parrafos en blanco y uno visible al final: mas de 20 declarados.
  {
    weight: 2,
    arbitrary: fc
      .tuple(fc.array(genPiezaEnBlanco, { minLength: 20, maxLength: 26 }), genPiezaVisible)
      .map(([blancos, visible]) => [...blancos, visible]),
  },
);

/** Saludo y firma; ambos pueden quedar en blanco sin afectar la propiedad. */
const genRotulo: fc.Arbitrary<string> = fc.oneof(
  fc.constant('Querida KawaValen'),
  fc.constant('Con cariño 🐱'),
  fc.constant(''),
  genEnBlancoNoVacio,
);

interface CartaGenerada {
  readonly carta: CartaConfigurada;
  /** Verdadero cuando al menos un parrafo declarado tiene caracteres visibles. */
  readonly conContenido: boolean;
}

const genCartaConfigurada: fc.Arbitrary<CartaGenerada> = fc
  .tuple(genRotulo, genPiezas, genRotulo)
  .map(([saludo, piezas, firma]) => ({
    carta: { saludo, parrafos: piezas.map((pieza) => pieza.texto), firma },
    conContenido: piezas.some((pieza) => pieza.clase === 'visible'),
  }));

/** Raiz con un hermano que hace de Mapa_Estelar, como en la Pagina_Regalo. */
function preparar(): { raiz: HTMLElement; mapa: HTMLElement } {
  document.body.replaceChildren();
  const raiz = document.createElement('div');
  const mapa = document.createElement('div');
  mapa.id = 'mapa-estelar';
  mapa.textContent = 'aqui vive el cielo';
  raiz.append(mapa);
  document.body.append(raiz);
  return { raiz, mapa };
}

/** Comprueba que el hermano sigue en el arbol y sin marcas de ocultamiento. */
function mapaSigueVisible(raiz: HTMLElement, mapa: HTMLElement): void {
  expect(raiz.contains(mapa)).toBe(true);
  expect(document.body.contains(mapa)).toBe(true);
  expect(mapa.hidden).toBe(false);
  expect(mapa.getAttribute('aria-hidden')).toBeNull();
  expect(mapa.style.display).toBe('');
  expect(mapa.style.visibility).toBe('');
}

describe('Propiedad 24: una Carta sin contenido produce el respaldo y conserva el mapa', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('para toda Carta declarada, `disponible` es falso exactamente cuando ningun parrafo tiene caracteres visibles', () => {
    // Un bicondicional que solo viera una rama no probaria nada.
    let respaldos = 0;
    let disponibles = 0;

    fc.assert(
      fc.property(genCartaConfigurada, ({ carta, conContenido }) => {
        const { raiz, mapa } = preparar();
        const resuelta = resolverCarta(carta);

        // Las dos direcciones del «si y solo si», en un solo aserto.
        expect(resuelta.disponible).toBe(conContenido);

        const asa = montarCarta(raiz, resuelta, {
          consultaMovimiento: null,
          primeraVezEnSesion: true,
        });
        const respaldo = asa.seccion.querySelector(`.${CLASES_CARTA.respaldo}`);
        const parrafos = asa.seccion.querySelectorAll(`.${CLASES_CARTA.parrafo}`);
        // Primera presentacion y sin movimiento reducido: la Carta con texto
        // aparece progresivamente (Requisito 5.2) y la vacia entra en respaldo.
        const estadoEsperado: EstadoCarta = conContenido ? 'apareciendo' : 'respaldo';

        if (conContenido) {
          disponibles += 1;

          // Ni mensaje de respaldo ni rastro de su texto.
          expect(respaldo).toBeNull();
          expect(asa.seccion.textContent).not.toContain(MENSAJE_CARTA_NO_DISPONIBLE);
          expect(parrafos.length).toBeGreaterThanOrEqual(1);
          expect(parrafos.length).toBe(resuelta.parrafos.length);
        } else {
          respaldos += 1;

          // Requisito 5.7: el mensaje de respaldo, y ningun parrafo de Carta.
          expect(respaldo).not.toBeNull();
          expect(respaldo?.textContent).toBe(MENSAJE_CARTA_NO_DISPONIBLE);
          expect(parrafos.length).toBe(0);
          expect(asa.seccion.querySelector(`.${CLASES_CARTA.saludo}`)).toBeNull();
          expect(asa.seccion.querySelector(`.${CLASES_CARTA.firma}`)).toBeNull();
          expect(resuelta.parrafos).toEqual([]);
        }

        expect(asa.estado()).toBe(estadoEsperado);
        expect(asa.seccion.dataset['estado']).toBe(estadoEsperado);

        // El Mapa_Estelar convive con la Carta en ambas ramas (Requisito 5.7).
        mapaSigueVisible(raiz, mapa);

        asa.destruir();
        mapaSigueVisible(raiz, mapa);
      }),
      { numRuns: 300 },
    );

    expect(respaldos).toBeGreaterThan(0);
    expect(disponibles).toBeGreaterThan(0);
  });

  it('un solo caracter visible en un solo parrafo basta para que la Carta este disponible', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VISIBLES_CLAVE),
        genEnBlanco,
        genEnBlanco,
        (visible, antes, despues) => {
          const { raiz, mapa } = preparar();
          const resuelta = resolverCarta({
            saludo: '',
            parrafos: [antes, `${antes}${visible}${despues}`, despues],
            firma: '',
          });

          expect(resuelta.disponible).toBe(true);

          const asa = montarCarta(raiz, resuelta, { consultaMovimiento: null });

          expect(asa.seccion.querySelector(`.${CLASES_CARTA.respaldo}`)).toBeNull();
          expect(asa.seccion.textContent).not.toContain(MENSAJE_CARTA_NO_DISPONIBLE);
          // El texto declarado llega intacto: no se recortan sus espacios.
          expect(
            [...asa.seccion.querySelectorAll(`.${CLASES_CARTA.parrafo}`)].map(
              (nodo) => nodo.textContent,
            ),
          ).toEqual([`${antes}${visible}${despues}`]);
          mapaSigueVisible(raiz, mapa);

          asa.destruir();
        },
      ),
      { numRuns: 200 },
    );
  });
});
