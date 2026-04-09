import type { FastifyInstance } from "fastify";

import { sendError } from "../lib/http.js";
import type { AuthService } from "../services/auth/service.js";
import type { RequestAuthContext } from "../services/auth/types.js";

declare module "fastify" {
  interface FastifyInstance {
    authService: AuthService;
  }

  interface FastifyRequest {
    auth: RequestAuthContext | null;
  }
}

function requiresBearerSession(pathname: string) {
  return pathname === "/v1/auth/session" || pathname === "/v1/auth/logout";
}

export async function registerAuthPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    request.auth = null;
    const routePath = request.routeOptions.url ?? request.raw.url ?? "";
    if (!requiresBearerSession(routePath)) {
      return;
    }

    try {
      request.auth = await app.authService.authenticateBearerToken(request.headers.authorization);
    } catch (error) {
      return sendError(request, reply, error);
    }
  });
}
