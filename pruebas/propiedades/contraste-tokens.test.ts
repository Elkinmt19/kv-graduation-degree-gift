import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CONTRASTE_MINIMO_NO_TEXTO,
  CONTRASTE_MINIMO_TEXTO,
  OPACIDAD_MAXIMA,
  OPACIDAD_MINIMA_TEXTO_DORADO,
  PALETA_REGALO,
  contrasteCompuesto,
  type Capa,
} from '../../src/nucleo/diseno/contraste.js';
import { interpretarCapaDeToken, leerTokens } from '../utilidades/estilos.js';

/**
 * Propiedad 27: Todo texto de la Paleta_Regalo mantiene el contraste minimo.
 *
 * **Validates: Requirements 6.2**
 *
 * Los colores no se copian a mano: se leen de `src/estilos/tokens.css` con
 * `leerTokens` y se interpretan con `interpretarCapaDeToken`, de modo que la
 * prueba mide los valores realmente declarados. La aritmetica es la de
 * `src/nucleo/diseno/contraste.ts` (luminancia relativa de WCAG 2.1).
 *
 * Los pares texto/fondo no son el producto cartesiano de todos los tokens: se
 * declaran los que las hojas de estilo combinan de verdad, con el estado
 * (reposo, foco, senalado, deshabilitado) que produce cada combinacion. Medir
 * pares que nadie pinta -por ejemplo `--texto-principal` sobre `--fondo-boton`-
 * inventaria fallos inexistentes; omitir pares declarados esconde fallos
 * reales.
 */

const tokens = leerTokens();

/** Convierte un token `rgb(var(--x-rgb) / a)` en la capa que declara. */
function capaDeToken(nombre: string): Capa {
  const valor = tokens.get(nombre);
  expect(valor, `el token ${nombre} debe estar declarado en tokens.css`).toBeDefined();

  const capa = interpretarCapaDeToken(valor ?? '');
  expect(capa, `el token ${nombre} debe declarar un color de la Paleta_Regalo`).not.toBeNull();

  return { color: PALETA_REGALO[capa!.nombre], opacidad: capa!.opacidad };
}

/** Base opaca del documento: `--fondo-base` (Requisito 6.1). */
const CAPA_BASE = capaDeToken('--fondo-base');
expect(CAPA_BASE.opacidad).toBe(OPACIDAD_MAXIMA);
const BASE = CAPA_BASE.color;

/**
 * Superficie declarada: pila de capas sobre la base opaca y roles de texto que
 * las hojas de estilo pintan encima, con el estado que los produce.
 */
interface Superficie {
  readonly fondo: string;
  /** Regla de estilo que declara la superficie y sus textos. */
  readonly origen: string;
  readonly textos: readonly { readonly token: string; readonly estado: string }[];
}

const SUPERFICIES: readonly Superficie[] = [
  {
    fondo: '--fondo-base',
    origen: 'body, h1-h3, p, .texto-carta, .texto-secundario y a:focus-visible en base.css',
    textos: [
      { token: '--texto-principal', estado: 'reposo' },
      { token: '--texto-secundario', estado: 'reposo' },
      { token: '--texto-senalado', estado: 'senalado' },
      { token: '--texto-enfocado', estado: 'foco' },
      { token: '--texto-deshabilitado', estado: 'deshabilitado' },
    ],
  },
  {
    fondo: '--fondo-elevado',
    origen: 'button, input, select, textarea (fondo de control) e input:disabled en base.css',
    textos: [
      { token: '--texto-principal', estado: 'reposo' },
      { token: '--texto-secundario', estado: 'reposo' },
      { token: '--texto-senalado', estado: 'senalado' },
      { token: '--texto-enfocado', estado: 'foco' },
      { token: '--texto-deshabilitado', estado: 'deshabilitado' },
    ],
  },
  {
    fondo: '--fondo-hundido',
    origen: 'paneles hundidos de la Pagina_Regalo',
    textos: [
      { token: '--texto-principal', estado: 'reposo' },
      { token: '--texto-secundario', estado: 'reposo' },
      { token: '--texto-senalado', estado: 'senalado' },
      { token: '--texto-enfocado', estado: 'foco' },
      { token: '--texto-deshabilitado', estado: 'deshabilitado' },
    ],
  },
  {
    fondo: '--velo-fondo',
    origen: 'velo sobre el fondo del Portal_Acceso',
    textos: [
      { token: '--texto-principal', estado: 'reposo' },
      { token: '--texto-secundario', estado: 'reposo' },
      { token: '--texto-senalado', estado: 'senalado' },
      { token: '--texto-enfocado', estado: 'foco' },
    ],
  },
  {
    // Cielo del Mapa_Estelar: solo lleva las etiquetas de Estrella (Req 4.4).
    fondo: '--fondo-cielo-alto',
    origen: 'degradado del cielo del Mapa_Estelar, extremo superior',
    textos: [{ token: '--texto-etiqueta-mapa', estado: 'reposo' }],
  },
  {
    fondo: '--fondo-cielo-bajo',
    origen: 'degradado del cielo del Mapa_Estelar, extremo inferior',
    textos: [{ token: '--texto-etiqueta-mapa', estado: 'reposo' }],
  },
  {
    fondo: '--fondo-boton',
    origen: 'button en base.css, tambien cuando esta enfocado',
    textos: [
      { token: '--texto-sobre-dorado', estado: 'reposo' },
      // Al enfocarse, el boton conserva `--texto-sobre-dorado`: la regla
      // generica `:focus-visible` solo pinta el aro y no declara `color`. Por
      // eso el estado de foco de esta superficie se mide con el mismo rol y no
      // con `--texto-enfocado`, que es el rol del texto enlazado sobre las
      // superficies oscuras y nunca se pinta sobre el relleno dorado.
      { token: '--texto-sobre-dorado', estado: 'foco' },
    ],
  },
  {
    fondo: '--fondo-boton-senalado',
    origen: 'button:hover:not(:disabled) en base.css',
    textos: [{ token: '--texto-sobre-dorado', estado: 'senalado' }],
  },
  {
    fondo: '--fondo-boton-deshabilitado',
    origen: 'button:disabled en base.css',
    textos: [{ token: '--texto-deshabilitado', estado: 'deshabilitado' }],
  },
];

