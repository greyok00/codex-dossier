BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS dossier_enum;
CREATE SCHEMA IF NOT EXISTS dossier_backend;
CREATE SCHEMA IF NOT EXISTS dossier_local;

-- Common enums

CREATE TYPE dossier_enum.destination_type_enum AS ENUM (
  'business',
  'corporate',
  'local_agency',
  'state_agency',
  'federal_agency',
  'regulator',
  'law_enforcement',
  'consumer_org',
  'other'
);

CREATE TYPE dossier_enum.intake_method_enum AS ENUM (
  'web_form',
  'email',
  'phone',
  'mail',
  'portal',
  'in_person'
);

CREATE TYPE dossier_enum.trust_level_enum AS ENUM (
  'official',
  'verified',
  'directory',
  'unconfirmed'
);

CREATE TYPE dossier_enum.incident_status_enum AS ENUM (
  'capturing',
  'review',
  'drafting',
  'ready_to_send',
  'sent_or_handed_off',
  'closed'
);

CREATE TYPE dossier_enum.evidence_item_type_enum AS ENUM (
  'audio',
  'upload',
  'transcript',
  'draft',
  'export',
  'proof'
);

CREATE TYPE dossier_enum.integrity_status_enum AS ENUM (
  'pending',
  'verified',
  'mismatch'
);

CREATE TYPE dossier_enum.custody_actor_enum AS ENUM (
  'user',
  'system',
  'ai'
);

CREATE TYPE dossier_enum.custody_action_enum AS ENUM (
  'evidence_created',
  'transcript_created',
  'facts_confirmed',
  'route_selected',
  'draft_approved',
  'send_action_recorded',
  'share_completed',
  'export_created',
  'proof_saved'
);

CREATE TYPE dossier_enum.submission_method_enum AS ENUM (
  'web_form',
  'email',
  'phone',
  'mail',
  'share'
);

CREATE TYPE dossier_enum.submission_status_enum AS ENUM (
  'attempted',
  'sent',
  'submitted',
  'shared',
  'called',
  'saved'
);

CREATE TYPE dossier_enum.route_category_enum AS ENUM (
  'Business',
  'Local',
  'State',
  'Federal',
  'Other verified routes'
);

CREATE TYPE dossier_enum.ai_purpose_enum AS ENUM (
  'transcribe',
  'extract',
  'draft',
  'route_reasoning'
);

CREATE TYPE dossier_enum.auth_platform_enum AS ENUM (
  'ios',
  'android',
  'web'
);

-- Backend tables

CREATE TABLE dossier_backend.app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  display_name text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_app_user_email_format CHECK (position('@' IN email) > 1)
);

CREATE INDEX idx_app_user_last_login_at
  ON dossier_backend.app_user (last_login_at DESC);

CREATE TABLE dossier_backend.app_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES dossier_backend.app_user(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  device_install_id uuid NOT NULL,
  platform dossier_enum.auth_platform_enum NOT NULL,
  app_version text NOT NULL,
  user_agent text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_app_session_expiry CHECK (expires_at > issued_at)
);

CREATE INDEX idx_app_session_user
  ON dossier_backend.app_session (user_id, issued_at DESC);

CREATE INDEX idx_app_session_expiry
  ON dossier_backend.app_session (expires_at);

CREATE INDEX idx_app_session_revoked
  ON dossier_backend.app_session (revoked_at);

