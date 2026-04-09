export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, details?: unknown) {
    super(401, "UNAUTHORIZED", message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, details?: unknown) {
    super(403, "FORBIDDEN", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: unknown) {
    super(404, "NOT_FOUND", message, details);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, "UNPROCESSABLE_ENTITY", message, details);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: unknown) {
    super(500, "DATABASE_ERROR", message, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string, details?: unknown) {
    super(503, "SERVICE_UNAVAILABLE", message, details);
  }
}
