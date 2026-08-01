import { describe, expect, it } from 'vitest';

import { CONSULTA_MOVIMIENTO_REDUCIDO } from '../../../src/infra/movimiento-reducido.js';
import {
  OPACIDAD_MAXIMA,
  OPACIDAD_MINIMA,
  PALETA_REGALO,
  interpretarHex,
  type NombrePaleta,
} from '../../../src/nucleo/diseno/contraste.js';
import {
  AREA_TACTIL_MIN,
  SEPARACION_TACTIL_MIN,
  UMBRAL_TACTIL,
} from '../../../src/vista/disposicion.js';
import {
  HOJA_DE_TOKENS,
  extraerDeclaraciones,
  interpretarCapaDeToken,
  inventariarLiteralesDeColor,
  leerHojaDeEstilo,
  leerHojasDeEstilo,
  leerTokens,
  type HojaDeEstilo,
} from '../../utilidades/estilos.js';

/**
 * Pruebas unitarias del sistema de diseno (`src/estilos/`).
 *
 * Verifican sobre las hojas reales, sin navegador:
 * - Requisito 6.1: fuera de `tokens.css` no hay ningun literal de color, y
 *   `tokens.css` solo declara los cuatro colores de la Paleta_Regalo con
 *   opacidades dentro de [0.05, 1.0].
 * - Requisito 6.7: la Carta usa la familia serif y los rotulos y controles la
 *   sans-serif, cada una con su generica de respaldo al final de la lista.
 * - Requisito 7.11: por debajo de 768 px los controles declaran el area tactil
 *   de 44 x 44 px y la separacion de 8 px, tomadas de los tokens.
 * - Requisito 7.5: con movimiento reducido se anulan los tokens de ritmo y las
 *   duraciones de animacion y transicion.
 *
 * Las cifras no se repiten a mano: los umbrales vienen de
 * `src/vista/disposicion.ts`, la paleta de `src/nucleo/diseno/contraste.ts` y la
 * consulta de medios de `src/infra/movimiento-reducido.ts`, de modo que un
 * cambio en el codigo o en la hoja de estilo hace fallar la prueba.
 */

// --- Analisis de reglas con su contexto de reglas `@` -------------------------

interface DeclaracionDeRegla {
  readonly propiedad: string;
  readonly valor: string;
}

interface Regla {
  /** Preludios de las reglas `@` que envuelven a esta regla, de fuera a dentro. */
  readonly contexto: readonly string[];
  readonly selector: string;
  readonly declaraciones: readonly DeclaracionDeRegla[];
}

function normalizarEspacios(texto: string): string {
  return texto.replace(/\s+/gu, ' ').trim();
}

