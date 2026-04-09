import type { FastifyInstance } from "fastify";

import { UnauthorizedError } from "../lib/errors.js";
import { sendError, sendSuccess } from "../lib/http.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/v1/auth/google", async (request, reply) => {
    try {
      const data = await app.authService.signInWithGoogle(request.body);
      return sendSuccess(request, reply, data);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  app.get("/v1/auth/session", async (request, reply) => {
    try {
      if (!request.auth) {
        throw new UnauthorizedError("Valid session required.");
      }
      const data = await app.authService.getCurrentSession(request.auth);
      return sendSuccess(request, reply, data);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    try {
      if (!request.auth) {
        throw new UnauthorizedError("Valid session required.");
      }
      const data = await app.authService.logout(request.body, request.auth);
      return sendSuccess(request, reply, data);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
