import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { Role, User } from "@prisma/client";
import { describe, expect, it } from "vitest";

import app from "../src/app";
import { prismaMock } from "./helpers/prisma.mock";
import { adminToken } from "./helpers/auth";

const buildUser = async (): Promise<User> => ({
  id: "admin-1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@souverainrecrut.fr",
  password: await bcrypt.hash("Password123!", 4),
  role: Role.ADMIN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("POST /v1/auth/login", () => {
  it("retourne un token JWT et l'utilisateur sans mot de passe", async () => {
    prismaMock.user.findUnique.mockResolvedValue(await buildUser());

    const res = await request(app)
      .post("/v1/auth/login")
      .send({ email: "ada@souverainrecrut.fr", password: "Password123!" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.password).toBeUndefined();

    const payload = jwt.verify(res.body.data.token, "test-secret") as {
      id: string;
      role: Role;
    };

    expect(payload).toMatchObject({ id: "admin-1", role: Role.ADMIN });
  });

  it("refuse un email inconnu (401)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/v1/auth/login")
      .send({ email: "inconnu@test.fr", password: "Password123!" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Email ou mot de passe invalide.");
  });

  it("refuse un mauvais mot de passe (401)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(await buildUser());

    const res = await request(app)
      .post("/v1/auth/login")
      .send({ email: "ada@souverainrecrut.fr", password: "mauvais" });

    expect(res.status).toBe(401);
  });
});

describe("GET /v1/auth/me", () => {
  it("retourne le profil de l'utilisateur connecté", async () => {
    const { password: _, ...profile } = await buildUser();
    prismaMock.user.findUnique.mockResolvedValue(profile as User);

    const res = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", adminToken());

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("ada@souverainrecrut.fr");
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "admin-1" } })
    );
  });

  it("retourne 404 si l'utilisateur n'existe plus", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", adminToken());

    expect(res.status).toBe(404);
  });
});
