import { beforeEach, vi } from "vitest";
import { mockReset } from "vitest-mock-extended";

/**
 * Variables d'environnement de test.
 * Elles doivent être définies avant le chargement de src/config/env.ts.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.API_VERSION = "v1";

/**
 * Prisma est remplacé par un mock :
 * aucune base PostgreSQL n'est nécessaire pour exécuter les tests.
 */
vi.mock("../src/config/prisma", async () => {
  const { prismaMock } = await import("./helpers/prisma.mock");

  return { prisma: prismaMock };
});

beforeEach(async () => {
  const { prismaMock } = await import("./helpers/prisma.mock");

  mockReset(prismaMock);
});
