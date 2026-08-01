# KawaValen Graduation Gift

Sitio web estático de una sola sesión: un portal protegido por clave y, detrás de él, el mapa estelar del instante exacto de la graduación acompañado de una carta dedicada.

Requiere Node.js 20.11 o superior.

```bash
npm install
npm run dev               # servidor de desarrollo
npm test                  # suite de pruebas (Vitest + fast-check)
npm run verificar-tipos   # tsc --noEmit
npm run build              # valida regalo.config.json (prebuild) y genera dist/
npm run generar-catalogo   # regenera public/datos/catalogo-estelar.json desde datos-fuente/
npm run verificar-paquete  # revisa dist/: Hash_Clave, ausencia de clave en texto claro, sin origenes ajenos
npm run medir               # mediciones de navegador con Playwright (fuera de la suite de Vitest)
```

## Calcular el Hash_Clave

`regalo.config.json` nunca guarda la Clave_Acceso: guarda solo su digesto SHA-256 en `hashClave`, como 64 caracteres hexadecimales minúsculos (Requisitos 1.6 y 8.6). Para obtenerlo:

```bash
npm run hash-clave -- "Clave De Ejemplo"
# 4f8a...  (64 caracteres hexadecimales minusculos)
```

El comando aplica exactamente la misma normalización que el Portal_Acceso antes de calcular el hash: recorta los espacios en blanco de los extremos, conserva los espacios internos y convierte las letras a minúsculas. Ambas rutas comparten `src/nucleo/clave.ts`, así que no pueden desincronizarse.

Copia la salida en el campo `hashClave` de `regalo.config.json`. La salida estándar contiene solo el hash, de modo que también se puede canalizar:

```bash
npm run hash-clave --silent -- "Clave De Ejemplo" | pbcopy
```

### La clave nunca pasa por un archivo del repositorio

- Pásala **únicamente** como argumento del comando. No la escribas en `regalo.config.json`, ni en un `.env`, ni en un archivo temporal, ni en un comentario del código: cualquiera de esos caminos la deja en el historial de Git y en el paquete publicado.
- El comando no escribe la clave en disco y no la imprime de vuelta; solo emite el hash.
- Recuerda que el argumento queda en el historial de tu intérprete de comandos. Si te importa, bórralo (`history -d`) o antepone un espacio a la línea cuando tu shell lo excluya del historial.
- Usa preferiblemente caracteres ASCII: la normalización no aplica Unicode NFC/NFD, así que dos formas de escribir la misma letra acentuada producen hashes distintos.
- La validación ocurre por completo en el navegador. El Hash_Clave es visible para cualquiera que inspeccione el paquete; el portal es un gesto de discreción, no un control de seguridad.

## Datos fuente y créditos

`public/datos/catalogo-estelar.json` se genera con `npm run generar-catalogo` a partir de los archivos versionados en `datos-fuente/` (HYG Database v3 y las líneas de constelación de d3-celestial), sin acceso a la red. Las licencias que exige cada fuente (CC BY-SA 2.5 y BSD-3-Clause) y el detalle de la tubería de generación están en `datos-fuente/CREDITOS.md`.
