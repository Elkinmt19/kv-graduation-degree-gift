# Implementation Plan: KawaValen Graduation Gift

## Overview

El plan construye el regalo desde un repositorio vacío en el orden de dependencias del diseño: primero el andamiaje del proyecto y los modelos de datos, después el núcleo puro (normalización de clave, catálogo, módulos astronómicos), luego la infraestructura de borde y el sistema de diseño, después las vistas (portal, mapa, carta, guiños), enseguida las herramientas de construcción y el cableado final, y al cierre el paquete estático y las mediciones de navegador.

Lenguaje: **TypeScript en modo estricto** (definido en el diseño, no requiere elección). Empaquetador Vite 5, pruebas con Vitest, propiedades con fast-check, validación de configuración con Zod, mediciones con Playwright.

Las 33 propiedades de correctitud del diseño tienen cada una su propia subtarea, con referencia explícita al requisito que validan.

Las tareas del bloque 19 están **bloqueadas por datos pendientes** (Instante_Graduacion exacto, texto de la Carta, selección de estrellas de "Obsidian", decisión sobre el audio del sanjuanero y clave definitiva). Todo lo demás se puede completar sin ellas: hasta que se confirmen, el Archivo_Configuracion conserva sus valores marcador.

## Tasks

- [ ] 1. Montar el proyecto desde cero
  - [x] 1.1 Inicializar el repositorio con el stack del diseño
    - Crear `package.json` con los scripts `dev`, `build`, `prebuild`, `test`, `hash-clave`, `generar-catalogo` y `medir`
    - Instalar y fijar versiones exactas: `typescript`, `vite`, `vitest`, `fast-check`, `zod`, `jsdom`, `@playwright/test`
    - Crear `tsconfig.json` con `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` y módulos ESM
    - Crear `vite.config.ts` con `base: './'` y la configuración de Vitest (entorno `node` por defecto, `jsdom` para `pruebas/unitarias/vista`)
    - Crear `index.html` mínimo y el árbol de carpetas `src/{nucleo,vista,infra,estilos}`, `herramientas/`, `datos-fuente/`, `public/datos`, `pruebas/{propiedades,unitarias,referencia,navegador}`
    - _Requisitos: 8.7_

  - [x] 1.2 Definir los modelos de datos del núcleo
    - Crear `src/nucleo/catalogo/modelo.ts` con `HorasAr`, `GradosDec`, `Magnitud`, `Estrella`, `Segmento`, `CatalogoEstelar` y sus invariantes documentados
    - Crear `src/nucleo/astronomia/modelo.ts` con `Ecuatorial`, `Horizontal`, `Punto`, `CirculoHorizonte`, `InstanteGraduacion`, `LugarGraduacion`, `EstrellaCalculada`, `CieloCalculado`
    - Crear `src/nucleo/errores.ts` con las uniones discriminadas `ErrorCatalogo` y `ErrorMotor`
    - _Requisitos: 2.1, 3.1, 3.2, 3.10_

  - [x] 1.3 Crear el Archivo_Configuracion con valores marcador
    - Crear `regalo.config.json` con `hashClave`, `instanteGraduacion`, `lugarGraduacion` (Neiva), `carta` y los interruptores, marcando de forma visible los campos PENDIENTE
    - Crear el tipo `ConfiguracionRegalo` en `src/nucleo/configuracion/modelo.ts`
    - _Requisitos: 8.1_

- [x] 2. Implementar la normalización de la clave y el comando de hash
  - [x] 2.1 Implementar `normalizarClave`
    - Crear `src/nucleo/clave.ts` con recorte de espacios en blanco de los extremos y conversión a minúsculas, sin normalización Unicode
    - _Requisitos: 1.2_

  - [x] 2.2 Escribir la prueba de propiedad de la normalización de la clave
    - **Propiedad 1: La normalización de la clave recorta los extremos, conserva el interior y es idempotente**
    - **Valida: Requisito 1.2**

  - [x] 2.3 Implementar el comando `hash-clave`
    - Crear `herramientas/hash-clave.ts` que reciba la clave por argumento, reutilice `normalizarClave`, use `node:crypto` y emita solo los 64 caracteres hexadecimales minúsculos
    - Documentar el uso en el README y advertir que la clave nunca debe pasar por un archivo del repositorio
    - _Requisitos: 8.6, 1.6_

  - [x] 2.4 Escribir la prueba de propiedad de coincidencia entre el comando y el portal
    - **Propiedad 33: El comando de hash y el Portal_Acceso coinciden siempre**
    - **Valida: Requisito 8.6**

