import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createPool } from "../src/db/pool.js";
import { buildApp } from "../src/app.js";
import type { GoogleTokenVerifier } from "../src/services/auth/types.js";
import { countTable, resetTestDatabase } from "./helpers/test-db.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  test("registry integration tests require TEST_DATABASE_URL", { skip: true }, () => {});
} else {
  test.describe("registry integration", { concurrency: false }, () => {
    const pool = createPool({ connectionString: testDatabaseUrl });
    const fakeGoogleTokenVerifier: GoogleTokenVerifier = {
      async verifyFirebaseIdToken(firebaseIdToken) {
        if (firebaseIdToken !== "test-firebase-id-token") {
          throw new Error("unexpected test token");
        }
        return {
          google_sub: "google-sub-test",
          email: "reviewer@example.com",
          email_verified: true,
          display_name: "Alex Grey",
          photo_url: "https://example.com/photo.jpg",
        };
      },
    };
    const app = buildApp(pool, {
      googleTokenVerifier: fakeGoogleTokenVerifier,
      internalRegistryApiKey: "test-internal-key",
    });
    const compiledBundlePath = "/home/grey/codex-dossier/generated/routing-registry/routing_registry_compiled_bundle.json";
    const jsonExamplePath = "/home/grey/codex-dossier/docs/routing-seed-pack/routing_registry_import_example.json";
    const internalHeaders = {
      "x-internal-registry-key": "test-internal-key",
    };

    async function login() {
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/google",
        payload: {
          firebase_id_token: "test-firebase-id-token",
          device: {
            install_id: "4f6f39e0-c365-4c9e-9a19-18cd29d3d9a0",
            platform: "ios",
            app_version: "0.1.0",
            user_agent: "integration-test",
          },
        },
      });
      assert.equal(response.statusCode, 200);
      return response.json().data.session.session_token as string;
    }

    test.before(async () => {
      await app.ready();
    });

    test.after(async () => {
      await app.close();
      await pool.end();
    });

    test.beforeEach(async () => {
      await resetTestDatabase(pool);
    });

    test("clean import into empty DB", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/internal/registry/import",
      headers: internalHeaders,
      payload: {
        compiled_bundle_path: compiledBundlePath,
      },
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.data.accepted.destinations, 60);
    assert.equal(await countTable(pool, "dossier_backend.destination"), 60);
    assert.equal(await countTable(pool, "dossier_backend.destination_intake"), 60);
    assert.equal(await countTable(pool, "dossier_backend.destination_rule"), 60);
    assert.equal(await countTable(pool, "dossier_backend.verification_record"), 60);
    });

    test("idempotent re-import does not duplicate canonical destinations", async () => {
    for (let index = 0; index < 2; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/internal/registry/import",
        headers: internalHeaders,
        payload: {
          compiled_bundle_path: compiledBundlePath,
        },
      });
      assert.equal(response.statusCode, 200);
    }

    const destinationCount = await countTable(pool, "dossier_backend.destination");
    const canonicalCountResult = await pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM (
        SELECT destination_name, destination_type, COALESCE(jurisdiction_state, ''), COALESCE(jurisdiction_county, ''), COALESCE(jurisdiction_city, ''), source_url
        FROM dossier_backend.destination
        GROUP BY 1, 2, 3, 4, 5, 6
      ) grouped
    `);

    assert.equal(destinationCount, 60);
    assert.equal(Number(canonicalCountResult.rows[0]?.count ?? "0"), 60);
    assert.equal(await countTable(pool, "dossier_backend.destination_intake"), 60);
    assert.equal(await countTable(pool, "dossier_backend.destination_rule"), 60);
    assert.equal(await countTable(pool, "dossier_backend.verification_record"), 60);
    });

    test("invalid enum value fails", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "dossier-invalid-enum-"));
    try {
      const bundle = JSON.parse(await readFile(compiledBundlePath, "utf8"));
      bundle.destinations[0].destination.destination_type = "bad_type";
      const invalidPath = join(tempDir, "invalid-enum.json");
      await writeFile(invalidPath, JSON.stringify(bundle, null, 2));

      const response = await app.inject({
        method: "POST",
        url: "/internal/registry/import",
        headers: internalHeaders,
        payload: {
          compiled_bundle_path: invalidPath,
        },
      });

      assert.equal(response.statusCode, 400);
      assert.equal(await countTable(pool, "dossier_backend.destination"), 0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
    });

    test("intake row with no contact path fails", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "dossier-invalid-intake-"));
    try {
      const bundle = JSON.parse(await readFile(compiledBundlePath, "utf8"));
      bundle.destinations[0].intakes[0].complaint_url = null;
      bundle.destinations[0].intakes[0].email = null;
      bundle.destinations[0].intakes[0].phone = null;
      bundle.destinations[0].intakes[0].mailing_address_json = null;
      const invalidPath = join(tempDir, "invalid-intake.json");
      await writeFile(invalidPath, JSON.stringify(bundle, null, 2));

      const response = await app.inject({
        method: "POST",
        url: "/internal/registry/import",
        headers: internalHeaders,
        payload: {
          compiled_bundle_path: invalidPath,
        },
      });

      assert.equal(response.statusCode, 400);
      assert.equal(await countTable(pool, "dossier_backend.destination"), 0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
    });

    test("malformed JSON list fields fail", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "dossier-invalid-list-"));
    try {
      const bundle = JSON.parse(await readFile(compiledBundlePath, "utf8"));
      bundle.destinations[0].destination.categories_handled_json = "consumer_billing";
      const invalidPath = join(tempDir, "invalid-list.json");
      await writeFile(invalidPath, JSON.stringify(bundle, null, 2));

      const response = await app.inject({
        method: "POST",
        url: "/internal/registry/import",
        headers: internalHeaders,
        payload: {
          compiled_bundle_path: invalidPath,
        },
      });

      assert.equal(response.statusCode, 400);
      assert.equal(await countTable(pool, "dossier_backend.destination"), 0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
    });

    test("multi-intake destination remains one destination with multiple intake rows", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/internal/registry/import",
      headers: internalHeaders,
      payload: {
        seed_inputs: [jsonExamplePath],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(await countTable(pool, "dossier_backend.destination"), 1);
    assert.equal(await countTable(pool, "dossier_backend.destination_intake"), 2);
    });

    test("verification records link to the correct destination", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/internal/registry/import",
      headers: internalHeaders,
      payload: {
        seed_inputs: [jsonExamplePath],
      },
    });

    assert.equal(response.statusCode, 200);
    const linkage = await pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM dossier_backend.verification_record vr
      INNER JOIN dossier_backend.destination d ON d.id = vr.destination_id
    `);
    assert.equal(Number(linkage.rows[0]?.count ?? "0"), 1);
    });

    test("POST /internal/registry/verify writes a verification record for an existing destination", async () => {
    const importResponse = await app.inject({
      method: "POST",
      url: "/internal/registry/import",
      headers: internalHeaders,
      payload: {
        seed_inputs: [jsonExamplePath],
      },
    });
    assert.equal(importResponse.statusCode, 200);

    const destinationRow = await pool.query<{ id: string; source_url: string }>(`
      SELECT id, source_url
      FROM dossier_backend.destination
      LIMIT 1
    `);
    const destination = destinationRow.rows[0];
    assert.ok(destination);

    const verifyResponse = await app.inject({
      method: "POST",
      url: "/internal/registry/verify",
      headers: internalHeaders,
      payload: {
        destination_id: destination.id,
        source_url: destination.source_url,
        checked_at: "2026-04-08T00:00:00Z",
        result: "verified",
        change_summary: "Operator re-check completed.",
        checked_by: "integration_test",
        next_review_due: "2026-05-08T00:00:00Z",
      },
    });

    assert.equal(verifyResponse.statusCode, 200);
    assert.equal(await countTable(pool, "dossier_backend.verification_record"), 2);
    });

    test("GET /v1/registry/version returns current metadata after import", async () => {
    const sessionToken = await login();
    const importResponse = await app.inject({
      method: "POST",
      url: "/internal/registry/import",
      headers: internalHeaders,
      payload: {
        compiled_bundle_path: compiledBundlePath,
      },
    });
    assert.equal(importResponse.statusCode, 200);

    const response = await app.inject({
      method: "GET",
      url: "/v1/registry/version",
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.data.destination_count, 60);
    assert.equal(payload.data.verification_window_end, "2026-04-07");
    assert.match(payload.data.registry_version, /^2026\.04\.07\.60$/);
    });

    test("public registry version route is available without a session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/registry/version",
    });

    assert.equal(response.statusCode, 200);
    });

    test("auth session returns the current user and session", async () => {
    const sessionToken = await login();

    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.data.user.email, "reviewer@example.com");
    assert.equal(payload.data.session.session_token, sessionToken);
    });

    test("logout revokes the current session", async () => {
    const sessionToken = await login();

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        all_sessions: false,
      },
    });
    assert.equal(logoutResponse.statusCode, 200);

    const sessionResponse = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    });
    assert.equal(sessionResponse.statusCode, 401);
    });

    test("internal registry routes require the operator key", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/internal/registry/import",
      payload: {
        compiled_bundle_path: compiledBundlePath,
      },
    });

    assert.equal(response.statusCode, 403);
    });
  });
}
