# Dossier Frontend Type Map

Status: Review artifact
Last updated: 2026-04-07
Source contracts:

- `/home/grey/codex-dossier/docs/TECH_SPEC.md`
- `/home/grey/codex-dossier/docs/OPENAPI.json`
- `/home/grey/codex-dossier/docs/SCHEMA.sql`

This document defines the canonical frontend type system for Dossier before application code is written. It maps public API contracts, local-first storage records, custody events, route cards, and screen states into implementation-safe frontend types.

## 1. Type System Rules

- Keep enum values identical to the product spec and OpenAPI contract.
- Keep API DTOs separate from local store records.
- Keep raw route/source/trust fields explicit.
- Keep originals and derived artifacts separate in types.
- Keep nullability exact. Do not collapse `null` into empty strings.
- Treat `/v1/routes/{destinationId}` as the OpenAPI translation of the spec notation `/v1/routes/:destinationId`.

## 2. Scalar Aliases

```ts
type Uuid = string;
type IsoDatetime = string;
type IsoDate = string;
type UrlString = string;
type EmailString = string;
type Sha256Hex = string;
type JsonObject = Record<string, unknown>;
```

## 3. Shared Enums

```ts
type AuthPlatform = 'ios' | 'android' | 'web';

type DestinationType =
  | 'business'
  | 'corporate'
  | 'local_agency'
  | 'state_agency'
  | 'federal_agency'
  | 'regulator'
  | 'law_enforcement'
  | 'consumer_org'
  | 'other';

type IntakeMethod =
  | 'web_form'
  | 'email'
  | 'phone'
  | 'mail'
  | 'portal'
  | 'in_person';

type TrustLevel = 'official' | 'verified' | 'directory' | 'unconfirmed';

type IncidentStatus =
  | 'capturing'
  | 'review'
  | 'drafting'
  | 'ready_to_send'
  | 'sent_or_handed_off'
  | 'closed';

type EvidenceItemType =
  | 'audio'
  | 'upload'
  | 'transcript'
  | 'draft'
  | 'export'
  | 'proof';

type IntegrityStatus = 'pending' | 'verified' | 'mismatch';

type CustodyActor = 'user' | 'system' | 'ai';

type CustodyAction =
  | 'evidence_created'
  | 'transcript_created'
  | 'facts_confirmed'
  | 'route_selected'
  | 'draft_approved'
  | 'send_action_recorded'
  | 'share_completed'
  | 'export_created'
  | 'proof_saved';

type SubmissionMethod = 'web_form' | 'email' | 'phone' | 'mail' | 'share';

type SubmissionStatus =
  | 'attempted'
  | 'sent'
  | 'submitted'
  | 'shared'
  | 'called'
  | 'saved';

type RouteCategory =
  | 'Business'
  | 'Local'
  | 'State'
  | 'Federal'
  | 'Other verified routes';

type AiPurpose = 'transcribe' | 'extract' | 'draft' | 'route_reasoning';
```

## 4. API Envelope Types

```ts
type ApiSuccess<T> = {
  ok: true;
  request_id: string;
  data: T;
};

type ApiError = {
  ok: false;
  request_id: string;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details: Record<string, unknown>;
  };
};

type ApiResult<T> = ApiSuccess<T> | ApiError;
```

## 5. Shared API DTOs

```ts
type DeviceContext = {
  install_id: Uuid;
  platform: AuthPlatform;
  app_version: string;
  user_agent: string;
};

type UserDto = {
  id: Uuid;
  google_sub: string;
  email: EmailString;
  email_verified: boolean;
  display_name: string | null;
  photo_url: UrlString | null;
  created_at: IsoDatetime;
  last_login_at: IsoDatetime;
};

type SessionDto = {
  session_id: Uuid;
  token_type: 'Bearer';
  session_token: string;
  issued_at: IsoDatetime;
  expires_at: IsoDatetime;
};

type ModelMetadataDto = {
  provider: 'openai';
  model: string;
  purpose: AiPurpose;
  requested_at: IsoDatetime;
  completed_at: IsoDatetime;
  latency_ms: number;
  input_audio_seconds: number | null;
  input_characters: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
};

type AttachmentReferenceDto = {
  evidence_id: Uuid;
  label: string;
  mime_type: string;
  sha256: Sha256Hex;
};
```