CREATE TABLE dossier_backend.destination (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_name text NOT NULL,
  destination_type dossier_enum.destination_type_enum NOT NULL,
  jurisdiction_country char(2) NOT NULL DEFAULT 'US',
  jurisdiction_state text,
  jurisdiction_county text,
  jurisdiction_city text,
  categories_handled_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_url text NOT NULL,
  last_verified_date date NOT NULL,
  trust_level dossier_enum.trust_level_enum NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_destination_country_us CHECK (jurisdiction_country = 'US'),
  CONSTRAINT ck_destination_categories_array CHECK (jsonb_typeof(categories_handled_json) = 'array'),
  CONSTRAINT ck_destination_status CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX uq_destination_canonical
  ON dossier_backend.destination (
    destination_name,
    destination_type,
    COALESCE(jurisdiction_state, ''),
    COALESCE(jurisdiction_county, ''),
    COALESCE(jurisdiction_city, ''),
    source_url
  );

CREATE INDEX idx_destination_jurisdiction
  ON dossier_backend.destination (jurisdiction_state, jurisdiction_county, jurisdiction_city);

CREATE INDEX idx_destination_trust_verified
  ON dossier_backend.destination (trust_level, last_verified_date DESC);

CREATE INDEX idx_destination_categories_gin
  ON dossier_backend.destination
  USING gin (categories_handled_json);

CREATE TABLE dossier_backend.destination_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id uuid NOT NULL REFERENCES dossier_backend.destination(id) ON DELETE CASCADE,
  intake_method dossier_enum.intake_method_enum NOT NULL,
  complaint_url text,
  email text,
  phone text,
  mailing_address_json jsonb,
  notes_required_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes_required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_destination_intake_contact_present CHECK (
    complaint_url IS NOT NULL OR
    email IS NOT NULL OR
    phone IS NOT NULL OR
    mailing_address_json IS NOT NULL
  ),
  CONSTRAINT ck_destination_intake_mailing_address_json CHECK (
    mailing_address_json IS NULL OR jsonb_typeof(mailing_address_json) = 'object'
  ),
  CONSTRAINT ck_destination_intake_required_fields_array CHECK (
    jsonb_typeof(notes_required_fields) = 'array'
  ),
  CONSTRAINT ck_destination_intake_required_documents_array CHECK (
    jsonb_typeof(notes_required_documents) = 'array'
  )
);

CREATE UNIQUE INDEX uq_destination_intake_variant
  ON dossier_backend.destination_intake (
    destination_id,
    intake_method,
    COALESCE(complaint_url, ''),
    COALESCE(email, ''),
    COALESCE(phone, '')
  );

CREATE INDEX idx_destination_intake_destination
  ON dossier_backend.destination_intake (destination_id, intake_method);

CREATE TABLE dossier_backend.destination_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id uuid NOT NULL REFERENCES dossier_backend.destination(id) ON DELETE CASCADE,
  incident_categories_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  business_types_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  jurisdiction_rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority_weight integer NOT NULL DEFAULT 100,
  exclusions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason_template text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_destination_rule_incident_categories_array CHECK (
    jsonb_typeof(incident_categories_json) = 'array'
  ),
  CONSTRAINT ck_destination_rule_business_types_array CHECK (
    jsonb_typeof(business_types_json) = 'array'
  ),
  CONSTRAINT ck_destination_rule_jurisdiction_rules_object CHECK (
    jsonb_typeof(jurisdiction_rules_json) = 'object'
  ),
  CONSTRAINT ck_destination_rule_exclusions_array CHECK (
    jsonb_typeof(exclusions_json) = 'array'
  ),
  CONSTRAINT ck_destination_rule_priority_weight CHECK (priority_weight >= 0)
);

CREATE INDEX idx_destination_rule_destination
  ON dossier_backend.destination_rule (destination_id, priority_weight DESC);

CREATE INDEX idx_destination_rule_incident_categories_gin
  ON dossier_backend.destination_rule
  USING gin (incident_categories_json);

CREATE INDEX idx_destination_rule_business_types_gin
  ON dossier_backend.destination_rule
  USING gin (business_types_json);

CREATE TABLE dossier_backend.verification_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id uuid NOT NULL REFERENCES dossier_backend.destination(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  checked_at timestamptz NOT NULL,
  result text NOT NULL,
  change_summary text NOT NULL DEFAULT '',
  checked_by text NOT NULL,
  next_review_due timestamptz,
  CONSTRAINT ck_verification_record_result CHECK (
    result IN ('verified', 'changed', 'failed', 'unreachable', 'skipped')
  )
);

CREATE INDEX idx_verification_record_destination
  ON dossier_backend.verification_record (destination_id, checked_at DESC);

CREATE INDEX idx_verification_record_due
  ON dossier_backend.verification_record (next_review_due);

