import type { FastifyInstance } from "fastify";

import { sendError, sendSuccess } from "../lib/http.js";

export async function registerSubmissionRoutes(app: FastifyInstance) {
  app.post("/v1/submission/email-preview", async (request, reply) => {
    try {
      const result = await app.submissionService.buildEmailPreview(request.auth, request.body);
      return sendSuccess(request, reply, result);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  app.post("/v1/submission/record-action", async (request, reply) => {
    try {
      const result = await app.submissionService.recordAction(request.auth, request.body);
      return sendSuccess(request, reply, result);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
