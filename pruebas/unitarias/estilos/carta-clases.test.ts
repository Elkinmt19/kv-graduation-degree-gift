import { describe, expect, it } from 'vitest';

import { CONSULTA_MOVIMIENTO_REDUCIDO } from '../../../src/infra/movimiento-reducido.js';
import {
  ANIMACION_APARICION,
  CLASES_CARTA,
  DURACION_APARICION_MS,
  type EstadoCarta,
} from '../../../src/vista/carta/lienzo.js';
import {
  HOJA_DE_TOKENS,
  extraerDeclaraciones,
  inventariarLiteralesDeColor,
  leerHojaDeEstilo,
  type HojaDeEstilo,
} from '../../utilidades/estilos.js';

/**
 * Contrato entre el Lienzo_Carta y `carta.css` (Tarea 12.5).
 *
 * Estas pruebas corren en Node porque leen la hoja del disco: jsdom no aplica
 * las hojas del proyecto ni calcula disposicion, asi que el desplazamiento
 * contenido del Requisito 5.4 solo puede verificarse sobre el archivo real. La
 * mitad de comportamiento vive en `pruebas/unitarias/vista/carta/lienzo.test.ts`.
 *
 * - Requisito 5.4: `.carta__desplazable` habilita el desplazamiento vertical
 *   dentro de su propio contenedor, sin desplazamiento horizontal y sin
 *   propagarlo al documento ni al Mapa_Estelar.
 * - Requisito 5.2: la aparicion progresiva es la animacion que nombra
 *   `ANIMACION_APARICION`, dura el token `--duracion-carta` y ese token vale los
 *   `DURACION_APARICION_MS` que declara la vista.
 * - Requisito 5.3: los estados `revelada` y `respaldo` fijan opacidad total y
 *   ninguna animacion de entrada.
 * - Requisito 7.5: con movimiento reducido la animacion desaparece incluso si la
 *   preferencia se activa con la Carta ya montada.
 * - Requisito 6.1: la hoja no declara ningun literal de color.
 * - Y el vocabulario de clases, en los dos sentidos, igual que el contrato del
 *   Portal_Acceso en `portal-clases.test.ts`.
 */

const HOJA_CARTA = leerHojaDeEstilo('carta.css');

/** Preludio exacto de la consulta de movimiento reducido en las hojas. */
const PRELUDIO_MOVIMIENTO_REDUCIDO = `@media ${CONSULTA_MOVIMIENTO_REDUCIDO}`;

// --- Analisis minimo de la hoja ----------------------------------------------

interface DeclaracionDeRegla {
  readonly propiedad: string;
  readonly valor: string;
}

interface Regla {
  /** Preludios `@` que envuelven la regla, de fuera a dentro. */
  readonly contexto: readonly string[];
  readonly selector: string;
  readonly declaraciones: readonly DeclaracionDeRegla[];
}

