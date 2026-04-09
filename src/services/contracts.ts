import { z } from "zod";

export const destinationTypeValues = [
  "business",
  "corporate",
  "local_agency",
  "state_agency",
  "federal_agency",
  "regulator",
  "law_enforcement",
  "consumer_org",
  "other",
] as const;

export const intakeMethodValues = ["web_form", "email", "phone", "mail", "portal", "in_person"] as const;
export const trustLevelValues = ["official", "verified", "directory", "unconfirmed"] as const;
export const routeCategoryValues = ["Business", "Local", "State", "Federal", "Other verified routes"] as const;
export const availableActionValues = ["open_form", "call", "email", "share_packet", "export_packet", "save_for_later"] as const;
export const submissionMethodValues = ["web_form", "email", "phone", "mail", "share"] as const;
export const submissionStatusValues = ["attempted", "sent", "submitted", "shared", "called", "saved"] as const;
export const custodyActionValues = [
  "evidence_created",
  "transcript_created",
  "facts_confirmed",
  "route_selected",
  "draft_approved",
  "send_action_recorded",
  "share_completed",
  "export_created",
  "proof_saved",
] as const;
export const custodyActorValues = ["user", "system", "ai"] as const;
export const evidenceItemTypeValues = ["audio", "upload", "transcript", "draft", "export", "proof"] as const;
export const integrityStatusValues = ["pending", "verified", "mismatch"] as const;
export const exportFormatValues = ["pdf", "zip"] as const;

export type DestinationType = (typeof destinationTypeValues)[number];
export type IntakeMethod = (typeof intakeMethodValues)[number];
export type TrustLevel = (typeof trustLevelValues)[number];
export type RouteCategory = (typeof routeCategoryValues)[number];
export type AvailableAction = (typeof availableActionValues)[number];
export type SubmissionMethod = (typeof submissionMethodValues)[number];
export type SubmissionStatus = (typeof submissionStatusValues)[number];
export type CustodyAction = (typeof custodyActionValues)[number];
export type CustodyActor = (typeof custodyActorValues)[number];
export type EvidenceItemType = (typeof evidenceItemTypeValues)[number];
export type IntegrityStatus = (typeof integrityStatusValues)[number];
export type ExportFormat = (typeof exportFormatValues)[number];

export const mailingAddressSchema = z
  .object({
    line1: z.string().min(1),
    line2: z.string().nullable(),
    city: z.string().min(1),
    state: z.string().min(1),
    postal_code: z.string().min(1),
    country: z.literal("US"),
  })
  .strict();

export const factSetSchema = z
  .object({
    fact_set_id: z.string().uuid(),
    incident_type: z.string().min(1).nullable(),
    people: z.array(z.string()),
    places: z.array(z.string()),
    businesses: z.array(z.string()),
    phones: z.array(z.string()),
    dates: z.array(z.string()),
    amounts: z.array(z.string()),
    timeline: z.array(
      z
        .object({
          time_label: z.string(),
          description: z.string(),
        })
        .strict(),
    ),
    key_facts: z.array(z.string()),
    reviewed_by_user: z.boolean(),
  })
  .strict();

export const venueMatchSchema = z
  .object({
    provider: z.string().min(1),
    place_id: z.string().min(1),
    business_name: z.string().min(1),
    address: z.string().min(1),
    phone: z.string().nullable(),
    website: z.url().nullable(),
    lat: z.number(),
    lng: z.number(),
    match_confidence: z.number().min(0).max(1),
    source_label: z.string().min(1),
    source_url: z.url(),
    trust_level: z.enum(trustLevelValues),
    captured_at: z.string().datetime({ offset: true }),
  })
  .strict();

export const destinationSchema = z
  .object({
    destination_id: z.string().uuid(),
    destination_name: z.string().min(1),
    destination_type: z.enum(destinationTypeValues),
    jurisdiction: z
      .object({
        country: z.literal("US"),
        state: z.string().nullable(),
        county: z.string().nullable(),
        city: z.string().nullable(),
      })
      .strict(),
    categories_handled: z.array(z.string()),
    intake_methods: z.array(z.enum(intakeMethodValues)),
    complaint_url: z.url().nullable(),
    email: z.email().nullable(),
    phone: z.string().nullable(),
    mailing_address: mailingAddressSchema.nullable(),
    source_url: z.url(),
    last_verified_date: z.string().date(),
    trust_level: z.enum(trustLevelValues),
    notes_required_fields: z.array(z.string()),
    notes_required_documents: z.array(z.string()),
  })
  .strict();

