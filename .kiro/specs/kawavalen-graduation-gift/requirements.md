# Requirements Document

## Introduction

KawaValen Graduation Gift es una aplicación web estática, de una sola sesión de uso, concebida como regalo de grado para María Valentina Barandica Nieto (KawaValen), quien se gradúa como física. La aplicación consta de dos vistas: un portal de acceso protegido por una clave y una vista de regalo que muestra el mapa estelar correspondiente al lugar, fecha y hora exactos de su graduación, acompañado de una carta dedicada.

La calidad visual es un requisito de primer orden: la paleta se construye sobre negro, azul y dorado, e incorpora guiños personales (su moto Kawasaki Z650 "Obsidian", sus gatos Michi y Guchi, el sanjuanero, los Jeep Rubicon y la física nuclear).

Notas de alcance:

- El sitio es estático (sin servidor propio ni base de datos). La clave de acceso funciona como una puerta ceremonial, no como un control de seguridad real: cualquier persona con conocimientos técnicos puede inspeccionar el paquete distribuido. Por eso el requisito 1 exige almacenar solo el hash de la clave y no incluir información sensible en la aplicación.
- El Instante_Graduacion y el texto de la Carta quedan definidos en el Archivo_Configuracion. Sus valores concretos (hora exacta de la ceremonia y contenido de la carta) se confirmarán con el autor del regalo antes de la implementación; el requisito 8 define cómo se configuran.

## Glossary

