import type { FastifyInstance } from "fastify";

import { sendError, sendSuccess } from "../lib/http.js";
import { getRegistryVersion } from "../services/registry/version-service.js";

export async function registerPublicRegistryRoutes(app: FastifyInstance) {
  app.get("/v1/registry/version", async (request, reply) => {
    try {
      const version = await getRegistryVersion(app.db);
      return sendSuccess(request, reply, version);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