## 6. Auth Types

```ts
type AuthGoogleRequestDto = {
  firebase_id_token: string;
  device: DeviceContext;
};

type AuthSessionResponseDto = ApiSuccess<{
  user: UserDto;
  session: SessionDto;
}>;

type LogoutRequestDto = {
  all_sessions: boolean;
};

type LogoutResponseDto = ApiSuccess<{
  logged_out: true;
  all_sessions: boolean;
}>;
```

## 7. Transcript And Fact Types

```ts
type TranscriptSegmentDto = {
  start_ms: number;
  end_ms: number;
  speaker_label: string | null;
  text: string;
  confidence: number | null;
};

type TranscriptDocumentDto = {
  full_text: string;
  language: string | null;
  segment_count: number;
  segments: TranscriptSegmentDto[];
};

type TranscribeRequestDto = {
  incident_id: Uuid;
  source_evidence_id: Uuid;
  source_evidence_sha256: Sha256Hex;
  upload: InlineAudioUploadDto | ObjectStorageAudioUploadDto;
  language_hint?: string | null;
  include_timestamps?: boolean;
};

type InlineAudioUploadDto = {
  upload_mode: 'inline_base64';
  filename: string;
  mime_type: string;
  size_bytes: number;
  content_base64: string;
};

type ObjectStorageAudioUploadDto = {
  upload_mode: 'object_storage_reference';
  filename: string;
  mime_type: string;
  size_bytes: number;
  object_key: string;
};

type TranscribeResponseDto = ApiSuccess<{
  incident_id: Uuid;
  source_evidence_id: Uuid;
  transcript_evidence_id: Uuid;
  transcript: TranscriptDocumentDto;
  model_metadata: ModelMetadataDto;
  warnings: string[];
}>;

type FactTimelineItem = {
  time_label: string;
  description: string;
};

type FactSetDto = {
  fact_set_id: Uuid;
  incident_type: string | null;
  people: string[];
  places: string[];
  businesses: string[];
  phones: string[];
  dates: string[];
  amounts: string[];
  timeline: FactTimelineItem[];
  key_facts: string[];
  reviewed_by_user: boolean;
};

type ExtractContextDto = {
  location_address: string | null;
  confirmed_place_id: string | null;
  confirmed_place_name: string | null;
  confirmed_place_phone: string | null;
};

type ExtractRequestDto = {
  incident_id: Uuid;
  transcript_evidence_id: Uuid;
  transcript: TranscriptDocumentDto;
  context: ExtractContextDto;
};

type ExtractResponseDto = ApiSuccess<{
  incident_id: Uuid;
  transcript_evidence_id: Uuid;
  fact_set: FactSetDto;
  model_metadata: ModelMetadataDto;
  warnings: string[];
}>;
```

## 8. Venue, Destination, And Route Types