- [x] 3. Implementar el Lector_Catalogo y el Serializador_Catalogo
  - [x] 3.1 Implementar `leerCatalogo`
    - Crear `src/nucleo/catalogo/lector.ts` con la cascada de validación: sintaxis JSON con posición, límites de cantidad (1–5000 estrellas, ≤ 20000 segmentos), campos ausentes o vacíos, rangos de `ar`, `dec` y `magnitud`, longitudes ≤ 64, nombres duplicados y extremos de segmento existentes y distintos
    - Construir las colecciones en variables locales y publicarlas solo al final, para no entregar colecciones parciales ante error
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.9, 2.10_

  - [x] 3.2 Implementar `serializarCatalogo`
    - Crear `src/nucleo/catalogo/serializador.ts` que componga el JSON campo por campo e inserte los numéricos con `toFixed(6)`, delegando el escape de cadenas a `JSON.stringify`
    - _Requisitos: 2.5_

  - [x] 3.3 Crear los generadores de fast-check
    - Crear `pruebas/generadores.ts` con `genEstrella`, `genCatalogoValido`, `genLatitud`, `genLongitud`, `genTiempoSidereo`, `genInstante`, `genAltitud`, `genClave`, `genAnchoVentana` y `genMutacion`, con el sesgo hacia los casos límite descrito en el diseño
    - _Requisitos: 2.1, 2.3, 3.2, 3.5_

  - [x] 3.4 Escribir la prueba de propiedad de lectura completa del catálogo
    - **Propiedad 5: La lectura de un catálogo válido conserva todas las entradas y todos los campos**
    - **Valida: Requisito 2.1**

  - [x] 3.5 Escribir la prueba de propiedad de rechazo de documentos inválidos
    - **Propiedad 6: Todo documento inválido se rechaza sin colecciones parciales e identificando la causa**
    - **Valida: Requisitos 2.2, 2.3, 2.4, 2.9, 2.10**

  - [x] 3.6 Escribir la prueba de propiedad del formato de serialización
    - **Propiedad 7: La serialización emite los cinco campos con al menos seis decimales**
    - **Valida: Requisito 2.5**

  - [x] 3.7 Escribir la prueba de propiedad de ida y vuelta objetos → documento → objetos
    - **Propiedad 8: Ida y vuelta de objetos a documento y de vuelta a objetos**
    - **Valida: Requisito 2.6**

  - [x] 3.8 Escribir la prueba de propiedad de ida y vuelta documento → objetos → documento → objetos
    - **Propiedad 9: Ida y vuelta de documento a objetos, a documento y de vuelta a objetos**
    - **Valida: Requisito 2.7**

- [x] 4. Punto de control - Asegurar que todas las pruebas pasen
  - Ejecutar la suite completa, confirmar que el núcleo del catálogo está verde y preguntar al usuario si surgen dudas.

- [ ] 5. Implementar el Motor_Astronomico
  - [x] 5.1 Implementar el módulo de tiempo
    - Crear `src/nucleo/astronomia/tiempo.ts` con `diaJuliano`, `siglosJulianos`, `tsmGreenwichGrados` (GMST, Meeus 12.4) y `tsLocalGrados` con longitud positiva al este
    - _Requisitos: 3.1_

  - [x] 5.2 Implementar la precesión desde J2000.0 y su inversa
    - Crear `src/nucleo/astronomia/precesion.ts` con `precesarDesdeJ2000` y `precesarHaciaJ2000` usando ζ, z y θ (Meeus 21.3)
    - _Requisitos: 3.1, 3.3_

  - [x] 5.3 Implementar la conversión ecuatorial ↔ horizontal
    - Crear `src/nucleo/astronomia/horizontales.ts` con `aHorizontales` y `aEcuatoriales` usando `atan2`, altitud en [-90, 90] y azimut en [0, 360) desde el norte y creciente al este
    - _Requisitos: 3.1, 3.2, 3.3_

  - [x] 5.4 Escribir la prueba de propiedad del dominio de las Coordenadas_Horizontales
    - **Propiedad 10: Las Coordenadas_Horizontales caen siempre en su dominio**
    - **Valida: Requisitos 3.1, 3.2**

  - [x] 5.5 Escribir la prueba de propiedad de ida y vuelta ecuatorial ↔ horizontal
    - **Propiedad 11: Ida y vuelta ecuatorial a horizontal y de vuelta a ecuatorial**
    - **Valida: Requisito 3.3**
    - Comparar con distancia angular envolvente y excluir el cenit exacto del azimut

  - [x] 5.6 Implementar la Proyeccion_Estereografica y su inversa
    - Crear `src/nucleo/astronomia/proyeccion.ts` con `proyectar` (`r = R · tan(z/2)`, norte arriba y este a la izquierda) y `desproyectar`
    - _Requisitos: 3.4, 3.5_

  - [x] 5.7 Escribir la prueba de propiedad de ida y vuelta de la proyección
    - **Propiedad 12: Ida y vuelta de la Proyeccion_Estereografica**
    - **Valida: Requisito 3.4**

  - [x] 5.8 Escribir la prueba de propiedad del invariante del Circulo_Horizonte
    - **Propiedad 13: Invariante del Circulo_Horizonte**
    - **Valida: Requisito 3.5**

  - [x] 5.9 Implementar el radio de dibujo por magnitud
    - Crear `src/vista/mapa/radio.ts` con `radioPorMagnitud`: recorte a [-1.5, 6.0] y curva `0.6 + 2.9 · t^1.6` entre 0.6 px y 3.5 px
    - _Requisitos: 4.2_

  - [x] 5.10 Escribir la prueba de propiedad de monotonía del radio
    - **Propiedad 18: El radio de dibujo decrece de forma monótona con la magnitud**
    - **Valida: Requisito 4.2**

  - [x] 5.11 Implementar la fachada `calcularCielo`
    - Crear `src/nucleo/astronomia/motor.ts` que valide primero el Instante_Graduacion y el Lugar_Graduacion, encadene precesión, conversión y proyección, marque `visible` y omita las coordenadas de pantalla de las estrellas bajo el horizonte
    - Producir `segmentosVisibles` solo con ambos extremos visibles, `constelacionesDibujadas`, `cardinales` en Az 0/90/180/270 con altitud 0 y el radio por magnitud
    - Respetar las reglas de determinismo: sin reloj, sin azar, sin acumulación incremental de ángulos ni iteración sobre estructuras de orden no determinista
    - _Requisitos: 3.1, 3.6, 3.9, 3.10, 4.1, 4.7, 4.15_

  - [x] 5.12 Escribir la prueba de propiedad de determinismo del motor
    - **Propiedad 14: El Motor_Astronomico es determinista**
    - **Valida: Requisito 3.6**

  - [x] 5.13 Escribir la prueba de propiedad metamórfica del día sidéreo
    - **Propiedad 15: Un día sidéreo devuelve el cielo a su lugar**
    - **Valida: Requisito 3.7**

  - [x] 5.14 Escribir la prueba de propiedad de lugar o instante inválidos
    - **Propiedad 16: Un lugar o un instante inválidos impiden todo cálculo**
    - **Valida: Requisito 3.9**

  - [x] 5.15 Escribir la prueba de propiedad de visibilidad, selección de dibujo y omisión de segmentos
    - **Propiedad 17: Visibilidad, selección de dibujo y omisión de segmentos**
    - **Valida: Requisitos 3.10, 4.1, 4.15**

  - [x] 5.16 Escribir la prueba de propiedad de respuesta del cielo a instante y lugar
    - **Propiedad 32: El cielo responde a los cambios de instante y de lugar**
    - **Valida: Requisito 8.2**

