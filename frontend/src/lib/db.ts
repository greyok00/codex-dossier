import Dexie, { type Table } from "dexie";

export interface StoredSession {
  id: "current";
  user: {
    id: string;
    email: string;
    display_name: string | null;
    photo_url: string | null;
  };
  session: {
    session_id: string;
    session_token: string;
    token_type: "Bearer";
    issued_at: string;
    expires_at: string;
  };
  updated_at: string;
}

export interface SettingRecord<T = unknown> {
  key: string;
  value: T;
  updated_at: string;
}

export interface IncidentRecord {
  id: string;
  title: string;
  status: "review";
  category: string | null;
  created_at: string;
  updated_at: string;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  place_id: string | null;
  place_name: string | null;
  place_phone: string | null;
  current_route_snapshot_id: string | null;
  current_draft_packet_id: string | null;
  current_submission_proof_id: string | null;
  current_export_evidence_id: string | null;
}

export interface EvidenceItemRecord {
  id: string;
  incident_id: string;
  type: "audio" | "transcript" | "export" | "proof";
  original: boolean;
  original_bytes: ArrayBuffer | null;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  integrity_status: "pending" | "verified" | "mismatch";
  captured_at: string;
  created_at: string;
  duration_ms: number | null;
  device_info_json: Record<string, unknown>;
  location_json: {
    lat: number | null;
    lng: number | null;
    address: string | null;
  };
  source_evidence_id: string | null;
}

export interface TranscriptRecord {
  id: string;
  incident_id: string;
  source_evidence_id: string;
  full_text: string;
  language: string | null;
  segment_count: number;
  model_metadata_json: Record<string, unknown>;
  warnings_json: string[];
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegmentRecord {
  id: string;
  transcript_id: string;
  incident_id: string;
  sequence: number;
  start_ms: number;
  end_ms: number;
  speaker_label: string | null;
  text: string;
  confidence: number | null;
}

export interface CustodyLogRecord {
  id: string;
  incident_id: string;
  evidence_item_id: string | null;
  action:
    | "evidence_created"
    | "transcript_created"
    | "facts_confirmed"
    | "route_selected"
    | "draft_approved"
    | "send_action_recorded"
    | "share_completed"
    | "export_created"
    | "proof_saved";
  actor: "user" | "system" | "ai";
  details_json: Record<string, unknown>;
  created_at: string;
}

export interface CaptureSummary {
  incident_id: string;
  evidence_id: string;
  sha256: string;
  captured_at: string;
  duration_ms: number;
  size_bytes: number;
}

export interface CaptureContext {
  incident: IncidentRecord;
  source_evidence: EvidenceItemRecord;
}

export interface TranscriptSummary {
  transcript: TranscriptRecord;
  transcript_evidence: EvidenceItemRecord | null;
  segments: TranscriptSegmentRecord[];
}

export interface FactTimelineItemRecord {
  time_label: string;
  description: string;
}

export interface FactSetRecord {
  id: string;
  incident_id: string;
  transcript_evidence_id: string;
  incident_type: string | null;
  people: string[];
  places: string[];
  businesses: string[];
  phones: string[];
  dates: string[];
  amounts: string[];
  timeline: FactTimelineItemRecord[];
  key_facts: string[];
  reviewed_by_user: boolean;
  confirmed_fields: string[];
  edited_fields: string[];
  model_metadata_json: Record<string, unknown>;
  warnings_json: string[];
  created_at: string;
  updated_at: string;
}

export interface FactSetSummary {
  fact_set: FactSetRecord;
}

export type RouteGroup = "Business" | "Local" | "State" | "Federal" | "Other";
export type RouteTrustLevel = "official" | "verified" | "directory" | "unconfirmed";

export interface RouteRecommendationRecord {
  id: string;
  incident_id: string;
  destination_id: string | null;
  destination_name_snapshot: string;
  destination_type_snapshot: string;
  route_group: RouteGroup;
  rank: number;
  reason: string;
  source_label: string;
  source_url: string | null;
  trust_level: RouteTrustLevel;
  last_verified_date: string | null;
  complaint_url: string | null;
  email: string | null;
  phone: string | null;
  mailing_address: string | null;
  intake_methods_snapshot: string[];
  required_documents_snapshot: string[];
  available_actions: string[];
  selected: boolean;
  created_at: string;
  updated_at: string;
}

export interface RouteRecommendationSummary {
  recommendations: RouteRecommendationRecord[];
}

export interface DraftPacketRecord {
  id: string;
  incident_id: string;
  route_recommendation_id: string;
  subject: string;
  body: string;
  attachment_labels: string[];
  approved: boolean;
  model_metadata_json: Record<string, unknown>;
  warnings_json: string[];
  created_at: string;
  updated_at: string;
}

export interface DraftPacketSummary {
  draft_packet: DraftPacketRecord;
}

export interface SubmissionProofRecord {
  id: string;
  incident_id: string;
  route_recommendation_id: string;
  method: "web_form" | "email" | "phone" | "mail" | "share";
  status: "attempted" | "sent" | "submitted" | "shared" | "called" | "saved";
  confirmation_number: string | null;
  notes: string | null;
  external_reference_url: string | null;
  attachment_labels: string[];
  created_at: string;
  updated_at: string;
}

export interface SubmissionProofSummary {
  submission_proof: SubmissionProofRecord;
}

export interface CaseFileSummary {
  incident: IncidentRecord;
  source_evidence: EvidenceItemRecord | null;
  transcript: TranscriptRecord | null;
  fact_set: FactSetRecord | null;
  routes: RouteRecommendationRecord[];
  draft_packet: DraftPacketRecord | null;
  submission_proof: SubmissionProofRecord | null;
  custody_log: CustodyLogRecord[];
  derived_evidence: EvidenceItemRecord[];
}

export class DossierDatabase extends Dexie {
  settings!: Table<SettingRecord, string>;
  sessions!: Table<StoredSession, string>;
  incidents!: Table<IncidentRecord, string>;
  evidence_items!: Table<EvidenceItemRecord, string>;
  transcripts!: Table<TranscriptRecord, string>;
  transcript_segments!: Table<TranscriptSegmentRecord, string>;
  fact_sets!: Table<FactSetRecord, string>;
  route_recommendations!: Table<RouteRecommendationRecord, string>;
  draft_packets!: Table<DraftPacketRecord, string>;
  submission_proofs!: Table<SubmissionProofRecord, string>;
  custody_log!: Table<CustodyLogRecord, string>;

