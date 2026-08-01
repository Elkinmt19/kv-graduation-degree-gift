import { describe, expect, it } from 'vitest';

import {
  CONTRASTE_MINIMO_NO_TEXTO,
  PALETA_REGALO,
  componerCapas,
  cumpleContrasteNoTextual,
  relacionContraste,
  type Capa,
} from '../../../src/nucleo/diseno/contraste.js';
import { CLASES_PORTAL } from '../../../src/vista/portal/portal.js';
import {
  extraerDeclaraciones,
  interpretarCapaDeToken,
  inventariarLiteralesDeColor,
  leerHojaDeEstilo,
  leerTokens,
} from '../../utilidades/estilos.js';

/**
 * Contrato entre el Portal_Acceso y sus estilos (Tarea 9.7).
 *
 * Estas pruebas corren en Node porque leen las hojas del disco: jsdom no aplica
 * las hojas del proyecto ni calcula `outline`, asi que lo que la hoja declara
 * solo puede verificarse sobre el archivo real.
 *
 * - Requisito 7.4: el aro de foco es dorado, de al menos 2 px de grosor y con
 *   relacion de contraste minima de 3:1 respecto del fondo adyacente.
 * - Requisito 6.1: `portal.css` no declara ningun literal de color.
 * - Y el vocabulario de clases: los selectores `portal…` de `portal.css` son
 *   exactamente los que exporta `CLASES_PORTAL`, el mismo objeto que
 *   `pruebas/unitarias/vista/portal/portal.test.ts` compara contra el DOM que
 *   monta el portal. Con las dos mitades, una clase renombrada en un solo lado
 *   deja de pasar desapercibida.
 */

const HOJA_PORTAL = leerHojaDeEstilo('portal.css');
const HOJA_BASE = leerHojaDeEstilo('base.css');
const TOKENS = leerTokens();

/** Valor de un token del sistema de diseno; falla si la hoja no lo declara. */
function token(nombre: string): string {
  const valor = TOKENS.get(nombre);
  if (valor === undefined) throw new Error(`tokens.css no declara ${nombre}`);
  return valor;
}

/** Capa de la Paleta_Regalo que declara un token de color. */
function capa(nombre: string): Capa {
  const declarada = interpretarCapaDeToken(token(nombre));
  if (declarada === null) throw new Error(`${nombre} no es una capa de la Paleta_Regalo: ${token(nombre)}`);
  return { color: PALETA_REGALO[declarada.nombre], opacidad: declarada.opacidad };
}

/** Distingue las clases del Portal_Acceso de las decorativas del cielo. */
function esClaseDelPortal(clase: string): boolean {
  return clase === CLASES_PORTAL.seccion || clase.startsWith(`${CLASES_PORTAL.seccion}__`);
}

/**
 * Clases `portal…` a las que apunta `portal.css`. Se leen de los selectores de
 * la hoja real, con los comentarios borrados para que un nombre mencionado en la
 * documentacion de la hoja no cuente como selector.
 */
