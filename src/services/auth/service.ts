import { createHash, randomBytes } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { DatabaseError, ServiceUnavailableError, UnauthorizedError, ValidationError } from "../../lib/errors.js";
import { withTransaction } from "../../db/pool.js";
import type {
  AuthSessionData,
  DeviceContext,
  GoogleTokenVerifier,
  RequestAuthContext,
  SessionRecord,
} from "./types.js";

const deviceContextSchema = z.object({
  install_id: z.string().uuid(),
  platform: z.enum(["ios", "android", "web"]),
  app_version: z.string().min(1),
  user_agent: z.string().min(1),
});

const authGoogleRequestSchema = z.object({
  firebase_id_token: z.string().min(1),
  device: deviceContextSchema,
});

const logoutRequestSchema = z.object({
  all_sessions: z.boolean(),
});

interface SessionRow {
  user_id: string;
  google_sub: string;
  email: string;
  email_verified: boolean;
  display_name: string | null;
  photo_url: string | null;
  user_created_at: Date;
  last_login_at: Date;
  session_id: string;
  issued_at: Date;
  expires_at: Date;
}

export class AuthService {
  constructor(
    private readonly pool: Pool,
    private readonly googleTokenVerifier: GoogleTokenVerifier | null,
    private readonly sessionTtlHours = Number(process.env.SESSION_TTL_HOURS ?? "2"),
  ) {}

  async signInWithGoogle(rawRequest: unknown): Promise<AuthSessionData> {
    let request: z.infer<typeof authGoogleRequestSchema>;
    try {
      request = authGoogleRequestSchema.parse(rawRequest);
    } catch (error) {
      throw new ValidationError("Google sign-in request validation failed.", error);
    }
    if (!this.googleTokenVerifier) {
      throw new ServiceUnavailableError("Google sign-in is not configured on this backend.");
    }

    const identity = await this.googleTokenVerifier.verifyFirebaseIdToken(request.firebase_id_token);
    const sessionToken = randomBytes(32).toString("base64url");
    const sessionTokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + this.sessionTtlHours * 60 * 60 * 1000);

