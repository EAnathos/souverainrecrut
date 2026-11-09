import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

/**
 * Génère un en-tête Authorization valide pour un rôle donné.
 */
export const bearer = (role: Role, id = "user-1"): string =>
  `Bearer ${jwt.sign({ id, role }, "test-secret", { expiresIn: "1h" })}`;

export const adminToken = () => bearer(Role.ADMIN, "admin-1");

export const recruiterToken = () => bearer(Role.RECRUITER, "recruiter-1");
