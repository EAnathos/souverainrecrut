import request from "supertest";
import { Job } from "@prisma/client";
import { describe, expect, it } from "vitest";

import app from "../src/app";
import { prismaMock } from "./helpers/prisma.mock";
import { adminToken, recruiterToken } from "./helpers/auth";

const job = {
  id: "j1",
  title: "Développeur Backend",
  description: "Node.js, TypeScript et PostgreSQL.",
  location: "Rennes",
  company: "SouverainRecrut",
  recruiterId: "recruiter-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
} as Job;

const validPayload = {
  title: "Développeur Backend",
  description: "Node.js, TypeScript et PostgreSQL.",
  location: "Rennes",
  company: "SouverainRecrut",
  recruiterId: "recruiter-1",
};

describe("Offres d'emploi", () => {
  it("GET /jobs retourne une liste paginée (valeurs par défaut)", async () => {
    prismaMock.job.findMany.mockResolvedValue([job]);
    prismaMock.job.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/v1/jobs")
      .set("Authorization", recruiterToken());

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it("GET /jobs/:id retourne l'offre", async () => {
    prismaMock.job.findUnique.mockResolvedValue(job);

    const res = await request(app)
      .get("/v1/jobs/j1")
      .set("Authorization", recruiterToken());

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe(job.title);
  });

  it("GET /jobs/:id retourne 404 si inconnue", async () => {
    prismaMock.job.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/v1/jobs/inconnu")
      .set("Authorization", recruiterToken());

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Offre introuvable.");
  });

  it("POST /jobs crée une offre", async () => {
    prismaMock.job.create.mockResolvedValue(job);

    const res = await request(app)
      .post("/v1/jobs")
      .set("Authorization", recruiterToken())
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(prismaMock.job.create).toHaveBeenCalledWith({ data: validPayload });
  });

  it("POST /jobs refuse une description trop courte (400)", async () => {
    const res = await request(app)
      .post("/v1/jobs")
      .set("Authorization", recruiterToken())
      .send({ ...validPayload, description: "court" });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("description");
  });

  it("PUT /jobs/:id met à jour l'offre", async () => {
    prismaMock.job.findUnique.mockResolvedValue(job);
    prismaMock.job.update.mockResolvedValue({ ...job, location: "Paris" });

    const res = await request(app)
      .put("/v1/jobs/j1")
      .set("Authorization", recruiterToken())
      .send({ location: "Paris" });

    expect(res.status).toBe(200);
    expect(res.body.data.location).toBe("Paris");
  });

  it("DELETE /jobs/:id supprime l'offre (ADMIN)", async () => {
    prismaMock.job.findUnique.mockResolvedValue(job);
    prismaMock.job.delete.mockResolvedValue(job);

    const res = await request(app)
      .delete("/v1/jobs/j1")
      .set("Authorization", adminToken());

    expect(res.status).toBe(200);
  });

  it("DELETE /jobs/:id retourne 404 si inconnue", async () => {
    prismaMock.job.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete("/v1/jobs/inconnu")
      .set("Authorization", adminToken());

    expect(res.status).toBe(404);
    expect(prismaMock.job.delete).not.toHaveBeenCalled();
  });
});