- [ ] 6. Punto de control - Asegurar que todas las pruebas pasen
  - Ejecutar la suite completa del núcleo astronómico y preguntar al usuario si surgen dudas.

- [x] 7. Implementar la infraestructura de borde
  - [x] 7.1 Crear los módulos de E/S sustituibles
    - Crear `src/infra/recursos.ts` con las interfaces `Traer` y `Reloj` y su implementación sobre `fetch` y `performance.now`
    - Crear `src/infra/hash.ts` con `digerir` sobre `crypto.subtle`, devolviendo `null` cuando Web Crypto no está disponible o el contexto no es seguro
    - Crear `src/infra/sesion.ts` con `EstadoSesion` sobre `sessionStorage` y respaldo en memoria cuando lanza excepción
    - Crear `src/infra/movimiento-reducido.ts` con la consulta `prefers-reduced-motion`
    - _Requisitos: 1.7, 1.9, 1.11, 7.5_

  - [x] 7.2 Implementar `obtenerCatalogo` con sus límites de tiempo
    - Añadir a `src/nucleo/catalogo/lector.ts` la obtención con `AbortController` a 3000 ms y un cronómetro independiente de 5000 ms para la lectura completa, devolviendo `indisponible` con motivo y milisegundos transcurridos
    - _Requisitos: 2.8, 4.13_

  - [x] 7.3 Escribir pruebas unitarias de la infraestructura de borde
    - Cubrir acceso concedido en la sesión y sesión nueva, `sessionStorage` inaccesible, SHA-256 ausente, catálogo inobtenible, tiempo excedido de 3000 ms y de 5000 ms
    - _Requisitos: 1.7, 1.9, 1.11, 2.8, 4.13_

