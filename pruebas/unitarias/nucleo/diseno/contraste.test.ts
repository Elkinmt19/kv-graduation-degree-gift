import { describe, expect, it } from 'vitest';

import {
  CONTRASTE_MINIMO_TEXTO,
  PALETA_REGALO,
  componerCapas,
  componerSobre,
  contrasteCompuesto,
  cumpleContrasteDeTexto,
  interpretarHex,
  luminanciaRelativa,
  relacionContraste,
} from '../../../../src/nucleo/diseno/contraste.js';

const BLANCO = { r: 255, g: 255, b: 255 };
const NEGRO = { r: 0, g: 0, b: 0 };

describe('luminanciaRelativa (WCAG 2.1)', () => {
  it('vale 1 para el blanco y 0 para el negro', () => {
    expect(luminanciaRelativa(BLANCO)).toBeCloseTo(1, 10);
    expect(luminanciaRelativa(NEGRO)).toBeCloseTo(0, 10);
  });

  it('reproduce el valor de referencia del gris medio #808080', () => {
    const gris = interpretarHex('#808080');
    expect(gris).not.toBeNull();
    // Valor conocido de la formula de WCAG 2.1 para el 50 % de sRGB.
    expect(luminanciaRelativa(gris!)).toBeCloseTo(0.2159, 3);
  });
});

describe('relacionContraste (WCAG 2.1)', () => {
  it('da 21:1 entre blanco y negro, en cualquier orden', () => {
    expect(relacionContraste(BLANCO, NEGRO)).toBeCloseTo(21, 10);
    expect(relacionContraste(NEGRO, BLANCO)).toBeCloseTo(21, 10);
  });

  it('da 1:1 para un color contra si mismo', () => {
    expect(relacionContraste(PALETA_REGALO.dorado, PALETA_REGALO.dorado)).toBeCloseTo(1, 10);
  });

  it('reproduce los contrastes documentados de la Paleta_Regalo', () => {
    // Requisito 6.2: dorado pleno sobre negro profundo, 9.6:1.
    expect(relacionContraste(PALETA_REGALO.dorado, PALETA_REGALO['negro-profundo'])).toBeCloseTo(
      9.62,
      2,
    );
    // El azul electrico sobre negro profundo no llega a 4.5:1: prohibido para texto.
    const azulSobreNegro = relacionContraste(
      PALETA_REGALO['azul-electrico'],
      PALETA_REGALO['negro-profundo'],
    );
    expect(azulSobreNegro).toBeCloseTo(3.05, 2);
    expect(cumpleContrasteDeTexto(azulSobreNegro)).toBe(false);
  });
});

describe('interpretarHex', () => {
  it('acepta las formas de 3, 4, 6 y 8 digitos e ignora el canal alfa', () => {
    expect(interpretarHex('#fff')).toEqual(BLANCO);
    expect(interpretarHex('#ffff')).toEqual(BLANCO);
    expect(interpretarHex('#05060D')).toEqual(PALETA_REGALO['negro-profundo']);
    expect(interpretarHex('#05060dff')).toEqual(PALETA_REGALO['negro-profundo']);
  });

  it('devuelve null ante un literal invalido', () => {
    expect(interpretarHex('#12345')).toBeNull();
    expect(interpretarHex('#gggggg')).toBeNull();
    expect(interpretarHex('dorado')).toBeNull();
  });
});

describe('composicion de capas con opacidad', () => {
  it('con opacidad 1 conserva la capa y con opacidad 0 conserva el fondo', () => {
    const fondo = PALETA_REGALO['negro-profundo'];
    expect(componerSobre(fondo, { color: PALETA_REGALO.dorado, opacidad: 1 })).toEqual(
      PALETA_REGALO.dorado,
    );
    expect(componerSobre(fondo, { color: PALETA_REGALO.dorado, opacidad: 0 })).toEqual(fondo);
  });

  it('interpola cada canal segun la opacidad declarada', () => {
    const compuesto = componerSobre(NEGRO, { color: BLANCO, opacidad: 0.5 });
    expect(compuesto).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
  });

  it('apila las capas de la mas lejana a la mas cercana', () => {
    const compuesto = componerCapas(NEGRO, [
      { color: BLANCO, opacidad: 1 },
      { color: NEGRO, opacidad: 0.5 },
    ]);
    expect(compuesto).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
  });

  it('sin capas devuelve la base intacta', () => {
    expect(componerCapas(PALETA_REGALO['azul-noche'], [])).toEqual(PALETA_REGALO['azul-noche']);
  });
});

describe('contrasteCompuesto (Requisito 6.2)', () => {
  it('mide el texto contra el fondo efectivo, no contra la base', () => {
    // `--texto-principal` es dorado al 92 % sobre `--fondo-base`.
    const sobreBase = contrasteCompuesto(
      PALETA_REGALO['negro-profundo'],
      [],
      [{ color: PALETA_REGALO.dorado, opacidad: 0.92 }],
    );
    expect(sobreBase).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
    expect(sobreBase).toBeCloseTo(8.2, 1);

    // El mismo texto sobre `--fondo-elevado`: azul noche al 55 % encima de la base.
    const sobreElevado = contrasteCompuesto(
      PALETA_REGALO['negro-profundo'],
      [{ color: PALETA_REGALO['azul-noche'], opacidad: 0.55 }],
      [{ color: PALETA_REGALO.dorado, opacidad: 0.92 }],
    );
    expect(sobreElevado).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
    expect(sobreElevado).toBeLessThan(sobreBase);
  });

  it('el minimo de opacidad expuesto para texto dorado sigue alcanzando 4.5:1', () => {
    const relacion = contrasteCompuesto(
      PALETA_REGALO['negro-profundo'],
      [],
      [{ color: PALETA_REGALO.dorado, opacidad: 0.7 }],
    );
    expect(cumpleContrasteDeTexto(relacion)).toBe(true);
  });
});
