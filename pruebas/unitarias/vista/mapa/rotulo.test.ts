import { describe, expect, it } from 'vitest';

import type { InstanteGraduacion, LugarGraduacion } from '../../../../src/nucleo/astronomia/modelo.js';
import {
  DESPLAZAMIENTO_COLOMBIA,
  LUGAR_SIN_NOMBRE,
  MAX_TEXTO_ALTERNATIVO,
  MIN_TEXTO_ALTERNATIVO,
  SIN_CONSTELACIONES,
  aplicarTextoAlternativo,
  partesInstante,
  rotuloDelCielo,
  rotuloLugarFecha,
  textoAlternativo,
} from '../../../../src/vista/mapa/rotulo.js';

/** Instante con `msUtc` derivado del texto, como lo exige el modelo. */
function instante(iso: string): InstanteGraduacion {
  return { iso, msUtc: Date.parse(iso) };
}

/** Instante_Graduacion y Lugar_Graduacion confirmados en `regalo.config.json`. */
const INSTANTE_REAL = instante('2026-07-31T18:00:00-05:00');
const LUGAR_REAL: LugarGraduacion = {
  nombre: 'Cra. 1 #26a-47, Neiva, Huila',
  latitud: 2.9484,
  longitud: -75.2795,
};

describe('rotuloLugarFecha (Requisito 4.6)', () => {
  it('arma el rotulo del regalo real con lugar, fecha, hora de 24 h y desplazamiento', () => {
    const rotulo = rotuloLugarFecha(INSTANTE_REAL, LUGAR_REAL);

    expect(rotulo.lugar).toBe('Cra. 1 #26a-47, Neiva, Huila');
    expect(rotulo.fecha).toBe('31 de julio de 2026');
    expect(rotulo.hora).toBe('18:00');
    expect(rotulo.desplazamiento).toBe(DESPLAZAMIENTO_COLOMBIA);
    expect(rotulo.texto).toBe('Cra. 1 #26a-47, Neiva, Huila · 31 de julio de 2026, 18:00 -05:00');
  });

  it('rellena la hora con dos digitos y respeta el cambio de ano en hora de Colombia', () => {
    const medianoche = rotuloLugarFecha(instante('2026-01-01T00:05:00-05:00'), LUGAR_REAL);
    expect(medianoche.fecha).toBe('1 de enero de 2026');
    expect(medianoche.hora).toBe('00:05');

    const fin = rotuloLugarFecha(instante('2025-12-31T23:59:59-05:00'), LUGAR_REAL);
    expect(fin.fecha).toBe('31 de diciembre de 2025');
    expect(fin.hora).toBe('23:59');
  });

  it('deriva los campos de msUtc, con desplazamiento de cinco horas, cuando el texto no es canonico', () => {
    // Medianoche UTC del 1 de agosto son las 19:00 del 31 de julio en Colombia.
    const partes = partesInstante(instante('2026-08-01T00:00:00Z'));

    expect(partes).toEqual({ anio: 2026, mes: 7, dia: 31, hora: 19, minuto: 0 });
  });

  it('sustituye por un respaldo el nombre de lugar vacio o con solo espacios', () => {
    const rotulo = rotuloLugarFecha(INSTANTE_REAL, { ...LUGAR_REAL, nombre: '   \n  ' });

    expect(rotulo.lugar).toBe(LUGAR_SIN_NOMBRE);
    expect(rotulo.texto.startsWith(LUGAR_SIN_NOMBRE)).toBe(true);
  });

  it('normaliza el espacio en blanco interno del nombre del lugar', () => {
    const rotulo = rotuloLugarFecha(INSTANTE_REAL, { ...LUGAR_REAL, nombre: ' Neiva,\n  Huila ' });

    expect(rotulo.lugar).toBe('Neiva, Huila');
  });
});

