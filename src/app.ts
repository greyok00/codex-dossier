import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";

import { registerCorsPlugin } from "./plugins/cors.js";
import { registerAuthPlugin } from "./plugins/auth.js";
import { registerAIRoutes } from "./routes/ai.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerInternalRegistryRoutes } from "./routes/internal-registry.js";
import { registerPublicRegistryRoutes } from "./routes/public-registry.js";
import { registerRoutingRoutes } from "./routes/routes.js";
import { registerSubmissionRoutes } from "./routes/submission.js";
import { registerVenueRoutes } from "./routes/venue.js";
import { AuthService } from "./services/auth/service.js";
import { createDefaultGoogleTokenVerifier } from "./services/auth/google-verifier.js";
import type { GoogleTokenVerifier } from "./services/auth/types.js";
import { DefaultAudioUploadResolver } from "./services/ai/audio-resolver.js";
import { createDefaultAIProvider } from "./services/ai/provider.js";
import { AIService } from "./services/ai/service.js";
import type { AIProvider, AudioUploadResolver } from "./services/ai/types.js";
import { PassiveRouteReasoningService, RoutingService, type RouteReasoningService } from "./services/routing/service.js";
import { SubmissionService } from "./services/submission/service.js";
import type { PlaceProvider } from "./services/venue/provider.js";
import { createDefaultPlaceProvider } from "./services/venue/provider.js";
import { VenueService } from "./services/venue/service.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Pool;
    authService: AuthService;
    internalRegistryApiKey: string | null;
    venueService: VenueService;
    routingService: RoutingService;
    aiService: AIService;
    submissionService: SubmissionService;
  }
}

export interface AppDependencies {
  googleTokenVerifier?: GoogleTokenVerifier | null;
  internalRegistryApiKey?: string | null;
  placeProvider?: PlaceProvider | null;
  routeReasoner?: RouteReasoningService | null;
  aiProvider?: AIProvider | null;
  audioUploadResolver?: AudioUploadResolver | null;
}

export function buildApp(db: Pool, dependencies: AppDependencies = {}): FastifyInstance {
  const app = Fastify({
    logger: false,
  });

  app.decorate("db", db);
  app.decorate(
    "authService",
    new AuthService(db, dependencies.googleTokenVerifier ?? createDefaultGoogleTokenVerifier()),
  );
  app.decorate("internalRegistryApiKey", dependencies.internalRegistryApiKey ?? process.env.INTERNAL_REGISTRY_API_KEY ?? null);
  app.decorate("venueService", new VenueService(db, dependencies.placeProvider ?? createDefaultPlaceProvider()));
  app.decorate("routingService", new RoutingService(db, dependencies.routeReasoner ?? new PassiveRouteReasoningService()));
  app.decorate(
    "aiService",
    new AIService(
      db,
      dependencies.aiProvider ?? createDefaultAIProvider(),
      dependencies.audioUploadResolver ?? new DefaultAudioUploadResolver(),
    ),
  );
  app.decorate("submissionService", new SubmissionService(db));
  void registerCorsPlugin(app);
  void registerAuthPlugin(app);
  void app.register(registerAuthRoutes);
  void app.register(registerHealthRoutes);
  void app.register(registerAIRoutes);
  void app.register(registerInternalRegistryRoutes);
  void app.register(registerPublicRegistryRoutes);
  void app.register(registerVenueRoutes);
  void app.register(registerRoutingRoutes);
  void app.register(registerSubmissionRoutes);

  return app;
}
