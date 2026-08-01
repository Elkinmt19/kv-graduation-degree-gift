# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A one-session static gift web app for a physics graduate: a password-gated portal leading to a star map showing the exact sky at the moment/place of her graduation, plus a dedicated letter and personal easter eggs. Built from a Kiro spec (`.kiro/specs/kawavalen-graduation-gift/`: `requirements.md`, `design.md`, `tasks.md`). **`tasks.md` is the authoritative build plan and progress tracker for this project** — read it first when resuming work; checked boxes are done, unchecked are not. `context.md` at the repo root has the original Spanish prompt with personal details (names, hobbies, colors) behind the gift.

The app is entirely static: no backend, no database, no runtime requests to first-party services. The access code is a ceremonial gate, not real security — the codebase and `dist/` are inspectable by anyone with dev tools, and the design explicitly accepts that (see Requirement 1 and the security section of `design.md`).

## Commands

```bash
npm run dev              # Vite dev server
npm test                 # vitest run (all suites: nucleo=node env, vista=jsdom env)
npm run verificar-tipos  # tsc --noEmit
npm run build             # prebuild (tsc + validar-configuracion) then vite build
npm run hash-clave -- "Clave De Ejemplo"   # compute the SHA-256 hash for regalo.config.json's hashClave field
npm run generar-catalogo  # regenerate public/datos/catalogo-estelar.json from datos-fuente/
npm run medir              # playwright test (browser performance measurements, not part of the vitest suite)
```

Run a single test file: `npx vitest run pruebas/unitarias/nucleo/clave.test.ts`. Run by name: `npx vitest run -t "nombre del test"`.

