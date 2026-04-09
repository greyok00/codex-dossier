import type { FastifyInstance } from "fastify";

import { sendError, sendSuccess } from "../lib/http.js";

export async function registerRoutingRoutes(app: FastifyInstance) {
  app.post("/v1/routes/recommend", async (request, reply) => {
    try {
      const result = await app.routingService.recommendRoutes(request.body);
      return sendSuccess(request, reply, result);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  app.get("/v1/routes/:destinationId", async (request, reply) => {
    try {
      const result = await app.routingService.getDestinationDetail(request.params);
      return sendSuccess(request, reply, result);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
