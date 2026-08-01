import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Capa } from '../../src/nucleo/diseno/contraste.js';
import {
  CONTRASTE_MINIMO_TEXTO,
  OPACIDAD_MAXIMA,
  OPACIDAD_MINIMA,
  OPACIDAD_MINIMA_TEXTO_DORADO,
  PALETA_REGALO,
  contrasteCompuesto,
  cumpleContrasteDeTexto,
} from '../../src/nucleo/diseno/contraste.js';
import {
  HOJA_DE_TOKENS,
  extraerDeclaraciones,
  interpretarCapaDeToken,
  leerHojaDeEstilo,
  leerTokens,
} from '../utilidades/estilos.js';

/**
 * Propiedad 27: Todo texto de la Paleta_Regalo mantiene el contraste minimo.
 *
 * *Para todo* token de texto de la Paleta_Regalo, *para toda* opacidad expuesta
 * por el sistema de diseno y *para todo* fondo efectivo declarado, la relacion
 * de contraste calculada sobre la composicion de capas es mayor o igual a
 * 4.5:1, en los estados de reposo, foco, senalado con el cursor y
 * deshabilitado.
 *
 * **Validates: Requirements 6.2**
 *
 * La prueba no copia ningun color: lee `tokens.css` con `leerTokens`, interpreta
 * cada valor `rgb(var(--x-rgb) / a)` como capa de la Paleta_Regalo con
 * `interpretarCapaDeToken` y mide con la aritmetica de WCAG 2.1 de
 * `src/nucleo/diseno/contraste.ts`. Asi, cambiar una opacidad en la hoja mueve
 * la propiedad, que es justo lo que el Requisito 6.2 vigila.
 *
 * El emparejamiento texto-fondo no es libre: el negro profundo de
 * `--texto-sobre-dorado` solo tiene sentido sobre las superficies doradas del
 * boton, y el dorado de los demas roles solo sobre las superficies oscuras. Por
 * eso las parejas se toman de las que `base.css` realmente declara por estado,
 * y una prueba aparte comprueba que esas declaraciones siguen ahi.
 */

// --- Lectura de los tokens declarados ---------------------------------------

const tokens = leerTokens();

/** Valor declarado de un token, o error si la hoja ya no lo declara. */
function valorDeToken(nombre: string): string {
  const valor = tokens.get(nombre);
  if (valor === undefined) {
    throw new Error(`${HOJA_DE_TOKENS} no declara ${nombre}`);
  }
  return valor;
}

/** Token de color leido como capa de la Paleta_Regalo. */
function capaDeToken(nombre: string): Capa {
  const valor = valorDeToken(nombre);
  const capa = interpretarCapaDeToken(valor);
  if (capa === null) {
    throw new Error(`${nombre} no es una capa de la Paleta_Regalo: "${valor}"`);
  }
  return { color: PALETA_REGALO[capa.nombre], opacidad: capa.opacidad };
}

/** Nombre de la Paleta_Regalo con el que se declara un token de color. */
function paletaDeToken(nombre: string): string {
  const valor = valorDeToken(nombre);
  const capa = interpretarCapaDeToken(valor);
  if (capa === null) {
    throw new Error(`${nombre} no es una capa de la Paleta_Regalo: "${valor}"`);
  }
  return capa.nombre;
}

/** Roles de texto declarados en `tokens.css` (todo token `--texto-*`). */
const ROLES_DE_TEXTO: readonly string[] = [...tokens.keys()]
  .filter((nombre) => nombre.startsWith('--texto-'))
  .sort((primero, segundo) => primero.localeCompare(segundo));

/** Color opaco del documento: `--fondo-base` (Requisito 6.1). */
const BASE = capaDeToken('--fondo-base').color;

// --- Superficies declaradas --------------------------------------------------

/**
 * Superficie de fondo, expresada como las capas que `tokens.css` declara encima
 * de `--fondo-base`, de la mas lejana a la mas cercana al observador.
 */
interface Superficie {
  readonly nombre: string;
  readonly capas: readonly string[];
}

function superficie(...capas: readonly string[]): Superficie {
  return { nombre: capas.length === 0 ? '--fondo-base' : capas.join(' + '), capas };
}

/**
 * Superficies oscuras de contenido: las que `base.css` declara como
 * `background-color` bajo texto (`body` con `--fondo-base`, los controles con
 * `--fondo-elevado`) y el oscurecimiento declarado para paneles hundidos.
 */
