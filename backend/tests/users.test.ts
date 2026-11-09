import bcrypt from "bcrypt";
import request from "supertest";
import { Role, User } from "@prisma/client";
import { describe, expect, it } from "vitest";

import app from "../src/app";
import { prismaMock } from "./helpers/prisma.mock";
import { adminToken } from "./helpers/auth";

const user: User = {
  id: "u1",
  firstName: "Grace",
  lastName: "Hopper",
  email: "grace@test.fr",
  password: "hash",
  role: Role.RECRUITER,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const validPayload = {
  firstName: "Grace",
  lastName: "Hopper",
  email: "grace@test.fr",
  password: "Password123!",
};

describe("Utilisateurs (ADMIN)", () => {
  it("GET /users retourne une liste paginée", async () => {
    prismaMock.user.findMany.mockResolvedValue([user]);
    prismaMock.user.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/v1/users")
      .set("Authorization", adminToken());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("GET /users/:id retourne l'utilisateur", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);

    const res = await request(app)
      .get("/v1/users/u1")
      .set("Authorization", adminToken());

    expect(res.status).toBe(200);
  });

  it("GET /users/:id retourne 404 si inconnu", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/v1/users/inconnu")
      .set("Authorization", adminToken());

    expect(res.status).toBe(404);
  });

  it("POST /users hache le mot de passe avant enregistrement", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(user);

    const res = await request(app)
      .post("/v1/users")
      .set("Authorization", adminToken())
      .send(validPayload);

    expect(res.status).toBe(201);

    const { data } = prismaMock.user.create.mock.calls[0][0];

    expect(data.password).not.toBe(validPayload.password);
    expect(await bcrypt.compare(validPayload.password, data.password)).toBe(
      true
    );
  });

  it("POST /users refuse un email déjà utilisé (409)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);

    const res = await request(app)
      .post("/v1/users")
      .set("Authorization", adminToken())
      .send(validPayload);

    expect(res.status).toBe(409);
  });

  it("POST /users refuse un mot de passe trop court (400)", async () => {
    const res = await request(app)
      .post("/v1/users")
      .set("Authorization", adminToken())
      .send({ ...validPayload, password: "court" });

    expect(res.status).toBe(400);
  });

  it("PUT /users/:id met à jour l'utilisateur", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.user.update.mockResolvedValue({ ...user, lastName: "Hopper-B" });

    const res = await request(app)
      .put("/v1/users/u1")
      .set("Authorization", adminToken())
      .send({ lastName: "Hopper-B" });

    expect(res.status).toBe(200);
    expect(res.body.data.lastName).toBe("Hopper-B");
  });

  it("DELETE /users/:id supprime l'utilisateur", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.user.delete.mockResolvedValue(user);

    const res = await request(app)
      .delete("/v1/users/u1")
      .set("Authorization", adminToken());

    expect(res.status).toBe(200);
  });
});
