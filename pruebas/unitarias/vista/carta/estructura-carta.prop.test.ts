import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  MAX_CARACTERES_CARTA,
  MAX_CARACTERES_ROTULO,
  MAX_PARRAFOS_CARTA,
  resolverCarta,
} from '../../../../src/nucleo/carta/resolver.js';
import type { CartaConfigurada } from '../../../../src/nucleo/configuracion/modelo.js';
import {
  CLASES_CARTA,
  MENSAJE_CARTA_NO_DISPONIBLE,
  montarCarta,
} from '../../../../src/vista/carta/lienzo.js';

/**
 * Propiedad 23: La estructura del Lienzo_Carta respeta el orden saludo,
 * parrafos y firma.
 *
 * **Validates: Requirements 5.1, 5.5, 5.6**
 *
 * Capa elegida: el DOM montado, es decir `resolverCarta` seguido de
 * `montarCarta`. El nucleo por si solo fijaria el orden y el tope del Requisito
 * 5.1, pero los Requisitos 5.5 y 5.6 no hablan de una lista: hablan de
 * *ubicacion*, «antes del primer parrafo» y «despues del ultimo». Esa parte solo
 * se puede comprobar sobre nodos hermanos en orden de documento, asi que la
 * prueba recorre los `<p>` que el Lienzo_Carta escribe y verifica de una vez las
 * tres afirmaciones: un bloque independiente por parrafo en el orden declarado
 * con el mismo texto (5.1), el saludo antes del primero (5.5) y la firma despues
 * del ultimo (5.6).
 *
 * Por eso vive bajo `pruebas/unitarias/vista/`: ese es el unico proyecto de
 * Vitest con jsdom. En `pruebas/propiedades/` no habria `document`, porque el
 * proyecto `nucleo` corre en `node` y excluye este arbol a proposito; el sufijo
 * `.prop.test.ts` la marca como prueba de propiedad, igual que
 * `portal/puerta-acceso.prop.test.ts`. Por la misma razon no se importa
 * `pruebas/utilidades/estilos.ts`: dentro del proyecto `vista` los modulos se
 * sirven por HTTP y su resolucion de rutas de disco no funciona.
 *
 * Dos salvedades del vocabulario de clases que la prueba respeta: `carta__parrafo`
 * aparece una vez por parrafo, y `carta__saludo`, `carta__parrafo` y
 * `carta__firma` se excluyen mutuamente con `carta__respaldo`. No se comprueba
 * entonces que el conjunto de clases del DOM iguale `CLASES_CARTA` con un nodo
 * cada una, sino la **secuencia** saludo, parrafo^n, firma.
 *
 * La Carta sin ningun parrafo con caracteres visibles se genera a proposito
 * (parrafos ausentes o todos en blanco), pero para ella el enunciado de la
 * propiedad es vacio: no hay «primer parrafo» ni «ultimo». Esas iteraciones solo
 * comprueban que no queda texto que ordenar; el mensaje de respaldo y la
 * permanencia del Mapa_Estelar son la Propiedad 24.
 *
 * Como `pruebas/generadores.ts` no exporta una `CartaConfigurada`, se construye
 * aqui con sesgo hacia los limites que nombran los requisitos: 0, 1, 20 y mas de
 * 20 parrafos, parrafos en blanco, un total de exactamente 6000 caracteres, un
 * unico parrafo que excede el tope, y saludos y firmas de exactamente 120
 * caracteres, tambien con acentos y pares suplentes.
 */

/** Espacios en blanco que `trim()` descarta, incluido el no separable. */
const BLANCOS = [' ', '\t', '\n', '\r', '\u00a0', '\u2009'] as const;

/** Caracteres visibles: ASCII, acentuado y pares suplentes (emoji). */
const VISIBLES = ['a', '7', 'ñ', 'á', '⚛', '🐱', '🏍', '🐈'] as const;

/** Texto de solo espacios en blanco, incluido el vacio. */
const genBlanco: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...BLANCOS), { maxLength: 5 })
  .map((piezas) => piezas.join(''));

/**
 * Texto con al menos un caracter visible: el del medio lo garantiza, asi el
 * generador no depende de un filtro que descarte muestras.
 */
const genVisible: fc.Arbitrary<string> = fc
  .tuple(
    fc.string({ unit: 'grapheme', maxLength: 20 }),
    fc.constantFrom(...VISIBLES),
    fc.string({ maxLength: 20 }),
  )
  .map(([izquierda, centro, derecha]) => `${izquierda}${centro}${derecha}`);

/** Parrafos largos alrededor del tope de 6000 unidades de codigo. */
const genParrafoLargo: fc.Arbitrary<string> = fc.constantFrom(
  'a'.repeat(MAX_CARACTERES_CARTA),
  'b'.repeat(MAX_CARACTERES_CARTA - 1),
  'c'.repeat(MAX_CARACTERES_CARTA + 1),
  'd'.repeat(3000),
  // 3000 pares suplentes ocupan 6000 unidades de codigo; el ultimo emoji sobra.
  `${'🐱'.repeat(3000)}🏍`,
);