const SUPERFICIES_CONTENIDO: readonly Superficie[] = [
  superficie(),
  superficie('--fondo-hundido'),
  superficie('--fondo-elevado'),
];

/** Superficies del cielo, sobre las que se dibujan los rotulos del mapa. */
const SUPERFICIES_CIELO: readonly Superficie[] = [
  superficie('--fondo-cielo-alto'),
  superficie('--fondo-cielo-bajo'),
];

/**
 * Superficies doradas de un boton: sobre el fondo del documento y sobre un
 * panel elevado, que son los dos sitios donde vive un control.
 */
function superficiesDeBoton(rol: string): readonly Superficie[] {
  return [superficie(rol), superficie('--fondo-elevado', rol)];
}

// --- Parejas texto-fondo por estado (Requisito 6.2) -------------------------

type Estado = 'reposo' | 'senalado' | 'foco' | 'deshabilitado';

/** Los cuatro estados que nombra el Requisito 6.2. */
const ESTADOS: readonly Estado[] = ['reposo', 'senalado', 'foco', 'deshabilitado'];

interface Pareja {
  readonly estado: Estado;
  readonly texto: string;
  readonly fondo: Superficie;
  /**
   * Si admite un velo generado encima del fondo. Solo las superficies oscuras
   * lo admiten: un velo sobre un boton no existe en ninguna hoja.
   */
  readonly velo: boolean;
}

function parejas(
  estado: Estado,
  texto: string,
  superficies: readonly Superficie[],
  velo: boolean,
): readonly Pareja[] {
  return superficies.map((fondo) => ({ estado, texto, fondo, velo }));
}

/**
 * Parejas que `base.css` declara, estado por estado:
 *
 * - reposo: `body`, `h1..h3` y `p` toman `--texto-principal`; `.texto-secundario`
 *   toma `--texto-secundario`; el boton toma `--texto-sobre-dorado` sobre
 *   `--fondo-boton`; los rotulos del mapa toman `--texto-etiqueta-mapa` sobre
 *   el cielo (Requisito 4.4).
 * - senalado: `button:hover` conserva `--texto-sobre-dorado` sobre
 *   `--fondo-boton-senalado`; `--texto-senalado` cubre el senalamiento sobre
 *   superficies oscuras.
 * - foco: la regla generica `:focus-visible` solo pinta el aro y no toca el
 *   `color`, asi que el boton enfocado conserva `--texto-sobre-dorado` sobre
 *   `--fondo-boton`; `--texto-enfocado` es el rol del texto enlazado
 *   (`a:focus-visible`), que vive sobre las superficies oscuras. Medir
 *   `--texto-enfocado` sobre `--fondo-boton` describiria una pareja que ninguna
 *   hoja declara, y por eso no entra en la lista.
 * - deshabilitado: `input:disabled` deja `--texto-deshabilitado` sobre
 *   `--fondo-elevado`; `button:disabled` lo deja sobre
 *   `--fondo-boton-deshabilitado`.
 */
const PAREJAS: readonly Pareja[] = [
  ...parejas('reposo', '--texto-principal', [...SUPERFICIES_CONTENIDO, ...SUPERFICIES_CIELO], true),
  ...parejas('reposo', '--texto-secundario', SUPERFICIES_CONTENIDO, true),
  ...parejas('reposo', '--texto-etiqueta-mapa', SUPERFICIES_CIELO, true),
  ...parejas('reposo', '--texto-sobre-dorado', superficiesDeBoton('--fondo-boton'), false),
  ...parejas('senalado', '--texto-senalado', [...SUPERFICIES_CONTENIDO, ...SUPERFICIES_CIELO], true),
  ...parejas(
    'senalado',
    '--texto-sobre-dorado',
    superficiesDeBoton('--fondo-boton-senalado'),
    false,
  ),
  ...parejas('foco', '--texto-enfocado', [...SUPERFICIES_CONTENIDO, ...SUPERFICIES_CIELO], true),
  ...parejas('foco', '--texto-sobre-dorado', superficiesDeBoton('--fondo-boton'), false),
  ...parejas('deshabilitado', '--texto-deshabilitado', SUPERFICIES_CONTENIDO, true),
  ...parejas(
    'deshabilitado',
    '--texto-deshabilitado',
    superficiesDeBoton('--fondo-boton-deshabilitado'),
    false,
  ),
];

/** Pareja ya resuelta a capas, para no releer los tokens en cada corrida. */
interface ParejaMedible extends Pareja {
  readonly capasFondo: readonly Capa[];
  readonly capaTexto: Capa;
}

