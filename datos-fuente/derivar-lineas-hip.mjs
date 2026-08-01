/**
 * Derivacion, de una sola vez, de `lineas-constelacion-hip.json` a partir de
 * los datos publicados por d3-celestial (BSD-3-Clause).
 *
 * Por que existe este guion: d3-celestial publica las figuras de linea de las
 * constelaciones como GeoJSON `MultiLineString` con **coordenadas**
 * (`data/constellations.lines.json`), no con numeros HIP. Sus catalogos de
 * estrellas (`data/stars.8.json`) usan el **numero HIP como `id`** y las mismas
 * coordenadas redondeadas a cuatro decimales. Cada vertice de una figura es,
 * por construccion, la posicion de una estrella de ese catalogo, asi que el
 * numero HIP se recupera buscando la estrella que ocupa esa coordenada.
 *
 * El resultado (`lineas-constelacion-hip.json`) es el archivo que consume
 * `herramientas/generar-catalogo.ts`: pares de numeros HIP, el formato que pide
 * el diseno. Se versiona en el repositorio para que la generacion del
 * Catalogo_Estelar siga siendo reproducible **sin red**; este guion solo se
 * vuelve a ejecutar si se actualiza la fuente.
 *
 * Uso (requiere red, una sola vez):
 *
 *   curl -sSL -o datos-fuente/constellations.lines.json \
 *     https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json
 *   curl -sSL -o /tmp/stars.8.json \
 *     https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/stars.8.json
 *   node datos-fuente/derivar-lineas-hip.mjs datos-fuente/constellations.lines.json /tmp/stars.8.json
 *
 * `stars.8.json` pesa unos 5 MB y no se versiona: solo sirve para esta
 * traduccion de coordenada a numero HIP.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Tolerancia de la busqueda por cercania, en grados. */
const TOLERANCIA_GRADOS = 0.0006;

/** Clave exacta de una coordenada redondeada a cuatro decimales. */
function clave(lon, lat) {
  return `${lon.toFixed(4)},${lat.toFixed(4)}`;
}

function main() {
  const [rutaLineas, rutaEstrellas] = process.argv.slice(2);
  if (rutaLineas === undefined || rutaEstrellas === undefined) {
    console.error(
      'Uso: node datos-fuente/derivar-lineas-hip.mjs <constellations.lines.json> <stars.8.json>',
    );
    process.exit(1);
  }

  const estrellas = JSON.parse(readFileSync(resolve(rutaEstrellas), 'utf8'));
  const porCoordenada = new Map();
  const puntos = [];
  for (const rasgo of estrellas.features) {
    const [lon, lat] = rasgo.geometry.coordinates;
    const hip = Number(rasgo.id);
    if (!Number.isInteger(hip) || hip <= 0) continue;
    const llave = clave(lon, lat);
    // Ante coordenadas repetidas gana el HIP menor: eleccion determinista.
    const previo = porCoordenada.get(llave);
    if (previo === undefined || hip < previo) porCoordenada.set(llave, hip);
    puntos.push({ hip, lon, lat });
  }

  /** HIP del vertice, por coincidencia exacta y, si falla, por cercania. */
  function hipDelVertice(lon, lat) {
    const exacto = porCoordenada.get(clave(lon, lat));
    if (exacto !== undefined) return exacto;

    let mejor = null;
    let mejorDistancia = Number.POSITIVE_INFINITY;
    for (const punto of puntos) {
      const dLat = punto.lat - lat;
      if (Math.abs(dLat) > TOLERANCIA_GRADOS) continue;
      const dLon = (punto.lon - lon) * Math.cos((lat * Math.PI) / 180);
      const distancia = Math.hypot(dLon, dLat);
      if (distancia < mejorDistancia) {
        mejorDistancia = distancia;
        mejor = punto.hip;
      }
    }
    return mejorDistancia <= TOLERANCIA_GRADOS ? mejor : null;
  }

  const lineas = JSON.parse(readFileSync(resolve(rutaLineas), 'utf8'));
  const pares = [];
  const vistos = new Set();
  let verticesSinResolver = 0;
  let totalVertices = 0;

  for (const rasgo of lineas.features) {
    for (const trazo of rasgo.geometry.coordinates) {
      let anterior = null;
      for (const [lon, lat] of trazo) {
        totalVertices += 1;
        const hip = hipDelVertice(lon, lat);
        if (hip === null) {
          verticesSinResolver += 1;
          console.error(
            `Vertice sin estrella en ${String(rasgo.id)}: [${String(lon)}, ${String(lat)}]`,
          );
        }
        if (anterior !== null && hip !== null && anterior !== hip) {
          const menor = Math.min(anterior, hip);
          const mayor = Math.max(anterior, hip);
          const llave = `${String(menor)}-${String(mayor)}`;
          if (!vistos.has(llave)) {
            vistos.add(llave);
            pares.push([menor, mayor]);
          }
        }
        anterior = hip;
      }
    }
  }

  pares.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  const salida = {
    $comentario:
      'Pares de numeros HIP de las figuras de linea de las constelaciones. Derivado de d3-celestial (BSD-3-Clause) con datos-fuente/derivar-lineas-hip.mjs; ver datos-fuente/CREDITOS.md.',
    fuente: 'd3-celestial (ofrohn), data/constellations.lines.json + data/stars.8.json',
    licencia: 'BSD-3-Clause',
    segmentos: pares,
  };

  const destino = resolve(
    dirname(fileURLToPath(import.meta.url)),
    'lineas-constelacion-hip.json',
  );
  writeFileSync(destino, `${JSON.stringify(salida, null, 2)}\n`, 'utf8');
  console.log(
    `Vertices: ${String(totalVertices)} (sin resolver: ${String(verticesSinResolver)}). Pares HIP unicos: ${String(pares.length)}. Escrito: ${destino}`,
  );
}

main();