  constructor(name = "dossier-mobile") {
    super(name);

    this.version(1).stores({
      settings: "key, updated_at",
      sessions: "id, updated_at",
      incidents: "id, created_at, updated_at, status",
      evidence_items: "id, incident_id, created_at, captured_at",
      custody_log: "id, incident_id, evidence_item_id, created_at, action",
    });

    this.version(2).stores({
      settings: "key, updated_at",
      sessions: "id, updated_at",
      incidents: "id, created_at, updated_at, status",
      evidence_items: "id, incident_id, created_at, captured_at, source_evidence_id",
      transcripts: "id, incident_id, source_evidence_id, created_at, updated_at",
      transcript_segments: "id, transcript_id, incident_id, sequence, start_ms",
      custody_log: "id, incident_id, evidence_item_id, created_at, action",
    });

    this.version(3).stores({
      settings: "key, updated_at",
      sessions: "id, updated_at",
      incidents: "id, created_at, updated_at, status",
      evidence_items: "id, incident_id, created_at, captured_at, source_evidence_id",
      transcripts: "id, incident_id, source_evidence_id, created_at, updated_at",
      transcript_segments: "id, transcript_id, incident_id, sequence, start_ms",
      fact_sets: "id, incident_id, transcript_evidence_id, created_at, updated_at, reviewed_by_user",
      custody_log: "id, incident_id, evidence_item_id, created_at, action",
    });

    this.version(4).stores({
      settings: "key, updated_at",
      sessions: "id, updated_at",
      incidents: "id, created_at, updated_at, status",
      evidence_items: "id, incident_id, created_at, captured_at, source_evidence_id",
      transcripts: "id, incident_id, source_evidence_id, created_at, updated_at",
      transcript_segments: "id, transcript_id, incident_id, sequence, start_ms",
      fact_sets: "id, incident_id, transcript_evidence_id, created_at, updated_at, reviewed_by_user",
      route_recommendations: "id, incident_id, route_group, selected, created_at, updated_at",
      custody_log: "id, incident_id, evidence_item_id, created_at, action",
    });

    this.version(5).stores({
      settings: "key, updated_at",
      sessions: "id, updated_at",
      incidents: "id, created_at, updated_at, status",
      evidence_items: "id, incident_id, created_at, captured_at, source_evidence_id, type",
      transcripts: "id, incident_id, source_evidence_id, created_at, updated_at",
      transcript_segments: "id, transcript_id, incident_id, sequence, start_ms",
      fact_sets: "id, incident_id, transcript_evidence_id, created_at, updated_at, reviewed_by_user",
      route_recommendations: "id, incident_id, route_group, selected, created_at, updated_at",
      draft_packets: "id, incident_id, route_recommendation_id, approved, created_at, updated_at",
      submission_proofs: "id, incident_id, route_recommendation_id, status, created_at, updated_at",
      custody_log: "id, incident_id, evidence_item_id, created_at, action",
    });
  }
}

export const database = new DossierDatabase();

const LOCK_HASH_KEY = "device_lock_hash";
const INSTALL_ID_KEY = "device_install_id";
const RECOVERY_EMAIL_KEY = "recovery_email";
const BIOMETRIC_ENABLED_KEY = "device_biometric_enabled";
const BIOMETRIC_CREDENTIAL_ID_KEY = "device_biometric_credential_id";
const REQUIRE_UNLOCK_ON_OPEN_KEY = "require_unlock_on_open";
const LOCAL_AI_PREPARED_AT_KEY = "local_ai_prepared_at";
const LOCAL_AI_MODEL_KEY = "local_ai_model";
const LAST_OPEN_PATH_KEY = "last_open_path";
const CLOUD_AI_ENABLED_KEY = "cloud_ai_enabled";
const QUICK_GUIDE_SEEN_KEY = "quick_guide_seen";
const CAPTURE_BRIEF_SEEN_KEY = "capture_brief_seen";
const DRAFT_WALKTHROUGH_SEEN_KEY = "draft_walkthrough_seen";
const FULL_APP_WALKTHROUGH_ENABLED_KEY = "full_app_walkthrough_enabled";
const DEMO_WALKTHROUGH_CASE_ID_KEY = "demo_walkthrough_case_id";

export interface BootstrapState {
  lock_hash: string | null;
  install_id: string;
  recovery_email: string | null;
  biometric_enabled: boolean;
  biometric_credential_id: string | null;
  require_unlock_on_open: boolean;
  local_ai_prepared_at: string | null;
  local_ai_model: string | null;
  last_open_path: string | null;
  cloud_ai_enabled: boolean;
  quick_guide_seen: boolean;
  capture_brief_seen: boolean;
  draft_walkthrough_seen: boolean;
  full_app_walkthrough_enabled: boolean;
}

export async function loadBootstrapState(db: DossierDatabase): Promise<BootstrapState> {
  const [
    lockHash,
    installId,
    recoveryEmail,
    biometricEnabled,
    biometricCredentialId,
    requireUnlockOnOpen,
    localAiPreparedAt,
    localAiModel,
    lastOpenPath,
    cloudAiEnabled,
    quickGuideSeen,
    captureBriefSeen,
    draftWalkthroughSeen,
    fullAppWalkthroughEnabled,
  ] =
    await Promise.all([
      getSetting<string>(db, LOCK_HASH_KEY),
      getSetting<string>(db, INSTALL_ID_KEY),
      getSetting<string>(db, RECOVERY_EMAIL_KEY),
      getSetting<boolean>(db, BIOMETRIC_ENABLED_KEY),
      getSetting<string>(db, BIOMETRIC_CREDENTIAL_ID_KEY),
      getSetting<boolean>(db, REQUIRE_UNLOCK_ON_OPEN_KEY),
      getSetting<string>(db, LOCAL_AI_PREPARED_AT_KEY),
      getSetting<string>(db, LOCAL_AI_MODEL_KEY),
      getSetting<string>(db, LAST_OPEN_PATH_KEY),
      getSetting<boolean>(db, CLOUD_AI_ENABLED_KEY),
      getSetting<boolean>(db, QUICK_GUIDE_SEEN_KEY),
      getSetting<boolean>(db, CAPTURE_BRIEF_SEEN_KEY),
      getSetting<boolean>(db, DRAFT_WALKTHROUGH_SEEN_KEY),
      getSetting<boolean>(db, FULL_APP_WALKTHROUGH_ENABLED_KEY),
    ]);

  const ensuredInstallId = installId ?? crypto.randomUUID();
  if (!installId) {
    await setSetting(db, INSTALL_ID_KEY, ensuredInstallId);
  }

  return {
    lock_hash: lockHash ?? null,
    install_id: ensuredInstallId,
    recovery_email: recoveryEmail ?? null,
    biometric_enabled: biometricEnabled ?? false,
    biometric_credential_id: biometricCredentialId ?? null,
    require_unlock_on_open: requireUnlockOnOpen ?? false,
    local_ai_prepared_at: localAiPreparedAt ?? null,
    local_ai_model: localAiModel ?? null,
    last_open_path: lastOpenPath ?? null,
    cloud_ai_enabled: cloudAiEnabled ?? false,
    quick_guide_seen: quickGuideSeen ?? false,
    capture_brief_seen: captureBriefSeen ?? false,
    draft_walkthrough_seen: draftWalkthroughSeen ?? false,
    full_app_walkthrough_enabled: fullAppWalkthroughEnabled ?? true,
  };
}

export async function setDeviceLockHash(db: DossierDatabase, lockHash: string) {
  await setSetting(db, LOCK_HASH_KEY, lockHash);
}

export async function getDeviceLockHash(db: DossierDatabase) {
  return getSetting<string>(db, LOCK_HASH_KEY);
}

export async function setRecoveryEmail(db: DossierDatabase, recoveryEmail: string | null) {
  await setSetting(db, RECOVERY_EMAIL_KEY, recoveryEmail);
}

export async function setBiometricPreference(db: DossierDatabase, biometricEnabled: boolean) {
  await setSetting(db, BIOMETRIC_ENABLED_KEY, biometricEnabled);
}

export async function setBiometricCredentialId(db: DossierDatabase, credentialId: string | null) {
  await setSetting(db, BIOMETRIC_CREDENTIAL_ID_KEY, credentialId);
}

export async function setRequireUnlockOnOpen(db: DossierDatabase, requireUnlockOnOpen: boolean) {
  await setSetting(db, REQUIRE_UNLOCK_ON_OPEN_KEY, requireUnlockOnOpen);
}

export async function setLocalAiPrepared(
  db: DossierDatabase,
  input: {
    prepared_at: string;
    model: string;
  },
) {
  await Promise.all([
    setSetting(db, LOCAL_AI_PREPARED_AT_KEY, input.prepared_at),
    setSetting(db, LOCAL_AI_MODEL_KEY, input.model),
  ]);
}

export async function setLastOpenPath(db: DossierDatabase, path: string) {
  await setSetting(db, LAST_OPEN_PATH_KEY, path);
}

export async function setCloudAiEnabled(db: DossierDatabase, cloudAiEnabled: boolean) {
  await setSetting(db, CLOUD_AI_ENABLED_KEY, cloudAiEnabled);
}

export async function setQuickGuideSeen(db: DossierDatabase, quickGuideSeen: boolean) {
  await setSetting(db, QUICK_GUIDE_SEEN_KEY, quickGuideSeen);
}

export async function setCaptureBriefSeen(db: DossierDatabase, captureBriefSeen: boolean) {
  await setSetting(db, CAPTURE_BRIEF_SEEN_KEY, captureBriefSeen);
}

export async function setDraftWalkthroughSeen(db: DossierDatabase, draftWalkthroughSeen: boolean) {
  await setSetting(db, DRAFT_WALKTHROUGH_SEEN_KEY, draftWalkthroughSeen);
}

export async function setFullAppWalkthroughEnabled(db: DossierDatabase, fullAppWalkthroughEnabled: boolean) {
  await setSetting(db, FULL_APP_WALKTHROUGH_ENABLED_KEY, fullAppWalkthroughEnabled);
}

export async function storeSession(db: DossierDatabase, session: StoredSession) {
  await db.sessions.put(session);
}

export async function clearSession(db: DossierDatabase) {
  await db.sessions.delete("current");
}

export async function listRecentIncidents(db: DossierDatabase, limit = 10) {
  return db.incidents.orderBy("created_at").reverse().limit(limit).toArray();
}

export async function ensureDemoWalkthroughCase(db: DossierDatabase): Promise<string> {
  const existingId = await getSetting<string>(db, DEMO_WALKTHROUGH_CASE_ID_KEY);
  if (existingId) {
    const existingIncident = await db.incidents.get(existingId);
    if (existingIncident) {
      return existingId;
    }
  }

  const now = new Date().toISOString();
  const incidentId = crypto.randomUUID();
  const sourceEvidenceId = crypto.randomUUID();
  const transcriptEvidenceId = crypto.randomUUID();
  const factSetId = crypto.randomUUID();
  const routeId = crypto.randomUUID();
  const draftId = crypto.randomUUID();
  const proofId = crypto.randomUUID();

  const transcriptText =
    "I was charged twice by Desert Market in Phoenix, Arizona. The manager refused to refund the $85 charge.";

  const incident: IncidentRecord = {
    id: incidentId,
    title: "Demo case: double charge at Desert Market",
    status: "review",
    category: "consumer_billing",
    created_at: now,
    updated_at: now,
    location_lat: 33.4484,
    location_lng: -112.074,
    location_address: "Phoenix, AZ 85004",
    place_id: "demo-place-desert-market",
    place_name: "Desert Market",
    place_phone: "(602) 555-0191",
    current_route_snapshot_id: routeId,
    current_draft_packet_id: draftId,
    current_submission_proof_id: proofId,
    current_export_evidence_id: null,
  };

  const sourceBytesText = "Demo source capture placeholder for walkthrough.";
  const sourceBytes = new TextEncoder().encode(sourceBytesText);
  const sourceBuffer = sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength);