CREATE TABLE dossier_backend.venue_match_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  place_id text NOT NULL,
  business_name text NOT NULL,
  address text NOT NULL,
  phone text,
  website text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  captured_at timestamptz NOT NULL,
  source_url text NOT NULL,
  trust_level dossier_enum.trust_level_enum NOT NULL DEFAULT 'directory'
);

CREATE UNIQUE INDEX uq_venue_match_provider_place
  ON dossier_backend.venue_match_cache (provider, place_id);

CREATE INDEX idx_venue_match_captured_at
  ON dossier_backend.venue_match_cache (captured_at DESC);

CREATE TABLE dossier_backend.ai_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES dossier_backend.app_user(id) ON DELETE SET NULL,
  client_incident_id uuid,
  purpose dossier_enum.ai_purpose_enum NOT NULL,
  provider text NOT NULL DEFAULT 'openai',
  model text NOT NULL,
  request_id text NOT NULL UNIQUE,
  requested_at timestamptz NOT NULL,
  completed_at timestamptz,
  latency_ms integer,
  input_audio_seconds numeric(12, 3),
  input_characters integer,
  input_tokens integer,
  output_tokens integer,
  status text NOT NULL,
  error_code text,
  CONSTRAINT ck_ai_request_log_status CHECK (
    status IN ('requested', 'completed', 'failed')
  ),
  CONSTRAINT ck_ai_request_log_latency CHECK (
    latency_ms IS NULL OR latency_ms >= 0
  ),
  CONSTRAINT ck_ai_request_log_input_audio_seconds CHECK (
    input_audio_seconds IS NULL OR input_audio_seconds >= 0
  ),
  CONSTRAINT ck_ai_request_log_input_characters CHECK (
    input_characters IS NULL OR input_characters >= 0
  ),
  CONSTRAINT ck_ai_request_log_input_tokens CHECK (
    input_tokens IS NULL OR input_tokens >= 0
  ),
  CONSTRAINT ck_ai_request_log_output_tokens CHECK (
    output_tokens IS NULL OR output_tokens >= 0
  )
);

CREATE INDEX idx_ai_request_log_user_purpose
  ON dossier_backend.ai_request_log (user_id, purpose, requested_at DESC);

CREATE INDEX idx_ai_request_log_incident
  ON dossier_backend.ai_request_log (client_incident_id, requested_at DESC);

CREATE TABLE dossier_backend.submission_action_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES dossier_backend.app_user(id) ON DELETE SET NULL,
  client_incident_id uuid NOT NULL,
  submission_proof_id uuid NOT NULL,
  destination_id uuid REFERENCES dossier_backend.destination(id) ON DELETE SET NULL,
  destination_name_snapshot text NOT NULL,
  destination_type_snapshot text NOT NULL,
  source_url text,
  last_verified_date date,
  trust_level dossier_enum.trust_level_enum NOT NULL,
  method dossier_enum.submission_method_enum NOT NULL,
  status dossier_enum.submission_status_enum NOT NULL,
  confirmation_number text,
  external_reference_url text,
  notes text,
  attachments_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  custody_event_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_submission_action_attachments_array CHECK (
    jsonb_typeof(attachments_json) = 'array'
  ),
  CONSTRAINT ck_submission_action_custody_event_object CHECK (
    jsonb_typeof(custody_event_json) = 'object'
  )
);

CREATE INDEX idx_submission_action_user_incident
  ON dossier_backend.submission_action_record (user_id, client_incident_id, created_at DESC);

CREATE INDEX idx_submission_action_destination
  ON dossier_backend.submission_action_record (destination_id, created_at DESC);

-- Local relational reference schema
-- The mobile app is local-first and may use IndexedDB at runtime.
-- These tables define the authoritative relational shape for local data.

CREATE TABLE dossier_local.incident (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  status dossier_enum.incident_status_enum NOT NULL,
  category text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  location_lat double precision,
  location_lng double precision,
  location_address text,
  place_id text,
  place_name text,
  place_phone text,
  current_route_snapshot_id uuid,
  current_draft_packet_id uuid,
  current_submission_proof_id uuid,
  current_export_evidence_id uuid,
  CONSTRAINT ck_incident_updated_at CHECK (updated_at >= created_at)
);

CREATE INDEX idx_local_incident_status_updated
  ON dossier_local.incident (status, updated_at DESC);