Vitest runs two projects (`vite.config.ts`): `nucleo` (node env, everything under `pruebas/` except `pruebas/unitarias/vista/**` and `pruebas/navegador/**`) and `vista` (jsdom env, only `pruebas/unitarias/vista/**`). Property tests (`pruebas/propiedades/`) use fast-check with 100+ iterations (1000 for the astronomy engine's round-trip properties) — expect some of them to take seconds, not milliseconds.

## Codebase is in Spanish

Identifiers, file names, test descriptions, commit-worthy prose — all Spanish, matching the spec's Glossary in `requirements.md`. Keep new code consistent with this; don't introduce English identifiers into `src/`, `herramientas/`, or `pruebas/`. Key domain terms (capitalized, used verbatim across code/tests/docs): `Portal_Acceso`, `Clave_Acceso`, `Hash_Clave`, `Pagina_Regalo`, `Mapa_Estelar`, `Motor_Astronomico`, `Catalogo_Estelar`, `Lector_Catalogo`/`Serializador_Catalogo`, `Instante_Graduacion`, `Lugar_Graduacion`, `Circulo_Horizonte`, `Lienzo_Carta`, `Guinos_Personales`, `Archivo_Configuracion`, `Paleta_Regalo`.

## Architecture

Four structural decisions drive everything (from `design.md` Overview):

1. **All astronomy is pure, client-side computation over a pre-built dataset.** `Catalogo_Estelar` (star catalog) is generated at build time from HYG v3 + d3-celestial constellation lines (see `datos-fuente/`, `herramientas/generar-catalogo.ts`) and shipped as a static JSON file. `Motor_Astronomico` (`src/nucleo/astronomia/`) has zero I/O — it's why the 33 correctness properties in `design.md` can be tested with fast-check in milliseconds.
2. **`regalo.config.json` is the single configuration surface.** Hash of the access code, graduation instant/place, letter text, and feature toggles (`guinosPersonales`, `musica`) live there, validated by `herramientas/validar-configuracion.ts` (Zod) as a `prebuild` step — a bad config fails the build loudly instead of shipping a broken `dist/`.
3. **The access code never touches the repo or the built package in cleartext.** Only its SHA-256 (`hashClave`, 64 lowercase hex chars) is stored. `src/nucleo/clave.ts` has the one normalization routine (trim + lowercase, no Unicode normalization) shared by the browser portal and the `herramientas/hash-clave.ts` CLI — see the README section "La clave nunca pasa por un archivo del repositorio" before touching anything code-adjacent to the access flow.
4. **Design is enforced, not decorative.** `Paleta_Regalo` is exactly four colors (`#05060D` black, `#0B2A6F` night blue, `#1E4FD8` electric blue, `#D4AF37` gold) at varying opacity — CSS files outside `src/estilos/tokens.css` must contain zero color literals, only `var(--…)`. This is asserted by tests (e.g. `pruebas/unitarias/estilos/*.test.ts`) that scan stylesheets for literal colors.

### Dependency rules (enforced by design, not tooling)

- **Core is pure**: `src/nucleo/**` (catalog reader/serializer, astronomy engine, letter resolver, key normalization) never touches the DOM, `fetch`, `Date.now()`, or `Math.random()`. It takes data, returns data or typed errors.
- **I/O lives at the edge**: `src/infra/` is the only place with `fetch`, `sessionStorage`, `crypto.subtle` — each behind a substitutable interface for testing.
- **Views don't compute**: `src/vista/**` receives already-resolved structures (`CieloCalculado`, `CartaResuelta`) and only draws / handles events.
- **Errors are typed values**, not exceptions: discriminated unions (`ErrorCatalogo`, `ErrorMotor`, `ResultadoLectura`, `ResultadoCielo` per `src/nucleo/errores.ts`), so the compiler forces every branch to be handled and property tests can assert on the error's concrete class.
- **Graceful degradation is the design's core error-handling principle**: no failure should leave a blank screen. If the star catalog can't load, the map falls back to a decorative starfield and the letter stays visible — every fallback path is enumerated in `design.md`'s "Rutas de respaldo en tiempo de ejecución" table; check it before adding new failure handling so it degrades the same way as everything else.

### Layout

```
src/nucleo/        # pure: clave.ts, catalogo/{modelo,lector,serializador}, astronomia/{tiempo,precesion,horizontales,proyeccion,motor}, carta/resolver, diseno/contraste, configuracion/modelo, errores
src/vista/         # DOM: portal/{portal,cielo-fondo}, mapa/{capas,etiquetas,interaccion,radio,circulo,animacion,rotulo}, carta/lienzo, guinos/{obsidian,decoraciones,audio}, disposicion.ts
src/infra/         # edge I/O: recursos (fetch+timers), sesion (sessionStorage), hash (crypto.subtle), movimiento-reducido (prefers-reduced-motion)
src/estilos/       # tokens.css (only file allowed color literals), base/portal/mapa/carta/respuesta.css
herramientas/      # Node-only, build time: hash-clave.ts, generar-catalogo.ts, validar-configuracion.ts
datos-fuente/      # versioned inputs (HYG v3 CSV, constellation lines), never published — see CREDITOS.md for required attribution (CC BY-SA 2.5 + BSD-3-Clause)
public/datos/      # generated catalogo-estelar.json (output of herramientas/generar-catalogo.ts)
pruebas/propiedades/  # fast-check property tests, one file per numbered Property in design.md
pruebas/unitarias/    # example-based tests; vista/** runs under jsdom, everything else under node
pruebas/referencia/   # almanac reference values for the 0.1°-tolerance astronomy check (Requirement 3.8) — currently pending real graduation instant
pruebas/navegador/    # Playwright performance specs, run via `npm run medir`, not part of vitest
```

### Correctness properties

`design.md`'s "Correctness Properties" section numbers 33 properties, each traced to a requirement ID and to one file in `pruebas/propiedades/`. When changing core logic (astronomy, catalog I/O, key normalization, config validation), check whether an existing property in that section already covers the invariant before adding a new unit test — the design's stated policy is "no excessive unit tests: a universal rule is covered by a property; a unit test is reserved for the example that documents behavior."

## Current state / known gaps

- Git repo has no commits yet — everything is currently untracked.
- `tasks.md` sections 11 (star map interaction/labels/rotulo/fallback), 13 (Obsidian constellation + personal decorations + audio), 15 (final `src/main.ts` wiring), 17 (dist packaging verification), and 18 (Playwright measurements) are unimplemented or partial. `src/main.ts` and `index.html` are still scaffolding, not the real boot sequence.
- One known type error: `pruebas/unitarias/estilos/mapa-clases.test.ts` imports `PALETA_DE_RESPALDO`/`PROPIEDADES_PALETA` from `src/vista/mapa/capas.ts`, which doesn't export them yet (blocks that test file; part of unfinished task 11.3).
- `regalo.config.json` intentionally holds **placeholder values** pending the gift author's final input (task block 19, all blocked): the real graduation instant, letter text, Obsidian constellation star selection, sanjuanero audio decision, and final `hashClave`. Don't treat these as bugs — they're deliberately marked PENDIENTE in the config's `$comentario` field and are the last task block by design.