function sinComentarios(contenido: string): string {
  return contenido.replace(/\/\*[\s\S]*?\*\//gu, ' ');
}

function declaracionesDelCuerpo(cuerpo: string): DeclaracionDeRegla[] {
  return cuerpo
    .split(';')
    .map((trozo) => trozo.trim())
    .filter((trozo) => trozo.length > 0)
    .flatMap((trozo) => {
      const separador = trozo.indexOf(':');
      if (separador <= 0) return [];
      return [
        {
          propiedad: trozo.slice(0, separador).trim(),
          valor: normalizarEspacios(trozo.slice(separador + 1)),
        },
      ];
    });
}

/**
 * Analiza una hoja en reglas planas, conservando los preludios `@media` que
 * las envuelven. `extraerDeclaraciones` de la utilidad compartida pierde esa
 * informacion a proposito, y aqui hace falta para distinguir lo que solo rige
 * por debajo de 768 px o con movimiento reducido.
 */
function analizarReglas(hoja: HojaDeEstilo): Regla[] {
  const contenido = sinComentarios(hoja.contenido);
  const reglas: Regla[] = [];
  const pila: string[] = [];
  let preludio = '';
  let indice = 0;

  while (indice < contenido.length) {
    const caracter = contenido[indice] ?? '';

    if (caracter === '{') {
      const cabecera = normalizarEspacios(preludio);
      preludio = '';
      indice += 1;

      if (cabecera.startsWith('@')) {
        pila.push(cabecera);
        continue;
      }

      let cuerpo = '';
      while (indice < contenido.length && contenido[indice] !== '}') {
        cuerpo += contenido[indice] ?? '';
        indice += 1;
      }
      indice += 1;

      reglas.push({
        contexto: [...pila],
        selector: cabecera,
        declaraciones: declaracionesDelCuerpo(cuerpo),
      });
      continue;
    }

    if (caracter === '}') {
      pila.pop();
      preludio = '';
      indice += 1;
      continue;
    }

    // Reglas `@` sin bloque, como `@import './tokens.css';`.
    if (caracter === ';') {
      preludio = '';
      indice += 1;
      continue;
    }

    preludio += caracter;
    indice += 1;
  }

  return reglas;
}

function selectorIncluye(regla: Regla, parte: string): boolean {
  return regla.selector.split(',').some((seleccion) => seleccion.trim() === parte);
}

function declara(regla: Regla, propiedad: string, valor: string): boolean {
  return regla.declaraciones.some(
    (declaracion) => declaracion.propiedad === propiedad && declaracion.valor === valor,
  );
}

function enContexto(regla: Regla, predicado: (preludio: string) => boolean): boolean {
  return regla.contexto.some(predicado);
}

// --- Lectura de las hojas reales ---------------------------------------------

const hojas = leerHojasDeEstilo();
const hojaDeTokens = leerHojaDeEstilo(HOJA_DE_TOKENS);
const tokens = leerTokens(hojaDeTokens);
const declaracionesDeTokens = extraerDeclaraciones(hojaDeTokens);
const reglasPorHoja = new Map(hojas.map((hoja) => [hoja.archivo, analizarReglas(hoja)]));
const todasLasReglas = [...reglasPorHoja.values()].flat();

function token(nombre: string): string {
  const valor = tokens.get(nombre);
  if (valor === undefined) throw new Error(`${HOJA_DE_TOKENS} no declara ${nombre}`);
  return valor;
}

/** Preludio exacto de la consulta de movimiento reducido en las hojas. */
const PRELUDIO_MOVIMIENTO_REDUCIDO = `@media ${CONSULTA_MOVIMIENTO_REDUCIDO}`;

const esMovimientoReducido = (preludio: string): boolean =>
  preludio === PRELUDIO_MOVIMIENTO_REDUCIDO;

/** Cota `max-width` declarada por un preludio `@media`, o `null`. */
function cotaMaxima(preludio: string): number | null {
  const coincidencia = /\(\s*max-width\s*:\s*(\d+)px\s*\)/u.exec(preludio);
  return coincidencia === null ? null : Number.parseInt(coincidencia[1] ?? '', 10);
}

const esTactil = (preludio: string): boolean => cotaMaxima(preludio) !== null;

// --- Requisito 6.1: inventario de color --------------------------------------

describe('Requisito 6.1: la Paleta_Regalo es la unica fuente de color', () => {
  it('lee mas de una hoja de estilo, para que el inventario signifique algo', () => {
    expect(hojas.length).toBeGreaterThan(1);
    expect(hojas.map((hoja) => hoja.archivo)).toContain(HOJA_DE_TOKENS);
  });

  it('ninguna hoja fuera de tokens.css declara un literal de color', () => {
    const inventario = inventariarLiteralesDeColor(hojas);
    const detalle = inventario
      .map((hallazgo) => `${hallazgo.archivo}:${hallazgo.linea} ${hallazgo.propiedad}: ${hallazgo.literal}`)
      .join('\n');
    expect(inventario, detalle).toEqual([]);
  });

  it('tokens.css declara exactamente los cuatro colores de la Paleta_Regalo', () => {
    const hexadecimales = new Set(
      declaracionesDeTokens.flatMap((declaracion) =>
        [...declaracion.valor.matchAll(/#[0-9a-fA-F]{3,8}\b/gu)].map((coincidencia) =>
          coincidencia[0].toLowerCase(),
        ),
      ),
    );
    expect([...hexadecimales].sort()).toEqual(['#05060d', '#0b2a6f', '#1e4fd8', '#d4af37']);
  });

  it('cada color de la paleta coincide con sus componentes y con el nucleo', () => {
    for (const nombre of Object.keys(PALETA_REGALO) as NombrePaleta[]) {
      const esperado = PALETA_REGALO[nombre];
      expect(interpretarHex(token(`--${nombre}`))).toEqual(esperado);
      // Los componentes RGB permiten derivar opacidades sin colores nuevos.
      expect(token(`--${nombre}-rgb`)).toBe(`${esperado.r} ${esperado.g} ${esperado.b}`);
    }
  });

  it('todo rol de color es una capa de la paleta con opacidad en [0.05, 1.0]', () => {
    const roles = declaracionesDeTokens.filter(
      (declaracion) => declaracion.propiedad.startsWith('--') && /\brgb\s*\(/u.test(declaracion.valor),
    );
    expect(roles.length).toBeGreaterThan(0);

    for (const rol of roles) {
      const capa = interpretarCapaDeToken(rol.valor);
      expect(capa, `${rol.propiedad}: ${rol.valor}`).not.toBeNull();
      expect(PALETA_REGALO[capa!.nombre]).toBeDefined();
      expect(capa!.opacidad).toBeGreaterThanOrEqual(OPACIDAD_MINIMA);
      expect(capa!.opacidad).toBeLessThanOrEqual(OPACIDAD_MAXIMA);
    }
  });

  it('tokens.css no usa ninguna otra funcion de color de CSS', () => {
    const prohibidas =
      /\b(hsla?|hwb|lab|lch|oklab|oklch|color-mix|light-dark|device-cmyk|color)\s*\(/iu;
    const infractores = declaracionesDeTokens.filter((declaracion) =>
      prohibidas.test(declaracion.valor),
    );
    expect(infractores.map((declaracion) => `${declaracion.propiedad}: ${declaracion.valor}`)).toEqual(
      [],
    );
  });
});

// --- Requisito 6.7: tipografia con generica de respaldo ----------------------

/** Ultima familia de una lista `font-family`, es decir la generica de respaldo. */
function familiaGenerica(lista: string): string {
  const partes = lista.split(',');
  return (partes[partes.length - 1] ?? '').trim().toLowerCase();
}

/** Genericas sans-serif admitidas como respaldo de la familia de interfaz. */
const GENERICAS_SANS = new Set(['sans-serif', 'system-ui', 'ui-sans-serif']);

describe('Requisito 6.7: serif para la Carta, sans-serif para rotulos y controles', () => {
  it('la familia de la Carta termina en la generica serif', () => {
    const familia = token('--familia-carta');
    expect(familia.split(',').length).toBeGreaterThan(1);
    expect(familiaGenerica(familia)).toBe('serif');
  });

  it('la familia de interfaz termina en una generica sans-serif', () => {
    const familia = token('--familia-ui');
    expect(familia.split(',').length).toBeGreaterThan(1);
    expect(GENERICAS_SANS.has(familiaGenerica(familia))).toBe(true);
    // La generica de la interfaz no puede ser la serif de la Carta.
    expect(familiaGenerica(familia)).not.toBe('serif');
  });

  it('el texto de la Carta declara la familia serif', () => {
    const carta = todasLasReglas.filter((regla) => selectorIncluye(regla, '.texto-carta'));
    expect(carta.length).toBeGreaterThan(0);
    expect(carta.some((regla) => declara(regla, 'font-family', 'var(--familia-carta)'))).toBe(true);
  });

  it('el cuerpo, los titulos y los controles declaran la familia sans-serif', () => {
    const conFamiliaUi = (parte: string): boolean =>
      todasLasReglas.some(
        (regla) => selectorIncluye(regla, parte) && declara(regla, 'font-family', 'var(--familia-ui)'),
      );

    expect(conFamiliaUi('body')).toBe(true);
    for (const titulo of ['h1', 'h2', 'h3']) {
      expect(conFamiliaUi(titulo), titulo).toBe(true);
    }

    // Los controles nativos heredan la tipografia del cuerpo con `font: inherit`.
    const controles = todasLasReglas.filter((regla) => selectorIncluye(regla, 'button'));
    expect(controles.some((regla) => declara(regla, 'font', 'inherit'))).toBe(true);
  });

  it('ninguna hoja declara una familia tipografica fuera de los tokens', () => {
    const familiasAdmitidas = new Set(['var(--familia-carta)', 'var(--familia-ui)', 'inherit']);
    const infractores = hojas
      .filter((hoja) => hoja.archivo !== HOJA_DE_TOKENS)
      .flatMap((hoja) =>
        extraerDeclaraciones(hoja)
          .filter((declaracion) => declaracion.propiedad === 'font-family')
          .filter((declaracion) => !familiasAdmitidas.has(declaracion.valor)),
      );
    expect(infractores.map((declaracion) => `${declaracion.archivo}: ${declaracion.valor}`)).toEqual(
      [],
    );
  });
});

// --- Requisito 7.11: areas tactiles por debajo de 768 px ---------------------

describe('Requisito 7.11: area tactil de 44 x 44 px y separacion de 8 px', () => {
  it('los tokens declaran los minimos que usa la disposicion', () => {
    expect(token('--area-tactil-min')).toBe(`${AREA_TACTIL_MIN}px`);
    expect(token('--separacion-tactil')).toBe(`${SEPARACION_TACTIL_MIN}px`);
    expect(AREA_TACTIL_MIN).toBe(44);
    expect(SEPARACION_TACTIL_MIN).toBe(8);
  });

  it('la consulta de medios se corta justo por debajo del umbral tactil', () => {
    const cotas = todasLasReglas
      .flatMap((regla) => regla.contexto)
      .flatMap((preludio) => {
        const cota = cotaMaxima(preludio);
        return cota === null ? [] : [cota];
      });
    expect(cotas.length).toBeGreaterThan(0);
    // `max-width: 767px` cubre exactamente "ancho menor a 768 px".
    for (const cota of cotas) expect(cota).toBe(UMBRAL_TACTIL - 1);
  });

  it('los controles reciben el area minima dentro de esa consulta', () => {
    const reglasTactiles = todasLasReglas.filter((regla) => enContexto(regla, esTactil));
    expect(reglasTactiles.length).toBeGreaterThan(0);

    const conArea = reglasTactiles.filter(
      (regla) =>
        declara(regla, 'min-width', 'var(--area-tactil-min)') &&
        declara(regla, 'min-height', 'var(--area-tactil-min)'),
    );
    expect(conArea.length).toBeGreaterThan(0);
    // El area rige para los controles nativos, no para un caso aislado.
    expect(
      conArea.some((regla) =>
        ['button', 'input', 'select', 'textarea'].every((control) =>
          regla.selector.includes(control),
        ),
      ),
    ).toBe(true);
  });

  it('los controles vecinos reciben la separacion minima dentro de esa consulta', () => {
    const propiedadesDeSeparacion = new Set([
      'gap',
      'row-gap',
      'column-gap',
      'margin',
      'margin-left',
      'margin-top',
      'margin-inline-start',
      'margin-block-start',
    ]);
    const separaciones = todasLasReglas
      .filter((regla) => enContexto(regla, esTactil))
      .flatMap((regla) => regla.declaraciones)
      .filter(
        (declaracion) =>
          propiedadesDeSeparacion.has(declaracion.propiedad) &&
          declaracion.valor === 'var(--separacion-tactil)',
      );
    expect(separaciones.length).toBeGreaterThan(0);
  });

  it('el area y la separacion tactiles solo se declaran con los tokens', () => {
    const infractores = hojas
      .filter((hoja) => hoja.archivo !== HOJA_DE_TOKENS)
      .flatMap((hoja) =>
        extraerDeclaraciones(hoja).filter(
          (declaracion) =>
            /^(min-width|min-height)$/u.test(declaracion.propiedad) &&
            /\b(44|8)px\b/u.test(declaracion.valor),
        ),
      );
    expect(infractores.map((declaracion) => `${declaracion.archivo}: ${declaracion.valor}`)).toEqual(
      [],
    );
  });
});

// --- Requisito 7.5: anulacion del movimiento --------------------------------

describe('Requisito 7.5: con movimiento reducido no queda movimiento', () => {
  const reglasReducidas = todasLasReglas.filter((regla) => enContexto(regla, esMovimientoReducido));

  it('las hojas usan la misma consulta de medios que el modulo de infraestructura', () => {
    expect(reglasReducidas.length).toBeGreaterThan(0);
    const hojasConConsulta = new Set(
      hojas
        .filter((hoja) =>
          analizarReglas(hoja).some((regla) => enContexto(regla, esMovimientoReducido)),
        )
        .map((hoja) => hoja.archivo),
    );
    expect(hojasConConsulta.has(HOJA_DE_TOKENS)).toBe(true);
    expect(hojasConConsulta.has('base.css')).toBe(true);
  });

  it('la duracion nula es cero, muy por debajo de los 100 ms del requisito', () => {
    expect(token('--duracion-nula')).toBe('0ms');
    expect(Number.parseFloat(token('--duracion-nula'))).toBe(0);
    expect(Number.parseFloat(token('--duracion-nula'))).toBeLessThanOrEqual(100);
  });

  it('todo token de duracion se anula dentro de la consulta', () => {
    const reglasRaiz = (reglasPorHoja.get(HOJA_DE_TOKENS) ?? []).filter((regla) =>
      selectorIncluye(regla, ':root'),
    );
    const base = reglasRaiz.filter((regla) => regla.contexto.length === 0);
    const reducidas = reglasRaiz.filter((regla) => enContexto(regla, esMovimientoReducido));
    expect(base.length).toBe(1);
    expect(reducidas.length).toBe(1);

    const duraciones = base
      .flatMap((regla) => regla.declaraciones)
      .filter(
        (declaracion) =>
          declaracion.propiedad.startsWith('--duracion-') &&
          declaracion.propiedad !== '--duracion-nula',
      )
      .map((declaracion) => declaracion.propiedad);
    expect(duraciones.length).toBeGreaterThan(0);

    for (const duracion of duraciones) {
      expect(
        reducidas.some((regla) => declara(regla, duracion, 'var(--duracion-nula)')),
        duracion,
      ).toBe(true);
    }
  });

  it('las animaciones y transiciones quedan anuladas en todo elemento', () => {
    const universales = reglasReducidas.filter((regla) => regla.selector.includes('*'));
    expect(universales.length).toBeGreaterThan(0);

    const anuladas = [
      'animation-duration',
      'animation-delay',
      'transition-duration',
      'transition-delay',
    ];
    for (const propiedad of anuladas) {
      expect(
        universales.some((regla) =>
          declara(regla, propiedad, 'var(--duracion-nula) !important'),
        ),
        propiedad,
      ).toBe(true);
    }

    // Sin este limite un bucle infinito seguiria corriendo aunque dure 0 ms.
    expect(
      universales.some((regla) => declara(regla, 'animation-iteration-count', '1 !important')),
    ).toBe(true);
  });

  it('fuera de la consulta las duraciones se declaran solo con tokens', () => {
    const infractores = hojas.flatMap((hoja) =>
      analizarReglas(hoja)
        .filter((regla) => !enContexto(regla, esMovimientoReducido))
        .flatMap((regla) => regla.declaraciones)
        .filter(
          (declaracion) =>
            /^(animation|transition)-(duration|delay)$/u.test(declaracion.propiedad) &&
            !/^var\(--duracion-[a-z-]+\)/u.test(declaracion.valor),
        ),
    );
    expect(infractores.map((declaracion) => `${declaracion.propiedad}: ${declaracion.valor}`)).toEqual(
      [],
    );
  });
});
