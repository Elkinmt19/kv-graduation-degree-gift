import { defineConfig } from 'vitest/config';

/**
 * Configuracion unica de Vite y Vitest.
 *
 * `base: './'` produce un `dist/` con rutas relativas, publicable como paquete
 * de archivos estaticos sin procesamiento del lado del servidor (Requisito 8.7).
 *
 * Vitest corre en dos proyectos: el nucleo puro y las herramientas en `node`,
 * y solo las pruebas de vista en `jsdom`.
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'recursos',
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    // Las mediciones de navegador son un guion de Playwright aparte.
    projects: [
      {
        extends: true,
        test: {
          name: 'nucleo',
          environment: 'node',
          include: ['pruebas/**/*.test.ts'],
          exclude: ['pruebas/unitarias/vista/**', 'pruebas/navegador/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'vista',
          environment: 'jsdom',
          include: ['pruebas/unitarias/vista/**/*.test.ts'],
        },
      },
    ],
  },
});
