/**
 * Pruebas unitarias de la tuberia del generador del Catalogo_Estelar.
 *
 * Ejercitan los pasos del diseno con una **muestra reducida**, escrita aqui
 * mismo: no es el volcado HYG v3, que vive comprimido en `datos-fuente/` y se
 * usa en la generacion real. La muestra reproduce el formato del volcado (misma
 * cabecera, mismos nombres de columna) con una veintena de estrellas brillantes
 * cuyas coordenadas J2000.0 y magnitudes son las del catalogo de origen, de
 * modo que las comprobaciones de la tuberia no dependan de 120 000 filas.
 *
 * Dos apartamientos deliberados de la fuente, marcados donde ocurren: el par de
 * Alfa Centauri va con el campo `proper` vacio, para forzar la colision de
 * nombres del paso 2, y se anade una entrada de magnitud 6.5 para comprobar el
 * corte del paso 1.
 *
 * Requisitos: 2.1, 2.5, 2.6, 2.7.
 */

import { describe, expect, it } from 'vitest';

import { leerCatalogo } from '../../../src/nucleo/catalogo/lector.js';
import {
  MAGNITUD_MAXIMA,
  asignarNombres,
  filtrarPorMagnitud,
  generarCatalogo,
  leerFilasHyg,
  nombreBase,
  nombreConstelacion,
  resolverSegmentos,
} from '../../../herramientas/generar-catalogo.js';

/** Cabecera de HYG v3, reducida a las columnas que consume la tuberia. */
const CABECERA = '"id","hip","hd","gl","proper","bayer","flam","con","ra","dec","mag"';

/**
 * Muestra reducida en el formato de HYG v3. Cada fila:
 * id, hip, hd, gl, proper, bayer, flam, con, ra (horas), dec (grados), mag.
 */
const FILAS_MUESTRA = [
  // El Sol: se descarta por identificador, no por magnitud.
  '0,,,"","Sol","","","",0.0,0.0,-26.7',
  '1,32349,48915,"","Sirius","Alp","9","CMa",6.752481,-16.716116,-1.44',
  '2,30438,45348,"","Canopus","Alp","","Car",6.399195,-52.695661,-0.62',
  '3,91262,172167,"","Vega","Alp","3","Lyr",18.615649,38.783689,0.03',
  '4,27989,39801,"","Betelgeuse","Alp","58","Ori",5.919529,7.407064,0.45',
  '5,24436,34085,"","Rigel","Bet","19","Ori",5.242298,-8.201638,0.18',
  // Sin nombre propio: el nombre sale de la designacion Bayer.
  '6,25336,35468,"","","Gam","24","Ori",5.418851,6.349703,1.64',
  '7,25930,36486,"","Mintaka","Del","34","Ori",5.533445,-0.299092,2.25',
  '8,26311,37128,"","Alnilam","Eps","46","Ori",5.603559,-1.201919,1.69',
  '9,26727,37742,"","Alnitak","Zet","50","Ori",5.679313,-1.942573,1.74',
  '10,27366,38771,"","Saiph","Kap","53","Ori",5.795942,-9.669605,2.07',
  // Sin nombre propio ni Bayer: el nombre sale de la designacion Flamsteed.
  '11,26176,36861,"","","","39","Ori",5.588210,9.934157,3.39',
  // Sin ninguna designacion: el nombre sale del numero HIP.
  '12,26234,,"","","","","Ori",5.596722,-2.600060,4.59',
  // Par de Alfa Centauri con `proper` vaciado a proposito: fuerza la colision.
  '13,71683,128620,"","","Alp","","Cen",14.660765,-60.833975,-0.01',
  '14,71681,128621,"","","Alp","","Cen",14.660960,-60.837861,1.33',
  // Por debajo del corte de magnitud del paso 1.
  '15,99999,,"","","","","Ori",5.500000,0.000000,6.50',
].join('\n');

const CSV_MUESTRA = `${CABECERA}\n${FILAS_MUESTRA}\n`;

/**
 * Lineas de constelacion de muestra, en el formato de
 * `datos-fuente/lineas-constelacion-hip.json`: el cinturon de Orion, un
 * segmento degenerado, un duplicado no orientado y uno con extremo ausente.
 */
const LINEAS_MUESTRA = JSON.stringify({
  segmentos: [
    [25930, 26311],
    [26311, 26727],
    [26311, 26311],
    [26311, 25930],
    [26311, 4242424],
  ],
});

describe('paso 1: corte de magnitud y descarte del Sol', () => {
  it('conserva solo las estrellas con magnitud aparente <= 5.5 y sin el Sol', () => {
    const filas = filtrarPorMagnitud(leerFilasHyg(CSV_MUESTRA));

    expect(filas.map((fila) => fila.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '13',
      '14',
    ]);
    expect(filas.every((fila) => fila.mag <= MAGNITUD_MAXIMA)).toBe(true);
    expect(filas.some((fila) => fila.proper === 'Sol')).toBe(false);
  });

  it('conserva las coordenadas del volcado sin transformarlas', () => {
    const filas = filtrarPorMagnitud(leerFilasHyg(CSV_MUESTRA));
    const sirio = filas.find((fila) => fila.proper === 'Sirius');

    expect(sirio).toBeDefined();
    expect(sirio?.ra).toBeCloseTo(6.752481, 6);
    expect(sirio?.dec).toBeCloseTo(-16.716116, 6);
    expect(sirio?.mag).toBeCloseTo(-1.44, 6);
  });
});

