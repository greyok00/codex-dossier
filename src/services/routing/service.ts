import type { Pool } from "pg";

import { DatabaseError, NotFoundError, ValidationError } from "../../lib/errors.js";
import {
  destinationSchema,
  modelMetadataSchema,
  routeCategoryValues,
  routeDetailParamsSchema,
  routeGroupSchema,
  routeRecommendationSchema,
  routesRecommendRequestSchema,
  type AvailableAction,
  type DestinationDto,
  type FactSet,
  type IntakeMethod,
  type MailingAddress,
  type ModelMetadata,
  type RouteCategory,
  type RouteGroup,
  type RouteRecommendation,
  type RoutesRecommendRequest,
  type TrustLevel,
  type VenueMatch,
} from "../contracts.js";
import { getRegistryVersion } from "../registry/version-service.js";

interface DestinationRow {
  id: string;
  destination_name: string;
  destination_type: DestinationDto["destination_type"];
  jurisdiction_country: "US";
  jurisdiction_state: string | null;
  jurisdiction_county: string | null;
  jurisdiction_city: string | null;
  categories_handled_json: string[];
  source_url: string;
  last_verified_date: string;
  trust_level: TrustLevel;
  status: "active" | "inactive";
}

interface DestinationIntakeRow {
  id: string;
  destination_id: string;
  intake_method: IntakeMethod;
  complaint_url: string | null;
  email: string | null;
  phone: string | null;
  mailing_address_json: MailingAddress | null;
  notes_required_fields: string[];
  notes_required_documents: string[];
}

interface DestinationRuleRow {
  id: string;
  destination_id: string;
  incident_categories_json: string[];
  business_types_json: string[];
  jurisdiction_rules_json: Record<string, unknown>;
  priority_weight: number;
  exclusions_json: string[];
  reason_template: string;
}

interface DestinationGraph {
  destination: DestinationRow;
  intakes: DestinationIntakeRow[];
  rules: DestinationRuleRow[];
}

interface CandidateContext {
  incidentType: string | null;
  inferredBusinessTypes: Set<string>;
  state: string | null;
  city: string | null;
  address: string | null;
  confirmedPlace: VenueMatch | null;
  factSet: FactSet;
}

interface ScoredRecommendation {
  route: RouteRecommendation;
  score: number;
}

export interface RouteReasoningService {
  rankCandidates(input: {
    incident_id: string;
    fact_set: FactSet;
    confirmed_place: VenueMatch | null;
    location_context: RoutesRecommendRequest["location_context"];
    candidates: ScoredRecommendation[];
  }): Promise<{
    ranked: ScoredRecommendation[];
    model_metadata: ModelMetadata;
  }>;
}

export class PassiveRouteReasoningService implements RouteReasoningService {
  constructor(private readonly model = process.env.OPENAI_ROUTE_REASONING_MODEL ?? "gpt-5.1-mini") {}

  async rankCandidates(input: {
    incident_id: string;
    fact_set: FactSet;
    confirmed_place: VenueMatch | null;
    location_context: RoutesRecommendRequest["location_context"];
    candidates: ScoredRecommendation[];
  }) {
    const requestedAt = new Date().toISOString();
    const ranked = [...input.candidates].sort(compareCandidates);
    const completedAt = new Date().toISOString();
    const inputCharacters = JSON.stringify({
      incident_id: input.incident_id,
      fact_set: input.fact_set,
      confirmed_place: input.confirmed_place,
      location_context: input.location_context ?? null,
    }).length;

    return {
      ranked,
      model_metadata: modelMetadataSchema.parse({
        provider: "openai",
        model: this.model,
        purpose: "route_reasoning",
        requested_at: requestedAt,
        completed_at: completedAt,
        latency_ms: Math.max(0, Date.parse(completedAt) - Date.parse(requestedAt)),
        input_characters: inputCharacters,
        input_tokens: null,
        output_tokens: null,
      }),
    };
  }
}

export class RoutingService {
  constructor(
    private readonly pool: Pool,
    private readonly routeReasoner: RouteReasoningService,
  ) {}

