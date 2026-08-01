import { describe, expect, it } from 'vitest';

describe('andamiaje del proyecto (entorno node)', () => {
  it('corre el nucleo puro sin DOM disponible', () => {
    expect(typeof globalThis.document).toBe('undefined');
  });

  it('tiene fast-check y zod disponibles para el nucleo', async () => {
    const fc = await import('fast-check');
    const { z } = await import('zod');

    fc.assert(
      fc.property(fc.integer(), (n) => z.number().safeParse(n).success),
      { numRuns: 25 },
    );
  });
});