- [x] 8. Implementar el sistema de diseño
  - [x] 8.1 Crear los tokens y los estilos base
    - Crear `src/estilos/tokens.css` con la Paleta_Regalo en hex y componentes RGB, los roles de texto, borde, retícula, foco y fondo, los tokens tipográficos serif y sans-serif con familia genérica de respaldo, y los tokens de ritmo con la anulación por `prefers-reduced-motion`
    - Crear `src/estilos/base.css` sin literales de color: solo `var(--…)`
    - _Requisitos: 6.1, 6.2, 6.7, 5.8, 7.5_

  - [x] 8.2 Implementar la disposición responsiva
    - Crear `src/estilos/respuesta.css` con la rejilla del regalo, el umbral de dos columnas en 880 px, `min-width: 0`, `overflow-wrap: anywhere` y las áreas táctiles de 44 × 44 px con separación de 8 px por debajo de 768 px
    - Crear `src/vista/disposicion.ts` con la función pura que decide columnas y anchos a partir del ancho de ventana, para poder verificarla sin navegador
    - _Requisitos: 5.9, 7.1, 7.2, 7.3, 7.9, 7.11_

  - [x] 8.3 Escribir la prueba de propiedad de la tipografía de la Carta
    - **Propiedad 25: La tipografía de la Carta nunca baja de sus mínimos**
    - **Valida: Requisito 5.8**

  - [x] 8.4 Escribir la prueba de propiedad de la disposición responsiva
    - **Propiedad 26: La disposición responsiva respeta los mínimos y nunca desborda horizontalmente**
    - **Valida: Requisitos 5.9, 7.1, 7.2, 7.3, 7.9**

  - [x] 8.5 Implementar el cálculo de contraste y el inventario de colores
    - Crear `src/nucleo/diseno/contraste.ts` con luminancia relativa WCAG 2.1, composición de capas con opacidad y relación de contraste
    - Crear la utilidad de pruebas que lee las hojas de estilo y extrae todo literal de color declarado fuera de `tokens.css`
    - _Requisitos: 6.1, 6.2_

  - [x] 8.6 Escribir la prueba de propiedad de contraste de los tokens de texto
    - **Propiedad 27: Todo texto de la Paleta_Regalo mantiene el contraste mínimo**
    - **Valida: Requisito 6.2**

  - [x] 8.7 Escribir pruebas unitarias del sistema de diseño
    - Cubrir el inventario de colores de las hojas de estilo, los tokens tipográficos serif y sans-serif con respaldo genérico, las áreas táctiles por debajo de 768 px y la anulación de animaciones con movimiento reducido
    - _Requisitos: 6.1, 6.7, 7.5, 7.11_

- [ ] 9. Implementar el Portal_Acceso
  - [x] 9.1 Implementar `montarPortal`
    - Crear `src/vista/portal/portal.ts` con el texto fijo de invitación, `<form>` real, `<input type="password" maxlength="64">` y botón deshabilitado mientras la clave normalizada tiene longitud 0
    - Implementar la máquina de estados `reposo`, `verificando`, `reintento`, `sin-validacion` y `concedido`, con la Pagina_Regalo `hidden` hasta la concesión, limpieza del campo y foco tras el fallo, mensaje de reintento en región `aria-live="polite"` y sin límite ni retardo de intentos
    - _Requisitos: 1.1, 1.3, 1.4, 1.5, 1.8, 1.10, 1.11, 7.10_

  - [x] 9.2 Implementar el cielo animado del portal
    - Crear `src/vista/portal/cielo-fondo.ts` que genere entre 80 y 200 puntos luminosos con semilla determinista y ciclos de animación entre 4000 y 12000 ms mediante `@keyframes`, desactivados con movimiento reducido
    - Crear `src/estilos/portal.css` con el degradado de negro profundo a azul noche, el borde dorado del campo y el fondo dorado del botón
    - _Requisitos: 6.3, 7.5_

  - [x] 9.3 Escribir la prueba de propiedad de la puerta de acceso
    - **Propiedad 2: La puerta de acceso se abre exactamente cuando los hashes coinciden**
    - **Valida: Requisitos 1.3, 1.4**

  - [x] 9.4 Escribir la prueba de propiedad de entradas que se normalizan a longitud cero
    - **Propiedad 3: Toda entrada que se normaliza a longitud cero bloquea el ingreso**
    - **Valida: Requisito 1.5**

  - [x] 9.5 Escribir la prueba de propiedad de intentos fallidos sin estado acumulado
    - **Propiedad 4: Los intentos fallidos no acumulan estado**
    - **Valida: Requisito 1.10**

  - [x] 9.6 Escribir la prueba de propiedad del cielo animado del portal
    - **Propiedad 28: El cielo animado del Portal_Acceso respeta sus rangos para cualquier semilla**
    - **Valida: Requisito 6.3**

  - [x] 9.7 Escribir pruebas unitarias del Portal_Acceso
    - Cubrir la estructura inicial de la vista, la recarga en la misma sesión y en una sesión nueva, el estado sin validación de SHA-256, el orden de tabulación con aro de foco dorado y la equivalencia de Enter y barra espaciadora
    - _Requisitos: 1.1, 1.7, 1.9, 1.11, 7.4, 7.10_

- [ ] 10. Punto de control - Asegurar que todas las pruebas pasen
  - Ejecutar la suite completa con el portal ya montado y preguntar al usuario si surgen dudas.