CREATE INDEX idx_local_incident_category_updated
  ON dossier_local.incident (category, updated_at DESC);

CREATE TABLE dossier_local.evidence_item (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES dossier_local.incident(id) ON DELETE CASCADE,
  type dossier_enum.evidence_item_type_enum NOT NULL,
  original boolean NOT NULL,
  integrity_status dossier_enum.integrity_status_enum NOT NULL,
  local_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  device_info_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_evidence_id uuid REFERENCES dossier_local.evidence_item(id) ON DELETE SET NULL,
  CONSTRAINT ck_evidence_item_size_bytes CHECK (size_bytes >= 0),
  CONSTRAINT ck_evidence_item_device_info_object CHECK (jsonb_typeof(device_info_json) = 'object'),
  CONSTRAINT ck_evidence_item_original_source CHECK (
    NOT (original = true AND source_evidence_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_local_evidence_incident_path
  ON dossier_local.evidence_item (incident_id, local_path);

CREATE UNIQUE INDEX uq_local_evidence_id_incident
  ON dossier_local.evidence_item (id, incident_id);

CREATE INDEX idx_local_evidence_incident_created
  ON dossier_local.evidence_item (incident_id, created_at DESC);

CREATE INDEX idx_local_evidence_sha256
  ON dossier_local.evidence_item (sha256);

CREATE TABLE dossier_local.custody_log_entry (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES dossier_local.incident(id) ON DELETE CASCADE,
  evidence_item_id uuid REFERENCES dossier_local.evidence_item(id) ON DELETE SET NULL,
  action dossier_enum.custody_action_enum NOT NULL,
  actor dossier_enum.custody_actor_enum NOT NULL,
  details_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  prev_hash text,
  entry_hash text NOT NULL UNIQUE,
  CONSTRAINT ck_custody_log_details_object CHECK (jsonb_typeof(details_json) = 'object'),
  CONSTRAINT ck_custody_log_hash_link CHECK (prev_hash IS NULL OR prev_hash <> entry_hash)
);

CREATE INDEX idx_local_custody_incident_created
  ON dossier_local.custody_log_entry (incident_id, created_at ASC);

CREATE INDEX idx_local_custody_action_created
  ON dossier_local.custody_log_entry (action, created_at DESC);

CREATE TABLE dossier_local.transcript_segment (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES dossier_local.incident(id) ON DELETE CASCADE,
  evidence_item_id uuid NOT NULL REFERENCES dossier_local.evidence_item(id) ON DELETE CASCADE,
  start_ms integer NOT NULL,
  end_ms integer NOT NULL,
  speaker_label text,
  text text NOT NULL,
  confidence numeric(4, 3),
  CONSTRAINT ck_transcript_segment_start_ms CHECK (start_ms >= 0),
  CONSTRAINT ck_transcript_segment_end_ms CHECK (end_ms >= start_ms),
  CONSTRAINT ck_transcript_segment_confidence CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE INDEX idx_local_transcript_incident_evidence_time
  ON dossier_local.transcript_segment (incident_id, evidence_item_id, start_ms);

CREATE TABLE dossier_local.fact_set (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL UNIQUE REFERENCES dossier_local.incident(id) ON DELETE CASCADE,
  incident_type text,
  people_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  places_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  businesses_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  phones_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  dates_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  amounts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  timeline_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_facts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by_user boolean NOT NULL DEFAULT false,
  CONSTRAINT ck_fact_set_people_array CHECK (jsonb_typeof(people_json) = 'array'),
  CONSTRAINT ck_fact_set_places_array CHECK (jsonb_typeof(places_json) = 'array'),
  CONSTRAINT ck_fact_set_businesses_array CHECK (jsonb_typeof(businesses_json) = 'array'),
  CONSTRAINT ck_fact_set_phones_array CHECK (jsonb_typeof(phones_json) = 'array'),
  CONSTRAINT ck_fact_set_dates_array CHECK (jsonb_typeof(dates_json) = 'array'),
  CONSTRAINT ck_fact_set_amounts_array CHECK (jsonb_typeof(amounts_json) = 'array'),
  CONSTRAINT ck_fact_set_timeline_array CHECK (jsonb_typeof(timeline_json) = 'array'),
  CONSTRAINT ck_fact_set_key_facts_array CHECK (jsonb_typeof(key_facts_json) = 'array')
);

CREATE TABLE dossier_local.route_recommendation_snapshot (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES dossier_local.incident(id) ON DELETE CASCADE,
  destination_id uuid,
  destination_name_snapshot text NOT NULL,
  destination_type_snapshot text NOT NULL,
  route_category dossier_enum.route_category_enum NOT NULL,
  rank integer NOT NULL,
  reason text NOT NULL,
  source_label text NOT NULL,
  source_url text,
  last_verified_date date,
  trust_level dossier_enum.trust_level_enum NOT NULL,
  intake_methods_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_documents_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  available_actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT ck_route_snapshot_rank CHECK (rank >= 1),
  CONSTRAINT ck_route_snapshot_intake_methods_array CHECK (
    jsonb_typeof(intake_methods_snapshot) = 'array'
  ),
  CONSTRAINT ck_route_snapshot_required_documents_array CHECK (
    jsonb_typeof(required_documents_snapshot) = 'array'
  ),
  CONSTRAINT ck_route_snapshot_available_actions_array CHECK (
    jsonb_typeof(available_actions_json) = 'array'
  )
);

CREATE UNIQUE INDEX uq_local_route_snapshot_id_incident
  ON dossier_local.route_recommendation_snapshot (id, incident_id);

CREATE INDEX idx_local_route_snapshot_incident_rank
  ON dossier_local.route_recommendation_snapshot (incident_id, route_category, rank);

CREATE TABLE dossier_local.draft_packet (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES dossier_local.incident(id) ON DELETE CASCADE,
  destination_id uuid,
  subject text NOT NULL,
  body text NOT NULL,
  attachments_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  CONSTRAINT ck_draft_packet_attachments_array CHECK (jsonb_typeof(attachments_json) = 'array'),
  CONSTRAINT ck_draft_packet_version CHECK (version >= 1)
);

CREATE UNIQUE INDEX uq_local_draft_packet_id_incident
  ON dossier_local.draft_packet (id, incident_id);

CREATE UNIQUE INDEX uq_local_draft_packet_version
  ON dossier_local.draft_packet (incident_id, COALESCE(destination_id::text, ''), version);

CREATE INDEX idx_local_draft_packet_incident
  ON dossier_local.draft_packet (incident_id, approved, version DESC);

CREATE TABLE dossier_local.submission_proof (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES dossier_local.incident(id) ON DELETE CASCADE,
  destination_id uuid,
  method dossier_enum.submission_method_enum NOT NULL,
  status dossier_enum.submission_status_enum NOT NULL,
  confirmation_number text,
  external_reference_url text,
  notes text,
  attachments_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL,
  CONSTRAINT ck_submission_proof_attachments_array CHECK (jsonb_typeof(attachments_json) = 'array')
);

CREATE UNIQUE INDEX uq_local_submission_proof_id_incident
  ON dossier_local.submission_proof (id, incident_id);

CREATE INDEX idx_local_submission_proof_incident_created
  ON dossier_local.submission_proof (incident_id, created_at DESC);

ALTER TABLE dossier_local.incident
  ADD CONSTRAINT fk_incident_current_route_snapshot
  FOREIGN KEY (current_route_snapshot_id, id)
  REFERENCES dossier_local.route_recommendation_snapshot (id, incident_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE dossier_local.incident
  ADD CONSTRAINT fk_incident_current_draft_packet
  FOREIGN KEY (current_draft_packet_id, id)
  REFERENCES dossier_local.draft_packet (id, incident_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE dossier_local.incident
  ADD CONSTRAINT fk_incident_current_submission_proof
  FOREIGN KEY (current_submission_proof_id, id)
  REFERENCES dossier_local.submission_proof (id, incident_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE dossier_local.incident
  ADD CONSTRAINT fk_incident_current_export_evidence
  FOREIGN KEY (current_export_evidence_id, id)
  REFERENCES dossier_local.evidence_item (id, incident_id)
  DEFERRABLE INITIALLY DEFERRED;

COMMIT;
