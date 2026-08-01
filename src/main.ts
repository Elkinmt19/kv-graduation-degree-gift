/**
 * Punto de entrada de la Aplicacion.
 *
 * Andamiaje minimo: la secuencia de arranque completa (estado de sesion,
 * precarga del catalogo, Portal_Acceso y Pagina_Regalo) se implementa en la
 * tarea 15.1.
 */
const raiz = document.querySelector<HTMLDivElement>('#aplicacion');

if (raiz !== null) {
  raiz.textContent = 'Para KawaValen';
}

export {};