- **Aplicacion**: El sitio web estático completo, compuesto por el Portal_Acceso y la Pagina_Regalo.
- **Portal_Acceso**: Vista inicial que solicita y valida la Clave_Acceso.
- **Clave_Acceso**: Cadena de texto secreta que habilita el paso a la Pagina_Regalo.
- **Hash_Clave**: Digesto SHA-256, en representación hexadecimal minúscula, de la Clave_Acceso normalizada.
- **Pagina_Regalo**: Vista que contiene el Mapa_Estelar, el Lienzo_Carta y los Guinos_Personales.
- **Mapa_Estelar**: Componente que dibuja el cielo visible en el Instante_Graduacion desde el Lugar_Graduacion.
- **Motor_Astronomico**: Módulo que convierte coordenadas ecuatoriales del Catalogo_Estelar en coordenadas horizontales y en coordenadas de pantalla.
- **Catalogo_Estelar**: Archivo de datos en formato JSON con estrellas (nombre, ascensión recta, declinación, magnitud aparente, constelación) y segmentos de constelaciones.
- **Estrella**: Entrada del Catalogo_Estelar compuesta por nombre, ascensión recta, declinación, magnitud aparente y constelación.
- **Segmento**: Par de nombres de Estrella que define una línea de constelación.
- **Lector_Catalogo**: Módulo que valida y convierte el contenido del Catalogo_Estelar en objetos Estrella y Segmento.
- **Serializador_Catalogo**: Módulo que convierte objetos Estrella y Segmento nuevamente al formato JSON del Catalogo_Estelar.
- **Instante_Graduacion**: Fecha y hora exactas de la ceremonia de grado, expresadas con desplazamiento horario -05:00 (hora de Colombia).
- **Lugar_Graduacion**: Coordenadas geográficas de la ceremonia; por defecto Neiva, Huila, Colombia (latitud 2.9273° N, longitud 75.2819° O).
- **Coordenadas_Horizontales**: Par (altitud, azimut) de una estrella vista desde el Lugar_Graduacion en el Instante_Graduacion.
- **Proyeccion_Estereografica**: Transformación que convierte Coordenadas_Horizontales en coordenadas cartesianas dentro del Circulo_Horizonte.
- **Circulo_Horizonte**: Círculo que delimita el área dibujable del Mapa_Estelar y representa el horizonte local.
- **Lienzo_Carta**: Componente que muestra el texto de la Carta.
- **Carta**: Texto dedicado que el autor del regalo escribe para KawaValen.
- **Guinos_Personales**: Elementos visuales opcionales que aluden a los gustos de KawaValen (moto Obsidian, gatos Michi y Guchi, sanjuanero, Jeep Rubicon, física nuclear).
- **Archivo_Configuracion**: Archivo único que centraliza Hash_Clave, Instante_Graduacion, Lugar_Graduacion, texto de la Carta y activación de Guinos_Personales.
- **Paleta_Regalo**: Conjunto de colores de la Aplicacion: negro profundo (#05060D), azul noche (#0B2A6F), azul eléctrico (#1E4FD8) y dorado (#D4AF37).

## Requirements

### Requirement 1: Portal de acceso con clave

**User Story:** Como autor del regalo, quiero que la aplicación pida una clave antes de mostrar el contenido, para que el regalo se revele únicamente a KawaValen.

#### Acceptance Criteria

1. CUANDO la Aplicacion se carga sin acceso concedido en la sesión actual, EL Portal_Acceso DEBERÁ mostrar el texto "Si eres KawaValen, por favor digita la clave de acceso", un campo de entrada de tipo contraseña con longitud máxima de 64 caracteres y un botón de ingreso, y DEBERÁ mantener oculto todo contenido de la Pagina_Regalo.
2. EL Portal_Acceso DEBERÁ normalizar el texto ingresado eliminando únicamente los caracteres de espacio en blanco iniciales y finales, conservando los espacios internos, y convirtiendo las letras a minúsculas, antes de calcular su hash SHA-256.
3. CUANDO la persona envía el formulario y el hash SHA-256 del texto normalizado coincide con los 64 caracteres del Hash_Clave, EL Portal_Acceso DEBERÁ conceder el acceso, registrar el estado de acceso concedido para la sesión actual del navegador y presentar la Pagina_Regalo en un máximo de 500 milisegundos.
4. SI el hash SHA-256 del texto normalizado difiere del Hash_Clave, ENTONCES EL Portal_Acceso DEBERÁ conservar la vista actual con la Pagina_Regalo oculta, limpiar el campo de entrada, devolver el foco a ese campo y mostrar el mensaje de reintento "Esa no es la clave, inténtalo de nuevo" en un máximo de 500 milisegundos, manteniéndolo visible hasta el siguiente envío del formulario.
5. MIENTRAS el texto normalizado del campo de entrada tiene longitud 0 caracteres, EL Portal_Acceso DEBERÁ mantener el botón de ingreso en estado deshabilitado y DEBERÁ ignorar todo envío del formulario.
6. EL Portal_Acceso DEBERÁ incluir en el paquete distribuido únicamente el Hash_Clave, en representación hexadecimal minúscula de exactamente 64 caracteres, sin incluir la Clave_Acceso en texto claro en ningún archivo del paquete.
7. CUANDO el acceso ha sido concedido y la persona recarga la página en la misma sesión del navegador, EL Portal_Acceso DEBERÁ presentar directamente la Pagina_Regalo sin volver a solicitar la Clave_Acceso.
8. CUANDO la persona presiona la tecla Enter con el campo de entrada enfocado y con texto normalizado de longitud mayor o igual a 1 carácter, EL Portal_Acceso DEBERÁ ejecutar la misma validación que el botón de ingreso.
9. CUANDO la Aplicacion se carga en una sesión del navegador distinta de aquella en la que se concedió el acceso, EL Portal_Acceso DEBERÁ solicitar de nuevo la Clave_Acceso y DEBERÁ mantener oculta la Pagina_Regalo.
10. EL Portal_Acceso DEBERÁ aceptar intentos consecutivos ilimitados de Clave_Acceso, sin bloqueo temporal ni retardo impuesto entre intentos.
11. SI el cálculo del hash SHA-256 no puede completarse en el navegador, ENTONCES EL Portal_Acceso DEBERÁ conservar la vista actual, mantener oculta la Pagina_Regalo y mostrar un mensaje que indique que la validación de la clave no está disponible en ese navegador.

### Requirement 2: Lectura del catálogo estelar

**User Story:** Como autor del regalo, quiero que la aplicación cargue un catálogo de estrellas confiable, para que el mapa estelar represente el cielo real.

#### Acceptance Criteria

1. CUANDO el Catalogo_Estelar contiene un documento JSON válido con al menos 1 y a lo sumo 5000 entradas de estrella y a lo sumo 20000 entradas de segmento, EL Lector_Catalogo DEBERÁ convertirlo, en un máximo de 300 milisegundos, en una colección de objetos Estrella con nombre (cadena no vacía de máximo 64 caracteres), ascensión recta en horas, declinación en grados, magnitud aparente y constelación (cadena no vacía de máximo 64 caracteres), y en una colección de objetos Segmento que referencian los nombres de las dos estrellas que une.
2. SI el Catalogo_Estelar contiene un documento con sintaxis JSON inválida, ENTONCES EL Lector_Catalogo DEBERÁ devolver un error que indique la posición del carácter donde falla la lectura y DEBERÁ no entregar colecciones parciales de objetos Estrella ni de objetos Segmento.
3. SI una entrada del Catalogo_Estelar declara una ascensión recta fuera del intervalo [0, 24) horas, una declinación fuera del intervalo [-90, 90] grados o una magnitud aparente fuera del intervalo [-1.5, 6.0], ENTONCES EL Lector_Catalogo DEBERÁ detener la lectura en la primera entrada inválida y devolver un error que identifique el nombre de la estrella y el campo inválido.
4. SI un Segmento del Catalogo_Estelar referencia el nombre de una estrella ausente de la colección de estrellas, o referencia dos veces el mismo nombre de estrella, ENTONCES EL Lector_Catalogo DEBERÁ devolver un error que identifique el nombre referenciado y la posición del segmento.
5. CUANDO el Serializador_Catalogo recibe colecciones de objetos Estrella y Segmento que cumplen los criterios 1, 3 y 4, EL Serializador_Catalogo DEBERÁ producir un documento JSON con el formato del Catalogo_Estelar que conserve los cinco campos de cada Estrella y los dos nombres de cada Segmento, con al menos 6 decimales en los campos numéricos.
6. PARA TODA colección válida de objetos Estrella y Segmento, serializar y luego leer nuevamente DEBERÁ producir colecciones equivalentes a las originales (propiedad de ida y vuelta), entendiendo por equivalentes que la cantidad de elementos coincide, que el conjunto de nombres de estrella y de pares de nombres de segmento coincide, y que la diferencia absoluta en ascensión recta, declinación y magnitud aparente es menor o igual a 0.000001.
7. PARA TODO documento JSON válido del Catalogo_Estelar, leer, serializar y volver a leer DEBERÁ producir colecciones equivalentes entre la primera y la segunda lectura, con el mismo criterio de equivalencia y la misma tolerancia de 0.000001 definidos en el criterio 6 (propiedad de ida y vuelta).
8. SI el Catalogo_Estelar no puede obtenerse, o su obtención supera 3000 milisegundos, ENTONCES EL Lector_Catalogo DEBERÁ devolver un error que indique la indisponibilidad del catálogo y DEBERÁ no entregar colecciones parciales.
9. SI una entrada del Catalogo_Estelar omite el nombre, la ascensión recta, la declinación, la magnitud aparente o la constelación, o declara el nombre o la constelación como cadena vacía, ENTONCES EL Lector_Catalogo DEBERÁ devolver un error que identifique la posición de la entrada y el campo ausente o vacío.
10. SI el Catalogo_Estelar declara dos o más estrellas con el mismo nombre, ENTONCES EL Lector_Catalogo DEBERÁ devolver un error que identifique el nombre repetido.

### Requirement 3: Cálculo de posiciones estelares

**User Story:** Como KawaValen, quiero ver la posición exacta de las estrellas en el momento de mi grado, para conservar ese cielo como recuerdo.

#### Acceptance Criteria

1. CUANDO el Lector_Catalogo entrega la colección de objetos Estrella, EL Motor_Astronomico DEBERÁ calcular para cada Estrella las Coordenadas_Horizontales correspondientes al Instante_Graduacion y al Lugar_Graduacion, expresadas en grados decimales.
2. EL Motor_Astronomico DEBERÁ producir, para toda Estrella del Catalogo_Estelar, una altitud dentro del intervalo [-90, 90] grados y un azimut dentro del intervalo [0, 360) grados medido desde el norte geográfico y creciente hacia el este, con una resolución mínima de 0.0001 grados.
3. PARA TODA Estrella, convertir sus coordenadas ecuatoriales a Coordenadas_Horizontales y aplicar la conversión inversa con el mismo Instante_Graduacion y el mismo Lugar_Graduacion DEBERÁ reproducir la ascensión recta y la declinación originales con un error máximo de 0.01 grados (propiedad de ida y vuelta).
4. PARA TODA Estrella con altitud mayor o igual a 0 grados, aplicar la Proyeccion_Estereografica y luego su inversa DEBERÁ reproducir la altitud y el azimut originales con un error máximo de 0.01 grados (propiedad de ida y vuelta).
5. PARA TODA Estrella con altitud mayor o igual a 0 grados, EL Motor_Astronomico DEBERÁ producir coordenadas de pantalla cuya distancia al centro del Circulo_Horizonte sea menor o igual al radio del Circulo_Horizonte, con una tolerancia máxima de 0.5 píxeles, y PARA TODA Estrella con altitud igual a 0 grados esa distancia DEBERÁ igualar el radio del Circulo_Horizonte con un error máximo de 0.5 píxeles (invariante).
6. CUANDO el Motor_Astronomico recibe dos veces el mismo Instante_Graduacion, el mismo Lugar_Graduacion y el mismo Catalogo_Estelar, DEBERÁ producir en ambas invocaciones altitudes, azimutes y coordenadas de pantalla cuya diferencia sea exactamente 0 para cada Estrella.
7. CUANDO el Motor_Astronomico recibe un instante desplazado 23 horas, 56 minutos y 4.0905 segundos respecto del Instante_Graduacion, DEBERÁ producir Coordenadas_Horizontales que difieran de las originales en menos de 0.5 grados de altitud y menos de 0.5 grados de azimut para cada Estrella (propiedad metamórfica del día sidéreo).
8. EL Motor_Astronomico DEBERÁ calcular la altitud y el azimut de las 20 Estrellas de menor magnitud aparente del Catalogo_Estelar con un error máximo de 0.1 grados respecto de un conjunto fijo de valores de referencia tomados de un almanaque astronómico publicado y registrados junto con las pruebas, para el Instante_Graduacion y el Lugar_Graduacion.
9. SI el Lugar_Graduacion declara una latitud fuera del intervalo [-90, 90] grados o una longitud fuera del intervalo (-180, 180] grados, o el Instante_Graduacion no puede interpretarse como una fecha y hora con desplazamiento horario, ENTONCES EL Motor_Astronomico DEBERÁ omitir el cálculo, no producir Coordenadas_Horizontales y devolver un error que identifique el campo inválido y el valor recibido.
10. PARA TODA Estrella con altitud menor a 0 grados, EL Motor_Astronomico DEBERÁ marcarla como no visible y DEBERÁ omitir sus coordenadas de pantalla.
11. CUANDO el Motor_Astronomico recibe un Catalogo_Estelar con hasta 3000 Estrellas, DEBERÁ completar el cálculo de las Coordenadas_Horizontales y de las coordenadas de pantalla de todas ellas en un máximo de 300 milisegundos.

### Requirement 4: Visualización del mapa estelar

**User Story:** Como KawaValen, quiero un mapa estelar bello y legible, para reconocer las constelaciones que estaban sobre mí ese día.

#### Acceptance Criteria

1. EL Mapa_Estelar DEBERÁ dibujar únicamente las Estrellas del Catalogo_Estelar con altitud mayor o igual a 0 grados y magnitud aparente menor o igual a 6.0, hasta un máximo de 3000 Estrellas dibujadas, y DEBERÁ ubicar cada una dentro del Circulo_Horizonte.
2. EL Mapa_Estelar DEBERÁ asignar a cada Estrella un radio de dibujo que decrece de forma monótona al crecer la magnitud aparente, con radio máximo de 3.5 píxeles para magnitud -1.5 y radio mínimo de 0.6 píxeles para magnitud 6.0; PARA TODA Estrella con magnitud menor que -1.5 DEBERÁ usar 3.5 píxeles y PARA TODA Estrella con magnitud mayor que 6.0 DEBERÁ usar 0.6 píxeles.
3. PARA TODO Segmento cuyas dos Estrellas tienen altitud mayor o igual a 0 grados, EL Mapa_Estelar DEBERÁ dibujar la línea de constelación que las une con un grosor entre 0.5 y 1.5 píxeles.
4. EL Mapa_Estelar DEBERÁ mostrar el nombre de las Estrellas con magnitud aparente menor o igual a 1.5, con un tamaño de fuente mínimo de 11 píxeles, un máximo de 30 etiquetas simultáneas y sin superposición entre etiquetas; SI dos etiquetas se superponen, ENTONCES EL Mapa_Estelar DEBERÁ ocultar la de mayor magnitud aparente.
5. CUANDO la persona señala una Estrella con el cursor o la toca en pantalla táctil dentro de un radio de detección mínimo de 12 píxeles alrededor del centro de la Estrella, EL Mapa_Estelar DEBERÁ mostrar, en un máximo de 150 milisegundos, su nombre, su constelación y su magnitud aparente con un decimal.
6. EL Mapa_Estelar DEBERÁ mostrar un rótulo con el nombre del Lugar_Graduacion, la fecha del Instante_Graduacion en día, mes y año, y su hora en formato de 24 horas con horas y minutos, seguida del desplazamiento horario -05:00.
7. EL Mapa_Estelar DEBERÁ mostrar sobre el borde del Circulo_Horizonte cuatro marcas rotuladas N, E, S y O, ubicadas en los azimuts 0, 90, 180 y 270 grados con una desviación máxima de 1 grado.
8. CUANDO la Pagina_Regalo termina de conceder el acceso, EL Mapa_Estelar DEBERÁ completar su primer dibujo en un máximo de 1000 milisegundos, medidos desde el instante de concesión del acceso en un dispositivo con navegador actualizado de los últimos tres años.
9. SI la lectura del Catalogo_Estelar devuelve un error, ENTONCES EL Mapa_Estelar DEBERÁ mostrar de forma conjunta un fondo estrellado decorativo y el texto "El cielo tarda en cargar, pero la carta te espera", DEBERÁ mantener visible el Lienzo_Carta y DEBERÁ conservar el Circulo_Horizonte sin Estrellas ni líneas de constelación dibujadas.
10. SI la lectura del Catalogo_Estelar devuelve un error y el fondo estrellado decorativo no puede dibujarse, ENTONCES EL Mapa_Estelar DEBERÁ mostrar un fondo plano en negro profundo con el mismo texto de respaldo.
11. CUANDO la lectura del Catalogo_Estelar finaliza sin error, EL Mapa_Estelar DEBERÁ dibujar el cielo calculado y DEBERÁ mantener oculto todo mensaje de respaldo.
12. CUANDO la ventana del navegador cambia de tamaño, EL Mapa_Estelar DEBERÁ redibujarse en un máximo de 400 milisegundos tras el último cambio de tamaño, conservando el Circulo_Horizonte completo dentro del área visible con un margen mínimo de 8 píxeles y un diámetro mínimo de 280 píxeles.
13. SI la lectura del Catalogo_Estelar no finaliza en 5000 milisegundos desde su inicio, ENTONCES EL Mapa_Estelar DEBERÁ tratarla como error y aplicar el comportamiento de respaldo del criterio 9.
14. CUANDO la persona retira el cursor de la Estrella señalada o toca un punto del Mapa_Estelar sin Estrella dentro del radio de detección, EL Mapa_Estelar DEBERÁ ocultar la información de la Estrella en un máximo de 150 milisegundos y DEBERÁ mantener el cielo dibujado sin cambios.
15. PARA TODO Segmento con al menos una Estrella de altitud menor que 0 grados, EL Mapa_Estelar DEBERÁ omitir por completo la línea de constelación correspondiente.

### Requirement 5: Carta dedicada

**User Story:** Como autor del regalo, quiero dedicarle una carta que acompañe el mapa estelar, para expresarle lo que significa su logro.

#### Acceptance Criteria

1. EL Lienzo_Carta DEBERÁ mostrar el texto de la Carta definido en el Archivo_Configuracion como bloques de párrafo independientes, en el mismo orden declarado, admitiendo entre 1 y 20 párrafos y un total máximo de 6000 caracteres.
2. CUANDO la Pagina_Regalo se presenta por primera vez en la sesión y el Archivo_Configuracion declara al menos un párrafo no vacío, EL Lienzo_Carta DEBERÁ revelar el texto de la Carta con una animación de aparición progresiva de 1200 milisegundos de duración y DEBERÁ dejar el texto completo con opacidad total al término de ese intervalo.
3. CUANDO la Pagina_Regalo se presenta de nuevo en la misma sesión del navegador, EL Lienzo_Carta DEBERÁ mostrar el texto completo de la Carta en su estado final con opacidad total, sin ejecutar la animación de aparición.
4. SI la altura del contenido del Lienzo_Carta supera la altura de su contenedor, ENTONCES EL Lienzo_Carta DEBERÁ habilitar desplazamiento vertical dentro de su propio contenedor, sin generar desplazamiento horizontal y sin desplazar el Mapa_Estelar.
5. EL Lienzo_Carta DEBERÁ mostrar el saludo dirigido a KawaValen declarado en el Archivo_Configuracion, con un máximo de 120 caracteres, ubicado antes del primer párrafo de la Carta.
6. EL Lienzo_Carta DEBERÁ mostrar la firma declarada en el Archivo_Configuracion, con un máximo de 120 caracteres, ubicada después del último párrafo de la Carta.
7. SI el Archivo_Configuracion no declara párrafos de la Carta o todos los párrafos declarados están vacíos, ENTONCES EL Lienzo_Carta DEBERÁ mostrar un mensaje de respaldo que indique que la carta aún no está disponible y DEBERÁ mantener visible el Mapa_Estelar.
8. EL Lienzo_Carta DEBERÁ presentar el texto de la Carta con un tamaño de fuente mínimo de 16 píxeles y una altura de línea mínima de 1.6 para todo ancho de ventana entre 320 y 1920 píxeles.
9. MIENTRAS el ancho de la ventana es menor a 768 píxeles, EL Lienzo_Carta DEBERÁ ubicarse debajo del Mapa_Estelar en un flujo de una sola columna.

### Requirement 6: Identidad visual y guiños personales

**User Story:** Como KawaValen, quiero que la página se vea hermosa y hable de mí, para sentir que el regalo fue hecho a mi medida.

#### Acceptance Criteria

1. EL Aplicacion DEBERÁ usar exclusivamente los cuatro colores de la Paleta_Regalo (negro profundo #05060D, azul noche #0B2A6F, azul eléctrico #1E4FD8, dorado #D4AF37) con valores de opacidad entre 0.05 y 1.0 para fondos, textos, bordes y acentos, sin declarar ningún otro valor de color.
2. EL Aplicacion DEBERÁ presentar todo texto con una relación de contraste mínima de 4.5:1 respecto del color de fondo efectivo resultante de la composición de capas y opacidades, en los estados de reposo, foco, señalado con el cursor y deshabilitado.
3. EL Portal_Acceso DEBERÁ mostrar un fondo de cielo nocturno en negro profundo y azul noche con entre 80 y 200 puntos luminosos animados cuyo ciclo de animación dura entre 4000 y 12000 milisegundos, y DEBERÁ aplicar dorado al borde del campo de entrada y al fondo del botón de ingreso.
4. DONDE los Guinos_Personales están activados en el Archivo_Configuracion, EL Mapa_Estelar DEBERÁ dibujar una constelación dedicada rotulada "Obsidian" en color dorado, trazada con entre 4 y 9 Segmentos sobre Estrellas del Catalogo_Estelar con altitud mayor o igual a 0 grados en el Instante_Graduacion.
5. DONDE los Guinos_Personales están activados en el Archivo_Configuracion, EL Pagina_Regalo DEBERÁ mostrar un único elemento decorativo por cada referencia personal (gatos Michi y Guchi, sanjuanero, Jeep Rubicon y física nuclear), cada uno con un tamaño máximo de 96 píxeles en su lado mayor, con un texto alternativo que lo nombre y sin superponerse al Circulo_Horizonte ni al texto de la Carta.
6. DONDE la reproducción de música está activada en el Archivo_Configuracion, EL Pagina_Regalo DEBERÁ mantener visible un control de reproducción y silencio del sanjuanero con un área señalable mínima de 44 por 44 píxeles en todo estado de reproducción, con el audio en estado detenido y el volumen inicial al 50 por ciento en la primera presentación de la sesión.
7. EL Aplicacion DEBERÁ presentar el texto de la Carta con una familia tipográfica serif y los rótulos, etiquetas y controles con una familia tipográfica sans-serif, declarando en cada caso la familia genérica correspondiente como respaldo cuando la fuente principal no está disponible.
8. DONDE los Guinos_Personales están desactivados en el Archivo_Configuracion, EL Pagina_Regalo DEBERÁ omitir la constelación "Obsidian" y todos los elementos decorativos de referencias personales, y DEBERÁ conservar el Mapa_Estelar, el Lienzo_Carta y la Paleta_Regalo sin cambios de disposición ni espacios reservados.
9. SI los Guinos_Personales están activados y menos de 5 Estrellas de la constelación "Obsidian" tienen altitud mayor o igual a 0 grados en el Instante_Graduacion, ENTONCES EL Mapa_Estelar DEBERÁ omitir esa constelación y su rótulo, y DEBERÁ conservar el resto del cielo dibujado sin mostrar mensajes de error.
10. DONDE la reproducción de música está activada en el Archivo_Configuracion, SI el recurso de audio del sanjuanero no queda disponible en un máximo de 5000 milisegundos, ENTONCES EL Pagina_Regalo DEBERÁ mantener el control en estado deshabilitado con una indicación visible de audio no disponible y DEBERÁ conservar visibles el Mapa_Estelar y el Lienzo_Carta.

### Requirement 7: Experiencia en distintos dispositivos y accesibilidad

**User Story:** Como KawaValen, quiero abrir el regalo desde mi celular o mi computador, para verlo donde esté cuando reciba el enlace.

#### Acceptance Criteria

1. PARA TODO ancho de ventana entre 320 y 1920 píxeles, EL Aplicacion DEBERÁ presentar el Portal_Acceso y la Pagina_Regalo sin desplazamiento horizontal, manteniendo todo elemento visible dentro del ancho de la ventana.
2. MIENTRAS el ancho de la ventana es mayor o igual a 1024 píxeles, EL Pagina_Regalo DEBERÁ mostrar el Mapa_Estelar y el Lienzo_Carta en dos columnas simultáneas, sin superposición entre ellas, con un ancho mínimo de 480 píxeles para la columna del Mapa_Estelar y de 320 píxeles para la columna del Lienzo_Carta.
3. MIENTRAS el ancho de la ventana está entre 768 y 1023 píxeles, SI el Lienzo_Carta conserva un ancho mínimo de 320 píxeles, ENTONCES EL Pagina_Regalo DEBERÁ presentar el Mapa_Estelar y el Lienzo_Carta en dos columnas.
4. EL Aplicacion DEBERÁ permitir alcanzar el campo de entrada, el botón de ingreso y todo control interactivo de la Pagina_Regalo mediante pulsaciones sucesivas de la tecla Tab, en el mismo orden en que los elementos aparecen en pantalla, y DEBERÁ mostrar sobre el elemento enfocado un indicador de foco en dorado de al menos 2 píxeles de grosor y con relación de contraste mínima de 3:1 respecto del fondo adyacente.
5. DONDE el navegador declara la preferencia de movimiento reducido, EL Aplicacion DEBERÁ omitir toda animación de aparición y todo movimiento continuo del fondo y del Mapa_Estelar, y DEBERÁ presentar cada contenido en su estado final en un máximo de 100 milisegundos desde que se incorpora a la vista.
6. EL Mapa_Estelar DEBERÁ exponer un texto alternativo de entre 80 y 500 caracteres que indique el nombre del Lugar_Graduacion, la fecha y la hora del Instante_Graduacion con desplazamiento horario -05:00, y los nombres de las constelaciones dibujadas.
7. CUANDO la Aplicacion se carga por primera vez, sin contenido previo en la caché del navegador, sobre una conexión de 1.6 Mbps de descarga y 300 milisegundos de latencia de ida y vuelta, EL Portal_Acceso DEBERÁ completar su primer dibujo con el campo de entrada y el botón de ingreso visibles en un máximo de 2500 milisegundos.
8. MIENTRAS el Mapa_Estelar ejecuta sus animaciones, EL Mapa_Estelar DEBERÁ mantener una tasa de dibujo mínima de 30 fotogramas por segundo, verificada como al menos el 95 por ciento de los fotogramas con tiempo de dibujo menor o igual a 33 milisegundos en una ventana de medición de 10 segundos, en un dispositivo con navegador liberado dentro de los últimos tres años.
9. MIENTRAS el ancho de la ventana está entre 768 y 1023 píxeles, SI el Lienzo_Carta no conserva un ancho mínimo de 320 píxeles en dos columnas, ENTONCES EL Pagina_Regalo DEBERÁ presentar el Mapa_Estelar y el Lienzo_Carta en una sola columna, con el Lienzo_Carta debajo del Mapa_Estelar.
10. CUANDO la persona presiona la tecla Enter o la barra espaciadora con un control interactivo enfocado, EL Aplicacion DEBERÁ ejecutar la misma acción que produce la pulsación de ese control con el cursor.
11. MIENTRAS el ancho de la ventana es menor a 768 píxeles, EL Aplicacion DEBERÁ presentar cada control interactivo con un área táctil mínima de 44 por 44 píxeles y una separación mínima de 8 píxeles respecto de los demás controles.

### Requirement 8: Configuración del regalo

**User Story:** Como autor del regalo, quiero configurar la clave, el momento, el lugar y la carta en un solo archivo, para ajustar el regalo sin tocar la lógica de la aplicación.

#### Acceptance Criteria

1. EL Archivo_Configuracion DEBERÁ declarar el Hash_Clave como cadena hexadecimal minúscula de exactamente 64 caracteres, el Instante_Graduacion en formato ISO 8601 con desplazamiento horario -05:00, el Lugar_Graduacion como latitud en el intervalo [-90, 90] grados y longitud en el intervalo [-180, 180] grados, un saludo de 1 a 120 caracteres, entre 1 y 12 párrafos de la Carta de hasta 1200 caracteres cada uno, una firma de 1 a 120 caracteres, y los interruptores de Guinos_Personales y de música con valor verdadero o falso.
2. CUANDO el Archivo_Configuracion cambia el valor del Instante_Graduacion o del Lugar_Graduacion y el proceso de construcción finaliza sin error, EL Mapa_Estelar DEBERÁ reflejar el cielo correspondiente a los nuevos valores en la siguiente carga de la Aplicacion, sin modificación alguna de la lógica de la Aplicacion.
3. SI el Archivo_Configuracion omite el Hash_Clave, el Instante_Graduacion, el Lugar_Graduacion, el saludo, los párrafos de la Carta o la firma, ENTONCES EL Aplicacion DEBERÁ detener el proceso de construcción, reportar el nombre de cada campo ausente y no generar el paquete de archivos estáticos.
4. SI el Archivo_Configuracion declara un Instante_Graduacion que no cumple el formato ISO 8601 con desplazamiento horario, o que declara un desplazamiento distinto de -05:00, ENTONCES EL Aplicacion DEBERÁ detener el proceso de construcción, reportar el valor recibido junto con el formato esperado y no generar el paquete de archivos estáticos.
5. CUANDO todos los campos del Archivo_Configuracion cumplen los criterios 1, 3, 4, 8 y 9, EL Aplicacion DEBERÁ completar el proceso de construcción en un máximo de 120 segundos y generar el paquete de archivos estáticos.
6. EL Aplicacion DEBERÁ incluir un comando descrito en la documentación del repositorio que reciba una Clave_Acceso en texto claro, aplique la misma normalización del Portal_Acceso (eliminar espacios iniciales y finales y convertir a minúsculas) y emita el Hash_Clave como cadena hexadecimal minúscula de 64 caracteres.
7. EL Aplicacion DEBERÁ generar un paquete de archivos estáticos que se presente completo sin procesamiento del lado del servidor y sin peticiones a servicios propios durante su ejecución en el navegador.
8. SI el Archivo_Configuracion declara un Hash_Clave que no es una cadena hexadecimal minúscula de exactamente 64 caracteres, ENTONCES EL Aplicacion DEBERÁ detener el proceso de construcción, reportar la cantidad de caracteres recibida y no generar el paquete de archivos estáticos.
9. SI el Archivo_Configuracion declara en el Lugar_Graduacion una latitud fuera del intervalo [-90, 90] grados o una longitud fuera del intervalo [-180, 180] grados, ENTONCES EL Aplicacion DEBERÁ detener el proceso de construcción, reportar el campo inválido con el valor recibido y no generar el paquete de archivos estáticos.
10. SI el Archivo_Configuracion omite el interruptor de Guinos_Personales o el interruptor de música, ENTONCES EL Aplicacion DEBERÁ completar el proceso de construcción tratando cada interruptor ausente como desactivado y reportar una advertencia que identifique el interruptor ausente.
