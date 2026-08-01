/**
 * Errores del nucleo, como uniones discriminadas por el campo `clase`.
 *
 * El nucleo nunca lanza excepciones para estos fallos: los devuelve como datos,
 * de modo que las vistas y las pruebas puedan examinarlos sin `try/catch` y el
 * compilador exija cubrir cada caso.
 *
 * Requisitos: 2.2, 2.3, 2.4, 2.8, 2.9, 2.10, 3.9, 4.13.
 */

/**
 * Fallos que puede devolver el Lector_Catalogo. Ante cualquiera de ellos la
 * lectura se detiene y no se entregan colecciones parciales.
 *
 * - `sintaxis-invalida`: el documento no es JSON valido. `posicion` es el
 *   indice del caracter donde falla la lectura (Requisito 2.2).
 * - `cantidad-invalida`: `estrellas` fuera de [1, 5000] o `segmentos` por
 *   encima de 20000. `recibido` es la cantidad hallada (Requisito 2.1).
 * - `campo-ausente`: una entrada omite un campo obligatorio o declara el
 *   nombre o la constelacion como cadena vacia. `indice` es la posicion de la
 *   entrada en su coleccion, base 0 (Requisito 2.9).
 * - `fuera-de-rango`: `ar`, `dec` o `magnitud` fuera de su intervalo, con el
 *   nombre de la estrella y el valor recibido (Requisito 2.3).
 * - `nombre-duplicado`: dos o mas estrellas comparten el mismo nombre
 *   (Requisito 2.10).
 * - `segmento-invalido`: un extremo referencia un nombre ausente del catalogo
 *   (`motivo: 'ausente'`) o el segmento repite el mismo nombre en sus dos
 *   extremos (`motivo: 'repetido'`). `posicion` es el indice del segmento,
 *   base 0 (Requisito 2.4).
 * - `indisponible`: el catalogo no pudo obtenerse por red, o la obtencion
 *   supero 3000 ms, o la lectura completa supero 5000 ms. `msTranscurridos`
 *   registra el tiempo consumido (Requisitos 2.8, 4.13).
 */
export type ErrorCatalogo =
  | { readonly clase: 'sintaxis-invalida'; readonly posicion: number }
  | {
      readonly clase: 'cantidad-invalida';
      readonly campo: 'estrellas' | 'segmentos';
      readonly recibido: number;
    }
  | { readonly clase: 'campo-ausente'; readonly indice: number; readonly campo: string }
  | {
      readonly clase: 'fuera-de-rango';
      readonly nombre: string;
      readonly campo: 'ar' | 'dec' | 'magnitud';
      readonly recibido: number;
    }
  | { readonly clase: 'nombre-duplicado'; readonly nombre: string }
  | {
      readonly clase: 'segmento-invalido';
      readonly posicion: number;
      readonly nombre: string;
      readonly motivo: 'ausente' | 'repetido';
    }
  | {
      readonly clase: 'indisponible';
      readonly motivo: 'red' | 'tiempo-excedido';
      readonly msTranscurridos: number;
    };

/**
 * Fallos que puede devolver el Motor_Astronomico. Se detectan antes de todo
 * calculo, de modo que no se producen Coordenadas_Horizontales parciales
 * (Requisito 3.9).
 *
 * - `lugar-invalido`: latitud fuera de [-90, 90] o longitud fuera de
 *   (-180, 180], con el campo y el valor recibido.
 * - `instante-invalido`: el Instante_Graduacion no puede interpretarse como
 *   fecha y hora con desplazamiento horario. `recibido` es la cadena original.
 */
export type ErrorMotor =
  | { readonly clase: 'lugar-invalido'; readonly campo: 'latitud' | 'longitud'; readonly recibido: number }
  | { readonly clase: 'instante-invalido'; readonly recibido: string };