describe('textoAlternativo (Requisito 7.6)', () => {
  const cielo = (constelaciones: readonly string[]): Parameters<typeof textoAlternativo>[0] => ({
    instante: INSTANTE_REAL,
    lugar: LUGAR_REAL,
    constelacionesDibujadas: constelaciones,
  });

  it('nombra lugar, fecha, hora con desplazamiento y constelaciones dibujadas', () => {
    const texto = textoAlternativo(cielo(['Orión', 'Tauro', 'Can Mayor']));

    expect(texto).toContain('Cra. 1 #26a-47, Neiva, Huila');
    expect(texto).toContain('31 de julio de 2026');
    expect(texto).toContain('18:00');
    expect(texto).toContain(DESPLAZAMIENTO_COLOMBIA);
    expect(texto).toContain('Orión, Tauro y Can Mayor');
    expect(texto.length).toBeGreaterThanOrEqual(MIN_TEXTO_ALTERNATIVO);
    expect(texto.length).toBeLessThanOrEqual(MAX_TEXTO_ALTERNATIVO);
  });

  it('informa cuando ninguna constelacion quedo sobre el horizonte', () => {
    const texto = textoAlternativo(cielo([]));

    expect(texto).toContain(SIN_CONSTELACIONES);
    expect(texto.length).toBeGreaterThanOrEqual(MIN_TEXTO_ALTERNATIVO);
    expect(texto.length).toBeLessThanOrEqual(MAX_TEXTO_ALTERNATIVO);
  });

  it('alcanza el minimo de 80 con el nombre de lugar y la fecha mas cortos posibles', () => {
    // Peor caso por abajo: un caracter de lugar, el mes mas corto, dia de un
    // digito, medianoche y una sola constelacion de un caracter.
    const corto = textoAlternativo({
      instante: instante('2026-05-01T00:00:00-05:00'),
      lugar: { ...LUGAR_REAL, nombre: 'A' },
      constelacionesDibujadas: ['Ó'],
    });

    expect(corto.length).toBeGreaterThanOrEqual(MIN_TEXTO_ALTERNATIVO);
    expect(corto).toContain('Constelaciones dibujadas: Ó.');
  });

  it('resume con `y N más` las constelaciones que no caben en 500 caracteres', () => {
    const muchas = Array.from({ length: 120 }, (_, indice) => `Constelación número ${String(indice)}`);
    const texto = textoAlternativo(cielo(muchas));

    expect(texto.length).toBeLessThanOrEqual(MAX_TEXTO_ALTERNATIVO);
    expect(texto).toContain('Constelación número 0');
    expect(texto).toMatch(/y \d+ más\.$/u);
    // La cola resumida es contigua: la ultima nombrada aparece y la siguiente no.
    expect(texto).not.toContain('Constelación número 119');
  });

  it('nombra al menos una constelacion incluso con un nombre de lugar desmedido', () => {
    const texto = textoAlternativo({
      instante: INSTANTE_REAL,
      lugar: { ...LUGAR_REAL, nombre: 'Ñ'.repeat(400) },
      constelacionesDibujadas: ['Orión', 'Tauro'],
    });

    expect(texto.length).toBeLessThanOrEqual(MAX_TEXTO_ALTERNATIVO);
    expect(texto).toContain('Constelaciones dibujadas: Orión');
  });

  it('descarta nombres vacios y repetidos conservando el orden recibido', () => {
    const texto = textoAlternativo(cielo(['Orión', '   ', 'Orión', 'Lira']));

    expect(texto).toContain('Constelaciones dibujadas: Orión y Lira.');
  });

  it('coincide con el rotulo en lugar, fecha y hora', () => {
    const rotulo = rotuloDelCielo(cielo(['Lira']));
    const texto = textoAlternativo(cielo(['Lira']));

    expect(texto).toContain(rotulo.lugar);
    expect(texto).toContain(rotulo.fecha);
    expect(texto).toContain(`${rotulo.hora} ${rotulo.desplazamiento}`);
  });
});

describe('aplicarTextoAlternativo (Requisitos 7.6, 7.10)', () => {
  it('expone el texto en el aria-label del lienzo con role img', () => {
    const lienzo = document.createElement('canvas');
    const texto = textoAlternativo({
      instante: INSTANTE_REAL,
      lugar: LUGAR_REAL,
      constelacionesDibujadas: ['Orión'],
    });

    aplicarTextoAlternativo(lienzo, texto);

    expect(lienzo.getAttribute('role')).toBe('img');
    expect(lienzo.getAttribute('aria-label')).toBe(texto);
  });

  it('reemplaza el texto anterior al redibujar', () => {
    const lienzo = document.createElement('canvas');

    aplicarTextoAlternativo(lienzo, 'primero');
    aplicarTextoAlternativo(lienzo, 'segundo');

    expect(lienzo.getAttribute('aria-label')).toBe('segundo');
  });
});
