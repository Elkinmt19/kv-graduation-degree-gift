# Créditos y licencias de los datos fuente

Este directorio guarda los datos astronómicos de los que `herramientas/generar-catalogo.ts`
deriva `public/datos/catalogo-estelar.json`. Ninguno de estos datos es propio: todos vienen de
proyectos públicos con licencia, y esta página recoge las atribuciones que esas licencias exigen.

La generación se ejecuta **sin red**: los archivos de este directorio son la única entrada.

---

## Estrellas — HYG Database v3

- **Archivo:** `hyg_v38.csv.gz` (versión 3.8 del volcado, tal como lo publica el origen).
- **Origen:** [HYG Database, astronexus](https://github.com/astronexus/HYG-Database),
  archivo `hyg/v3/hyg_v38.csv.gz`.
- **Autoría:** David Nash (astronexus) y colaboradores del repositorio.
- **Licencia:** **Creative Commons Attribution-ShareAlike 2.5**
  (<http://creativecommons.org/licenses/by-sa/2.5/>), declarada en `hyg/v3/LICENSE.html` del
  repositorio de origen. Conviene anotarlo porque el `LICENSE` de la raíz de ese repositorio
  cubre las versiones más nuevas (AT-HYG) con CC BY-SA 4.0; la carpeta `hyg/v3`, que es la que
  se usa aquí, mantiene la 2.5.
- **Contenido:** combinación de los catálogos Hipparcos, Yale Bright Star y Gliese-Jahreiß, con
  época y equinoccio J2000.0. Descripción parafraseada del README del repositorio de origen para
  respetar las restricciones de la licencia.

Cómo obtenerlo de nuevo:

```sh
curl -sSL -o datos-fuente/hyg_v38.csv.gz \
  https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/v3/hyg_v38.csv.gz
```

El generador acepta también `datos-fuente/hyg_v38.csv` sin comprimir, si se prefiere tenerlo en
claro; con el `.gz` presente no hace falta descomprimir nada.

---

## Líneas de constelación — d3-celestial

- **Archivos:** `constellations.lines.json` (fuente tal cual) y `lineas-constelacion-hip.json`
  (derivado, es el que consume el generador).
- **Origen:** [d3-celestial, Olaf Frohn](https://github.com/ofrohn/d3-celestial), archivos
  `data/constellations.lines.json` y `data/stars.8.json`.
- **Licencia:** **BSD-3-Clause**. La cláusula 1 obliga a conservar el aviso de copyright, que se
  reproduce íntegro más abajo.

### Aviso de copyright de d3-celestial (BSD-3-Clause)

```
Copyright (c) 2015, Olaf Frohn
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted
provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of
   conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of
   conditions and the following disclaimer in the documentation and/or other materials provided
   with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to
   endorse or promote products derived from this software without specific prior written
   permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### Por qué hay un archivo derivado

El diseño describe la entrada de las líneas como **pares de números HIP**, porque así el
generador puede resolver cada extremo contra el nombre que asignó a esa estrella. d3-celestial,
en cambio, publica las figuras como GeoJSON `MultiLineString` con **coordenadas**. Sus catálogos
de estrellas (`data/stars.8.json`) usan el número HIP como `id` y las mismas coordenadas
redondeadas a cuatro decimales, de modo que cada vértice de una figura identifica sin ambigüedad
a una estrella.

`derivar-lineas-hip.mjs` hace esa traducción una sola vez: busca la estrella que ocupa la
coordenada de cada vértice (coincidencia exacta a cuatro decimales y, si falla, la más cercana
dentro de 0.0006°) y emite los pares HIP consecutivos, sin duplicados no orientados y ordenados.
En la derivación vigente los **893 vértices se resolvieron por coincidencia exacta**, sin
recurrir a la búsqueda por cercanía, y produjeron **743 pares HIP** distintos.

Cómo rederivarlo (requiere red, una sola vez):

```sh
curl -sSL -o datos-fuente/constellations.lines.json \
  https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json
curl -sSL -o /tmp/stars.8.json \
  https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/stars.8.json
node datos-fuente/derivar-lineas-hip.mjs datos-fuente/constellations.lines.json /tmp/stars.8.json
```

`stars.8.json` pesa unos 5 MB y no se versiona: solo sirve para esa traducción.

**Alternativa documentada:** [constellation-lines, doinab](https://github.com/doinab/constellation-lines)
(Creative Commons), si algún día se prefiere un trazado con referencias bibliográficas. Sus
líneas se identifican con designaciones estilo SIMBAD, no con números HIP, así que cambiar de
fuente exige adaptar la derivación.

---

## Licencia del catálogo generado

Por la cláusula **ShareAlike** de CC BY-SA 2.5, `public/datos/catalogo-estelar.json` es una obra
derivada y **se distribuye bajo esa misma licencia**, con atribución visible. El código de la
Aplicacion conserva su propia licencia; la cláusula ShareAlike alcanza al archivo de datos, no al
programa que lo lee.

La atribución viaja **dentro** del propio catálogo, en su campo `atribucion`, de modo que no
pueda separarse del dato:

```
Estrellas: HYG Database v3 (astronexus), CC BY-SA 2.5. Lineas de constelacion: d3-celestial
(ofrohn), BSD-3-Clause. Este catalogo se distribuye bajo CC BY-SA 2.5.
```

La Pagina_Regalo muestra esa línea de créditos de forma discreta, con los colores de la
Paleta_Regalo, para satisfacer la atribución sin romper el Requisito 6.1.

---

## Cómo se genera el catálogo

```sh
npm run generar-catalogo
```

La tubería, descrita en el diseño y sin acceso a la red:

1. Filtra HYG por magnitud aparente ≤ 5.5 y descarta el Sol.
2. Asigna a cada estrella un nombre único y no vacío por precedencia: nombre propio →
   designación Bayer → designación Flamsteed → `HIP <n>`, con sufijo determinista ante colisión.
   Las diecisiete entradas del corte que carecen de número HIP continúan la cadena con `HD <n>`,
   `Gliese <n>` y `HYG <id>`.
3. Copia `ar` (horas), `dec` (grados), `magnitud` y `constelacion` (nombre en español de las 88
   constelaciones IAU; la abreviatura IAU si no hubiera traducción).
4. Resuelve los pares HIP a nombres y **descarta** los segmentos con algún extremo ausente por el
   corte de magnitud, los degenerados y los duplicados.
5. Verifica la ida y vuelta **antes de escribir**: serializa con el Serializador_Catalogo, relee
   con el Lector_Catalogo, vuelve a serializar y a releer, y termina con error si algo falla o no
   es equivalente.
6. Solo entonces escribe `public/datos/catalogo-estelar.json`.

Salida de la generación vigente:

```
estrellas: 2865 (magnitud aparente <= 5.5, sin el Sol)
segmentos: 732
colisiones de nombre resueltas con sufijo: 3
segmentos descartados por extremo ausente: 11
segmentos descartados por degenerados: 0
segmentos descartados por duplicados: 0
```

Si falta alguna fuente, el generador **no inventa datos**: termina con código distinto de cero e
imprime la ruta esperada y el comando con el que obtenerla.