function sinComentarios(contenido: string): string {
  return contenido.replace(/\/\*[\s\S]*?\*\//gu, ' ');
}

function normalizar(texto: string): string {
  return texto.replace(/\s+/gu, ' ').trim();
}

/**
 * Analiza la hoja en reglas planas conservando los preludios `@` que las
 * envuelven. `extraerDeclaraciones` pierde el selector a proposito, y aqui hace
 * falta para distinguir lo que rige sobre `.carta__desplazable` de lo que rige
 * dentro de la consulta de movimiento reducido.
 */
function analizarReglas(hoja: HojaDeEstilo): Regla[] {
  const contenido = sinComentarios(hoja.contenido);
  const reglas: Regla[] = [];
  const pila: string[] = [];
  let preludio = '';
  let indice = 0;

  while (indice < contenido.length) {
    const caracter = contenido[indice] ?? '';
    indice += 1;

    if (caracter === '{') {
      const cabecera = normalizar(preludio);
      preludio = '';

      if (cabecera.startsWith('@') && !cabecera.startsWith('@keyframes')) {
        pila.push(cabecera);
        continue;
      }

      let cuerpo = '';
      let profundidad = 1;
      while (indice < contenido.length && profundidad > 0) {
        const dentro = contenido[indice] ?? '';
        indice += 1;
        if (dentro === '{') profundidad += 1;
        else if (dentro === '}') profundidad -= 1;
        if (profundidad > 0) cuerpo += dentro;
      }

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
      continue;
    }

    if (caracter === ';') {
      // Reglas `@` sin bloque, como `@import './tokens.css';`.
      preludio = '';
      continue;
    }

    preludio += caracter;
  }

  return reglas;
}

function declaracionesDelCuerpo(cuerpo: string): DeclaracionDeRegla[] {
  return cuerpo
    .split(';')
    .map((trozo) => trozo.trim())
    .filter((trozo) => trozo.length > 0 && !trozo.includes('{'))
    .flatMap((trozo) => {
      const separador = trozo.indexOf(':');
      if (separador <= 0) return [];
      return [
        { propiedad: trozo.slice(0, separador).trim(), valor: normalizar(trozo.slice(separador + 1)) },
      ];
    });
}

const REGLAS = analizarReglas(HOJA_CARTA);

const esMovimientoReducido = (regla: Regla): boolean =>
  regla.contexto.includes(PRELUDIO_MOVIMIENTO_REDUCIDO);

/** Reglas cuyo selector menciona la parte indicada, dentro o fuera de `@media`. */
function reglasQueApuntanA(parte: string): Regla[] {
  return REGLAS.filter((regla) => regla.selector.includes(parte));
}

/** Valor declarado para una propiedad en el conjunto de reglas indicado. */
function valores(reglas: readonly Regla[], propiedad: string): string[] {
  return reglas
    .flatMap((regla) => regla.declaraciones)
    .filter((declaracion) => declaracion.propiedad === propiedad)
    .map((declaracion) => declaracion.valor);
}

/** Selector del estado que publica `data-estado`. */
function selectorDeEstado(estado: EstadoCarta): string {
  return `.${CLASES_CARTA.seccion}[data-estado='${estado}']`;
}

// --- Vocabulario de clases ---------------------------------------------------

function esClaseDeLaCarta(clase: string): boolean {
  return clase === CLASES_CARTA.seccion || clase.startsWith(`${CLASES_CARTA.seccion}__`);
}

/**
 * Clases `carta…` a las que apunta la hoja, leidas de los selectores reales con
 * los comentarios borrados, para que un nombre mencionado en la documentacion de
 * la hoja no cuente como selector.
 */
function clasesDeLaHoja(): Set<string> {
  const halladas = [...sinComentarios(HOJA_CARTA.contenido).matchAll(/\.([a-zA-Z][\w-]*)/gu)].map(
    (coincidencia) => coincidencia[1] ?? '',
  );
  return new Set(halladas.filter(esClaseDeLaCarta));
}

describe('carta.css estila exactamente las clases que el Lienzo_Carta emite', () => {
  it('los selectores de la hoja son los del contrato CLASES_CARTA', () => {
    const enLaHoja = clasesDeLaHoja();
    const delContrato = new Set<string>(Object.values(CLASES_CARTA));

    expect(enLaHoja.size).toBeGreaterThan(0);

    // Sin esto, una clase renombrada en el DOM perderia su estilo en silencio.
    expect([...delContrato].filter((clase) => !enLaHoja.has(clase))).toEqual([]);
    // Y al reves: la hoja no puede conservar selectores huerfanos.
    expect([...enLaHoja].filter((clase) => !delContrato.has(clase))).toEqual([]);
  });

  it('no declara ningun literal de color (Requisito 6.1)', () => {
    const inventario = inventariarLiteralesDeColor([HOJA_CARTA]);
    const detalle = inventario
      .map((hallazgo) => `${hallazgo.archivo}:${String(hallazgo.linea)} ${hallazgo.literal}`)
      .join('\n');
    expect(inventario, detalle).toEqual([]);
  });
});

// --- Requisito 5.4: desplazamiento contenido ---------------------------------

describe('Requisito 5.4: el desplazamiento vive dentro de la Carta', () => {
  const desplazable = reglasQueApuntanA(`.${CLASES_CARTA.desplazable}`).filter(
    (regla) => regla.selector === `.${CLASES_CARTA.desplazable}`,
  );

  it('la region desplazable tiene su propia regla', () => {
    expect(desplazable.length).toBe(1);
  });

  it('habilita el desplazamiento vertical y prohibe el horizontal', () => {
    // `auto` y no `scroll`: la barra solo aparece cuando el contenido excede la
    // altura, que es la condicion del requisito.
    expect(valores(desplazable, 'overflow-y')).toEqual(['auto']);
    // Requisitos 5.4 y 7.1: nunca hay desplazamiento horizontal.
    expect(valores(desplazable, 'overflow-x')).toEqual(['hidden']);
  });

  it('detiene el desplazamiento en sus extremos, sin arrastrar el Mapa_Estelar', () => {
    expect(valores(desplazable, 'overscroll-behavior')).toEqual(['contain']);
  });

  it('acota su altura, que es lo que hace posible el desplazamiento interno', () => {
    const tope = valores(desplazable, 'max-height');
    expect(tope).toEqual(['var(--alto-max-carta)']);

    // Sin el tope declarado en `.carta`, la columna creceria y desplazaria la
    // pagina entera en lugar de la Carta.
    const marco = REGLAS.filter((regla) => regla.selector === `.${CLASES_CARTA.seccion}`);
    const alto = valores(marco, '--alto-max-carta');
    expect(alto.length).toBe(1);
    expect(alto[0]).not.toBe('none');
    // El tope depende de la ventana, de modo que la Carta nunca la desborde.
    expect(alto[0]).toMatch(/\d+(vh|rem|px)/u);
  });

  it('la barra reserva su espacio para no reacomodar el texto', () => {
    expect(valores(desplazable, 'scrollbar-gutter')).toEqual(['stable']);
  });
});

// --- Requisitos 5.2 y 5.3: aparicion progresiva ------------------------------

describe('Requisitos 5.2 y 5.3: la aparicion dura 1200 ms y solo la primera vez', () => {
  const apareciendo = REGLAS.filter(
    (regla) => regla.selector.includes(selectorDeEstado('apareciendo')) && !esMovimientoReducido(regla),
  );

  it('solo el estado apareciendo recibe la animacion', () => {
    expect(apareciendo.length).toBe(1);
    expect(valores(apareciendo, 'animation-name')).toEqual([ANIMACION_APARICION]);
    // La animacion se aplica a la region desplazable, la que lleva el texto.
    expect(apareciendo[0]?.selector).toContain(`.${CLASES_CARTA.desplazable}`);
  });

  it('la duracion sale del token --duracion-carta, que vale DURACION_APARICION_MS', () => {
    expect(valores(apareciendo, 'animation-duration')).toEqual(['var(--duracion-carta)']);
    expect(valores(apareciendo, 'animation-iteration-count')).toEqual(['1']);
    // El estado final debe quedar aplicado al termino del intervalo.
    expect(valores(apareciendo, 'animation-fill-mode')).toEqual(['both']);

    // `leerTokens` deja ganar la ultima declaracion, y `--duracion-carta` se
    // reescribe dentro de la consulta de movimiento reducido; aqui interesa la
    // primera, la que rige sin preferencia declarada.
    const declarada = extraerDeclaraciones(leerHojaDeEstilo(HOJA_DE_TOKENS)).find(
      (declaracion) => declaracion.propiedad === '--duracion-carta',
    );
    expect(declarada?.valor).toBe(`${String(DURACION_APARICION_MS)}ms`);
    expect(DURACION_APARICION_MS).toBe(1200);
  });

  it('la animacion nombrada existe y termina con opacidad total', () => {
    const fotogramas = REGLAS.filter((regla) => regla.selector === `@keyframes ${ANIMACION_APARICION}`);
    expect(fotogramas.length).toBe(1);

    const cuerpo = sinComentarios(HOJA_CARTA.contenido);
    const bloque = cuerpo.slice(cuerpo.indexOf(`@keyframes ${ANIMACION_APARICION}`));
    expect(normalizar(bloque)).toMatch(/from \{ opacity: 0;/u);
    expect(normalizar(bloque)).toMatch(/to \{ opacity: 1;/u);
  });

  it('revelada y respaldo fijan opacidad total y ninguna animacion de entrada', () => {
    for (const estado of ['revelada', 'respaldo'] as const) {
      const reglas = REGLAS.filter((regla) => regla.selector.includes(selectorDeEstado(estado)));
      expect(reglas.length, estado).toBe(1);
      expect(valores(reglas, 'opacity'), estado).toEqual(['1']);
      expect(valores(reglas, 'transform'), estado).toEqual(['none']);
      expect(valores(reglas, 'animation-name'), estado).toEqual(['none']);
    }
  });
});

// --- Requisito 7.5: sin animacion con movimiento reducido --------------------

describe('Requisito 7.5: con movimiento reducido no queda aparicion', () => {
  it('la consulta retira la animacion del estado apareciendo', () => {
    const reducidas = REGLAS.filter(
      (regla) => esMovimientoReducido(regla) && regla.selector.includes(selectorDeEstado('apareciendo')),
    );
    expect(reducidas.length).toBe(1);
    expect(valores(reducidas, 'animation-name')).toEqual(['none']);
    // Y deja el texto legible de inmediato, no invisible.
    expect(valores(reducidas, 'opacity')).toEqual(['1']);
    expect(valores(reducidas, 'transform')).toEqual(['none']);
  });

  it('usa la misma consulta que el modulo de infraestructura', () => {
    const preludios = new Set(REGLAS.flatMap((regla) => regla.contexto));
    expect(preludios.has(PRELUDIO_MOVIMIENTO_REDUCIDO)).toBe(true);
  });
});