/** Un parrafo declarado: visible, en blanco o desmesurado. */
const genParrafo: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: genVisible },
  { weight: 2, arbitrary: genBlanco },
  { weight: 1, arbitrary: genParrafoLargo },
);

/** Listas de parrafos sesgadas a los limites del Requisito 5.1. */
const genParrafos: fc.Arbitrary<readonly string[]> = fc.oneof(
  // Sin parrafos declarados.
  { weight: 1, arbitrary: fc.constant<readonly string[]>([]) },
  // Un solo parrafo.
  { weight: 2, arbitrary: fc.array(genParrafo, { minLength: 1, maxLength: 1 }) },
  // Caso general corto.
  { weight: 4, arbitrary: fc.array(genParrafo, { minLength: 1, maxLength: 6 }) },
  // Exactamente el maximo admitido.
  {
    weight: 2,
    arbitrary: fc.array(genVisible, {
      minLength: MAX_PARRAFOS_CARTA,
      maxLength: MAX_PARRAFOS_CARTA,
    }),
  },
  // Mas de 20: el excedente debe quedar fuera.
  {
    weight: 2,
    arbitrary: fc.array(genParrafo, {
      minLength: MAX_PARRAFOS_CARTA + 1,
      maxLength: MAX_PARRAFOS_CARTA + 6,
    }),
  },
  // Todos en blanco: no queda texto que ordenar.
  { weight: 2, arbitrary: fc.array(genBlanco, { minLength: 1, maxLength: 6 }) },
  // Total de exactamente 6000 caracteres, y un cuarto parrafo que ya no cabe.
  {
    weight: 2,
    arbitrary: fc.constant<readonly string[]>([
      'x'.repeat(3000),
      'y'.repeat(2999),
      'z',
      'w'.repeat(10),
    ]),
  },
);

/** Saludos y firmas alrededor del tope de 120 caracteres. */
const genRotulo: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: genVisible },
  { weight: 1, arbitrary: genBlanco },
  {
    weight: 3,
    arbitrary: fc.constantFrom(
      'á'.repeat(MAX_CARACTERES_ROTULO),
      'k'.repeat(MAX_CARACTERES_ROTULO - 1),
      'k'.repeat(MAX_CARACTERES_ROTULO + 1),
      'q'.repeat(MAX_CARACTERES_ROTULO * 2),
      // 60 pares suplentes son 120 unidades de codigo justas.
      '🐱'.repeat(MAX_CARACTERES_ROTULO / 2),
      `${'🐈'.repeat(MAX_CARACTERES_ROTULO / 2)}🏍`,
    ),
  },
);

const genCarta: fc.Arbitrary<CartaConfigurada> = fc.record({
  saludo: genRotulo,
  parrafos: genParrafos,
  firma: genRotulo,
});

/** Verdadero si el texto tiene algun caracter que no es espacio en blanco. */
function tieneContenido(texto: string): boolean {
  return texto.trim().length > 0;
}

/** Raiz con un Mapa_Estelar hermano, como en la Pagina_Regalo. */
function preparar(): HTMLElement {
  const raiz = document.createElement('div');
  const mapa = document.createElement('div');
  mapa.id = 'mapa';
  raiz.append(mapa);
  document.body.append(raiz);
  return raiz;
}