  const sourceEvidence: EvidenceItemRecord = {
    id: sourceEvidenceId,
    incident_id: incidentId,
    type: "audio",
    original: true,
    original_bytes: sourceBuffer,
    mime_type: "audio/webm",
    size_bytes: sourceBytes.byteLength,
    sha256: "6b4f8e8de8f7c6f63f7d215aa4af7f50f6bc8c3866bf884f40f6d5d74457f706",
    integrity_status: "verified",
    captured_at: now,
    created_at: now,
    duration_ms: 9400,
    device_info_json: {
      platform: "web",
      app_version: "demo",
    },
    location_json: {
      lat: 33.4484,
      lng: -112.074,
      address: "Phoenix, AZ 85004",
    },
    source_evidence_id: null,
  };

  const transcript: TranscriptRecord = {
    id: transcriptEvidenceId,
    incident_id: incidentId,
    source_evidence_id: sourceEvidenceId,
    full_text: transcriptText,
    language: "en",
    segment_count: 2,
    model_metadata_json: {
      mode: "demo",
      model: "Xenova/whisper-tiny.en",
    },
    warnings_json: [],
    created_at: now,
    updated_at: now,
  };

  const transcriptEvidence: EvidenceItemRecord = {
    id: transcriptEvidenceId,
    incident_id: incidentId,
    type: "transcript",
    original: false,
    original_bytes: null,
    mime_type: "text/plain",
    size_bytes: new Blob([transcriptText]).size,
    sha256: "",
    integrity_status: "pending",
    captured_at: now,
    created_at: now,
    duration_ms: null,
    device_info_json: {},
    location_json: {
      lat: null,
      lng: null,
      address: null,
    },
    source_evidence_id: sourceEvidenceId,
  };

