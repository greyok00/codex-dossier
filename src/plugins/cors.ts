import type { FastifyInstance } from "fastify";

const ALLOWED_HEADERS = "Content-Type, Authorization, X-Internal-Registry-Key";
const ALLOWED_METHODS = "GET,POST,OPTIONS";

export async function registerCorsPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    applyCorsHeaders(reply, request.headers.origin);

    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    applyCorsHeaders(reply, request.headers.origin);
    return payload;
  });
}

function applyCorsHeaders(
  reply: {
    header(name: string, value: string): unknown;
  },
  origin: string | undefined,
) {
  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Origin", origin && origin.length > 0 ? origin : "*");
  reply.header("Access-Control-Allow-Methods", ALLOWED_METHODS);
  reply.header("Access-Control-Allow-Headers", ALLOWED_HEADERS);
}
