export type AuthPlatform = "ios" | "android" | "web";

export interface DeviceContext {
  install_id: string;
  platform: AuthPlatform;
  app_version: string;
  user_agent: string;
}

export interface VerifiedGoogleIdentity {
  google_sub: string;
  email: string;
  email_verified: boolean;
  display_name: string | null;
  photo_url: string | null;
}

export interface GoogleTokenVerifier {
  verifyFirebaseIdToken(firebaseIdToken: string): Promise<VerifiedGoogleIdentity>;
}

export interface AuthenticatedUser {
  id: string;
  google_sub: string;
  email: string;
  email_verified: boolean;
  display_name: string | null;
  photo_url: string | null;
  created_at: string;
  last_login_at: string;
}

export interface AuthenticatedSession {
  session_id: string;
  token_type: "Bearer";
  session_token: string;
  issued_at: string;
  expires_at: string;
}

export interface AuthSessionData {
  user: AuthenticatedUser;
  session: AuthenticatedSession;
}

export interface SessionRecord extends AuthSessionData {
  user: AuthenticatedUser;
  session: AuthenticatedSession & {
    user_id: string;
  };
}

export interface RequestAuthContext {
  user: AuthenticatedUser;
  session: AuthenticatedSession & {
    user_id: string;
  };
  session_token: string;
}