- [ ] 11. Implementar el Mapa_Estelar
  - [x] 11.1 Implementar el cálculo y el ajuste del Circulo_Horizonte
    - Crear `src/vista/mapa/circulo.ts` con `R = max(140, (min(ancho, alto) − 16) / 2)` y el dimensionado del lienzo por `devicePixelRatio`
    - Implementar el `ResizeObserver` con antirrebote de 150 ms que dispara el redibujo
    - _Requisitos: 4.12_

  - [x] 11.2 Escribir la prueba de propiedad de ajuste del Circulo_Horizonte
    - **Propiedad 22: El Circulo_Horizonte cabe en cualquier tamaño de ventana admitido**
    - **Valida: Requisito 4.12**

  - [x] 11.3 Implementar las capas de dibujo del cielo
    - Crear `src/vista/mapa/capas.ts` con el degradado de fondo y el disco del horizonte, la retícula tenue, las líneas de constelación de 1.0 px solo con ambos extremos visibles, las estrellas con disco y halo según su radio, y las marcas cardinales N, E, S, O
    - Dibujar las capas estáticas una vez en un `OffscreenCanvas` y copiarlas con `drawImage`
    - Crear `src/estilos/mapa.css`
    - _Requisitos: 4.1, 4.3, 4.7, 4.15_

  - [x] 11.4 Implementar la colocación de etiquetas
    - Crear `src/vista/mapa/etiquetas.ts` con selección de estrellas visibles de magnitud ≤ 1.5, orden por magnitud ascendente, medición con `measureText`, colocación voraz sin solapamiento y tope de 30 etiquetas con fuente de 12 px
    - _Requisitos: 4.4_

  - [x] 11.5 Escribir la prueba de propiedad de las etiquetas del mapa
    - **Propiedad 19: Las etiquetas del mapa nunca se superponen y ceden por magnitud**
    - **Valida: Requisito 4.4**

  - [x] 11.6 Implementar la interacción con las estrellas
    - Crear `src/vista/mapa/interaccion.ts` con la rejilla uniforme de 16 px, la resolución del impacto en las 9 celdas vecinas dentro de 12 px (14 px en punteros gruesos), la agrupación de `pointermove`, `pointerdown` y `pointerleave` en `requestAnimationFrame` y la ficha con nombre, constelación y magnitud a un decimal
    - _Requisitos: 4.5, 4.14_

  - [x] 11.7 Escribir la prueba de propiedad de la detección de la estrella señalada
    - **Propiedad 20: La detección de la Estrella señalada devuelve siempre la más cercana dentro del radio**
    - **Valida: Requisitos 4.5, 4.14**

  - [x] 11.8 Implementar el rótulo de lugar y fecha y el texto alternativo
    - Crear `src/vista/mapa/rotulo.ts` con el nombre del Lugar_Graduacion, día, mes y año, hora y minutos en formato de 24 horas y el sufijo -05:00
    - Implementar `textoAlternativo()` de 80 a 500 caracteres con lugar, fecha con desplazamiento y constelaciones dibujadas, expuesto en el `aria-label` del lienzo con `role="img"`
    - _Requisitos: 4.6, 7.6_

  - [x] 11.9 Escribir la prueba de propiedad del rótulo de lugar y fecha
    - **Propiedad 21: El rótulo de lugar y fecha contiene siempre sus componentes**
    - **Valida: Requisito 4.6**

  - [x] 11.10 Escribir la prueba de propiedad del texto alternativo del mapa
    - **Propiedad 30: El texto alternativo del mapa siempre informa y cabe en su límite**
    - **Valida: Requisito 7.6**

  - [x] 11.11 Implementar `montarMapa` y la ruta de respaldo
    - Crear `src/vista/mapa/mapa.ts` que orqueste las capas, devuelva `ControlMapa` con `redibujar`, `redimensionar`, `textoAlternativo` y `destruir`
    - Implementar el respaldo con `cielo` nulo: disco vacío, fondo estrellado decorativo determinista y el texto "El cielo tarda en cargar, pero la carta te espera", más la sustitución por un nodo con fondo plano cuando el contexto 2D no está disponible
    - _Requisitos: 4.8, 4.9, 4.10, 4.11, 4.13_

  - [x] 11.12 Implementar el bucle de titileo determinista
    - Crear `src/vista/mapa/animacion.ts` con un único `requestAnimationFrame` que redibuje solo las estrellas, con fase senoidal derivada del Instante_Graduacion, y que no se inicie con movimiento reducido
    - _Requisitos: 3.6, 7.5, 7.8_

  - [x] 11.13 Escribir pruebas unitarias del Mapa_Estelar
    - Cubrir la ruta de respaldo con fondo decorativo y texto, el contexto 2D nulo con fondo plano, la rama sin respaldo cuando el cielo es válido, la retirada del cursor y el trato del exceso de 5000 ms como error
    - _Requisitos: 4.9, 4.10, 4.11, 4.13, 4.14_