```ts
type MailingAddressDto = {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: 'US';
};

type DestinationDto = {
  destination_id: Uuid;
  destination_name: string;
  destination_type: DestinationType;
  jurisdiction: {
    country: 'US';
    state: string | null;
    county: string | null;
    city: string | null;
  };
  categories_handled: string[];
  intake_methods: IntakeMethod[];
  complaint_url: UrlString | null;
  email: EmailString | null;
  phone: string | null;
  mailing_address: MailingAddressDto | null;
  source_url: UrlString;
  last_verified_date: IsoDate;
  trust_level: TrustLevel;
  notes_required_fields: string[];
  notes_required_documents: string[];
};

type VenueMatchDto = {
  provider: string;
  place_id: string;
  business_name: string;
  address: string;
  phone: string | null;
  website: UrlString | null;
  lat: number;
  lng: number;
  match_confidence: number;
  source_label: string;
  source_url: UrlString;
  trust_level: TrustLevel;
  captured_at: IsoDatetime;
};

type VenueMatchRequestDto = {
  incident_id: Uuid;
  location: {
    lat: number;
    lng: number;
    address: string | null;
  };
  transcript_excerpt?: string | null;
  business_hints?: string[];
};

type VenueMatchResponseDto = ApiSuccess<{
  incident_id: Uuid;
  matches: VenueMatchDto[];
}>;

type RouteRecommendationDto = {
  destination_id: Uuid | null;
  destination_name_snapshot: string;
  destination_type_snapshot: string;
  route_category: RouteCategory;
  rank: number;
  reason: string;
  source_label: string;
  source_url: UrlString | null;
  last_verified_date: IsoDate | null;
  trust_level: TrustLevel;
  intake_methods_snapshot: IntakeMethod[];
  required_documents_snapshot: string[];
  available_actions: RouteAction[];
  destination: DestinationDto | null;
};

type RouteAction =
  | 'open_form'
  | 'call'
  | 'email'
  | 'share_packet'
  | 'export_packet'
  | 'save_for_later';

type RouteGroupDto = {
  route_category: RouteCategory;
  routes: RouteRecommendationDto[];
};

type RoutesRecommendRequestDto = {
  incident_id: Uuid;
  fact_set: FactSetDto;
  confirmed_place: VenueMatchDto | null;
  location_context: {
    state: string | null;
    city: string | null;
    address: string | null;
  };
};

type RoutesRecommendResponseDto = ApiSuccess<{
  incident_id: Uuid;
  registry_version: string;
  generated_at: IsoDatetime;
  model_metadata: ModelMetadataDto;
  route_groups: RouteGroupDto[];
}>;

type RouteDetailResponseDto = ApiSuccess<{
  destination: DestinationDto;
}>;

type RegistryVersionResponseDto = ApiSuccess<{
  registry_version: string;
  published_at: IsoDatetime;
  destination_count: number;
  verification_window_start: IsoDate | null;
  verification_window_end: IsoDate | null;
}>;
```

## 9. Draft, Submission, And Proof Types

```ts
type DraftPacketDto = {
  draft_packet_id: Uuid;
  incident_id: Uuid;
  destination_id: Uuid | null;
  subject: string;
  body: string;
  attachments: AttachmentReferenceDto[];
  version: number;
  approved: boolean;
};

type DraftRequestDto = {
  incident_id: Uuid;
  fact_set: FactSetDto;
  selected_route: RouteRecommendationDto;
  transcript_excerpt?: string | null;
  desired_tone?: string;
};

type DraftResponseDto = ApiSuccess<{
  incident_id: Uuid;
  selected_route: RouteRecommendationDto;
  draft_packet: DraftPacketDto;
  model_metadata: ModelMetadataDto;
  warnings: string[];
}>;

type EmailPreviewDto = {
  to: EmailString[];
  cc: EmailString[];
  subject: string;
  body: string;
  attachments: AttachmentReferenceDto[];
  destination_name_snapshot: string;
  destination_type_snapshot: string;
  source_url: UrlString | null;
  last_verified_date: IsoDate | null;
  trust_level: TrustLevel;
};

type EmailPreviewRequestDto = {
  incident_id: Uuid;
  selected_route: RouteRecommendationDto;
  draft_packet: DraftPacketDto;
};

type EmailPreviewResponseDto = ApiSuccess<{
  incident_id: Uuid;
  destination_id: Uuid | null;
  email_preview: EmailPreviewDto;
}>;

type SubmissionProofDto = {
  submission_proof_id: Uuid;
  incident_id: Uuid;
  destination_id: Uuid | null;
  method: SubmissionMethod;
  status: SubmissionStatus;
  confirmation_number: string | null;
  external_reference_url: UrlString | null;
  notes: string | null;
  attachments: AttachmentReferenceDto[];
  created_at: IsoDatetime;
};
```

