import request from "supertest";
import { Application, ApplicationStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import app from "../src/app";
import { ApplicationService } from "../src/services/application.service";
import { prismaMock } from "./helpers/prisma.mock";
import { adminToken, recruiterToken } from "./helpers/auth";

const application = {
  id: "a1",
  candidateId: "c1",
  jobId: "j1",
  status: ApplicationStatus.PENDING,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
} as Application;

describe("Candidatures", () => {
  it("GET /applications retourne une liste paginée", async () => {
    prismaMock.application.findMany.mockResolvedValue([application]);
    prismaMock.application.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/v1/applications")
      .set("Authorization", recruiterToken());

    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe("PENDING");
  });

  it("GET /applications/:id retourne la candidature", async () => {
    prismaMock.application.findUnique.mockResolvedValue(application);

    const res = await request(app)
      .get("/v1/applications/a1")
      .set("Authorization", recruiterToken());

    expect(res.status).toBe(200);
  });

  it("GET /applications/:id retourne 404 si inconnue", async () => {
    prismaMock.application.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/v1/applications/inconnu")
      .set("Authorization", recruiterToken());

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Candidature introuvable.");
  });

  it("POST /applications crée une candidature", async () => {
    prismaMock.application.create.mockResolvedValue(application);

    const res = await request(app)
      .post("/v1/applications")
      .set("Authorization", recruiterToken())
      .send({ candidateId: "c1", jobId: "j1" });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe("a1");
  });

  it("POST /applications refuse un statut inconnu (400)", async () => {
    const res = await request(app)
      .post("/v1/applications")
      .set("Authorization", recruiterToken())
      .send({ candidateId: "c1", jobId: "j1", status: "HIRED" });

    expect(res.status).toBe(400);
  });

  it("PUT /applications/:id change le statut", async () => {
    prismaMock.application.findUnique.mockResolvedValue(application);
    prismaMock.application.update.mockResolvedValue({
      ...application,
      status: ApplicationStatus.ACCEPTED,
    });

    const res = await request(app)
      .put("/v1/applications/a1")
      .set("Authorization", recruiterToken())
      .send({ status: "ACCEPTED" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ACCEPTED");
  });

  it("DELETE /applications/:id supprime la candidature (ADMIN)", async () => {
    prismaMock.application.findUnique.mockResolvedValue(application);
    prismaMock.application.delete.mockResolvedValue(application);

    const res = await request(app)
      .delete("/v1/applications/a1")
      .set("Authorization", adminToken());

    expect(res.status).toBe(200);
  });

  it("ApplicationService.updateStatus met à jour uniquement le statut", async () => {
    prismaMock.application.findUnique.mockResolvedValue(application);
    prismaMock.application.update.mockResolvedValue({
      ...application,
      status: ApplicationStatus.REJECTED,
    });

    const result = await new ApplicationService().updateStatus(
      "a1",
      ApplicationStatus.REJECTED
    );

    expect(result.status).toBe(ApplicationStatus.REJECTED);
    expect(prismaMock.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1" },
        data: { status: ApplicationStatus.REJECTED },
      })
    );
  });
});