    const client = await this.pool.connect();
    try {
      return await withTransaction(client, async () => {
        const user = await upsertUser(client, identity);
        const session = await createSession(client, {
          userId: user.id,
          sessionTokenHash,
          expiresAt,
          device: request.device,
        });

        return {
          user: {
            id: user.id,
            google_sub: user.google_sub,
            email: user.email,
            email_verified: user.email_verified,
            display_name: user.display_name,
            photo_url: user.photo_url,
            created_at: user.created_at.toISOString(),
            last_login_at: user.last_login_at.toISOString(),
          },
          session: {
            session_id: session.session_id,
            token_type: "Bearer",
            session_token: sessionToken,
            issued_at: session.issued_at.toISOString(),
            expires_at: session.expires_at.toISOString(),
          },
        };
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof UnauthorizedError || error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new DatabaseError("Google sign-in failed.", error);
    } finally {
      client.release();
    }
  }

  async authenticateBearerToken(authorizationHeader?: string): Promise<RequestAuthContext> {
    const token = parseBearerToken(authorizationHeader);
    const tokenHash = hashSessionToken(token);
    const client = await this.pool.connect();
    try {
      const row = await lookupSession(client, tokenHash);
      if (!row) {
        throw new UnauthorizedError("Valid session required.");
      }

      await client.query(
        `
          UPDATE dossier_backend.app_session
          SET last_seen_at = now()
          WHERE id = $1::uuid
        `,
        [row.session_id],
      );

      return sessionRowToContext(row, token);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new DatabaseError("Session lookup failed.", error);
    } finally {
      client.release();
    }
  }

  async getCurrentSession(auth: RequestAuthContext): Promise<AuthSessionData> {
    return {
      user: auth.user,
      session: {
        session_id: auth.session.session_id,
        token_type: "Bearer",
        session_token: auth.session_token,
        issued_at: auth.session.issued_at,
        expires_at: auth.session.expires_at,
      },
    };
  }

  async logout(rawRequest: unknown, auth: RequestAuthContext) {
    let request: z.infer<typeof logoutRequestSchema>;
    try {
      request = logoutRequestSchema.parse(rawRequest);
    } catch (error) {
      throw new ValidationError("Logout request validation failed.", error);
    }
    const client = await this.pool.connect();
    try {
      await withTransaction(client, async () => {
        if (request.all_sessions) {
          await client.query(
            `
              UPDATE dossier_backend.app_session
              SET revoked_at = COALESCE(revoked_at, now())
              WHERE user_id = $1::uuid
                AND revoked_at IS NULL
            `,
            [auth.user.id],
          );
          return;
        }

        await client.query(
          `
            UPDATE dossier_backend.app_session
            SET revoked_at = COALESCE(revoked_at, now())
            WHERE id = $1::uuid
          `,
          [auth.session.session_id],
        );
      });

      return {
        logged_out: true as const,
        all_sessions: request.all_sessions,
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError("Logout failed.", error);
    } finally {
      client.release();
    }
  }
}

function parseBearerToken(authorizationHeader?: string) {
  if (!authorizationHeader) {
    throw new UnauthorizedError("Authorization header is required.");
  }
  const [tokenType, token] = authorizationHeader.split(" ");
  if (tokenType !== "Bearer" || !token) {
    throw new UnauthorizedError("Authorization header must use Bearer token format.");
  }
  return token;
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function upsertUser(client: PoolClient, identity: Awaited<ReturnType<GoogleTokenVerifier["verifyFirebaseIdToken"]>>) {
  const result = await client.query<{
    id: string;
    google_sub: string;
    email: string;
    email_verified: boolean;
    display_name: string | null;
    photo_url: string | null;
    created_at: Date;
    last_login_at: Date;
  }>(
    `
      INSERT INTO dossier_backend.app_user (
        google_sub,
        email,
        email_verified,
        display_name,
        photo_url,
        last_login_at
      )
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (google_sub) DO UPDATE SET
        email = EXCLUDED.email,
        email_verified = EXCLUDED.email_verified,
        display_name = EXCLUDED.display_name,
        photo_url = EXCLUDED.photo_url,
        last_login_at = now(),
        updated_at = now()
      RETURNING
        id,
        google_sub,
        email,
        email_verified,
        display_name,
        photo_url,
        created_at,
        last_login_at
    `,
    [
      identity.google_sub,
      identity.email,
      identity.email_verified,
      identity.display_name,
      identity.photo_url,
    ],
  );
  return result.rows[0]!;
}

async function createSession(
  client: PoolClient,
  input: {
    userId: string;
    sessionTokenHash: string;
    expiresAt: Date;
    device: DeviceContext;
  },
) {
  const result = await client.query<{
    session_id: string;
    issued_at: Date;
    expires_at: Date;
  }>(
    `
      INSERT INTO dossier_backend.app_session (
        user_id,
        session_token_hash,
        expires_at,
        device_install_id,
        platform,
        app_version,
        user_agent
      )
      VALUES ($1::uuid, $2, $3::timestamptz, $4::uuid, $5::dossier_enum.auth_platform_enum, $6, $7)
      RETURNING id AS session_id, issued_at, expires_at
    `,
    [
      input.userId,
      input.sessionTokenHash,
      input.expiresAt.toISOString(),
      input.device.install_id,
      input.device.platform,
      input.device.app_version,
      input.device.user_agent,
    ],
  );
  return result.rows[0]!;
}

async function lookupSession(client: PoolClient, sessionTokenHash: string): Promise<SessionRow | null> {
  const result = await client.query<SessionRow>(
    `
      SELECT
        u.id AS user_id,
        u.google_sub,
        u.email,
        u.email_verified,
        u.display_name,
        u.photo_url,
        u.created_at AS user_created_at,
        u.last_login_at,
        s.id AS session_id,
        s.issued_at,
        s.expires_at
      FROM dossier_backend.app_session s
      INNER JOIN dossier_backend.app_user u ON u.id = s.user_id
      WHERE s.session_token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
      LIMIT 1
    `,
    [sessionTokenHash],
  );
  return result.rows[0] ?? null;
}

function sessionRowToContext(row: SessionRow, sessionToken: string): RequestAuthContext {
  return {
    user: {
      id: row.user_id,
      google_sub: row.google_sub,
      email: row.email,
      email_verified: row.email_verified,
      display_name: row.display_name,
      photo_url: row.photo_url,
      created_at: row.user_created_at.toISOString(),
      last_login_at: row.last_login_at.toISOString(),
    },
    session: {
      session_id: row.session_id,
      token_type: "Bearer",
      session_token: sessionToken,
      issued_at: row.issued_at.toISOString(),
      expires_at: row.expires_at.toISOString(),
      user_id: row.user_id,
    },
    session_token: sessionToken,
  };
}
