import type { FastifyInstance } from "fastify";

import { sendError, sendSuccess } from "../lib/http.js";

export async function registerAIRoutes(app: FastifyInstance) {
  app.post("/v1/ai/transcribe", async (request, reply) => {
    try {
      const result = await app.aiService.transcribe(request.auth, request.body);
      return sendSuccess(request, reply, result);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  app.post("/v1/ai/extract", async (request, reply) => {
    try {
      const result = await app.aiService.extract(request.auth, request.body);
      return sendSuccess(request, reply, result);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  app.post("/v1/ai/draft", async (request, reply) => {
    try {
      const result = await app.aiService.draft(request.auth, request.body);
      return sendSuccess(request, reply, result);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
