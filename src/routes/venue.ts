import type { FastifyInstance } from "fastify";

import { sendError, sendSuccess } from "../lib/http.js";

export async function registerVenueRoutes(app: FastifyInstance) {
  app.post("/v1/venue/match", async (request, reply) => {
    try {
      const result = await app.venueService.matchVenue(request.body);
      return sendSuccess(request, reply, result);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