- [x] 12. Implementar el Lienzo_Carta
  - [x] 12.1 Implementar `resolverCarta`
    - Crear `src/nucleo/carta/resolver.ts` que descarte párrafos vacíos, respete el orden declarado, aplique el tope de 6000 caracteres y marque `disponible: false` cuando no queda ninguno
    - _Requisitos: 5.1, 5.5, 5.6, 5.7_

  - [x] 12.2 Escribir la prueba de propiedad de la estructura de la Carta
    - **Propiedad 23: La estructura del Lienzo_Carta respeta el orden saludo, párrafos y firma**
    - **Valida: Requisitos 5.1, 5.5, 5.6**

  - [x] 12.3 Escribir la prueba de propiedad del respaldo de Carta sin contenido
    - **Propiedad 24: Una Carta sin contenido produce el mensaje de respaldo y conserva el mapa**
    - **Valida: Requisito 5.7**

  - [x] 12.4 Implementar `montarCarta`
    - Crear `src/vista/carta/lienzo.ts` con un `<p>` por párrafo, saludo antes y firma después, animación de aparición de 1200 ms solo la primera vez en la sesión y estado final directo en las siguientes
    - Crear `src/estilos/carta.css` con `overflow-y: auto`, `overflow-x: hidden`, `overscroll-behavior: contain` y la tipografía serif de la Carta
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 7.5_

  - [x] 12.5 Escribir pruebas unitarias del Lienzo_Carta
    - Cubrir la animación en la primera presentación y su ausencia en las siguientes, el desplazamiento vertical contenido sin arrastrar el mapa y el mensaje de respaldo con el mapa visible
    - _Requisitos: 5.2, 5.3, 5.4, 5.7_

- [ ] 13. Implementar los Guinos_Personales
  - [x] 13.1 Implementar la constelación Obsidian
    - Crear `src/vista/guinos/obsidian.ts` con la lista ordenada de nombres de estrella y sus 4 a 9 segmentos como valor marcador, el trazo dorado sobre el mapa y la omisión silenciosa de figura y rótulo cuando menos de 5 de sus estrellas tienen altitud ≥ 0
    - _Requisitos: 6.4, 6.9_

  - [x] 13.2 Escribir la prueba de propiedad de la constelación Obsidian
    - **Propiedad 29: La constelación Obsidian se dibuja exactamente cuando hay estrellas suficientes**
    - **Valida: Requisito 6.9**

  - [x] 13.3 Implementar las decoraciones personales
    - Crear `src/vista/guinos/decoraciones.ts` con un único SVG en línea de trazo dorado por referencia (Michi, Guchi, sanjuanero, Jeep Rubicon, física nuclear), ≤ 96 px en su lado mayor, con `role="img"` y `aria-label`, en una banda propia de la rejilla
    - Garantizar que con los guiños desactivados los nodos no se crean y ninguna regla reserva su espacio
    - _Requisitos: 6.5, 6.8_

  - [x] 13.4 Implementar el control de audio del sanjuanero
    - Crear `src/vista/guinos/audio.ts` con un control único de reproducción y silencio de ≥ 44 × 44 px, `volume = 0.5` y estado detenido en la primera presentación, con límite de 5000 ms sobre `canplay` que lo deja deshabilitado con indicación visible de audio no disponible
    - _Requisitos: 6.6, 6.10_

  - [x] 13.5 Escribir pruebas unitarias de los Guinos_Personales
    - Cubrir el trazo de Obsidian, las cinco decoraciones con su texto alternativo, la ausencia total de nodos con los guiños desactivados y el control de audio en sus estados disponible e indisponible
    - _Requisitos: 6.4, 6.5, 6.6, 6.8, 6.10_

- [ ] 14. Implementar las herramientas de construcción
  - [x] 14.1 Implementar el validador del Archivo_Configuracion
    - Crear `herramientas/validar-configuracion.ts` con Zod: campos obligatorios, `hashClave` con `/^[0-9a-f]{64}$/` reportando la cantidad de caracteres recibida, `instanteGraduacion` ISO 8601 con desplazamiento exactamente -05:00, rangos de latitud y longitud, longitudes de saludo, párrafos (1–12, ≤ 1200 caracteres) y firma
    - Agrupar todos los campos ausentes o inválidos en una sola salida, terminar con código distinto de cero y tratar los interruptores ausentes como desactivados con advertencia
    - Conectarlo al script `prebuild` para que un fallo impida generar `dist/`
    - _Requisitos: 8.1, 8.3, 8.4, 8.5, 8.8, 8.9, 8.10_

  - [x] 14.2 Escribir la prueba de propiedad del validador de configuración
    - **Propiedad 31: Toda configuración válida se acepta y toda configuración con un defecto se rechaza señalándolo**
    - **Valida: Requisitos 8.1, 8.3, 8.4, 8.8, 8.9**

  - [x] 14.3 Escribir pruebas unitarias de los interruptores ausentes
    - Cubrir las cuatro combinaciones de ausencia de `guinosPersonales` y `musica`, con construcción exitosa y advertencia que identifica cada interruptor
    - _Requisitos: 8.10_

  - [x] 14.4 Implementar la generación del Catalogo_Estelar
    - Añadir a `datos-fuente/` el HYG v3 en CSV y las líneas de constelación por número HIP, más `datos-fuente/CREDITOS.md` con las atribuciones de CC BY-SA 2.5 y BSD-3-Clause
    - Crear `herramientas/generar-catalogo.ts` que filtre por magnitud ≤ 5.5 sin el Sol, asigne nombres únicos por precedencia (propio → Bayer → Flamsteed → `HIP <n>`) con sufijo determinista ante colisión, copie `ar`, `dec`, `magnitud` y `constelacion`, resuelva los pares HIP a nombres descartando segmentos con extremo ausente o degenerados, y escriba `public/datos/catalogo-estelar.json`
    - Incorporar la verificación de ida y vuelta antes de escribir: serializar con el Serializador_Catalogo, releer con el Lector_Catalogo y terminar con error si la relectura falla o no es equivalente
    - Incluir la línea de créditos visible en la Pagina_Regalo con los colores de la Paleta_Regalo
    - _Requisitos: 2.1, 2.5, 2.6, 2.7_

  - [ ] 14.5 Escribir la prueba del catálogo publicado
    - Leer `public/datos/catalogo-estelar.json` con el Lector_Catalogo completo y verificar sus invariantes y la equivalencia de ida y vuelta sobre el dato real
    - _Requisitos: 2.1, 2.6, 2.7_