export const routeRecommendationSchema = z
  .object({
    destination_id: z.string().uuid().nullable(),
    destination_name_snapshot: z.string().min(1),
    destination_type_snapshot: z.string().min(1),
    route_category: z.enum(routeCategoryValues),
    rank: z.number().int().min(1),
    reason: z.string().min(1),
    source_label: z.string().min(1),
    source_url: z.url().nullable(),
    last_verified_date: z.string().date().nullable(),
    trust_level: z.enum(trustLevelValues),
    intake_methods_snapshot: z.array(z.enum(intakeMethodValues)),
    required_documents_snapshot: z.array(z.string()),
    available_actions: z.array(z.enum(availableActionValues)),
    destination: destinationSchema.nullable(),
  })
  .strict();

export const routeGroupSchema = z
  .object({
    route_category: z.enum(routeCategoryValues),
    routes: z.array(routeRecommendationSchema),
  })
  .strict();

export const modelMetadataSchema = z
  .object({
    provider: z.literal("openai"),
    model: z.string().min(1),
    purpose: z.enum(["transcribe", "extract", "draft", "route_reasoning"]),
    requested_at: z.string().datetime({ offset: true }),
    completed_at: z.string().datetime({ offset: true }),
    latency_ms: z.number().int().min(0),
    input_audio_seconds: z.number().min(0).nullable().optional(),
    input_characters: z.number().int().min(0).nullable().optional(),
    input_tokens: z.number().int().min(0).nullable().optional(),
    output_tokens: z.number().int().min(0).nullable().optional(),
  })
  .strict();

export const transcriptSegmentSchema = z
  .object({
    start_ms: z.number().int().min(0),
    end_ms: z.number().int().min(0),
    speaker_label: z.string().nullable(),
    text: z.string(),
    confidence: z.number().min(0).max(1).nullable(),
  })
  .strict();

export const transcriptDocumentSchema = z
  .object({
    full_text: z.string(),
    language: z.string().nullable(),
    segment_count: z.number().int().min(0),
    segments: z.array(transcriptSegmentSchema),
  })
  .strict();

export const extractContextSchema = z
  .object({
    location_address: z.string().nullable(),
    confirmed_place_id: z.string().nullable(),
    confirmed_place_name: z.string().nullable(),
    confirmed_place_phone: z.string().nullable(),
  })
  .strict();

export const inlineAudioUploadSchema = z
  .object({
    upload_mode: z.literal("inline_base64"),
    filename: z.string().min(1),
    mime_type: z.string().min(1),
    size_bytes: z.number().int().min(1),
    content_base64: z.string().min(1),
  })
  .strict();

export const objectStorageAudioUploadSchema = z
  .object({
    upload_mode: z.literal("object_storage_reference"),
    filename: z.string().min(1),
    mime_type: z.string().min(1),
    size_bytes: z.number().int().min(1),
    object_key: z.string().min(1),
  })
  .strict();

export const attachmentReferenceSchema = z
  .object({
    evidence_id: z.string().uuid(),
    label: z.string().min(1),
    mime_type: z.string().min(1),
    sha256: z.string().min(1),
  })
  .strict();

export const draftPacketSchema = z
  .object({
    draft_packet_id: z.string().uuid(),
    incident_id: z.string().uuid(),
    destination_id: z.string().uuid().nullable(),
    subject: z.string(),
    body: z.string(),
    attachments: z.array(attachmentReferenceSchema),
    version: z.number().int().min(1),
    approved: z.boolean(),
  })
  .strict();

export const emailPreviewSchema = z
  .object({
    to: z.array(z.email()),
    cc: z.array(z.email()),
    subject: z.string(),
    body: z.string(),
    attachments: z.array(attachmentReferenceSchema),
    destination_name_snapshot: z.string().min(1),
    destination_type_snapshot: z.string().min(1),
    source_url: z.url().nullable(),
    last_verified_date: z.string().date().nullable(),
    trust_level: z.enum(trustLevelValues),
  })
  .strict();