  const transcriptSegments: TranscriptSegmentRecord[] = [
    {
      id: `${transcriptEvidenceId}:0`,
      transcript_id: transcriptEvidenceId,
      incident_id: incidentId,
      sequence: 0,
      start_ms: 0,
      end_ms: 4200,
      speaker_label: "Speaker 1",
      text: "I was charged twice by Desert Market in Phoenix, Arizona.",
      confidence: 0.92,
    },
    {
      id: `${transcriptEvidenceId}:1`,
      transcript_id: transcriptEvidenceId,
      incident_id: incidentId,
      sequence: 1,
      start_ms: 4200,
      end_ms: 9400,
      speaker_label: "Speaker 1",
      text: "The manager refused to refund the $85 charge.",
      confidence: 0.9,
    },
  ];

  const factSet: FactSetRecord = {
    id: factSetId,
    incident_id: incidentId,
    transcript_evidence_id: transcriptEvidenceId,
    incident_type: "consumer_billing",
    people: ["Store manager"],
    places: ["Phoenix, AZ"],
    businesses: ["Desert Market"],
    phones: ["(602) 555-0191"],
    dates: [new Date(now).toLocaleDateString()],
    amounts: ["$85"],
    timeline: [
      { time_label: "00:00", description: "Witness reports double charge at Desert Market." },
      { time_label: "00:04", description: "Manager refused refund request for $85." },
    ],
    key_facts: [
      "Customer reports being charged twice at Desert Market.",
      "Requested refund of $85 was denied by store manager.",
    ],
    reviewed_by_user: true,
    confirmed_fields: ["incident_type", "businesses", "places", "amounts", "key_facts"],
    edited_fields: [],
    model_metadata_json: {
      mode: "demo",
      model: "deterministic-facts-v1",
    },
    warnings_json: [],
    created_at: now,
    updated_at: now,
  };

  const route: RouteRecommendationRecord = {
    id: routeId,
    incident_id: incidentId,
    destination_id: "az-ag-consumer-complaint",
    destination_name_snapshot: "Arizona Consumer Complaint",
    destination_type_snapshot: "gov_state",
    route_group: "State",
    rank: 1,
    reason: "State attorney general office handles consumer billing complaints for Arizona businesses.",
    source_label: "azag.gov",
    source_url: "https://consumer-complaint.azag.gov/",
    trust_level: "official",
    last_verified_date: new Date().toISOString().slice(0, 10),
    complaint_url: "https://consumer-complaint.azag.gov/",
    email: null,
    phone: "(602) 542-5763",
    mailing_address: "2005 N Central Ave, Phoenix, AZ 85004",
    intake_methods_snapshot: ["web_form", "phone"],
    required_documents_snapshot: ["Case summary", "Date and amount", "Proof packet"],
    available_actions: ["open_form", "call", "share", "export_pdf", "export_zip"],
    selected: true,
    created_at: now,
    updated_at: now,
  };

  const draft: DraftPacketRecord = {
    id: draftId,
    incident_id: incidentId,
    route_recommendation_id: routeId,
    subject: "Consumer billing complaint: Desert Market double charge",
    body:
      "I am filing a consumer billing complaint regarding Desert Market in Phoenix, Arizona.\n\n" +
      "On the date of incident, I was charged twice for one transaction. I immediately requested a refund of $85, but the manager refused.\n\n" +
      "I am requesting a review of this transaction and a refund of the duplicate charge. I have attached supporting details and evidence from my case packet.",
    attachment_labels: ["Source capture", "Transcript", "Confirmed facts", "Proof packet"],
    approved: true,
    model_metadata_json: {
      mode: "demo",
      model: "template-draft-v1",
    },
    warnings_json: [],
    created_at: now,
    updated_at: now,
  };

  const proof: SubmissionProofRecord = {
    id: proofId,
    incident_id: incidentId,
    route_recommendation_id: routeId,
    method: "web_form",
    status: "saved",
    confirmation_number: "DEMO-12345",
    notes: "Demo proof record for walkthrough.",
    external_reference_url: "https://consumer-complaint.azag.gov/",
    attachment_labels: ["Draft report", "Proof packet"],
    created_at: now,
    updated_at: now,
  };

  const custody: CustodyLogRecord[] = [
    {
      id: crypto.randomUUID(),
      incident_id: incidentId,
      evidence_item_id: sourceEvidenceId,
      action: "evidence_created",
      actor: "system",
      created_at: now,
      details_json: {
        event: "evidence_created",
        evidence_id: sourceEvidenceId,
      },
    },
    {
      id: crypto.randomUUID(),
      incident_id: incidentId,
      evidence_item_id: transcriptEvidenceId,
      action: "transcript_created",
      actor: "ai",
      created_at: now,
      details_json: {
        event: "transcript_created",
        transcript_evidence_id: transcriptEvidenceId,
      },
    },
    {
      id: crypto.randomUUID(),
      incident_id: incidentId,
      evidence_item_id: transcriptEvidenceId,
      action: "facts_confirmed",
      actor: "user",
      created_at: now,
      details_json: {
        event: "facts_confirmed",
        fact_set_id: factSetId,
      },
    },
  ];

  await db.transaction(
    "rw",
    [
      db.incidents,
      db.evidence_items,
      db.transcripts,
      db.transcript_segments,
      db.fact_sets,
      db.route_recommendations,
      db.draft_packets,
      db.submission_proofs,
      db.custody_log,
      db.settings,
    ],
    async () => {
      await db.incidents.put(incident);
      await db.evidence_items.bulkPut([sourceEvidence, transcriptEvidence]);
      await db.transcripts.put(transcript);
      await db.transcript_segments.bulkPut(transcriptSegments);
      await db.fact_sets.put(factSet);
      await db.route_recommendations.put(route);
      await db.draft_packets.put(draft);
      await db.submission_proofs.put(proof);
      await db.custody_log.bulkPut(custody);
      await setSetting(db, DEMO_WALKTHROUGH_CASE_ID_KEY, incidentId);
    },
  );

  return incidentId;
}