describe('paso 2: nombres unicos por precedencia', () => {
  it('aplica la precedencia nombre propio -> Bayer -> Flamsteed -> HIP', () => {
    const porId = new Map(leerFilasHyg(CSV_MUESTRA).map((fila) => [fila.id, fila]));
    const nombreDe = (id: string): string => {
      const fila = porId.get(id);
      expect(fila).toBeDefined();
      return fila === undefined ? '' : nombreBase(fila);
    };

    expect(nombreDe('1')).toBe('Sirius');
    expect(nombreDe('6')).toBe('Gamma Ori');
    expect(nombreDe('11')).toBe('39 Ori');
    expect(nombreDe('12')).toBe('HIP 26234');
  });

  it('desambigua las colisiones con un sufijo determinista', () => {
    const filas = filtrarPorMagnitud(leerFilasHyg(CSV_MUESTRA));
    const primera = asignarNombres(filas);
    const segunda = asignarNombres(filas);

    const nombres = primera.estrellas.map((estrella) => estrella.nombre);
    expect(nombres).toContain('Alfa Cen');
    expect(nombres).toContain('Alfa Cen (2)');
    expect(primera.colisiones).toBe(1);
    // Determinismo: la misma entrada produce exactamente los mismos nombres.
    expect(segunda.estrellas.map((estrella) => estrella.nombre)).toEqual(nombres);
  });

  it('no produce nombres vacios, repetidos ni de mas de 64 caracteres', () => {
    const { estrellas } = asignarNombres(filtrarPorMagnitud(leerFilasHyg(CSV_MUESTRA)));
    const nombres = estrellas.map((estrella) => estrella.nombre);

    expect(new Set(nombres).size).toBe(nombres.length);
    expect(nombres.every((nombre) => nombre.length > 0 && nombre.length <= 64)).toBe(true);
    expect(
      estrellas.every(
        (estrella) => estrella.constelacion.length > 0 && estrella.constelacion.length <= 64,
      ),
    ).toBe(true);
  });
});

describe('paso 3: constelacion en espanol', () => {
  it('traduce las abreviaturas IAU conocidas y deja intactas las demas', () => {
    expect(nombreConstelacion('Ori')).toBe('Orion');
    expect(nombreConstelacion('CMa')).toBe('Can Mayor');
    expect(nombreConstelacion('UMi')).toBe('Osa Menor');
    expect(nombreConstelacion('Zzz')).toBe('Zzz');
  });
});

describe('paso 4: resolucion de los pares HIP', () => {
  it('descarta los segmentos con extremo ausente, degenerados y duplicados', () => {
    const { porHip } = asignarNombres(filtrarPorMagnitud(leerFilasHyg(CSV_MUESTRA)));
    const pares = [
      [25930, 26311],
      [26311, 26727],
      [26311, 26311],
      [26311, 25930],
      [26311, 4242424],
    ] as const;

    const resueltos = resolverSegmentos(
      pares.map(([desde, hasta]) => [desde, hasta] as const),
      porHip,
    );

    expect(resueltos.segmentos).toEqual([
      { desde: 'Mintaka', hasta: 'Alnilam' },
      { desde: 'Alnilam', hasta: 'Alnitak' },
    ]);
    expect(resueltos.descartadosPorDegenerado).toBe(1);
    expect(resueltos.descartadosPorDuplicado).toBe(1);
    expect(resueltos.descartadosPorExtremoAusente).toBe(1);
  });
});

describe('pasos 5 y 6: catalogo generado', () => {
  it('produce un documento que el Lector_Catalogo acepta', () => {
    const resultado = generarCatalogo(CSV_MUESTRA, LINEAS_MUESTRA);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.informe.estrellas).toBe(14);
    expect(resultado.informe.segmentos).toBe(2);

    const relectura = leerCatalogo(resultado.documento);
    expect(relectura.ok).toBe(true);
    if (!relectura.ok) return;

    expect(relectura.catalogo.epoca).toBe('J2000.0');
    expect(relectura.catalogo.atribucion).toContain('CC BY-SA 2.5');
    expect(relectura.catalogo.atribucion).toContain('BSD-3-Clause');
    expect(relectura.catalogo.estrellas).toHaveLength(14);
    expect(relectura.catalogo.segmentos).toHaveLength(2);
  });

  it('rechaza la generacion cuando el corte deja mas estrellas de las admitidas', () => {
    const filas: string[] = [];
    for (let indice = 1; indice <= 5001; indice += 1) {
      const ra = ((indice * 0.001) % 24).toFixed(6);
      filas.push(`${String(indice)},${String(indice)},,"","","","","Ori",${ra},0.0,3.0`);
    }
    const csv = `${CABECERA}\n${filas.join('\n')}\n`;

    const resultado = generarCatalogo(csv, LINEAS_MUESTRA);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.problemas.join(' ')).toContain('5000');
  });

  it('rechaza la generacion cuando el volcado no aporta ninguna estrella', () => {
    const resultado = generarCatalogo(`${CABECERA}\n`, LINEAS_MUESTRA);
    expect(resultado.ok).toBe(false);
  });
});
