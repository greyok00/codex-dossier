import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { ServiceUnavailableError, UnauthorizedError } from "../../lib/errors.js";
import type { GoogleTokenVerifier, VerifiedGoogleIdentity } from "./types.js";

function getFirebaseApp() {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    return initializeApp({
      credential: cert(JSON.parse(serviceAccountJson)),
    });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID) {
    const options: { credential: ReturnType<typeof applicationDefault>; projectId?: string } = {
      credential: applicationDefault(),
    };
    if (process.env.FIREBASE_PROJECT_ID) {
      options.projectId = process.env.FIREBASE_PROJECT_ID;
    }
    return initializeApp(options);
  }

  throw new ServiceUnavailableError("Firebase Admin is not configured.");
}

export class FirebaseGoogleTokenVerifier implements GoogleTokenVerifier {
  async verifyFirebaseIdToken(firebaseIdToken: string): Promise<VerifiedGoogleIdentity> {
    try {
      const decoded = await getAuth(getFirebaseApp()).verifyIdToken(firebaseIdToken);
      const googleIdentity =
        decoded.firebase?.identities?.["google.com"]?.[0] ??
        decoded.firebase?.identities?.google?.[0] ??
        decoded.sub;

      if (!googleIdentity || !decoded.email) {
        throw new UnauthorizedError("Firebase token is missing required Google identity fields.");
      }

      return {
        google_sub: googleIdentity,
        email: decoded.email,
        email_verified: Boolean(decoded.email_verified),
        display_name: decoded.name ?? null,
        photo_url: decoded.picture ?? null,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableError || error instanceof UnauthorizedError) {
        throw error;
      }
      throw new UnauthorizedError("Firebase token verification failed.", error);
    }
  }
}

export function createDefaultGoogleTokenVerifier() {
  try {
    return new FirebaseGoogleTokenVerifier();
  } catch {
    return null;
  }
}
