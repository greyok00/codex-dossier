import type { FastifyInstance } from "fastify";

import { ForbiddenError, ServiceUnavailableError } from "../lib/errors.js";
import { sendError, sendSuccess } from "../lib/http.js";
import { RoutingRegistryImportService } from "../services/registry/import-service.js";

export async function registerInternalRegistryRoutes(app: FastifyInstance) {
  const service = new RoutingRegistryImportService(app.db);

  app.addHook("preHandler", async (request, reply) => {
    try {
      if (!app.internalRegistryApiKey) {
        throw new ServiceUnavailableError("Internal registry API key is not configured.");
      }
      const requestKey = request.headers["x-internal-registry-key"];
      if (requestKey !== app.internalRegistryApiKey) {
        throw new ForbiddenError("Valid internal registry key required.");
      }
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  app.post("/internal/registry/import", async (request, reply) => {
    try {
      const result = await service.importFromRequest(request.body);
      return sendSuccess(request, reply, result);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });

  app.post("/internal/registry/verify", async (request, reply) => {
    try {
      const result = await service.verifyDestination(request.body);
      return sendSuccess(request, reply, result);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
