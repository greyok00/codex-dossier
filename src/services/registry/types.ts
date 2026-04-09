export type DestinationType =
  | "business"
  | "corporate"
  | "local_agency"
  | "state_agency"
  | "federal_agency"
  | "regulator"
  | "law_enforcement"
  | "consumer_org"
  | "other";

export type IntakeMethod =
  | "web_form"
  | "email"
  | "phone"
  | "mail"
  | "portal"
  | "in_person";

export type TrustLevel = "official" | "verified" | "directory" | "unconfirmed";
export type DestinationStatus = "active" | "inactive";
export type VerificationResult = "verified" | "changed" | "failed" | "unreachable" | "skipped";

export interface CompiledDestinationRecord {
  id: string;
  destination_name: string;
  destination_type: DestinationType;
  jurisdiction_country: "US";
  jurisdiction_state: string | null;
  jurisdiction_county: string | null;
  jurisdiction_city: string | null;
  categories_handled_json: string[];
  source_url: string;
  last_verified_date: string;
  trust_level: TrustLevel;
  status: DestinationStatus;
}

export interface DestinationIntakeRecord {
  id: string;
  destination_id: string;
  intake_method: IntakeMethod;
  complaint_url: string | null;
  email: string | null;
  phone: string | null;
  mailing_address_json: Record<string, unknown> | null;
  notes_required_fields: string[];
  notes_required_documents: string[];
}

export interface DestinationRuleRecord {
  id: string;
  destination_id: string;
  incident_categories_json: string[];
  business_types_json: string[];
  jurisdiction_rules_json: Record<string, unknown>;
  priority_weight: number;
  exclusions_json: string[];
  reason_template: string;
}

export interface VerificationRecord {
  id: string;
  destination_id: string;
  source_url: string;
  checked_at: string;
  result: VerificationResult;
  change_summary: string;
  checked_by: string;
  next_review_due: string | null;
}

export interface CompiledDestinationBundleEntry {
  destination: CompiledDestinationRecord;
  intakes: DestinationIntakeRecord[];
  rules: DestinationRuleRecord[];
  verification_records: VerificationRecord[];
  source_files: string[];
  source_kinds: string[];
  merged_from: number;
}

export interface CompiledDestinationBundle {
  import_batch_id: string;
  generated_at: string;
  source_files: string[];
  summary: {
    destination_count: number;
    intake_count: number;
    rule_count: number;
    verification_record_count: number;
  };
  destinations: CompiledDestinationBundleEntry[];
}

export interface ImportRecordCounts {
  destinations: number;
  intakes: number;
  rules: number;
  verification_records: number;
}

export interface RegistryVersionMetadata {
  registry_version: string;
  published_at: string;
  destination_count: number;
  verification_window_start: string | null;
  verification_window_end: string | null;
}

export interface RegistryImportSummary {
  import_batch_id: string;
  source_kind: "compiled_bundle" | "seed_inputs";
  source_files: string[];
  accepted: ImportRecordCounts;
  skipped: ImportRecordCounts;
  rejected: ImportRecordCounts;
  registry_version: RegistryVersionMetadata;
}

export interface RegistryVerifySummary {
  verification_record_id: string;
  destination_id: string;
  registry_version: RegistryVersionMetadata;
}