## 10. Custody Event Types

```ts
type EvidenceCreatedDetails = {
  event: 'evidence_created';
  evidence_id: Uuid;
  evidence_type: EvidenceItemType;
  original: boolean;
  integrity_status: IntegrityStatus;
  sha256: Sha256Hex;
  captured_at: IsoDatetime;
  size_bytes: number;
  mime_type: string;
  device_info: JsonObject;
  location: {
    lat: number | null;
    lng: number | null;
    address: string | null;
  };
};

type TranscriptCreatedDetails = {
  event: 'transcript_created';
  evidence_id: Uuid;
  transcript_evidence_id: Uuid;
  source_evidence_id: Uuid;
  segment_count: number;
  model: string;
  language: string | null;
  confidence_summary: {
    average: number;
  };
};

type FactsConfirmedDetails = {
  event: 'facts_confirmed';
  fact_set_id: Uuid;
  incident_type: string | null;
  confirmed_fields: string[];
  edited_fields: string[];
  reviewed_by_user: true;
};

type RouteSelectedDetails = {
  event: 'route_selected';
  route_snapshot_id: Uuid;
  destination_id: Uuid | null;
  destination_name_snapshot: string;
  destination_type_snapshot: string;
  route_category: RouteCategory;
  rank: number;
  reason: string;
  source_url: UrlString | null;
  last_verified_date: IsoDate | null;
  trust_level: TrustLevel;
  intake_methods_snapshot: IntakeMethod[];
  required_documents_snapshot: string[];
};

type DraftApprovedDetails = {
  event: 'draft_approved';
  draft_packet_id: Uuid;
  destination_id: Uuid | null;
  version: number;
  subject: string;
  attachment_count: number;
};

type SendActionRecordedDetails = {
  event: 'send_action_recorded';
  submission_proof_id: Uuid | null;
  destination_id: Uuid | null;
  method: SubmissionMethod;
  status: SubmissionStatus;
  target_label: string;
  external_reference_url: UrlString | null;
};

type ShareCompletedDetails = {
  event: 'share_completed';
  shared_item_types: string[];
  share_method: string;
  destination_hint: string | null;
  evidence_ids: Uuid[];
};

type ExportCreatedDetails = {
  event: 'export_created';
  export_evidence_id: Uuid;
  export_format: 'pdf' | 'zip';
  included_items: string[];
  sha256: Sha256Hex;
};

type ProofSavedDetails = {
  event: 'proof_saved';
  submission_proof_id: Uuid;
  destination_id: Uuid | null;
  method: SubmissionMethod;
  status: SubmissionStatus;
  confirmation_number: string | null;
  external_reference_url: UrlString | null;
  attachment_count: number;
};

type CustodyEventDetails =
  | EvidenceCreatedDetails
  | TranscriptCreatedDetails
  | FactsConfirmedDetails
  | RouteSelectedDetails
  | DraftApprovedDetails
  | SendActionRecordedDetails
  | ShareCompletedDetails
  | ExportCreatedDetails
  | ProofSavedDetails;

type CustodyEventDescriptorDto = {
  action: CustodyAction;
  actor: CustodyActor;
  details_json: CustodyEventDetails;
};
```

## 11. Public Submission Action Types

```ts
type RecordActionRequestDto = {
  submission_proof: SubmissionProofDto;
  selected_route: RouteRecommendationDto;
  custody_event: CustodyEventDescriptorDto;
};

type RecordActionResponseDto = ApiSuccess<{
  submission_proof: SubmissionProofDto;
  destination_source: {
    destination_id: Uuid | null;
    destination_name_snapshot: string;
    destination_type_snapshot: string;
    source_url: UrlString | null;
    last_verified_date: IsoDate | null;
    trust_level: TrustLevel;
  };
  recorded_at: IsoDatetime;
  server_reference_id: Uuid;
}>;
```

## 12. Local Store Models