describe('Propiedad 23: la estructura del Lienzo_Carta respeta el orden saludo, parrafos y firma', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('para toda Carta declarada en el Archivo_Configuracion', () => {
    // Clases de entrada que la propiedad debe haber visto de verdad.
    let conTexto = 0;
    let sinTexto = 0;
    let alMaximoDeParrafos = 0;
    let alTopeDeCaracteres = 0;
    let rotuloRecortado = 0;

    fc.assert(
      fc.property(genCarta, (declarada) => {
        document.body.replaceChildren();
        const raiz = preparar();

        const resuelta = resolverCarta(declarada);
        const asa = montarCarta(raiz, resuelta, { consultaMovimiento: null });

        const desplazable = asa.seccion.querySelector(`.${CLASES_CARTA.desplazable}`);
        if (desplazable === null) {
          throw new Error('el Lienzo_Carta no monto su contenedor desplazable');
        }

        // Todo el texto es hijo directo del contenedor desplazable, asi que el
        // orden de documento es exactamente el orden de estos nodos.
        const bloques = [...desplazable.children];
        expect(bloques).toEqual([...asa.seccion.querySelectorAll('p')]);

        if (!resuelta.disponible) {
          sinTexto += 1;

          // Enunciado vacio: sin parrafos utiles no hay «primero» ni «ultimo».
          expect(declarada.parrafos.every((parrafo) => !tieneContenido(parrafo))).toBe(true);
          expect(bloques.map((nodo) => nodo.className)).toEqual([CLASES_CARTA.respaldo]);
          asa.destruir();
          return;
        }

        conTexto += 1;

        const parrafos = resuelta.parrafos;
        if (parrafos.length === MAX_PARRAFOS_CARTA) {
          alMaximoDeParrafos += 1;
        }
        if (parrafos.join('').length === MAX_CARACTERES_CARTA) {
          alTopeDeCaracteres += 1;
        }
        if (declarada.saludo.length > MAX_CARACTERES_ROTULO) {
          rotuloRecortado += 1;
        }

        // Requisitos 5.5, 5.1 y 5.6: la secuencia exacta de bloques.
        expect(bloques.map((nodo) => nodo.className)).toEqual([
          CLASES_CARTA.saludo,
          ...parrafos.map(() => CLASES_CARTA.parrafo),
          CLASES_CARTA.firma,
        ]);
        // Cada bloque es un parrafo independiente, no un contenedor anidado.
        expect(bloques.every((nodo) => nodo.tagName === 'P')).toBe(true);
        expect(bloques.every((nodo) => nodo.children.length === 0)).toBe(true);
        // Con texto no hay respaldo: las clases se excluyen mutuamente.
        expect(desplazable.querySelector(`.${CLASES_CARTA.respaldo}`)).toBeNull();
        expect(asa.seccion.textContent).not.toContain(MENSAJE_CARTA_NO_DISPONIBLE);

        // Requisito 5.1: un bloque por parrafo, en orden y con el mismo texto.
        const nodosParrafo = [...desplazable.querySelectorAll(`.${CLASES_CARTA.parrafo}`)];
        expect(nodosParrafo).toHaveLength(parrafos.length);
        expect(nodosParrafo.map((nodo) => nodo.textContent)).toEqual([...parrafos]);
        expect(parrafos.length).toBeGreaterThanOrEqual(1);
        expect(parrafos.length).toBeLessThanOrEqual(MAX_PARRAFOS_CARTA);
        expect(parrafos.join('').length).toBeLessThanOrEqual(MAX_CARACTERES_CARTA);

        // Requisito 5.1: el orden es el declarado y el texto es literal. Los
        // parrafos mostrados son un prefijo de los declarados con contenido; el
        // unico texto que puede diferir es el primero cuando por si solo excede
        // el tope, y entonces es un prefijo suyo.
        const utiles = declarada.parrafos.filter(tieneContenido);
        parrafos.forEach((mostrado, indice) => {
          const declaradoUtil = utiles[indice] ?? '';
          const literal = mostrado === declaradoUtil;
          const prefijoDelDesmesurado =
            indice === 0 &&
            parrafos.length === 1 &&
            mostrado.length === MAX_CARACTERES_CARTA &&
            declaradoUtil.startsWith(mostrado);
          expect(literal || prefijoDelDesmesurado).toBe(true);
        });

        // Requisito 5.5: el saludo, de a lo sumo 120 caracteres, antes del primer parrafo.
        const saludo = bloques[0];
        const primerParrafo = nodosParrafo[0];
        if (saludo === undefined || primerParrafo === undefined) {
          throw new Error('falta el saludo o el primer parrafo');
        }
        expect(saludo.className).toBe(CLASES_CARTA.saludo);
        expect(saludo.textContent).toBe(resuelta.saludo);
        expect(resuelta.saludo.length).toBeLessThanOrEqual(MAX_CARACTERES_ROTULO);
        expect(
          saludo.compareDocumentPosition(primerParrafo) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

        // Requisito 5.6: la firma, de a lo sumo 120 caracteres, despues del ultimo parrafo.
        const firma = bloques.at(-1);
        const ultimoParrafo = nodosParrafo.at(-1);
        if (firma === undefined || ultimoParrafo === undefined) {
          throw new Error('falta la firma o el ultimo parrafo');
        }
        expect(firma.className).toBe(CLASES_CARTA.firma);
        expect(firma.textContent).toBe(resuelta.firma);
        expect(resuelta.firma.length).toBeLessThanOrEqual(MAX_CARACTERES_ROTULO);
        expect(
          firma.compareDocumentPosition(ultimoParrafo) & Node.DOCUMENT_POSITION_PRECEDING,
        ).toBe(Node.DOCUMENT_POSITION_PRECEDING);

        asa.destruir();
      }),
      { numRuns: 200 },
    );

    // Los limites que nombran los requisitos se ejercitaron de verdad.
    expect(conTexto).toBeGreaterThan(0);
    expect(sinTexto).toBeGreaterThan(0);
    expect(alMaximoDeParrafos).toBeGreaterThan(0);
    expect(alTopeDeCaracteres).toBeGreaterThan(0);
    expect(rotuloRecortado).toBeGreaterThan(0);
  });
});
