import { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { authorize } from "../src/middlewares/authorize.middleware";
import { AppError } from "../src/errors/app.error";
import {
  buildPaginationMeta,
  getPagination,
} from "../src/utils/pagination";

describe("getPagination", () => {
  it("applique les valeurs par défaut", () => {
    expect(getPagination()).toEqual({ page: 1, limit: 10, skip: 0 });
  });

  it("calcule le décalage", () => {
    expect(getPagination("3", "20")).toEqual({ page: 3, limit: 20, skip: 40 });
  });

  it("borne la page à 1 et la limite entre 1 et 100", () => {
    expect(getPagination("-5", "500")).toEqual({
      page: 1,
      limit: 100,
      skip: 0,
    });
    expect(getPagination("1", "0").limit).toBe(1);
  });
});

describe("buildPaginationMeta", () => {
  it("arrondit le nombre de pages au supérieur", () => {
    expect(buildPaginationMeta(1, 10, 21).totalPages).toBe(3);
  });
});

describe("authorize", () => {
  it("retourne 401 si aucun utilisateur n'est attaché à la requête", () => {
    const next = vi.fn();

    authorize("ADMIN")({} as Request, {} as Response, next);

    const error = next.mock.calls[0][0] as AppError;

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
  });
});

describe("AppError", () => {
  it("utilise 500 par défaut", () => {
    const error = new AppError("erreur");

    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(true);
  });
});