function clasesDeLaHoja(): Set<string> {
  const sinComentarios = HOJA_PORTAL.contenido.replace(/\/\*[\s\S]*?\*\//gu, ' ');
  const halladas = [...sinComentarios.matchAll(/\.([a-zA-Z][\w-]*)/gu)].map(
    (coincidencia) => coincidencia[1] ?? '',
  );
  return new Set(halladas.filter(esClaseDelPortal));
}

describe('portal.css estila exactamente las clases que el portal emite', () => {
  it('los selectores de la hoja son los del contrato CLASES_PORTAL', () => {
    const enLaHoja = clasesDeLaHoja();
    const delContrato = new Set<string>(Object.values(CLASES_PORTAL));

    expect(enLaHoja.size).toBeGreaterThan(0);

    // Sin esto, una clase renombrada en el DOM perderia su estilo en silencio.
    const sinEstilo = [...delContrato].filter((clase) => !enLaHoja.has(clase));
    expect(sinEstilo).toEqual([]);

    // Y al reves: la hoja no puede quedarse con selectores huerfanos, como el
    // `.portal__panel` que apuntaba a un elemento que el portal nunca monto.
    const huerfanas = [...enLaHoja].filter((clase) => !delContrato.has(clase));
    expect(huerfanas).toEqual([]);
  });

  it('el panel del formulario y el mensaje reciben sus reglas propias', () => {
    const declaraciones = extraerDeclaraciones(HOJA_PORTAL);
    expect(declaraciones.length).toBeGreaterThan(0);

    // La reserva de altura del mensaje (Requisito 1.4) depende de que la regla
    // apunte a la clase que el portal escribe de verdad.
    const sinComentarios = HOJA_PORTAL.contenido.replace(/\/\*[\s\S]*?\*\//gu, ' ');
    for (const clase of [CLASES_PORTAL.formulario, CLASES_PORTAL.mensaje, CLASES_PORTAL.campo]) {
      expect(sinComentarios, clase).toContain(`.${clase} {`);
    }
    expect(sinComentarios).toContain(`.${CLASES_PORTAL.ingreso} {`);
  });

  it('no declara ningun literal de color (Requisito 6.1)', () => {
    const inventario = inventariarLiteralesDeColor([HOJA_PORTAL]);
    const detalle = inventario
      .map((hallazgo) => `${hallazgo.archivo}:${String(hallazgo.linea)} ${hallazgo.literal}`)
      .join('\n');
    expect(inventario, detalle).toEqual([]);
  });
});

describe('Requisito 7.4: aro de foco dorado de al menos 2 px', () => {
  it('el grosor declarado alcanza los 2 px', () => {
    const grosor = token('--grosor-foco');
    expect(grosor).toMatch(/^\d+(\.\d+)?px$/u);
    expect(Number.parseFloat(grosor)).toBeGreaterThanOrEqual(2);
  });

  it('el aro es dorado pleno de la Paleta_Regalo', () => {
    expect(capa('--foco')).toEqual({ color: PALETA_REGALO.dorado, opacidad: 1 });
  });

  it('base.css lo pinta sobre todo elemento enfocado, campo y boton incluidos', () => {
    const declaraciones = extraerDeclaraciones(HOJA_BASE);

    // El campo y el boton del portal no declaran contorno propio: lo reciben de
    // esta unica regla, alcanzable con pulsaciones sucesivas de Tab.
    expect(
      declaraciones
        .filter((declaracion) => declaracion.propiedad === 'outline')
        .map((declaracion) => declaracion.valor),
    ).toContain('var(--grosor-foco) solid var(--foco)');
    expect(
      declaraciones.some(
        (declaracion) =>
          declaracion.propiedad === 'outline-offset' &&
          declaracion.valor === 'var(--separacion-foco)',
      ),
    ).toBe(true);
    expect(HOJA_BASE.contenido.replace(/\/\*[\s\S]*?\*\//gu, ' ')).toContain(':focus-visible {');

    // Ninguna hoja del portal puede anular el aro con `outline: none`.
    expect(
      extraerDeclaraciones(HOJA_PORTAL).some(
        (declaracion) =>
          declaracion.propiedad.startsWith('outline') && /\bnone\b|\b0\b/u.test(declaracion.valor),
      ),
    ).toBe(false);
  });

  it('alcanza 3:1 contra cada superficie que lo rodea', () => {
    // `--separacion-foco` deja el aro por fuera del elemento enfocado, sobre el
    // panel del formulario; el relleno dorado del boton nunca lo toca.
    expect(Number.parseFloat(token('--separacion-foco'))).toBeGreaterThan(0);

    const base = PALETA_REGALO['negro-profundo'];
    const aro = componerCapas(base, [capa('--foco')]);

    // Ambos extremos del degradado del cielo, bajo el panel del formulario, y la
    // superficie del propio campo, que queda dentro de la separacion del aro.
    const superficies = [
      componerCapas(base, [capa('--fondo-cielo-alto'), capa('--fondo-hundido')]),
      componerCapas(base, [capa('--fondo-cielo-bajo'), capa('--fondo-hundido')]),
      componerCapas(base, [capa('--fondo-hundido'), capa('--fondo-elevado')]),
    ];

    for (const superficie of superficies) {
      const relacion = relacionContraste(aro, superficie);
      expect(cumpleContrasteNoTextual(relacion), `${String(relacion)}:1`).toBe(true);
      expect(relacion).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_NO_TEXTO);
    }
  });
});