export const submissionProofSchema = z
  .object({
    submission_proof_id: z.string().uuid(),
    incident_id: z.string().uuid(),
    destination_id: z.string().uuid().nullable(),
    method: z.enum(submissionMethodValues),
    status: z.enum(submissionStatusValues),
    confirmation_number: z.string().nullable(),
    external_reference_url: z.url().nullable(),
    notes: z.string().nullable(),
    attachments: z.array(attachmentReferenceSchema),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();

const evidenceCreatedDetailsSchema = z
  .object({
    event: z.literal("evidence_created"),
    evidence_id: z.string().uuid(),
    evidence_type: z.enum(evidenceItemTypeValues),
    original: z.boolean(),
    integrity_status: z.enum(integrityStatusValues),
    sha256: z.string().min(1),
    captured_at: z.string().datetime({ offset: true }),
    size_bytes: z.number().int().min(0),
    mime_type: z.string().min(1),
    device_info: z.record(z.string(), z.unknown()),
    location: z
      .object({
        lat: z.number().nullable(),
        lng: z.number().nullable(),
        address: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

const transcriptCreatedDetailsSchema = z
  .object({
    event: z.literal("transcript_created"),
    evidence_id: z.string().uuid(),
    transcript_evidence_id: z.string().uuid(),
    source_evidence_id: z.string().uuid(),
    segment_count: z.number().int().min(0),
    model: z.string().min(1),
    language: z.string().nullable(),
    confidence_summary: z
      .object({
        average: z.number().min(0).max(1),
      })
      .strict(),
  })
  .strict();

const factsConfirmedDetailsSchema = z
  .object({
    event: z.literal("facts_confirmed"),
    fact_set_id: z.string().uuid(),
    incident_type: z.string().nullable(),
    confirmed_fields: z.array(z.string()),
    edited_fields: z.array(z.string()),
    reviewed_by_user: z.boolean(),
  })
  .strict();

const routeSelectedDetailsSchema = z
  .object({
    event: z.literal("route_selected"),
    route_snapshot_id: z.string().uuid(),
    destination_id: z.string().uuid().nullable(),
    destination_name_snapshot: z.string(),
    destination_type_snapshot: z.string(),
    route_category: z.enum(routeCategoryValues),
    rank: z.number().int().min(1),
    reason: z.string(),
    source_url: z.url().nullable(),
    last_verified_date: z.string().date().nullable(),
    trust_level: z.enum(trustLevelValues),
    intake_methods_snapshot: z.array(z.enum(intakeMethodValues)),
    required_documents_snapshot: z.array(z.string()),
  })
  .strict();

const draftApprovedDetailsSchema = z
  .object({
    event: z.literal("draft_approved"),
    draft_packet_id: z.string().uuid(),
    destination_id: z.string().uuid().nullable(),
    version: z.number().int().min(1),
    subject: z.string(),
    attachment_count: z.number().int().min(0),
  })
  .strict();

const sendActionRecordedDetailsSchema = z
  .object({
    event: z.literal("send_action_recorded"),
    submission_proof_id: z.string().uuid().nullable(),
    destination_id: z.string().uuid().nullable(),
    method: z.enum(submissionMethodValues),
    status: z.enum(submissionStatusValues),
    target_label: z.string(),
    external_reference_url: z.url().nullable(),
  })
  .strict();

const shareCompletedDetailsSchema = z
  .object({
    event: z.literal("share_completed"),
    shared_item_types: z.array(z.string()),
    share_method: z.string(),
    destination_hint: z.string().nullable(),
    evidence_ids: z.array(z.string().uuid()),
  })
  .strict();

const exportCreatedDetailsSchema = z
  .object({
    event: z.literal("export_created"),
    export_evidence_id: z.string().uuid(),
    export_format: z.enum(exportFormatValues),
    included_items: z.array(z.string()),
    sha256: z.string(),
  })
  .strict();

const proofSavedDetailsSchema = z
  .object({
    event: z.literal("proof_saved"),
    submission_proof_id: z.string().uuid(),
    destination_id: z.string().uuid().nullable(),
    method: z.enum(submissionMethodValues),
    status: z.enum(submissionStatusValues),
    confirmation_number: z.string().nullable(),
    external_reference_url: z.url().nullable(),
    attachment_count: z.number().int().min(0),
  })
  .strict();

export const custodyEventDetailsSchema = z.discriminatedUnion("event", [
  evidenceCreatedDetailsSchema,
  transcriptCreatedDetailsSchema,
  factsConfirmedDetailsSchema,
  routeSelectedDetailsSchema,
  draftApprovedDetailsSchema,
  sendActionRecordedDetailsSchema,
  shareCompletedDetailsSchema,
  exportCreatedDetailsSchema,
  proofSavedDetailsSchema,
]);

export const custodyEventDescriptorSchema = z
  .object({
    action: z.enum(custodyActionValues),
    actor: z.enum(custodyActorValues),
    details_json: custodyEventDetailsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action !== value.details_json.event) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custody event action must match details_json.event.",
        path: ["action"],
      });
    }
  });

export const venueMatchRequestSchema = z
  .object({
    incident_id: z.string().uuid(),
    location: z
      .object({
        lat: z.number(),
        lng: z.number(),
        address: z.string().nullable().optional(),
      })
      .strict(),
    transcript_excerpt: z.string().nullable().optional(),
    business_hints: z.array(z.string().min(1)).optional().default([]),
  })
  .strict();

export const routesRecommendRequestSchema = z
  .object({
    incident_id: z.string().uuid(),
    fact_set: factSetSchema,
    confirmed_place: venueMatchSchema.nullable(),
    location_context: z
      .object({
        state: z.string().nullable(),
        city: z.string().nullable(),
        address: z.string().nullable(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const transcribeRequestSchema = z
  .object({
    incident_id: z.string().uuid(),
    source_evidence_id: z.string().uuid(),
    source_evidence_sha256: z.string().min(1),
    upload: z.discriminatedUnion("upload_mode", [inlineAudioUploadSchema, objectStorageAudioUploadSchema]),
    language_hint: z.string().nullable().optional(),
    include_timestamps: z.boolean().optional().default(true),
  })
  .strict();

export const extractRequestSchema = z
  .object({
    incident_id: z.string().uuid(),
    transcript_evidence_id: z.string().uuid(),
    transcript: transcriptDocumentSchema,
    context: extractContextSchema,
  })
  .strict();

export const draftRequestSchema = z
  .object({
    incident_id: z.string().uuid(),
    fact_set: factSetSchema,
    selected_route: routeRecommendationSchema,
    transcript_excerpt: z.string().nullable().optional(),
    desired_tone: z.string().optional().default("plain_serious"),
  })
  .strict();

export const emailPreviewRequestSchema = z
  .object({
    incident_id: z.string().uuid(),
    selected_route: routeRecommendationSchema,
    draft_packet: draftPacketSchema,
  })
  .strict();

export const recordActionRequestSchema = z
  .object({
    submission_proof: submissionProofSchema,
    selected_route: routeRecommendationSchema,
    custody_event: custodyEventDescriptorSchema,
  })
  .strict();

export const routeDetailParamsSchema = z
  .object({
    destinationId: z.string().uuid(),
  })
  .strict();

export type MailingAddress = z.infer<typeof mailingAddressSchema>;
export type FactSet = z.infer<typeof factSetSchema>;
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type TranscriptDocument = z.infer<typeof transcriptDocumentSchema>;
export type ExtractContext = z.infer<typeof extractContextSchema>;
export type InlineAudioUpload = z.infer<typeof inlineAudioUploadSchema>;
export type ObjectStorageAudioUpload = z.infer<typeof objectStorageAudioUploadSchema>;
export type AudioUpload = z.infer<typeof inlineAudioUploadSchema> | z.infer<typeof objectStorageAudioUploadSchema>;
export type AttachmentReference = z.infer<typeof attachmentReferenceSchema>;
export type DraftPacket = z.infer<typeof draftPacketSchema>;
export type EmailPreview = z.infer<typeof emailPreviewSchema>;
export type SubmissionProof = z.infer<typeof submissionProofSchema>;
export type CustodyEventDescriptor = z.infer<typeof custodyEventDescriptorSchema>;
export type VenueMatch = z.infer<typeof venueMatchSchema>;
export type DestinationDto = z.infer<typeof destinationSchema>;
export type RouteRecommendation = z.infer<typeof routeRecommendationSchema>;
export type RouteGroup = z.infer<typeof routeGroupSchema>;
export type ModelMetadata = z.infer<typeof modelMetadataSchema>;
export type VenueMatchRequest = z.infer<typeof venueMatchRequestSchema>;
export type RoutesRecommendRequest = z.infer<typeof routesRecommendRequestSchema>;
export type TranscribeRequest = z.infer<typeof transcribeRequestSchema>;
export type ExtractRequest = z.infer<typeof extractRequestSchema>;
export type DraftRequest = z.infer<typeof draftRequestSchema>;
export type EmailPreviewRequest = z.infer<typeof emailPreviewRequestSchema>;
export type RecordActionRequest = z.infer<typeof recordActionRequestSchema>;