  async recommendRoutes(rawRequest: unknown) {
    let request: RoutesRecommendRequest;
    try {
      request = routesRecommendRequestSchema.parse(rawRequest);
    } catch (error) {
      throw new ValidationError("Route recommendation request validation failed.", error);
    }

    try {
      const [registryVersion, destinationGraphs] = await Promise.all([
        getRegistryVersion(this.pool),
        this.loadDestinationGraphs(),
      ]);

      const candidateContext = buildCandidateContext(request);
      const candidates: ScoredRecommendation[] = [];

      const businessCandidate = buildBusinessCandidate(request.confirmed_place);
      if (businessCandidate) {
        candidates.push(businessCandidate);
      }

      for (const graph of destinationGraphs) {
        const matched = buildMatchedRoute(graph, candidateContext);
        if (matched) {
          candidates.push(matched);
        }
      }

      let ranking = await this.routeReasoner.rankCandidates({
        incident_id: request.incident_id,
        fact_set: request.fact_set,
        confirmed_place: request.confirmed_place,
        location_context: request.location_context,
        candidates,
      });

      ranking = {
        ranked: ranking.ranked.map((candidate) => ({
          route: routeRecommendationSchema.parse(candidate.route),
          score: candidate.score,
        })),
        model_metadata: modelMetadataSchema.parse(ranking.model_metadata),
      };

      const routeGroups = buildRouteGroups(ranking.ranked);
      return {
        incident_id: request.incident_id,
        registry_version: registryVersion.registry_version,
        generated_at: new Date().toISOString(),
        model_metadata: ranking.model_metadata,
        route_groups: routeGroups.map((group) => routeGroupSchema.parse(group)),
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError("Route recommendation failed.", error);
    }
  }

  async getDestinationDetail(rawParams: unknown) {
    let params: { destinationId: string };
    try {
      params = routeDetailParamsSchema.parse(rawParams);
    } catch (error) {
      throw new ValidationError("Destination detail request validation failed.", error);
    }

    try {
      const graphs = await this.loadDestinationGraphs(params.destinationId);
      if (graphs.length !== 1) {
        throw new NotFoundError("Destination not found.", {
          destination_id: params.destinationId,
        });
      }
      const graph = graphs[0];
      if (!graph) {
        throw new NotFoundError("Destination not found.", {
          destination_id: params.destinationId,
        });
      }

      return {
        destination: toDestinationDto(graph),
      };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError("Destination lookup failed.", error);
    }
  }

  private async loadDestinationGraphs(destinationId?: string) {
    const destinationResult = await this.pool.query<DestinationRow>(
      `
        SELECT
          id,
          destination_name,
          destination_type,
          jurisdiction_country,
          jurisdiction_state,
          jurisdiction_county,
          jurisdiction_city,
          categories_handled_json,
          source_url,
          last_verified_date::text,
          trust_level,
          status
        FROM dossier_backend.destination
        WHERE status = 'active'
          AND ($1::uuid IS NULL OR id = $1::uuid)
      `,
      [destinationId ?? null],
    );

    if (destinationResult.rowCount === 0) {
      return [];
    }

    const destinationIds = destinationResult.rows.map((row) => row.id);
    const intakeResult = await this.pool.query<DestinationIntakeRow>(
      `
        SELECT
          id,
          destination_id,
          intake_method,
          complaint_url,
          email,
          phone,
          mailing_address_json,
          notes_required_fields,
          notes_required_documents
        FROM dossier_backend.destination_intake
        WHERE destination_id = ANY($1::uuid[])
      `,
      [destinationIds],
    );
    const ruleResult = await this.pool.query<DestinationRuleRow>(
      `
        SELECT
          id,
          destination_id,
          incident_categories_json,
          business_types_json,
          jurisdiction_rules_json,
          priority_weight,
          exclusions_json,
          reason_template
        FROM dossier_backend.destination_rule
        WHERE destination_id = ANY($1::uuid[])
      `,
      [destinationIds],
    );

    const intakeMap = new Map<string, DestinationIntakeRow[]>();
    for (const intake of intakeResult.rows) {
      const bucket = intakeMap.get(intake.destination_id) ?? [];
      bucket.push(intake);
      intakeMap.set(intake.destination_id, bucket);
    }

    const ruleMap = new Map<string, DestinationRuleRow[]>();
    for (const rule of ruleResult.rows) {
      const bucket = ruleMap.get(rule.destination_id) ?? [];
      bucket.push(rule);
      ruleMap.set(rule.destination_id, bucket);
    }

    return destinationResult.rows.map((destination) => ({
      destination,
      intakes: intakeMap.get(destination.id) ?? [],
      rules: ruleMap.get(destination.id) ?? [],
    }));
  }
}

function buildCandidateContext(request: RoutesRecommendRequest): CandidateContext {
  const state = request.location_context?.state ?? inferStateFromVenue(request.confirmed_place) ?? null;
  const city = request.location_context?.city ?? null;
  const address = request.location_context?.address ?? request.confirmed_place?.address ?? null;
  return {
    incidentType: request.fact_set.incident_type,
    inferredBusinessTypes: inferBusinessTypes(request.fact_set, request.confirmed_place),
    state,
    city,
    address,
    confirmedPlace: request.confirmed_place,
    factSet: request.fact_set,
  };
}

function buildBusinessCandidate(confirmedPlace: VenueMatch | null): ScoredRecommendation | null {
  if (!confirmedPlace) {
    return null;
  }

  const route = routeRecommendationSchema.parse({
    destination_id: null,
    destination_name_snapshot: confirmedPlace.business_name,
    destination_type_snapshot: "business",
    route_category: "Business",
    rank: 1,
    reason: "Matches the business location captured for this case.",
    source_label: confirmedPlace.source_label,
    source_url: confirmedPlace.source_url,
    last_verified_date: confirmedPlace.captured_at.slice(0, 10),
    trust_level: confirmedPlace.trust_level,
    intake_methods_snapshot: buildBusinessIntakeMethods(confirmedPlace),
    required_documents_snapshot: [],
    available_actions: buildBusinessActions(confirmedPlace),
    destination: null,
  });

  return {
    route,
    score: 1000 + confirmedPlace.match_confidence * 100,
  };
}

function buildMatchedRoute(graph: DestinationGraph, context: CandidateContext): ScoredRecommendation | null {
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestRule: DestinationRuleRow | null = null;

  for (const rule of graph.rules) {
    const score = scoreRuleMatch(graph.destination, rule, context);
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  if (!bestRule || bestScore < 0) {
    return null;
  }

  const destination = toDestinationDto(graph);
  const route = routeRecommendationSchema.parse({
    destination_id: destination.destination_id,
    destination_name_snapshot: destination.destination_name,
    destination_type_snapshot: destination.destination_type,
    route_category: routeCategoryForDestination(graph.destination),
    rank: 1,
    reason: bestRule.reason_template,
    source_label: sourceLabelFromUrl(destination.source_url),
    source_url: destination.source_url,
    last_verified_date: destination.last_verified_date,
    trust_level: destination.trust_level,
    intake_methods_snapshot: destination.intake_methods,
    required_documents_snapshot: destination.notes_required_documents,
    available_actions: buildAvailableActions(graph.intakes),
    destination,
  });

  return {
    route,
    score: bestScore,
  };
}

function scoreRuleMatch(destination: DestinationRow, rule: DestinationRuleRow, context: CandidateContext) {
  if (!matchesIncidentCategory(rule, context.incidentType)) {
    return -1;
  }
  if (!matchesJurisdiction(destination, rule, context)) {
    return -1;
  }
  if (!matchesBusinessType(rule, context.inferredBusinessTypes)) {
    return -1;
  }
  if (isExcluded(rule.exclusions_json, context)) {
    return -1;
  }

  const incidentBonus = context.incidentType && rule.incident_categories_json.includes(context.incidentType) ? 35 : 0;
  const businessBonus = countOverlap(rule.business_types_json, context.inferredBusinessTypes) * 8;
  const jurisdictionBonus = computeJurisdictionBonus(destination, context);
  const trustBonus = trustWeight(destination.trust_level);
  return rule.priority_weight + incidentBonus + businessBonus + jurisdictionBonus + trustBonus;
}

function matchesIncidentCategory(rule: DestinationRuleRow, incidentType: string | null) {
  if (rule.incident_categories_json.length === 0) {
    return true;
  }
  if (!incidentType) {
    return false;
  }
  return rule.incident_categories_json.includes(incidentType);
}

function matchesJurisdiction(destination: DestinationRow, rule: DestinationRuleRow, context: CandidateContext) {
  const countryEquals = readString(rule.jurisdiction_rules_json.country_equals);
  if (countryEquals && countryEquals !== "US") {
    return false;
  }

  if (destination.destination_type === "federal_agency") {
    return true;
  }

  const stateEquals = readStringArray(rule.jurisdiction_rules_json.state_equals);
  if (stateEquals.length > 0) {
    if (!context.state || !stateEquals.includes(context.state)) {
      return false;
    }
  }

  const cityEquals = readStringArray(rule.jurisdiction_rules_json.city_equals);
  if (cityEquals.length > 0) {
    if (!context.city || !cityEquals.includes(context.city)) {
      return false;
    }
  }

  return true;
}

function matchesBusinessType(rule: DestinationRuleRow, inferredBusinessTypes: Set<string>) {
  if (rule.business_types_json.length === 0) {
    return true;
  }
  return rule.business_types_json.some((businessType) => inferredBusinessTypes.has(businessType));
}

function isExcluded(exclusions: string[], context: CandidateContext) {
  return exclusions.some((exclusion) => {
    switch (exclusion) {
      case "workplace_only":
        return isWorkplaceCase(context);
      case "wage_only":
        return context.incidentType === "workplace_wages";
      case "housing_only":
        return isHousingCase(context);
      case "emergency_only":
        return context.incidentType === "emergency";
      case "employment_discrimination_only":
        return context.incidentType?.includes("employment") ?? false;
      case "general_consumer_only":
        return isGeneralConsumerCase(context);
      case "general_consumer_only_without_health_or_privacy_signal":
        return isGeneralConsumerCase(context) && !hasAnySignal(context, ["health", "privacy", "data"]);
      case "general_retail_only":
        return context.incidentType === "retail_transaction";
      case "non_communications_only":
        return !hasAnyBusinessType(context, ["communications_provider", "internet_provider", "wireless_provider", "tv_provider"]);
      case "non_financial_product_only":
        return !hasAnyBusinessType(context, ["bank", "credit_card_issuer", "debt_collector", "mortgage_servicer", "credit_bureau"]);
      case "private_dispute_only_without_civil_rights_signal":
        return !hasAnySignal(context, ["civil", "rights", "discrimination"]);
      case "housing_discrimination_federal_priority":
        return hasAnySignal(context, ["housing", "tenant", "landlord", "discrimination"]);
      case "regulated_financial_product_federal_priority":
        return hasAnyBusinessType(context, ["bank", "credit_card_issuer", "debt_collector", "mortgage_servicer", "credit_bureau"]);
      default:
        return false;
    }
  });
}

function toDestinationDto(graph: DestinationGraph): DestinationDto {
  const orderedIntakes = [...graph.intakes].sort((left, right) => intakeOrder(left.intake_method) - intakeOrder(right.intake_method));
  const intakeMethods = dedupe(orderedIntakes.map((intake) => intake.intake_method));
  const complaintUrl = firstPresent(orderedIntakes.map((intake) => intake.complaint_url));
  const email = firstPresent(orderedIntakes.map((intake) => intake.email));
  const phone = firstPresent(orderedIntakes.map((intake) => intake.phone));
  const mailingAddress = firstPresent(orderedIntakes.map((intake) => intake.mailing_address_json));
  const notesRequiredFields = dedupe(orderedIntakes.flatMap((intake) => intake.notes_required_fields));
  const notesRequiredDocuments = dedupe(orderedIntakes.flatMap((intake) => intake.notes_required_documents));

  return destinationSchema.parse({
    destination_id: graph.destination.id,
    destination_name: graph.destination.destination_name,
    destination_type: graph.destination.destination_type,
    jurisdiction: {
      country: graph.destination.jurisdiction_country,
      state: graph.destination.jurisdiction_state,
      county: graph.destination.jurisdiction_county,
      city: graph.destination.jurisdiction_city,
    },
    categories_handled: graph.destination.categories_handled_json,
    intake_methods: intakeMethods,
    complaint_url: complaintUrl,
    email,
    phone,
    mailing_address: mailingAddress,
    source_url: graph.destination.source_url,
    last_verified_date: graph.destination.last_verified_date,
    trust_level: graph.destination.trust_level,
    notes_required_fields: notesRequiredFields,
    notes_required_documents: notesRequiredDocuments,
  });
}

function buildRouteGroups(rankedCandidates: ScoredRecommendation[]): RouteGroup[] {
  const routeGroups = new Map<RouteCategory, RouteRecommendation[]>();
  for (const category of routeCategoryValues) {
    routeGroups.set(category, []);
  }

  for (const candidate of rankedCandidates) {
    const group = routeGroups.get(candidate.route.route_category);
    if (!group) {
      continue;
    }
    group.push(candidate.route);
  }

  return routeCategoryValues.map((category) => ({
    route_category: category,
    routes: (routeGroups.get(category) ?? []).map((route, index) =>
      routeRecommendationSchema.parse({
        ...route,
        rank: index + 1,
      }),
    ),
  }));
}

function routeCategoryForDestination(destination: DestinationRow): RouteCategory {
  switch (destination.destination_type) {
    case "business":
    case "corporate":
      return "Business";
    case "local_agency":
    case "law_enforcement":
      return "Local";
    case "state_agency":
      return "State";
    case "federal_agency":
      return "Federal";
    default:
      return "Other verified routes";
  }
}

function sourceLabelFromUrl(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return sourceUrl;
  }
}

function buildAvailableActions(intakes: DestinationIntakeRow[]): AvailableAction[] {
  const actions = new Set<AvailableAction>();
  for (const intake of intakes) {
    if (intake.complaint_url && (intake.intake_method === "web_form" || intake.intake_method === "portal")) {
      actions.add("open_form");
    }
    if (intake.phone) {
      actions.add("call");
    }
    if (intake.email) {
      actions.add("email");
    }
  }
  actions.add("share_packet");
  actions.add("export_packet");
  actions.add("save_for_later");
  return [...actions];
}

function buildBusinessIntakeMethods(confirmedPlace: VenueMatch): IntakeMethod[] {
  const methods = new Set<IntakeMethod>();
  if (confirmedPlace.website) {
    methods.add("web_form");
  }
  if (confirmedPlace.phone) {
    methods.add("phone");
  }
  return methods.size > 0 ? [...methods] : ["phone"];
}

function buildBusinessActions(confirmedPlace: VenueMatch): AvailableAction[] {
  const actions = new Set<AvailableAction>();
  if (confirmedPlace.website) {
    actions.add("open_form");
  }
  if (confirmedPlace.phone) {
    actions.add("call");
  }
  actions.add("share_packet");
  actions.add("export_packet");
  actions.add("save_for_later");
  return [...actions];
}

function inferBusinessTypes(factSet: FactSet, confirmedPlace: VenueMatch | null) {
  const sourceText = [
    confirmedPlace?.business_name ?? "",
    ...factSet.businesses,
    ...factSet.key_facts,
    ...factSet.places,
  ]
    .join(" ")
    .toLowerCase();

  const inferred = new Set<string>();
  if (sourceText) {
    inferred.add("general_business");
  }
  if (/(retail|store|market|shop|restaurant|cafe|merchant)/.test(sourceText)) {
    inferred.add("retail");
  }
  if (/(online|app|website|platform|service)/.test(sourceText)) {
    inferred.add("online_services");
  }
  if (/(contractor|repair|plumber|electric|cleaning|home service)/.test(sourceText)) {
    inferred.add("home_services");
  }
  if (/(bank|credit union)/.test(sourceText)) {
    inferred.add("bank");
  }
  if (/(credit card|issuer)/.test(sourceText)) {
    inferred.add("credit_card_issuer");
  }
  if (/(debt collector|collection)/.test(sourceText)) {
    inferred.add("debt_collector");
  }
  if (/(mortgage|loan servicer)/.test(sourceText)) {
    inferred.add("mortgage_servicer");
  }
  if (/(credit bureau|credit report)/.test(sourceText)) {
    inferred.add("credit_bureau");
  }
  if (/(internet|broadband)/.test(sourceText)) {
    inferred.add("internet_provider");
    inferred.add("communications_provider");
  }
  if (/(wireless|cell|phone carrier|mobile provider)/.test(sourceText)) {
    inferred.add("wireless_provider");
    inferred.add("communications_provider");
  }
  if (/(cable|tv provider|broadcast)/.test(sourceText)) {
    inferred.add("tv_provider");
    inferred.add("communications_provider");
  }
  if (/(employer|job site|workplace|manager|hr)/.test(sourceText)) {
    inferred.add("employer");
    inferred.add("job_site");
  }
  if (/(hospital|clinic|doctor|health plan|insurer)/.test(sourceText)) {
    inferred.add("health_provider");
    inferred.add("health_plan");
  }
  if (inferred.size === 0) {
    inferred.add("general_business");
  }
  return inferred;
}

function inferStateFromVenue(confirmedPlace: VenueMatch | null) {
  if (!confirmedPlace) {
    return null;
  }
  const segments = confirmedPlace.address.split(",").map((segment) => segment.trim());
  for (const segment of segments) {
    const state = segment.match(/\b([A-Z]{2})\b/);
    if (state) {
      return state[1];
    }
  }
  return null;
}

function computeJurisdictionBonus(destination: DestinationRow, context: CandidateContext) {
  if (destination.destination_type === "federal_agency") {
    return 20;
  }
  if (destination.jurisdiction_state && context.state && destination.jurisdiction_state === context.state) {
    return 18;
  }
  if (destination.jurisdiction_city && context.city && destination.jurisdiction_city === context.city) {
    return 15;
  }
  return 0;
}

function trustWeight(trustLevel: TrustLevel) {
  switch (trustLevel) {
    case "official":
      return 12;
    case "verified":
      return 8;
    case "directory":
      return 4;
    case "unconfirmed":
      return 0;
  }
}

function isWorkplaceCase(context: CandidateContext) {
  return (context.incidentType?.startsWith("workplace_") ?? false) || hasAnyBusinessType(context, ["employer", "job_site"]);
}

function isHousingCase(context: CandidateContext) {
  return hasAnySignal(context, ["housing", "tenant", "landlord", "lease", "apartment"]);
}

function isGeneralConsumerCase(context: CandidateContext) {
  return ["consumer_billing", "retail_transaction", "service_quality", "fraud_or_deception", "price_gouging"].includes(
    context.incidentType ?? "",
  );
}

function hasAnySignal(context: CandidateContext, fragments: string[]) {
  const haystack = [
    context.incidentType ?? "",
    ...context.factSet.key_facts,
    ...context.factSet.timeline.map((item) => item.description),
    ...context.factSet.businesses,
    context.confirmedPlace?.business_name ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return fragments.some((fragment) => haystack.includes(fragment));
}

function hasAnyBusinessType(context: CandidateContext, businessTypes: string[]) {
  return businessTypes.some((businessType) => context.inferredBusinessTypes.has(businessType));
}

function countOverlap(values: string[], candidates: Set<string>) {
  return values.reduce((count, value) => count + (candidates.has(value) ? 1 : 0), 0);
}

function compareCandidates(left: ScoredRecommendation, right: ScoredRecommendation) {
  const categoryDelta =
    routeCategoryValues.indexOf(left.route.route_category) - routeCategoryValues.indexOf(right.route.route_category);
  if (categoryDelta !== 0) {
    return categoryDelta;
  }
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  return left.route.destination_name_snapshot.localeCompare(right.route.destination_name_snapshot);
}

function intakeOrder(intakeMethod: IntakeMethod) {
  return ["web_form", "portal", "email", "phone", "mail", "in_person"].indexOf(intakeMethod);
}

function firstPresent<T>(values: Array<T | null>) {
  for (const value of values) {
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function dedupe<T>(values: T[]) {
  return [...new Set(values)];
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