export async function deleteIncidentCase(db: DossierDatabase, incidentId: string) {
  await db.transaction(
    "rw",
    [
      db.incidents,
      db.evidence_items,
      db.transcripts,
      db.transcript_segments,
      db.fact_sets,
      db.route_recommendations,
      db.draft_packets,
      db.submission_proofs,
      db.custody_log,
    ],
    async () => {
      await Promise.all([
        db.evidence_items.where("incident_id").equals(incidentId).delete(),
        db.transcripts.where("incident_id").equals(incidentId).delete(),
        db.transcript_segments.where("incident_id").equals(incidentId).delete(),
        db.fact_sets.where("incident_id").equals(incidentId).delete(),
        db.route_recommendations.where("incident_id").equals(incidentId).delete(),
        db.draft_packets.where("incident_id").equals(incidentId).delete(),
        db.submission_proofs.where("incident_id").equals(incidentId).delete(),
        db.custody_log.where("incident_id").equals(incidentId).delete(),
      ]);
      await db.incidents.delete(incidentId);
    },
  );
}

export async function persistCapture(
  db: DossierDatabase,
  input: {
    original_bytes: ArrayBuffer;
    size_bytes: number;
    mime_type: string;
    duration_ms: number;
    sha256: string;
    device_info_json: Record<string, unknown>;
    location: {
      lat: number | null;
      lng: number | null;
      address: string | null;
    };
  },
) {
  const incidentId = crypto.randomUUID();
  const evidenceId = crypto.randomUUID();
  const logId = crypto.randomUUID();
  const capturedAt = new Date().toISOString();

  const incident: IncidentRecord = {
    id: incidentId,
    title: "Untitled case",
    status: "review",
    category: null,
    created_at: capturedAt,
    updated_at: capturedAt,
    location_lat: input.location.lat,
    location_lng: input.location.lng,
    location_address: input.location.address,
    place_id: null,
    place_name: null,
    place_phone: null,
    current_route_snapshot_id: null,
    current_draft_packet_id: null,
    current_submission_proof_id: null,
    current_export_evidence_id: null,
  };

  const evidence: EvidenceItemRecord = {
    id: evidenceId,
    incident_id: incidentId,
    type: "audio",
    original: true,
    original_bytes: input.original_bytes,
    mime_type: input.mime_type,
    size_bytes: input.size_bytes,
    sha256: input.sha256,
    integrity_status: "verified",
    captured_at: capturedAt,
    created_at: capturedAt,
    duration_ms: input.duration_ms,
    device_info_json: input.device_info_json,
    location_json: input.location,
    source_evidence_id: null,
  };

  const log: CustodyLogRecord = {
    id: logId,
    incident_id: incidentId,
    evidence_item_id: evidenceId,
    action: "evidence_created",
    actor: "system",
    created_at: capturedAt,
    details_json: {
      event: "evidence_created",
      evidence_id: evidenceId,
      evidence_type: "audio",
      original: true,
      integrity_status: "verified",
      sha256: input.sha256,
      captured_at: capturedAt,
      size_bytes: input.size_bytes,
      mime_type: input.mime_type,
      device_info: input.device_info_json,
      location: input.location,
    },
  };

  await db.transaction("rw", db.incidents, db.evidence_items, db.custody_log, async () => {
    await db.incidents.put(incident);
    await db.evidence_items.put(evidence);
    await db.custody_log.put(log);
  });

  return {
    incident_id: incidentId,
    evidence_id: evidenceId,
    sha256: input.sha256,
    captured_at: capturedAt,
    duration_ms: input.duration_ms,
    size_bytes: input.size_bytes,
  } satisfies CaptureSummary;
}

export async function getCaptureContext(db: DossierDatabase, incidentId: string): Promise<CaptureContext | null> {
  const incident = await db.incidents.get(incidentId);
  if (!incident) {
    return null;
  }

  const sourceEvidence = await db.evidence_items
    .where("incident_id")
    .equals(incidentId)
    .toArray()
    .then((records) =>
      records
        .filter((record) => record.type === "audio" && record.original)
        .sort((left, right) => right.captured_at.localeCompare(left.captured_at))
        .at(0) ?? null,
    );

  if (!sourceEvidence) {
    return null;
  }

  return {
    incident,
    source_evidence: sourceEvidence,
  };
}

export async function saveTranscript(
  db: DossierDatabase,
  input: {
    incident_id: string;
    transcript_evidence_id: string;
    source_evidence_id: string;
    full_text: string;
    language: string | null;
    segments: Array<{
      start_ms: number;
      end_ms: number;
      speaker_label: string | null;
      text: string;
      confidence: number | null;
    }>;
    model_metadata_json: Record<string, unknown>;
    warnings_json: string[];
  },
) {
  const createdAt = new Date().toISOString();
  const transcript: TranscriptRecord = {
    id: input.transcript_evidence_id,
    incident_id: input.incident_id,
    source_evidence_id: input.source_evidence_id,
    full_text: input.full_text,
    language: input.language,
    segment_count: input.segments.length,
    model_metadata_json: input.model_metadata_json,
    warnings_json: input.warnings_json,
    created_at: createdAt,
    updated_at: createdAt,
  };

  const transcriptEvidence: EvidenceItemRecord = {
    id: input.transcript_evidence_id,
    incident_id: input.incident_id,
    type: "transcript",
    original: false,
    original_bytes: null,
    mime_type: "text/plain",
    size_bytes: new Blob([input.full_text]).size,
    sha256: "",
    integrity_status: "pending",
    captured_at: createdAt,
    created_at: createdAt,
    duration_ms: null,
    device_info_json: {},
    location_json: {
      lat: null,
      lng: null,
      address: null,
    },
    source_evidence_id: input.source_evidence_id,
  };

  const averageConfidence =
    input.segments.length === 0
      ? 0
      : input.segments.reduce((total, segment) => total + (segment.confidence ?? 0), 0) / input.segments.length;

  const transcriptSegments: TranscriptSegmentRecord[] = input.segments.map((segment, index) => ({
    id: `${input.transcript_evidence_id}:${index}`,
    transcript_id: input.transcript_evidence_id,
    incident_id: input.incident_id,
    sequence: index,
    start_ms: segment.start_ms,
    end_ms: segment.end_ms,
    speaker_label: segment.speaker_label,
    text: segment.text,
    confidence: segment.confidence,
  }));

  const log: CustodyLogRecord = {
    id: crypto.randomUUID(),
    incident_id: input.incident_id,
    evidence_item_id: input.transcript_evidence_id,
    action: "transcript_created",
    actor: "ai",
    created_at: createdAt,
    details_json: {
      event: "transcript_created",
      evidence_id: input.transcript_evidence_id,
      transcript_evidence_id: input.transcript_evidence_id,
      source_evidence_id: input.source_evidence_id,
      segment_count: input.segments.length,
      model: String(input.model_metadata_json.model ?? ""),
      language: input.language,
      confidence_summary: {
        average: Number.isFinite(averageConfidence) ? averageConfidence : 0,
      },
    },
  };

  await db.transaction(
    "rw",
    [db.incidents, db.evidence_items, db.transcripts, db.transcript_segments, db.custody_log],
    async () => {
      await db.transcripts.put(transcript);
      await db.evidence_items.put(transcriptEvidence);
      await db.transcript_segments.bulkPut(transcriptSegments);

      const incident = await db.incidents.get(input.incident_id);
      if (incident) {
        await db.incidents.put({
          ...incident,
          updated_at: createdAt,
        });
      }

      await db.custody_log.put(log);
    },
  );

  return transcript;
}