const MEDIBLES: readonly ParejaMedible[] = PAREJAS.map((pareja) => ({
  ...pareja,
  capasFondo: pareja.fondo.capas.map(capaDeToken),
  capaTexto: capaDeToken(pareja.texto),
}));

// --- Generadores -------------------------------------------------------------

/**
 * Opacidad admitida por el Requisito 6.1: [0.05, 1], con sesgo hacia las
 * fronteras y hacia las opacidades que la hoja ya declara.
 */
const genOpacidad: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({
      min: OPACIDAD_MINIMA,
      max: OPACIDAD_MAXIMA,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(OPACIDAD_MINIMA, 0.3, 0.55, 0.6, 0.7, 0.85, 0.9, OPACIDAD_MAXIMA),
  },
);

/**
 * Velo de negro profundo encima de la superficie oscura, con cualquier opacidad
 * autorizada: generaliza `--velo-fondo` a todo el intervalo del Requisito 6.1.
 * `null` representa la superficie sin velo.
 */
const genVelo: fc.Arbitrary<Capa | null> = fc.option(
  genOpacidad.map((opacidad) => ({ color: PALETA_REGALO['negro-profundo'], opacidad })),
  { nil: null },
);

/** Opacidad de texto expuesta por el sistema: [0.7, 1] (Requisito 6.2). */
const genOpacidadDeTexto: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.double({
      min: OPACIDAD_MINIMA_TEXTO_DORADO,
      max: OPACIDAD_MAXIMA,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(OPACIDAD_MINIMA_TEXTO_DORADO, 0.74, 0.92, OPACIDAD_MAXIMA),
  },
);

/** Opacidad maxima de azul noche declarada bajo texto: `--fondo-elevado`. */
const OPACIDAD_AZUL_BAJO_TEXTO = capaDeToken('--fondo-elevado').opacidad;

/** Opacidad minima de los roles que el diseno dibuja sobre el cielo. */
const OPACIDAD_TEXTO_SOBRE_CIELO = capaDeToken('--texto-etiqueta-mapa').opacidad;

// --- Ataduras con las hojas de estilo ---------------------------------------

const hojaBase = leerHojaDeEstilo('base.css');
const declaracionesBase = extraerDeclaraciones(hojaBase);

/** Contenido de la hoja sin comentarios, para inspeccionar reglas concretas. */
const baseSinComentarios = hojaBase.contenido.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * Cuerpo de la regla cuyo selector es exactamente `:focus-visible`, es decir la
 * regla generica de foco, no `a:focus-visible` ni ningun otro selector
 * compuesto. Devuelve `null` si la hoja ya no declara esa regla.
 */
function cuerpoDelFocoGenerico(): string | null {
  const coincidencia = /(?:^|[};])\s*:focus-visible\s*\{([^}]*)\}/.exec(baseSinComentarios);
  return coincidencia === null ? null : (coincidencia[1] ?? '');
}

function declara(propiedad: string, token: string): boolean {
  return declaracionesBase.some(
    (declaracion) =>
      declaracion.propiedad === propiedad && declaracion.valor === `var(${token})`,
  );
}

function medir(pareja: ParejaMedible, velo: Capa | null): number {
  const capasFondo =
    pareja.velo && velo !== null ? [...pareja.capasFondo, velo] : pareja.capasFondo;
  return contrasteCompuesto(BASE, capasFondo, [pareja.capaTexto]);
}

function describirFallo(pareja: ParejaMedible, velo: Capa | null, relacion: number): string {
  const conVelo =
    pareja.velo && velo !== null
      ? ` + velo negro ${velo.opacidad.toFixed(4)}`
      : '';
  return `${pareja.estado}: ${pareja.texto} sobre ${pareja.fondo.nombre}${conVelo} = ${relacion.toFixed(2)}:1`;
}

