import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/v1/health", async () => {
    return {
      ok: true,
      data: {
        service: "dossier-backend",
        status: "up",
        timestamp: new Date().toISOString(),
      },
    };
  });
}
