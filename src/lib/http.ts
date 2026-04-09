import type { FastifyReply, FastifyRequest } from "fastify";

import { AppError } from "./errors.js";

export function sendSuccess<T>(request: FastifyRequest, reply: FastifyReply, data: T, statusCode = 200) {
  return reply.status(statusCode).send({
    ok: true,
    request_id: request.id,
    data,
  });
}

export function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      ok: false,
      request_id: request.id,
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
    });
  }

  return reply.status(500).send({
    ok: false,
    request_id: request.id,
    error: {
      code: "INTERNAL_ERROR",
      message: "An internal error occurred.",
      details: null,
    },
  });
}