export async function getTranscriptSummary(db: DossierDatabase, incidentId: string): Promise<TranscriptSummary | null> {
  const transcripts = await db.transcripts.where("incident_id").equals(incidentId).reverse().sortBy("created_at");
  const transcript = transcripts.at(-1) ?? null;
  if (!transcript) {
    return null;
  }

  const [transcriptEvidence, segments] = await Promise.all([
    db.evidence_items.get(transcript.id),
    db.transcript_segments.where("transcript_id").equals(transcript.id).sortBy("sequence"),
  ]);

  return {
    transcript,
    transcript_evidence: transcriptEvidence ?? null,
    segments,
  };
}

export async function saveFactSet(
  db: DossierDatabase,
  input: {
    incident_id: string;
    transcript_evidence_id: string;
    fact_set_id: string;
    incident_type: string | null;
    people: string[];
    places: string[];
    businesses: string[];
    phones: string[];
    dates: string[];
    amounts: string[];
    timeline: FactTimelineItemRecord[];
    key_facts: string[];
    reviewed_by_user: boolean;
    confirmed_fields: string[];
    edited_fields: string[];
    model_metadata_json: Record<string, unknown>;
    warnings_json: string[];
  },
) {
  const now = new Date().toISOString();
  const existing = await db.fact_sets.get(input.fact_set_id);

  const record: FactSetRecord = {
    id: input.fact_set_id,
    incident_id: input.incident_id,
    transcript_evidence_id: input.transcript_evidence_id,
    incident_type: input.incident_type,
    people: input.people,
    places: input.places,
    businesses: input.businesses,
    phones: input.phones,
    dates: input.dates,
    amounts: input.amounts,
    timeline: input.timeline,
    key_facts: input.key_facts,
    reviewed_by_user: input.reviewed_by_user,
    confirmed_fields: input.confirmed_fields,
    edited_fields: input.edited_fields,
    model_metadata_json: input.model_metadata_json,
    warnings_json: input.warnings_json,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  await db.transaction("rw", db.fact_sets, db.incidents, async () => {
    await db.fact_sets.put(record);

    const incident = await db.incidents.get(input.incident_id);
    if (incident) {
      await db.incidents.put({
        ...incident,
        category: input.incident_type,
        updated_at: now,
      });
    }
  });

  return record;
}

export async function getFactSetSummary(db: DossierDatabase, incidentId: string): Promise<FactSetSummary | null> {
  const records = await db.fact_sets.where("incident_id").equals(incidentId).reverse().sortBy("updated_at");
  const factSet = records.at(-1) ?? null;

  if (!factSet) {
    return null;
  }

  return {
    fact_set: factSet,
  };
}

export async function confirmFactSet(
  db: DossierDatabase,
  input: {
    incident_id: string;
    fact_set_id: string;
    incident_type: string | null;
    people: string[];
    places: string[];
    businesses: string[];
    phones: string[];
    dates: string[];
    amounts: string[];
    timeline: FactTimelineItemRecord[];
    key_facts: string[];
    confirmed_fields: string[];
    edited_fields: string[];
  },
) {
  const now = new Date().toISOString();
  const existing = await db.fact_sets.get(input.fact_set_id);
  if (!existing) {
    return null;
  }

  const updated: FactSetRecord = {
    ...existing,
    incident_type: input.incident_type,
    people: input.people,
    places: input.places,
    businesses: input.businesses,
    phones: input.phones,
    dates: input.dates,
    amounts: input.amounts,
    timeline: input.timeline,
    key_facts: input.key_facts,
    reviewed_by_user: true,
    confirmed_fields: input.confirmed_fields,
    edited_fields: input.edited_fields,
    updated_at: now,
  };

  const log: CustodyLogRecord = {
    id: crypto.randomUUID(),
    incident_id: input.incident_id,
    evidence_item_id: existing.transcript_evidence_id,
    action: "facts_confirmed",
    actor: "user",
    created_at: now,
    details_json: {
      event: "facts_confirmed",
      fact_set_id: input.fact_set_id,
      incident_type: input.incident_type,
      confirmed_fields: input.confirmed_fields,
      edited_fields: input.edited_fields,
      reviewed_by_user: true,
    },
  };

  await db.transaction("rw", db.fact_sets, db.incidents, db.custody_log, async () => {
    await db.fact_sets.put(updated);

    const incident = await db.incidents.get(input.incident_id);
    if (incident) {
      await db.incidents.put({
        ...incident,
        category: input.incident_type,
        updated_at: now,
      });
    }

    await db.custody_log.put(log);
  });

  return updated;
}

export async function saveRouteRecommendations(
  db: DossierDatabase,
  input: {
    incident_id: string;
    recommendations: Array<Omit<RouteRecommendationRecord, "created_at" | "updated_at">>;
  },
) {
  const now = new Date().toISOString();
  const hasSelected = input.recommendations.some((recommendation) => recommendation.selected);
  const records: RouteRecommendationRecord[] = input.recommendations.map((recommendation, index) => ({
    ...recommendation,
    selected: hasSelected ? recommendation.selected : false,
    created_at: now,
    updated_at: now,
  }));

  await db.transaction("rw", db.route_recommendations, db.incidents, async () => {
    await db.route_recommendations.where("incident_id").equals(input.incident_id).delete();
    if (records.length > 0) {
      await db.route_recommendations.bulkPut(records);
    }

    const incident = await db.incidents.get(input.incident_id);
    if (incident) {
      const selected = records.find((record) => record.selected) ?? records[0] ?? null;
      await db.incidents.put({
        ...incident,
        current_route_snapshot_id: selected?.id ?? null,
        updated_at: now,
      });
    }
  });

  return records;
}

export async function getRouteRecommendationSummary(
  db: DossierDatabase,
  incidentId: string,
): Promise<RouteRecommendationSummary | null> {
  const recommendations = await db.route_recommendations
    .where("incident_id")
    .equals(incidentId)
    .sortBy("created_at");

  if (recommendations.length === 0) {
    return null;
  }

  return {
    recommendations,
  };
}

export async function saveDraftPacket(
  db: DossierDatabase,
  input: {
    incident_id: string;
    route_recommendation_id: string;
    draft_packet_id: string;
    subject: string;
    body: string;
    attachment_labels: string[];
    approved: boolean;
    model_metadata_json: Record<string, unknown>;
    warnings_json: string[];
  },
) {
  const now = new Date().toISOString();
  const existing = await db.draft_packets.get(input.draft_packet_id);

  const record: DraftPacketRecord = {
    id: input.draft_packet_id,
    incident_id: input.incident_id,
    route_recommendation_id: input.route_recommendation_id,
    subject: input.subject,
    body: input.body,
    attachment_labels: input.attachment_labels,
    approved: input.approved,
    model_metadata_json: input.model_metadata_json,
    warnings_json: input.warnings_json,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  await db.transaction("rw", db.draft_packets, db.incidents, async () => {
    await db.draft_packets.put(record);

    const incident = await db.incidents.get(input.incident_id);
    if (incident) {
      await db.incidents.put({
        ...incident,
        current_draft_packet_id: record.id,
        updated_at: now,
      });
    }
  });

  return record;
}

export async function getDraftPacketSummary(db: DossierDatabase, incidentId: string): Promise<DraftPacketSummary | null> {
  const records = await db.draft_packets.where("incident_id").equals(incidentId).reverse().sortBy("updated_at");
  const draftPacket = records.at(-1) ?? null;

  if (!draftPacket) {
    return null;
  }

  return {
    draft_packet: draftPacket,
  };
}

export async function approveDraftPacket(
  db: DossierDatabase,
  input: {
    incident_id: string;
    draft_packet_id: string;
    subject: string;
    body: string;
    attachment_labels: string[];
  },
) {
  const now = new Date().toISOString();
  const existing = await db.draft_packets.get(input.draft_packet_id);
  if (!existing) {
    return null;
  }

  const updated: DraftPacketRecord = {
    ...existing,
    subject: input.subject,
    body: input.body,
    attachment_labels: input.attachment_labels,
    approved: true,
    updated_at: now,
  };

  await db.transaction("rw", db.draft_packets, db.incidents, db.custody_log, async () => {
    await db.draft_packets.put(updated);

    const incident = await db.incidents.get(input.incident_id);
    if (incident) {
      await db.incidents.put({
        ...incident,
        current_draft_packet_id: updated.id,
        updated_at: now,
      });
    }

    await db.custody_log.put({
      id: crypto.randomUUID(),
      incident_id: input.incident_id,
      evidence_item_id: null,
      action: "draft_approved",
      actor: "user",
      created_at: now,
      details_json: {
        event: "draft_approved",
        draft_packet_id: updated.id,
        subject: updated.subject,
        approved: true,
        attachment_labels: updated.attachment_labels,
      },
    });
  });

  return updated;
}

export async function saveSubmissionProof(
  db: DossierDatabase,
  input: {
    incident_id: string;
    route_recommendation_id: string;
    submission_proof_id: string;
    method: "web_form" | "email" | "phone" | "mail" | "share";
    status: "attempted" | "sent" | "submitted" | "shared" | "called" | "saved";
    confirmation_number: string | null;
    notes: string | null;
    external_reference_url: string | null;
    attachment_labels: string[];
  },
) {
  const now = new Date().toISOString();
  const existing = await db.submission_proofs.get(input.submission_proof_id);

  const record: SubmissionProofRecord = {
    id: input.submission_proof_id,
    incident_id: input.incident_id,
    route_recommendation_id: input.route_recommendation_id,
    method: input.method,
    status: input.status,
    confirmation_number: input.confirmation_number,
    notes: input.notes,
    external_reference_url: input.external_reference_url,
    attachment_labels: input.attachment_labels,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  const proofEvidenceId = existing?.id ?? crypto.randomUUID();
  const proofSummary = [
    `Method: ${record.method}`,
    `Status: ${record.status}`,
    `Confirmation: ${record.confirmation_number ?? ""}`,
    `Reference: ${record.external_reference_url ?? ""}`,
    `Notes: ${record.notes ?? ""}`,
  ].join("\n");
  const proofBytes = new TextEncoder().encode(proofSummary);
  const proofBuffer = proofBytes.buffer.slice(proofBytes.byteOffset, proofBytes.byteOffset + proofBytes.byteLength);

  await db.transaction(
    "rw",
    db.submission_proofs,
    db.evidence_items,
    db.incidents,
    db.custody_log,
    async () => {
      await db.submission_proofs.put(record);

      await db.evidence_items.put({
        id: proofEvidenceId,
        incident_id: input.incident_id,
        type: "proof",
        original: false,
        original_bytes: proofBuffer,
        mime_type: "text/plain",
        size_bytes: proofBytes.byteLength,
        sha256: "",
        integrity_status: "pending",
        captured_at: now,
        created_at: now,
        duration_ms: null,
        device_info_json: {},
        location_json: {
          lat: null,
          lng: null,
          address: null,
        },
        source_evidence_id: null,
      });

      const incident = await db.incidents.get(input.incident_id);
      if (incident) {
        await db.incidents.put({
          ...incident,
          current_submission_proof_id: record.id,
          updated_at: now,
        });
      }

      await db.custody_log.put({
        id: crypto.randomUUID(),
        incident_id: input.incident_id,
        evidence_item_id: proofEvidenceId,
        action: "proof_saved",
        actor: "user",
        created_at: now,
        details_json: {
          event: "proof_saved",
          submission_proof_id: record.id,
          method: record.method,
          status: record.status,
          confirmation_number: record.confirmation_number,
          external_reference_url: record.external_reference_url,
        },
      });
    },
  );

  return record;
}

export async function getSubmissionProofSummary(
  db: DossierDatabase,
  incidentId: string,
): Promise<SubmissionProofSummary | null> {
  const records = await db.submission_proofs.where("incident_id").equals(incidentId).reverse().sortBy("updated_at");
  const submissionProof = records.at(-1) ?? null;

  if (!submissionProof) {
    return null;
  }

  return {
    submission_proof: submissionProof,
  };
}

export async function recordSendAction(
  db: DossierDatabase,
  input: {
    incident_id: string;
    route_recommendation_id: string;
    method: "web_form" | "email" | "phone" | "mail" | "share";
    status: "attempted" | "sent" | "submitted" | "shared" | "called" | "saved";
    destination_name_snapshot: string;
    source_label: string;
    trust_level: RouteTrustLevel;
    external_reference_url: string | null;
  },
) {
  const now = new Date().toISOString();
  await db.custody_log.put({
    id: crypto.randomUUID(),
    incident_id: input.incident_id,
    evidence_item_id: null,
    action: "send_action_recorded",
    actor: "user",
    created_at: now,
    details_json: {
      event: "send_action_recorded",
      route_recommendation_id: input.route_recommendation_id,
      method: input.method,
      status: input.status,
      destination_name_snapshot: input.destination_name_snapshot,
      source_label: input.source_label,
      trust_level: input.trust_level,
      external_reference_url: input.external_reference_url,
    },
  });
}

export async function recordShareCompleted(
  db: DossierDatabase,
  input: {
    incident_id: string;
    route_recommendation_id: string;
    destination_name_snapshot: string;
    shared_items: string[];
  },
) {
  const now = new Date().toISOString();
  await db.custody_log.put({
    id: crypto.randomUUID(),
    incident_id: input.incident_id,
    evidence_item_id: null,
    action: "share_completed",
    actor: "user",
    created_at: now,
    details_json: {
      event: "share_completed",
      route_recommendation_id: input.route_recommendation_id,
      destination_name_snapshot: input.destination_name_snapshot,
      shared_items: input.shared_items,
    },
  });
}

export async function createExportEvidence(
  db: DossierDatabase,
  input: {
    incident_id: string;
    filename: string;
    mime_type: string;
    bytes: ArrayBuffer;
    route_recommendation_id: string | null;
    format: "pdf" | "zip";
  },
) {
  const now = new Date().toISOString();
  const evidenceId = crypto.randomUUID();

  await db.transaction("rw", db.evidence_items, db.incidents, db.custody_log, async () => {
    await db.evidence_items.put({
      id: evidenceId,
      incident_id: input.incident_id,
      type: "export",
      original: false,
      original_bytes: input.bytes,
      mime_type: input.mime_type,
      size_bytes: input.bytes.byteLength,
      sha256: "",
      integrity_status: "pending",
      captured_at: now,
      created_at: now,
      duration_ms: null,
      device_info_json: {
        filename: input.filename,
      },
      location_json: {
        lat: null,
        lng: null,
        address: null,
      },
      source_evidence_id: null,
    });

    const incident = await db.incidents.get(input.incident_id);
    if (incident) {
      await db.incidents.put({
        ...incident,
        current_export_evidence_id: evidenceId,
        updated_at: now,
      });
    }

    await db.custody_log.put({
      id: crypto.randomUUID(),
      incident_id: input.incident_id,
      evidence_item_id: evidenceId,
      action: "export_created",
      actor: "system",
      created_at: now,
      details_json: {
        event: "export_created",
        evidence_id: evidenceId,
        format: input.format,
        filename: input.filename,
        mime_type: input.mime_type,
        route_recommendation_id: input.route_recommendation_id,
      },
    });
  });

  return evidenceId;
}

export async function getCaseFileSummary(db: DossierDatabase, incidentId: string): Promise<CaseFileSummary | null> {
  const incident = await db.incidents.get(incidentId);
  if (!incident) {
    return null;
  }

  const [captureContext, transcriptSummary, factSetSummary, routeSummary, draftSummary, proofSummary, custodyLog, allEvidence] =
    await Promise.all([
      getCaptureContext(db, incidentId),
      getTranscriptSummary(db, incidentId),
      getFactSetSummary(db, incidentId),
      getRouteRecommendationSummary(db, incidentId),
      getDraftPacketSummary(db, incidentId),
      getSubmissionProofSummary(db, incidentId),
      db.custody_log.where("incident_id").equals(incidentId).sortBy("created_at"),
      db.evidence_items.where("incident_id").equals(incidentId).toArray(),
    ]);

  return {
    incident,
    source_evidence: captureContext?.source_evidence ?? null,
    transcript: transcriptSummary?.transcript ?? null,
    fact_set: factSetSummary?.fact_set ?? null,
    routes: routeSummary?.recommendations ?? [],
    draft_packet: draftSummary?.draft_packet ?? null,
    submission_proof: proofSummary?.submission_proof ?? null,
    custody_log: custodyLog,
    derived_evidence: allEvidence.filter((record) => !record.original),
  };
}

export async function selectRouteRecommendation(
  db: DossierDatabase,
  input: {
    incident_id: string;
    route_recommendation_id: string;
    selected?: boolean;
  },
) {
  const now = new Date().toISOString();
  const recommendations = await db.route_recommendations.where("incident_id").equals(input.incident_id).toArray();
  const selected = recommendations.find((record) => record.id === input.route_recommendation_id) ?? null;

  if (!selected) {
    return null;
  }

  const nextSelected = input.selected ?? true;

  await db.transaction("rw", db.route_recommendations, db.incidents, db.custody_log, async () => {
    await Promise.all(
      recommendations.map((record) =>
        db.route_recommendations.put({
          ...record,
          selected: nextSelected ? record.id === input.route_recommendation_id : false,
          updated_at: now,
        }),
      ),
    );

    const incident = await db.incidents.get(input.incident_id);
    if (incident) {
      await db.incidents.put({
        ...incident,
        current_route_snapshot_id: nextSelected ? selected.id : null,
        updated_at: now,
      });
    }

    await db.custody_log.put({
      id: crypto.randomUUID(),
      incident_id: input.incident_id,
      evidence_item_id: null,
      action: "route_selected",
      actor: "user",
      created_at: now,
        details_json: {
          event: "route_selected",
          route_snapshot_id: selected.id,
          destination_id: selected.destination_id,
          destination_name_snapshot: selected.destination_name_snapshot,
          destination_type_snapshot: selected.destination_type_snapshot,
          route_category: mapRouteGroupToCategory(selected.route_group),
          rank: selected.rank,
          source_url: selected.source_url,
          trust_level: selected.trust_level,
          selected: nextSelected,
          intake_methods_snapshot: selected.intake_methods_snapshot,
          required_documents_snapshot: selected.required_documents_snapshot,
        },
      });
  });

  return {
    ...selected,
    selected: nextSelected,
    updated_at: now,
  };
}

async function getSetting<T>(db: DossierDatabase, key: string) {
  const record = await db.settings.get(key);
  return (record?.value as T | undefined) ?? null;
}

async function setSetting<T>(db: DossierDatabase, key: string, value: T) {
  await db.settings.put({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
}

function mapRouteGroupToCategory(group: RouteGroup) {
  switch (group) {
    case "Business":
      return "Business";
    case "Local":
      return "Local";
    case "State":
      return "State";
    case "Federal":
      return "Federal";
    case "Other":
      return "Other verified routes";
  }
}