describe('Propiedad 27: todo texto de la Paleta_Regalo mantiene el contraste minimo', () => {
  it('los roles de texto se declaran como capas de la Paleta_Regalo, nunca en azul electrico', () => {
    expect(ROLES_DE_TEXTO.length).toBeGreaterThan(0);
    for (const rol of ROLES_DE_TEXTO) {
      const capa = capaDeToken(rol);
      expect(capa.opacidad).toBeGreaterThanOrEqual(OPACIDAD_MINIMA);
      expect(capa.opacidad).toBeLessThanOrEqual(OPACIDAD_MAXIMA);
      // El azul electrico da 3.05:1 sobre negro profundo: prohibido para texto.
      expect(paletaDeToken(rol), rol).not.toBe('azul-electrico');
    }
    // `--fondo-base` es el color opaco de partida de toda composicion.
    expect(capaDeToken('--fondo-base').opacidad).toBe(OPACIDAD_MAXIMA);
  });

  it('las parejas medidas son las que declara base.css, y cubren los cuatro estados', () => {
    // Sin estas ataduras la propiedad podria pasar mientras la hoja usa otros
    // roles: cada token medido tiene que estar declarado como color de texto.
    expect(declara('color', '--texto-principal')).toBe(true);
    expect(declara('color', '--texto-secundario')).toBe(true);
    expect(declara('color', '--texto-sobre-dorado')).toBe(true);
    expect(declara('color', '--texto-deshabilitado')).toBe(true);
    expect(declara('color', '--texto-enfocado')).toBe(true);
    expect(declara('background-color', '--fondo-base')).toBe(true);
    expect(declara('background-color', '--fondo-elevado')).toBe(true);
    expect(declara('background-color', '--fondo-boton')).toBe(true);
    expect(declara('background-color', '--fondo-boton-senalado')).toBe(true);
    expect(declara('background-color', '--fondo-boton-deshabilitado')).toBe(true);

    // La regla generica de foco solo pinta el aro: si volviera a declarar un
    // `color`, ganaria por especificidad al rotulo del boton y habria que medir
    // ese rol nuevo sobre las superficies doradas. Mientras no lo declare, el
    // boton enfocado conserva `--texto-sobre-dorado`, que es lo que se mide.
    const focoGenerico = cuerpoDelFocoGenerico();
    expect(focoGenerico, 'base.css debe declarar la regla generica :focus-visible').not.toBeNull();
    expect(focoGenerico ?? '').not.toMatch(/(?:^|[;{\s])color\s*:/);

    for (const estado of ESTADOS) {
      expect(
        MEDIBLES.filter((pareja) => pareja.estado === estado).length,
        estado,
      ).toBeGreaterThan(0);
    }
    // Todo rol de texto declarado entra en alguna pareja.
    for (const rol of ROLES_DE_TEXTO) {
      expect(
        MEDIBLES.some((pareja) => pareja.texto === rol),
        rol,
      ).toBe(true);
    }
  });

  it('para todo fondo efectivo declarado y todo velo autorizado, en los cuatro estados', () => {
    fc.assert(
      fc.property(genVelo, (velo) => {
        const fallos = MEDIBLES.flatMap((pareja) => {
          const relacion = medir(pareja, velo);
          return cumpleContrasteDeTexto(relacion) ? [] : [describirFallo(pareja, velo, relacion)];
        });
        expect(fallos, `minimo ${String(CONTRASTE_MINIMO_TEXTO)}:1`).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it('para toda opacidad de texto expuesta sobre toda superficie de azul noche admitida', () => {
    fc.assert(
      fc.property(
        genOpacidadDeTexto,
        fc.double({
          min: OPACIDAD_MINIMA,
          max: OPACIDAD_AZUL_BAJO_TEXTO,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        genVelo,
        (opacidadTexto, opacidadFondo, velo) => {
          const capasFondo: Capa[] = [
            { color: PALETA_REGALO['azul-noche'], opacidad: opacidadFondo },
          ];
          if (velo !== null) capasFondo.push(velo);

          const relacion = contrasteCompuesto(BASE, capasFondo, [
            { color: PALETA_REGALO.dorado, opacidad: opacidadTexto },
          ]);
          expect(
            relacion,
            `dorado ${opacidadTexto.toFixed(4)} sobre azul noche ${opacidadFondo.toFixed(4)}`,
          ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('los roles que el diseno dibuja sobre el cielo soportan cualquier azul noche', () => {
    fc.assert(
      fc.property(
        fc.double({
          min: OPACIDAD_TEXTO_SOBRE_CIELO,
          max: OPACIDAD_MAXIMA,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        genOpacidad,
        (opacidadTexto, opacidadCielo) => {
          const relacion = contrasteCompuesto(
            BASE,
            [{ color: PALETA_REGALO['azul-noche'], opacidad: opacidadCielo }],
            [{ color: PALETA_REGALO.dorado, opacidad: opacidadTexto }],
          );
          expect(
            relacion,
            `dorado ${opacidadTexto.toFixed(4)} sobre cielo ${opacidadCielo.toFixed(4)}`,
          ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
        },
      ),
      { numRuns: 400 },
    );
  });
});