These are the canonical frontend persistence models derived from the locked spec and SQL reference schema.

```ts
type LocalIncident = {
  id: Uuid;
  title: string;
  status: IncidentStatus;
  category: string | null;
  created_at: IsoDatetime;
  updated_at: IsoDatetime;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  place_id: string | null;
  place_name: string | null;
  place_phone: string | null;
  current_route_snapshot_id: Uuid | null;
  current_draft_packet_id: Uuid | null;
  current_submission_proof_id: Uuid | null;
  current_export_evidence_id: Uuid | null;
};

type LocalEvidenceItem = {
  id: Uuid;
  incident_id: Uuid;
  type: EvidenceItemType;
  original: boolean;
  integrity_status: IntegrityStatus;
  local_path: string;
  mime_type: string;
  size_bytes: number;
  sha256: Sha256Hex;
  captured_at: IsoDatetime;
  created_at: IsoDatetime;
  device_info_json: JsonObject;
  source_evidence_id: Uuid | null;
};

type LocalCustodyLogEntry = {
  id: Uuid;
  incident_id: Uuid;
  evidence_item_id: Uuid | null;
  action: CustodyAction;
  actor: CustodyActor;
  details_json: CustodyEventDetails;
  created_at: IsoDatetime;
  prev_hash: string | null;
  entry_hash: string;
};

type LocalTranscriptSegment = {
  id: Uuid;
  incident_id: Uuid;
  evidence_item_id: Uuid;
  start_ms: number;
  end_ms: number;
  speaker_label: string | null;
  text: string;
  confidence: number | null;
};

type LocalFactSet = {
  id: Uuid;
  incident_id: Uuid;
  incident_type: string | null;
  people_json: string[];
  places_json: string[];
  businesses_json: string[];
  phones_json: string[];
  dates_json: string[];
  amounts_json: string[];
  timeline_json: FactTimelineItem[];
  key_facts_json: string[];
  reviewed_by_user: boolean;
};

type LocalRouteRecommendationSnapshot = {
  id: Uuid;
  incident_id: Uuid;
  destination_id: Uuid | null;
  destination_name_snapshot: string;
  destination_type_snapshot: string;
  route_category: RouteCategory;
  rank: number;
  reason: string;
  source_label: string;
  source_url: UrlString | null;
  last_verified_date: IsoDate | null;
  trust_level: TrustLevel;
  intake_methods_snapshot: IntakeMethod[];
  required_documents_snapshot: string[];
  available_actions_json: RouteAction[];
};

type LocalDraftPacket = {
  id: Uuid;
  incident_id: Uuid;
  destination_id: Uuid | null;
  subject: string;
  body: string;
  attachments_json: AttachmentReferenceDto[];
  version: number;
  approved: boolean;
};

type LocalSubmissionProof = {
  id: Uuid;
  incident_id: Uuid;
  destination_id: Uuid | null;
  method: SubmissionMethod;
  status: SubmissionStatus;
  confirmation_number: string | null;
  external_reference_url: UrlString | null;
  notes: string | null;
  attachments_json: AttachmentReferenceDto[];
  created_at: IsoDatetime;
};
```

## 13. Frontend View Models

These are UI-facing normalized types derived from DTOs and local records.

```ts
type RouteCardVm = {
  id: Uuid | null;
  category: RouteCategory;
  name: string;
  type_label: string;
  why_this_route_fits: string;
  source_label: string;
  source_url: UrlString | null;
  last_verified_date: IsoDate | null;
  trust_level: TrustLevel;
  intake_methods: IntakeMethod[];
  required_documents: string[];
  available_actions: RouteAction[];
};

type RouteGroupVm = {
  category: RouteCategory;
  cards: RouteCardVm[];
};

type CaseHeaderVm = {
  incident_id: Uuid;
  title: string;
  status: IncidentStatus;
  updated_at: IsoDatetime;
  place_name: string | null;
  location_address: string | null;
};

type EvidenceSummaryVm = {
  evidence_id: Uuid;
  type: EvidenceItemType;
  original: boolean;
  integrity_status: IntegrityStatus;
  captured_at: IsoDatetime;
  sha256: Sha256Hex;
};

type ProofSummaryVm = {
  submission_proof_id: Uuid;
  method: SubmissionMethod;
  status: SubmissionStatus;
  confirmation_number: string | null;
  external_reference_url: UrlString | null;
  created_at: IsoDatetime;
};
```