/** Par declarado de texto sobre fondo efectivo, con su procedencia. */
interface ParDeclarado {
  readonly fondo: string;
  readonly texto: string;
  readonly estado: string;
  readonly origen: string;
}

const PARES: readonly ParDeclarado[] = SUPERFICIES.flatMap((superficie) =>
  superficie.textos.map((texto) => ({
    fondo: superficie.fondo,
    texto: texto.token,
    estado: texto.estado,
    origen: superficie.origen,
  })),
);

/** Capas del fondo efectivo de una superficie sobre la base opaca. */
function capasDeFondo(fondo: string): readonly Capa[] {
  return fondo === '--fondo-base' ? [] : [capaDeToken(fondo)];
}

/** Relacion de contraste de un par declarado, sobre su fondo efectivo. */
function contrasteDelPar(par: ParDeclarado): number {
  return contrasteCompuesto(BASE, capasDeFondo(par.fondo), [capaDeToken(par.texto)]);
}

/**
 * Superficies sobre las que el sistema expone todo el intervalo de opacidad de
 * texto dorado, de `OPACIDAD_MINIMA_TEXTO_DORADO` a `OPACIDAD_MAXIMA`. El
 * extremo inferior del cielo (`--fondo-cielo-bajo`, azul noche al 90 %) queda
 * fuera: solo lleva la etiqueta del mapa, con su opacidad fija, que se mide en
 * el barrido de pares.
 */
const SUPERFICIES_CON_TEXTO_DORADO: readonly string[] = [
  '--fondo-base',
  '--fondo-elevado',
  '--fondo-hundido',
  '--velo-fondo',
  '--fondo-cielo-alto',
];

const genSuperficieConTextoDorado = fc.constantFrom(...SUPERFICIES_CON_TEXTO_DORADO);

const genOpacidadDeTexto = fc.double({
  min: OPACIDAD_MINIMA_TEXTO_DORADO,
  max: OPACIDAD_MAXIMA,
  noNaN: true,
  noDefaultInfinity: true,
});

describe('Propiedad 27: todo texto de la Paleta_Regalo mantiene el contraste minimo', () => {
  it('para todo par declarado de token de texto y fondo efectivo, en todos sus estados', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PARES), (par) => {
        const relacion = contrasteDelPar(par);
        expect(
          relacion,
          `${par.texto} sobre ${par.fondo} (estado ${par.estado}, ${par.origen}) da ` +
            `${relacion.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
      }),
      { numRuns: PARES.length * 20 },
    );
  });

  it('para toda opacidad de texto dorado expuesta y toda superficie que la admite', () => {
    fc.assert(
      fc.property(genSuperficieConTextoDorado, genOpacidadDeTexto, (fondo, opacidad) => {
        const relacion = contrasteCompuesto(BASE, capasDeFondo(fondo), [
          { color: PALETA_REGALO.dorado, opacidad },
        ]);
        expect(
          relacion,
          `dorado al ${(opacidad * 100).toFixed(1)} % sobre ${fondo} da ${relacion.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
      }),
      { numRuns: 500 },
    );
  });

  it('el aro de foco alcanza su minimo sobre todo fondo adyacente declarado', () => {
    // El aro se pinta fuera del elemento (`outline-offset`), asi que su fondo
    // adyacente es la superficie que lo contiene, no el relleno del control.
    fc.assert(
      fc.property(genSuperficieConTextoDorado, (fondo) => {
        const relacion = contrasteCompuesto(BASE, capasDeFondo(fondo), [capaDeToken('--foco')]);
        expect(
          relacion,
          `el aro de foco sobre ${fondo} da ${relacion.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_NO_TEXTO);
      }),
      { numRuns: SUPERFICIES_CON_TEXTO_DORADO.length * 20 },
    );
  });
});