- [x] 15. Integrar la Aplicacion
  - [x] 15.1 Cablear la secuencia de arranque
    - Crear `src/main.ts` que lea el estado de sesión, inicie la precarga del catálogo en paralelo al portal, monte el Portal_Acceso, y al conceder el acceso monte la Pagina_Regalo con el Mapa_Estelar, el Lienzo_Carta y los Guinos_Personales según los interruptores
    - Consumir `regalo.config.json` como módulo importado, sin petición en tiempo de ejecución, y pasar el cielo calculado o `null` al mapa
    - Completar `index.html` con el orden del DOM igual al orden visual y `<meta name="robots" content="noindex">`
    - _Requisitos: 1.3, 1.7, 1.9, 4.8, 4.11, 8.2, 8.7_

  - [x] 15.2 Escribir pruebas de integración del flujo completo
    - Cubrir en jsdom el recorrido de clave correcta a Pagina_Regalo con mapa y carta, la recarga en la misma sesión, el respaldo del mapa ante catálogo indisponible y el respaldo de la carta sin párrafos
    - _Requisitos: 1.3, 1.7, 4.9, 5.7_

- [x] 16. Punto de control - Asegurar que todas las pruebas pasen
  - Ejecutar la suite completa con la Aplicacion cableada y preguntar al usuario si surgen dudas.

- [x] 17. Construir y verificar el paquete estático
  - [x] 17.1 Configurar el empaquetado publicable
    - Añadir las fuentes woff2 autoalojadas con subconjunto latino en `public/fuentes/`, `robots.txt` y la configuración de `vite build` con rutas relativas
    - Crear `herramientas/verificar-paquete.ts` que revise `dist/`: presencia del Hash_Clave con formato de 64 hexadecimales minúsculos, ausencia de la clave en texto claro y ausencia de referencias a orígenes ajenos
    - _Requisitos: 1.6, 8.5, 8.7_

  - [x] 17.2 Escribir la prueba de verificación del paquete
    - Ejecutar la construcción y afirmar que `dist/` no contiene ninguna clave en texto claro, que el Hash_Clave cumple el formato y que ningún recurso apunta fuera del propio origen estático
    - _Requisitos: 1.6, 8.7_

- [ ] 18. Implementar las mediciones de navegador
  - [ ] 18.1 Configurar Playwright y el guion de mediciones
    - Crear `playwright.config.ts` y `pruebas/navegador/rendimiento.spec.ts` con el arranque del paquete construido y las utilidades de traza, fuera de la suite de Vitest
    - _Requisitos: 8.7_

  - [ ] 18.2 Medir los tiempos de presentación y de dibujo
    - Verificar la presentación de la Pagina_Regalo en ≤ 500 ms, el primer dibujo del mapa en ≤ 1000 ms desde la concesión, el redibujo en ≤ 400 ms tras el cambio de tamaño y el primer dibujo del portal en ≤ 2500 ms con red limitada a 1.6 Mbps y 300 ms de latencia
    - _Requisitos: 1.3, 4.8, 4.12, 7.7_

  - [ ] 18.3 Medir el rendimiento del núcleo y la tasa de fotogramas
    - Verificar la lectura de un catálogo de 5000 entradas en ≤ 300 ms, el cálculo de 3000 estrellas en ≤ 300 ms y al menos el 95 % de los fotogramas por debajo de 33 ms en una ventana de 10 segundos
    - _Requisitos: 2.1, 3.11, 7.8_