## 14. Form Models

```ts
type FactsFormValues = {
  incident_type: string | null;
  people: string[];
  places: string[];
  businesses: string[];
  phones: string[];
  dates: string[];
  amounts: string[];
  timeline: FactTimelineItem[];
  key_facts: string[];
};

type DraftReportFormValues = {
  subject: string;
  body: string;
  attachment_ids: Uuid[];
};

type ProofOfActionFormValues = {
  method: SubmissionMethod;
  status: SubmissionStatus;
  confirmation_number: string | null;
  external_reference_url: UrlString | null;
  notes: string | null;
  attachment_ids: Uuid[];
};

type AiMode = 'managed' | 'bring_your_own_key';

type SettingsFormValues = {
  theme: 'Slate' | 'Paper';
  ai_mode: AiMode;
  biometric_unlock_enabled: boolean;
  pin_lock_enabled: boolean;
  location_permission_enabled: boolean;
  share_logging_enabled: boolean;
};
```

## 15. Screen State Types

UI copy can say `offline/deferred`, but code should use a stable enum value without a slash.

```ts
type ScreenAsyncState =
  | 'empty'
  | 'loading'
  | 'ready'
  | 'partial'
  | 'error'
  | 'offline_deferred';

type CaptureScreenState = {
  state: ScreenAsyncState;
  can_start_capture: boolean;
  can_stop_capture: boolean;
  location_available: boolean;
  microphone_permission: 'unknown' | 'granted' | 'denied';
  message: string | null;
};

type TranscriptScreenState = {
  state: ScreenAsyncState;
  transcript_evidence_id: Uuid | null;
  segment_count: number;
  message: string | null;
};

type FactsScreenState = {
  state: ScreenAsyncState;
  fact_set_id: Uuid | null;
  reviewed_by_user: boolean;
  message: string | null;
};

type RecommendedRoutesScreenState = {
  state: ScreenAsyncState;
  registry_version: string | null;
  route_group_count: number;
  message: string | null;
};

type DraftReportScreenState = {
  state: ScreenAsyncState;
  draft_packet_id: Uuid | null;
  approved: boolean;
  message: string | null;
};

type SendOrHandOffScreenState = {
  state: ScreenAsyncState;
  available_actions: RouteAction[];
  message: string | null;
};

type ExportCaseFileScreenState = {
  state: ScreenAsyncState;
  export_evidence_id: Uuid | null;
  message: string | null;
};
```

## 16. Mapping Rules

- `AuthGoogleRequestDto.firebase_id_token` must come from Firebase Auth after Google sign-in.
- `RouteRecommendationDto` is the canonical UI contract for route cards.
- `RouteCardVm` should be derived from route snapshots, not rebuilt from raw destination data.
- `LocalRouteRecommendationSnapshot` is the durable route record that preserves source and trust state at the time shown.
- `LocalIncident.current_route_snapshot_id`, `current_draft_packet_id`, `current_submission_proof_id`, and `current_export_evidence_id` are continuity pointers for resume flows.
- `LocalCustodyLogEntry.details_json` must always conform to one of the locked custody event payload types.
- `SubmissionProofDto.status` and `SubmissionMethod` must never be widened beyond the locked enums.

## 17. Generation Guidance

When real code generation begins:

- Generate API types directly from `OPENAPI.json`
- Keep local store models aligned to `SCHEMA.sql`
- Do not merge DTO types and local store types into one shared type
- Keep route/source/trust fields intact in all layers
- Validate custody event payloads as discriminated unions on `event`