- [ ] 19. Completar los datos pendientes de confirmación
  - [x] 19.1 Fijar el Instante_Graduacion definitivo
    - **Bloqueada:** requiere la hora exacta de la ceremonia confirmada por el autor del regalo
    - Reemplazar el valor marcador en `regalo.config.json` con el ISO 8601 y desplazamiento -05:00 confirmado, y verificar que el validador acepta el archivo
    - _Requisitos: 8.1, 8.4_

  - [x] 19.2 Registrar los valores de referencia del almanaque y activar su prueba
    - `pruebas/referencia/almanaque.json` con la altitud y el azimut geométricos de las 20 estrellas de menor magnitud para el Instante_Graduacion y Neiva, fuente Skyfield/efemérides JPL DE421 (segunda implementación independiente, no transcripción de un almanaque impreso — ver el `$comentario` del archivo) y fecha de consulta
    - Prueba activada en `pruebas/unitarias/nucleo/astronomia/almanaque.test.ts`, comparación con tolerancia de 0.1 grados
    - _Requisitos: 3.8_

  - [x] 19.3 Incorporar el texto definitivo de la Carta
    - Reemplazados los valores marcador de `carta` en `regalo.config.json` con el texto de `carta-oficial.md` (saludo, 6 párrafos, firma), todos dentro de los límites del validador
    - _Requisitos: 5.1, 5.5, 5.6, 8.1_

  - [x] 19.4 Fijar la selección de estrellas de la constelación Obsidian
    - Confirmado el gancho de Escorpio como definitivo: 8 estrellas reales, 7 segmentos, las 8 sobre el horizonte de Neiva (altitudes 28-57°) en el Instante_Graduacion confirmado; ver `pruebas/unitarias/vista/guinos/obsidian.test.ts`
    - _Requisitos: 6.4, 6.9_

  - [x] 19.5 Resolver el audio del sanjuanero
    - Se incluye: `public/audio/sanjuanero.mp3` (grabación de uso personal/privado del autor, sin distribución pública) y `musica: true` en `regalo.config.json`
    - _Requisitos: 6.6, 6.10_

  - [ ] 19.6 Generar el Hash_Clave definitivo
    - **Bloqueada:** requiere la Clave_Acceso elegida por el autor del regalo
    - Ejecutar `npm run hash-clave` con la clave definitiva, pegar el resultado en `regalo.config.json` y verificar con la prueba del paquete que la clave en texto claro no aparece en `dist/` ni en el repositorio
    - _Requisitos: 1.6, 8.6_

- [ ] 20. Punto de control final - Asegurar que todas las pruebas pasen
  - Ejecutar la suite completa, la verificación del paquete y las mediciones de navegador, y preguntar al usuario si surgen dudas.

## Notes

- Las tareas marcadas con `*` son opcionales y se pueden omitir para un MVP más rápido; las 33 propiedades de correctitud viven en esas subtareas, así que omitirlas reduce la garantía de correctitud.
- Cada tarea referencia los requisitos que implementa, para mantener la trazabilidad con `requirements.md`.
- Las propiedades usan fast-check con mínimo 100 iteraciones, y 1000 en las de ida y vuelta del Motor_Astronomico.
- El bloque 19 agrupa todo lo bloqueado por datos pendientes: el resto del plan se puede completar de principio a fin con los valores marcador del Archivo_Configuracion.
- Las mediciones de navegador del bloque 18 corren a demanda con Playwright, nunca dentro de la suite de Vitest.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "8.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "3.2", "7.1", "8.2", "8.5"] },
    { "id": 3, "tasks": ["2.4", "3.3", "5.1", "5.2", "5.6", "5.9", "7.2", "8.3", "8.4", "8.6", "8.7"] },
    { "id": 4, "tasks": ["3.4", "3.5", "3.6", "3.7", "3.8", "5.3", "5.10", "7.3", "9.1", "9.2", "12.1", "14.1"] },
    { "id": 5, "tasks": ["5.4", "5.5", "5.7", "5.8", "9.3", "9.4", "9.5", "9.6", "9.7", "12.2", "12.3", "12.4", "14.2", "14.3"] },
    { "id": 6, "tasks": ["5.11", "11.1", "12.5", "14.4"] },
    { "id": 7, "tasks": ["5.12", "5.13", "5.14", "5.15", "5.16", "11.2", "11.3", "14.5"] },
    { "id": 8, "tasks": ["11.4", "11.6", "11.8", "11.12", "13.1"] },
    { "id": 9, "tasks": ["11.5", "11.7", "11.9", "11.10", "11.11", "13.2", "13.3", "13.4"] },
    { "id": 10, "tasks": ["11.13", "13.5", "15.1"] },
    { "id": 11, "tasks": ["15.2", "17.1"] },
    { "id": 12, "tasks": ["17.2", "18.1"] },
    { "id": 13, "tasks": ["18.2", "18.3", "19.1", "19.3", "19.5", "19.6"] },
    { "id": 14, "tasks": ["19.2", "19.4"] }
  ]
}
```
