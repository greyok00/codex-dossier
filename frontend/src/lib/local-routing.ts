import routingRegistryBundle from "../../../generated/routing-registry/routing_registry_compiled_bundle.json";

import type { RouteGroup, RouteTrustLevel } from "./db";
import type { FactSetDto, RouteRecommendationDto } from "./runtime";

type IntakeMethod = "web_form" | "email" | "phone" | "mail" | "portal" | "in_person";

interface RegistryBundle {
  destinations: RegistryEntry[];
}

interface RegistryEntry {
  destination: {
    id: string;
    destination_name: string;
    destination_type: string;
    jurisdiction_country: string;
    jurisdiction_state: string | null;
    jurisdiction_county: string | null;
    jurisdiction_city: string | null;
    categories_handled_json: string[];
    source_url: string;
    last_verified_date: string;
    trust_level: RouteTrustLevel;
    status: string;
  };
  intakes: Array<{
    id: string;
    destination_id: string;
    intake_method: IntakeMethod;
    complaint_url: string | null;
    email: string | null;
    phone: string | null;
    mailing_address_json:
      | {
          line1?: string;
          line2?: string | null;
          city?: string;
          state?: string;
          postal_code?: string;
          country?: string;
        }
      | null;
    notes_required_fields: string[];
    notes_required_documents: string[];
  }>;
  rules: Array<{
    id: string;
    destination_id: string;
    incident_categories_json: string[];
    business_types_json: string[];
    jurisdiction_rules_json: {
      country_equals?: string;
      state_equals?: string[];
      city_equals?: string[];
    };
    priority_weight: number;
    exclusions_json: string[];
    reason_template: string;
  }>;
}

interface RouteContext {
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  confirmed_place_name: string | null;
  confirmed_place_phone: string | null;
  transcript_excerpt: string | null;
}

interface BuiltRoute {
  recommendation: RouteRecommendationDto;
  priority: number;
  relevance: number;
}

const registryEntries = (routingRegistryBundle as RegistryBundle).destinations;

const GROUP_ORDER: RouteGroup[] = ["Business", "Local", "State", "Federal", "Other"];
const MAX_RECOMMENDATIONS = 6;

const BUSINESS_TYPE_KEYWORDS: Array<{ type: string; patterns: RegExp[] }> = [
  { type: "retail", patterns: [/\bmarket\b/iu, /\bstore\b/iu, /\bshop\b/iu, /\bretail\b/iu] },
  { type: "restaurant", patterns: [/\brestaurant\b/iu, /\bcafe\b/iu, /\bdiner\b/iu, /\bbar\b/iu] },
  { type: "bank", patterns: [/\bbank\b/iu, /\bcredit union\b/iu] },
  { type: "credit_card_issuer", patterns: [/\bcredit card\b/iu] },
  { type: "internet_provider", patterns: [/\binternet\b/iu, /\bwireless\b/iu, /\bcell\b/iu, /\bphone service\b/iu] },
  { type: "employer", patterns: [/\bemployer\b/iu, /\bmanager\b/iu, /\bpayroll\b/iu] },
  { type: "landlord", patterns: [/\blandlord\b/iu, /\bproperty manager\b/iu, /\brent\b/iu, /\bapartment\b/iu] },
  { type: "health_provider", patterns: [/\bclinic\b/iu, /\bhospital\b/iu, /\bdoctor\b/iu, /\bmedical\b/iu] },
  {
    type: "law_enforcement",
    patterns: [/\bpolice\b/iu, /\bofficer\b/iu, /\bdepartment\b/iu, /\bsheriff\b/iu, /\binternal affairs\b/iu],
  },
  { type: "public_entity", patterns: [/\bcity\b/iu, /\bcounty\b/iu, /\bstate\b/iu, /\bpublic agency\b/iu] },
  { type: "business", patterns: [/.*/u] },
  { type: "general_business", patterns: [/.*/u] },
];

export function buildDeterministicRouteRecommendations(input: {
  incident_id: string;
  fact_set: FactSetDto;
  context: RouteContext;
}): RouteRecommendationDto[] {
  const categories = deriveCategories(input.fact_set, input.context.transcript_excerpt);
  const businessTypes = inferBusinessTypes(input.fact_set, input.context);
  const emergencyCase = categories.includes("emergency_safety");
  const policeMisconductCase = categories.includes("police_misconduct");
  const { state, city } = inferStateCityContext(input);
  const builtRoutes: BuiltRoute[] = [];

  if (emergencyCase && !policeMisconductCase) {
    builtRoutes.push(...buildEmergencyRoutes(input, state, city));
  }

  if (policeMisconductCase) {
    builtRoutes.push(...buildPoliceMisconductRoutes(input, state, city));
  }

  const businessRoute = emergencyCase || policeMisconductCase ? null : buildBusinessRoute(input, state);
  if (businessRoute) {
    builtRoutes.push({
      recommendation: businessRoute,
      priority: 1000,
      relevance: 88,
    });
  }

  for (const entry of registryEntries) {
    if (entry.destination.status !== "active") {
      continue;
    }
    if (isExcludedDestination(entry.destination.destination_name, entry.destination.source_url)) {
      continue;
    }

    const routeGroup = mapDestinationTypeToGroup(entry.destination.destination_type);
    if (!routeGroup) {
      continue;
    }

    const matchingRule = entry.rules
      .filter((rule) => ruleMatches(rule, categories, businessTypes, state, city, entry.destination.destination_type))
      .sort((left, right) => right.priority_weight - left.priority_weight)[0];

    if (!matchingRule) {
      continue;
    }

    builtRoutes.push({
      recommendation: buildRegistryRoute(entry, routeGroup, matchingRule),
      priority: matchingRule.priority_weight,
      relevance: scoreRegistryRelevance(matchingRule.priority_weight, routeGroup, entry.destination.trust_level),
    });
  }

  const otherRoute = policeMisconductCase ? null : buildBetterBusinessRoute(input, categories);
  if (otherRoute) {
    builtRoutes.push({
      recommendation: otherRoute,
      priority: 40,
      relevance: 76,
    });
  }
  builtRoutes.push(...buildFallbackRoutes(input, state, policeMisconductCase));
  builtRoutes.push(...buildFederalResourceRoutes(input, categories, businessTypes, policeMisconductCase));

  const sortedByRelevance = builtRoutes
    .sort((left, right) => {
      const groupDifference =
        GROUP_ORDER.indexOf(left.recommendation.route_group) - GROUP_ORDER.indexOf(right.recommendation.route_group);
      if (groupDifference !== 0) {
        return groupDifference;
      }

      if (left.relevance !== right.relevance) {
        return right.relevance - left.relevance;
      }

      return left.recommendation.destination_name_snapshot.localeCompare(right.recommendation.destination_name_snapshot);
    });

  const relevant = sortedByRelevance.filter((item) => item.relevance >= 75);
  const selected: BuiltRoute[] = [];
  const selectedGroups = new Set<RouteGroup>();

  for (const candidate of relevant) {
    if (selected.length >= Math.min(5, MAX_RECOMMENDATIONS)) {
      break;
    }
    if (selectedGroups.has(candidate.recommendation.route_group)) {
      continue;
    }
    selected.push(candidate);
    selectedGroups.add(candidate.recommendation.route_group);
  }

  for (const candidate of relevant) {
    if (selected.length >= MAX_RECOMMENDATIONS) {
      break;
    }
    if (selected.includes(candidate)) {
      continue;
    }
    selected.push(candidate);
  }

  if (selected.length < MAX_RECOMMENDATIONS) {
    for (const candidate of sortedByRelevance) {
      if (selected.length >= MAX_RECOMMENDATIONS) {
        break;
      }
      if (selected.includes(candidate)) {
        continue;
      }
      selected.push(candidate);
    }
  }

  return dedupeRoutes(selected).map((item, index) => ({
    ...item.recommendation,
    reason: `${item.recommendation.reason} Relevance: ${Math.round(item.relevance)}%.`,
    rank: index + 1,
  }));
}

function buildBusinessRoute(
  input: {
    incident_id: string;
    fact_set: FactSetDto;
    context: RouteContext;
  },
  state: string | null,
): RouteRecommendationDto | null {
  const businessName = input.context.confirmed_place_name ?? input.fact_set.businesses[0] ?? null;
  if (!businessName) {
    return null;
  }

  const phone = input.context.confirmed_place_phone ?? input.fact_set.phones[0] ?? null;
  const requiredDocuments = compact([
    input.fact_set.amounts.length > 0 ? "Receipt or charge amount" : null,
    "Original audio capture",
    "Transcript",
  ]);

  return {
    id: crypto.randomUUID(),
    destination_id: null,
    destination_name_snapshot: `${businessName} public contact`,
    destination_type_snapshot: "business",
    route_group: "Business",
    rank: 0,
    reason: state
      ? `Matches the business named in the case facts and the saved location in ${state}.`
      : "Matches the business named in the case facts.",
    source_label: "Transcript and saved case facts",
    source_url: null,
    trust_level: phone ? "verified" : "unconfirmed",
    last_verified_date: null,
    complaint_url: null,
    email: null,
    phone,
    mailing_address: input.context.location_address,
    intake_methods_snapshot: phone ? ["phone"] : ["email"],
    required_documents_snapshot: requiredDocuments,
    available_actions: phone ? ["call", "share_packet", "export_packet", "save_for_later"] : ["share_packet", "export_packet", "save_for_later"],
    selected: false,
  };
}

function buildEmergencyRoutes(
  input: {
    incident_id: string;
    fact_set: FactSetDto;
    context: RouteContext;
  },
  state: string | null,
  city: string | null,
): BuiltRoute[] {
  const routes: BuiltRoute[] = [];
  const localPoliceResource = getLocalPoliceResource(state, city);

  routes.push({
    recommendation: {
      id: crypto.randomUUID(),
      destination_id: null,
      destination_name_snapshot: city && state ? `${city}, ${state} police report information` : "Local police report information",
      destination_type_snapshot: "law_enforcement",
      route_group: "Local",
      rank: 0,
      reason:
        city && state
          ? `Use this to file a local police report in ${city}, ${state}.`
          : state
            ? `Use this to file a local police report in ${state}.`
            : "Use this to file a local police report.",
      source_label: localPoliceResource?.source_label ?? "No verified local police site on file",
      source_url: localPoliceResource?.source_url ?? null,
      trust_level: localPoliceResource?.trust_level ?? "unconfirmed",
      last_verified_date: new Date().toISOString().slice(0, 10),
      complaint_url: localPoliceResource?.complaint_url ?? null,
      email: null,
      phone: null,
      mailing_address: input.context.location_address,
      intake_methods_snapshot: localPoliceResource ? ["web_form"] : [],
      required_documents_snapshot: ["Proof packet", "Date and time", "Location details"],
      available_actions: localPoliceResource ? ["open_form", "share_packet", "export_packet", "save_for_later"] : ["share_packet", "export_packet", "save_for_later"],
      selected: false,
    },
    priority: 1200,
    relevance: 95,
  });

  return routes;
}

function getLocalPoliceResource(
  state: string | null,
  city: string | null,
): Pick<RouteRecommendationDto, "source_label" | "source_url" | "trust_level" | "complaint_url"> | null {
  if (state && city) {
    return null;
  }
  return null;
}

function buildRegistryRoute(entry: RegistryEntry, routeGroup: RouteGroup, rule: RegistryEntry["rules"][number]): RouteRecommendationDto {
  const intakeMethods = unique(entry.intakes.map((intake) => intake.intake_method));
  const requiredDocuments = unique(entry.intakes.flatMap((intake) => intake.notes_required_documents ?? []));
  const preferredIntake =
    entry.intakes.find((intake) => intake.complaint_url) ??
    entry.intakes.find((intake) => intake.phone) ??
    entry.intakes[0] ??
    null;

  return {
    id: crypto.randomUUID(),
    destination_id: entry.destination.id,
    destination_name_snapshot: normalizeDestinationName(entry.destination.destination_name),
    destination_type_snapshot: entry.destination.destination_type,
    route_group: routeGroup,
    rank: 0,
    reason: rule.reason_template,
    source_label: sourceLabelFromUrl(entry.destination.source_url),
    source_url: entry.destination.source_url,
    trust_level: entry.destination.trust_level,
    last_verified_date: entry.destination.last_verified_date,
    complaint_url: preferredIntake?.complaint_url ?? null,
    email: preferredIntake?.email ?? null,
    phone: preferredIntake?.phone ?? null,
    mailing_address: formatMailingAddress(preferredIntake?.mailing_address_json ?? null),
    intake_methods_snapshot: intakeMethods,
    required_documents_snapshot: requiredDocuments,
    available_actions: mapIntakeMethodsToActions(intakeMethods),
    selected: false,
  };
}

function normalizeDestinationName(value: string) {
  if (/^ftc reportfraud portal$/iu.test(value.trim())) {
    return "FTC Report Fraud";
  }

  return value;
}

function buildBetterBusinessRoute(
  input: {
    incident_id: string;
    fact_set: FactSetDto;
    context: RouteContext;
  },
  categories: string[],
): RouteRecommendationDto | null {
  const businessName = input.context.confirmed_place_name ?? input.fact_set.businesses[0] ?? null;
  if (!businessName) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    destination_id: null,
    destination_name_snapshot: "Better Business Bureau Complaint",
    destination_type_snapshot: "consumer_org",
    route_group: "Other",
    rank: 0,
    reason: `Useful as an additional complaint route if direct contact with ${businessName} does not resolve the issue.`,
    source_label: "bbb.org",
    source_url: "https://www.bbb.org/file-a-complaint",
    trust_level: "directory",
    last_verified_date: new Date().toISOString().slice(0, 10),
    complaint_url: "https://www.bbb.org/file-a-complaint",
    email: null,
    phone: null,
    mailing_address: null,
    intake_methods_snapshot: ["web_form"],
    required_documents_snapshot: ["Business name", "Dates", "Proof packet"],
    available_actions: ["open_form", "share_packet", "export_packet", "save_for_later"],
    selected: false,
  };
}

function buildFallbackRoutes(
  input: {
    incident_id: string;
    fact_set: FactSetDto;
    context: RouteContext;
  },
  state: string | null,
  policeMisconductCase: boolean,
): BuiltRoute[] {
  const routes: BuiltRoute[] = [];
  const stateConsumerRoute = policeMisconductCase ? getStatePoliceOversightRoute(state) : getStateConsumerRoute(state);

  routes.push({
    recommendation: {
      id: crypto.randomUUID(),
      destination_id: null,
      destination_name_snapshot: stateConsumerRoute.destination_name_snapshot,
      destination_type_snapshot: "state_agency",
      route_group: "State",
      rank: 0,
      reason: stateConsumerRoute.reason,
      source_label: stateConsumerRoute.source_label,
      source_url: stateConsumerRoute.source_url,
      trust_level: stateConsumerRoute.trust_level,
      last_verified_date: new Date().toISOString().slice(0, 10),
      complaint_url: stateConsumerRoute.complaint_url,
      email: null,
      phone: null,
      mailing_address: null,
      intake_methods_snapshot: ["web_form"],
      required_documents_snapshot: ["Summary of what happened", "Dates", "Proof packet"],
      available_actions: ["open_form", "share_packet", "export_packet", "save_for_later"],
      selected: false,
    },
    priority: 50,
    relevance: 75,
  });

  if (!policeMisconductCase) {
    routes.push({
      recommendation: {
        id: crypto.randomUUID(),
        destination_id: null,
        destination_name_snapshot: "Business support and contact lookup",
        destination_type_snapshot: "business",
        route_group: "Business",
        rank: 0,
        reason: "If agency options are limited, contact the business directly with your saved proof packet.",
        source_label: "Case details",
        source_url: null,
        trust_level: "directory",
        last_verified_date: null,
        complaint_url: null,
        email: null,
        phone: input.fact_set.phones[0] ?? input.context.confirmed_place_phone ?? null,
        mailing_address: input.context.location_address,
        intake_methods_snapshot: ["phone", "email"],
        required_documents_snapshot: ["Proof packet", "Date", "Amount if relevant"],
        available_actions: ["call", "share_packet", "export_packet", "save_for_later"],
        selected: false,
      },
      priority: 45,
      relevance: 74,
    });
  }

  return routes;
}

function buildFederalResourceRoutes(
  input: {
    incident_id: string;
    fact_set: FactSetDto;
    context: RouteContext;
  },
  categories: string[],
  businessTypes: string[],
  policeMisconductCase: boolean,
): BuiltRoute[] {
  const routes: BuiltRoute[] = [];
  const haystack = [
    input.fact_set.incident_type,
    ...input.fact_set.businesses,
    ...input.fact_set.key_facts,
    input.context.transcript_excerpt,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (policeMisconductCase || categories.includes("civil_rights")) {
    routes.push({
      recommendation: {
        id: crypto.randomUUID(),
        destination_id: null,
        destination_name_snapshot: "U.S. Department of Justice Civil Rights Reporting Portal",
        destination_type_snapshot: "federal_agency",
        route_group: "Federal",
        rank: 0,
        reason: "Use the DOJ portal for federal civil rights complaints, including police misconduct and excessive force.",
        source_label: "civilrights.justice.gov",
        source_url: "https://civilrights.justice.gov/report/",
        trust_level: "official",
        last_verified_date: new Date().toISOString().slice(0, 10),
        complaint_url: "https://civilrights.justice.gov/report/",
        email: null,
        phone: null,
        mailing_address: null,
        intake_methods_snapshot: ["web_form"],
        required_documents_snapshot: ["Case summary", "Dates", "Agency or officer details", "Proof packet"],
        available_actions: ["open_form", "share_packet", "export_packet", "save_for_later"],
        selected: false,
      },
      priority: 72,
      relevance: 88,
    });
  }

  if (categories.includes("tenant_issue")) {
    routes.push({
      recommendation: {
        id: crypto.randomUUID(),
        destination_id: null,
        destination_name_snapshot: "USAGov Housing Complaint Guide",
        destination_type_snapshot: "federal_agency",
        route_group: "Federal",
        rank: 0,
        reason: "Use the USAGov housing complaint guide to reach the correct housing, landlord, or fair-housing complaint path.",
        source_label: "usa.gov",
        source_url: "https://www.usa.gov/housing-complaints",
        trust_level: "official",
        last_verified_date: new Date().toISOString().slice(0, 10),
        complaint_url: "https://www.usa.gov/housing-complaints",
        email: null,
        phone: null,
        mailing_address: null,
        intake_methods_snapshot: ["web_form"],
        required_documents_snapshot: ["Lease or rental documents", "Timeline", "Photos or records if available", "Proof packet"],
        available_actions: ["open_form", "share_packet", "export_packet", "save_for_later"],
        selected: false,
      },
      priority: 68,
      relevance: 86,
    });
  }

  if (categories.includes("workplace_wages")) {
    routes.push({
      recommendation: {
        id: crypto.randomUUID(),
        destination_id: null,
        destination_name_snapshot: "U.S. Department of Labor Wage and Hour Complaint Information",
        destination_type_snapshot: "federal_agency",
        route_group: "Federal",
        rank: 0,
        reason: "Use the Department of Labor Wage and Hour complaint path for wage, overtime, and pay practice issues.",
        source_label: "dol.gov",
        source_url: "https://www.dol.gov/agencies/whd/contact/complaints/information?lang=en",
        trust_level: "official",
        last_verified_date: new Date().toISOString().slice(0, 10),
        complaint_url: "https://www.dol.gov/agencies/whd/contact/complaints/information?lang=en",
        email: null,
        phone: null,
        mailing_address: null,
        intake_methods_snapshot: ["web_form", "phone"],
        required_documents_snapshot: ["Employer name", "Pay records if available", "Hours worked", "Proof packet"],
        available_actions: ["open_form", "call", "share_packet", "export_packet", "save_for_later"],
        selected: false,
      },
      priority: 67,
      relevance: 85,
    });
  }

  if (categories.includes("fraud_or_deception")) {
    routes.push({
      recommendation: {
        id: crypto.randomUUID(),
        destination_id: null,
        destination_name_snapshot: "Federal Trade Commission ReportFraud",
        destination_type_snapshot: "federal_agency",
        route_group: "Federal",
        rank: 0,
        reason: "Use ReportFraud for scams, deceptive practices, suspicious communications, and identity-theft related complaints.",
        source_label: "reportfraud.ftc.gov",
        source_url: "https://reportfraud.ftc.gov/",
        trust_level: "official",
        last_verified_date: new Date().toISOString().slice(0, 10),
        complaint_url: "https://reportfraud.ftc.gov/",
        email: null,
        phone: null,
        mailing_address: null,
        intake_methods_snapshot: ["web_form"],
        required_documents_snapshot: ["What happened", "Dates", "Contact details used by the scammer", "Proof packet"],
        available_actions: ["open_form", "share_packet", "export_packet", "save_for_later"],
        selected: false,
      },
      priority: 64,
      relevance: 84,
    });
  }

  if (categories.some((category) => category.startsWith("consumer_") || category === "retail_transaction" || category === "service_quality")) {
    routes.push({
      recommendation: {
        id: crypto.randomUUID(),
        destination_id: null,
        destination_name_snapshot: "USAGov Consumer Complaint Guide",
        destination_type_snapshot: "federal_agency",
        route_group: "Federal",
        rank: 0,
        reason: "Use the USAGov guide to find official federal and state complaint paths for company product and service issues.",
        source_label: "usa.gov",
        source_url: "https://www.usa.gov/company-product-service-complaints",
        trust_level: "official",
        last_verified_date: new Date().toISOString().slice(0, 10),
        complaint_url: "https://www.usa.gov/company-product-service-complaints",
        email: null,
        phone: null,
        mailing_address: null,
        intake_methods_snapshot: ["web_form"],
        required_documents_snapshot: ["Company name", "Transaction records", "Timeline", "Proof packet"],
        available_actions: ["open_form", "share_packet", "export_packet", "save_for_later"],
        selected: false,
      },
      priority: 60,
      relevance: 82,
    });
  }

  if (businessTypes.some((type) => ["bank", "credit_card_issuer", "internet_provider"].includes(type)) || /\bbank\b|\bcredit\b|\bcard\b|\bloan\b|\bwireless\b|\bcell\b|\bphone service\b/u.test(haystack)) {
    routes.push({
      recommendation: {
        id: crypto.randomUUID(),
        destination_id: null,
        destination_name_snapshot: "Consumer Financial Protection Bureau Complaint",
        destination_type_snapshot: "federal_agency",
        route_group: "Federal",
        rank: 0,
        reason: "Use the CFPB complaint path for bank, credit card, lending, and some telecom billing issues.",
        source_label: "consumerfinance.gov",
        source_url: "https://www.consumerfinance.gov/complaint/",
        trust_level: "official",
        last_verified_date: new Date().toISOString().slice(0, 10),
        complaint_url: "https://www.consumerfinance.gov/complaint/",
        email: null,
        phone: null,
        mailing_address: null,
        intake_methods_snapshot: ["web_form"],
        required_documents_snapshot: ["Account or transaction information", "Dates", "Billing records", "Proof packet"],
        available_actions: ["open_form", "share_packet", "export_packet", "save_for_later"],
        selected: false,
      },
      priority: 66,
      relevance: 86,
    });
  }

  return routes;
}

function getStateConsumerRoute(state: string | null) {
  if (state === "TX") {
    return {
      destination_name_snapshot: "Texas Attorney General Consumer Complaint",
      reason: "Use the Texas Attorney General complaint form for Texas consumer complaints and business disputes.",
      source_label: "texasattorneygeneral.gov",
      source_url: "https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint",
      complaint_url: "https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint",
      trust_level: "official" as const,
    };
  }

  if (state === "AZ") {
    return {
      destination_name_snapshot: "Arizona Attorney General Consumer Complaint",
      reason: "Use the Arizona Attorney General complaint form for Arizona consumer complaints and business disputes.",
      source_label: "azag.gov",
      source_url: "https://consumer-complaint.azag.gov/",
      complaint_url: "https://consumer-complaint.azag.gov/",
      trust_level: "official" as const,
    };
  }

  if (state) {
    return {
      destination_name_snapshot: `${state} state consumer office directory`,
      reason: "Use this directory to find the official state office and complaint pages.",
      source_label: "usa.gov",
      source_url: "https://www.usa.gov/state-consumer",
      complaint_url: "https://www.usa.gov/state-consumer",
      trust_level: "official" as const,
    };
  }

  return {
    destination_name_snapshot: "State consumer office directory",
    reason: "Use this to find state complaint offices and validated filing pages.",
    source_label: "usa.gov",
    source_url: "https://www.usa.gov/state-consumer",
    complaint_url: "https://www.usa.gov/state-consumer",
    trust_level: "official" as const,
  };
}

function getStatePoliceOversightRoute(state: string | null) {
  if (state) {
    return {
      destination_name_snapshot: `${state} attorney general office directory`,
      reason: "Use this directory to find your state attorney general office and complaint channels.",
      source_label: "usa.gov",
      source_url: "https://www.usa.gov/state-attorney-general",
      complaint_url: "https://www.usa.gov/state-attorney-general",
      trust_level: "official" as const,
    };
  }

  return {
    destination_name_snapshot: "State attorney general office directory",
    reason: "Use this directory to find state attorney general offices and official complaint channels.",
    source_label: "usa.gov",
    source_url: "https://www.usa.gov/state-attorney-general",
    complaint_url: "https://www.usa.gov/state-attorney-general",
    trust_level: "official" as const,
  };
}

function buildPoliceMisconductRoutes(
  input: {
    incident_id: string;
    fact_set: FactSetDto;
    context: RouteContext;
  },
  state: string | null,
  city: string | null,
): BuiltRoute[] {
  return [
    {
      recommendation: {
        id: crypto.randomUUID(),
        destination_id: null,
        destination_name_snapshot: city && state ? `${city}, ${state} police department complaint desk` : "Local police department complaint desk",
        destination_type_snapshot: "law_enforcement",
        route_group: "Local",
        rank: 0,
        reason:
          city && state
            ? `Start with the local department complaint channel for ${city}, ${state}, then keep the case packet for escalation.`
            : "Start with the local department complaint channel, then keep the case packet for escalation.",
        source_label: "Case location and transcript",
        source_url: null,
        trust_level: "unconfirmed",
        last_verified_date: null,
        complaint_url: null,
        email: null,
        phone: null,
        mailing_address: input.context.location_address,
        intake_methods_snapshot: ["phone", "in_person"],
        required_documents_snapshot: ["Case summary", "Date and time", "Officer details if known", "Proof packet"],
        available_actions: ["share_packet", "export_packet", "save_for_later"],
        selected: false,
      },
      priority: 88,
      relevance: 83,
    },
  ];
}

function ruleMatches(
  rule: RegistryEntry["rules"][number],
  categories: string[],
  businessTypes: string[],
  state: string | null,
  city: string | null,
  destinationType: string,
) {
  if (rule.incident_categories_json.length > 0 && !rule.incident_categories_json.some((category) => categories.includes(category))) {
    return false;
  }

  if (rule.business_types_json.length > 0 && !rule.business_types_json.some((type) => businessTypes.includes(type))) {
    return false;
  }

  if (destinationType === "state_agency") {
    const allowedStates = rule.jurisdiction_rules_json.state_equals ?? [];
    if (allowedStates.length > 0 && (!state || !allowedStates.includes(state))) {
      return false;
    }

    const allowedCities = rule.jurisdiction_rules_json.city_equals ?? [];
    if (allowedCities.length > 0 && city && !allowedCities.includes(city)) {
      return false;
    }
  }

  for (const exclusion of rule.exclusions_json) {
    if (exclusion === "general_retail_only" && businessTypes.includes("retail")) {
      return false;
    }
    if (exclusion === "non_communications_only" && !businessTypes.some((type) => type.includes("provider"))) {
      return false;
    }
    if (exclusion === "general_consumer_only" && categories.some((category) => category.startsWith("consumer_") || category === "retail_transaction")) {
      return false;
    }
    if (exclusion === "workplace_only" && categories.some((category) => category.startsWith("workplace_"))) {
      return false;
    }
    if (exclusion === "housing_only" && categories.some((category) => category.includes("housing") || category === "tenant_issue")) {
      return false;
    }
  }

  return true;
}

function deriveCategories(factSet: FactSetDto, transcriptExcerpt: string | null) {
  const categories = new Set<string>();
  if (factSet.incident_type) {
    categories.add(factSet.incident_type);
  }

  const haystack = [
    factSet.incident_type,
    factSet.people.join(" "),
    factSet.places.join(" "),
    factSet.businesses.join(" "),
    factSet.phones.join(" "),
    factSet.dates.join(" "),
    factSet.amounts.join(" "),
    factSet.key_facts.join(" "),
    factSet.timeline.map((item) => item.description).join(" "),
    transcriptExcerpt,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bcharged\b|\bbilling\b|\brefund\b|\bdouble charge\b|\bovercharged\b/iu.test(haystack)) {
    categories.add("consumer_billing");
  }
  if (/\bstore\b|\bmarket\b|\bretail\b|\bpurchase\b|\bcheckout\b|\breceipt\b/iu.test(haystack)) {
    categories.add("retail_transaction");
  }
  if (/\bfraud\b|\bscam\b|\bdeceptive\b|\bfake\b|\bmisled\b/iu.test(haystack)) {
    categories.add("fraud_or_deception");
  }
  if (/\bmurder\b|\bhomicide\b|\bshooting\b|\bweapon\b|\bassault\b|\battack\b|\bimmediate danger\b/iu.test(haystack)) {
    categories.add("emergency_safety");
  }
  if (
    /\bpolice misconduct\b|\bcomplaint against (?:a |an )?police\b|\bcomplaint against (?:an |a )?officer\b|\bcomplaint against (?:the )?police\b|\bexcessive force\b|\bbrutality\b|\binternal affairs\b|\bcivilian review\b|\babuse of authority\b/iu.test(
      haystack,
    )
  ) {
    categories.add("police_misconduct");
    categories.add("civil_rights");
  }
  if (/\bpolice report\b|\bbreak[- ]?in\b|\bbroken into\b|\bburglary\b|\bcar break[- ]?in\b|\brobbed\b|\brobbery\b|\bvandaliz/iu.test(haystack)) {
    categories.add("emergency_safety");
  }
  if (/\bstolen\b|\btheft\b|\bstole\b|\bcard stolen\b|\bcredit card stolen\b|\bidentity theft\b/iu.test(haystack)) {
    categories.add("fraud_or_deception");
  }
  if (/\bservice\b|\brude\b|\brefused\b|\bunresolved\b|\bquality\b/iu.test(haystack)) {
    categories.add("service_quality");
  }
  if (/\bprivacy\b|\bdata\b|\binformation\b/iu.test(haystack)) {
    categories.add("privacy_or_data");
  }
  if (/\bwage\b|\bpay\b|\bovertime\b/iu.test(haystack)) {
    categories.add("workplace_wages");
  }
  if (/\bdiscriminat/iu.test(haystack)) {
    categories.add("civil_rights");
  }

  return [...categories];
}

function inferBusinessTypes(factSet: FactSetDto, context: RouteContext) {
  const haystack = [
    ...factSet.businesses,
    ...factSet.key_facts,
    context.confirmed_place_name,
    context.transcript_excerpt,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const inferred = new Set<string>();
  for (const candidate of BUSINESS_TYPE_KEYWORDS) {
    if (candidate.patterns.some((pattern) => pattern.test(haystack))) {
      inferred.add(candidate.type);
    }
  }

  inferred.add("general_business");
  return [...inferred];
}

function inferStateCityContext(input: {
  fact_set: FactSetDto;
  context: RouteContext;
}) {
  const fromAddress = parseAddressContext(input.context.location_address);
  if (fromAddress.state && fromAddress.city) {
    return fromAddress;
  }

  const searchText = [
    ...input.fact_set.places,
    ...input.fact_set.businesses,
    ...input.fact_set.key_facts,
    input.context.transcript_excerpt,
  ]
    .filter(Boolean)
    .join(" ");

  const extracted = extractCityStateFromText(searchText);
  return {
    city: fromAddress.city ?? extracted.city,
    state: fromAddress.state ?? extracted.state,
  };
}

function extractCityStateFromText(text: string) {
  const stateFromText = extractStateCode(text);
  if (!stateFromText) {
    return {
      city: null,
      state: null,
    };
  }

  const statePattern = `(?:${stateFromText}|${stateNameFromCode(stateFromText)})`;
  const cityStateRegex = new RegExp(`\\b(?:in|at|near)\\s+([A-Za-z][A-Za-z .'-]{1,40}?)\\s*,?\\s*${statePattern}\\b`, "iu");
  const cityStateMatch = text.match(cityStateRegex);
  if (cityStateMatch?.[1]) {
    return {
      city: toTitleCase(cityStateMatch[1].trim()),
      state: stateFromText,
    };
  }

  const trailingRegex = new RegExp(`\\b([A-Za-z][A-Za-z .'-]{1,40}?)\\s*,\\s*${statePattern}\\b`, "iu");
  const trailingMatch = text.match(trailingRegex);
  if (trailingMatch?.[1]) {
    return {
      city: toTitleCase(trailingMatch[1].trim()),
      state: stateFromText,
    };
  }

  return {
    city: null,
    state: stateFromText,
  };
}

function stateNameFromCode(code: string) {
  const entry = Object.entries(US_STATE_CODES).find(([, value]) => value === code);
  return entry?.[0] ?? code;
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

function isExcludedDestination(destinationName: string, sourceUrl: string) {
  const normalized = destinationName.trim().toLowerCase();
  if (normalized.includes("ftc reportfraud") || normalized === "ftc report fraud") {
    return true;
  }
  return /reportfraud\.ftc\.gov/iu.test(sourceUrl);
}

function scoreRegistryRelevance(priorityWeight: number, group: RouteGroup, trust: RouteTrustLevel) {
  const trustBoost =
    trust === "official" ? 10 : trust === "verified" ? 7 : trust === "directory" ? 3 : 0;
  const groupBoost =
    group === "Business" ? 8 : group === "State" ? 6 : group === "Local" ? 5 : group === "Federal" ? 4 : 2;
  const weighted = 58 + Math.min(20, Math.max(0, priorityWeight)) + trustBoost + groupBoost;
  return Math.max(45, Math.min(97, weighted));
}

function dedupeRoutes(routes: BuiltRoute[]) {
  const seen = new Set<string>();
  const unique: BuiltRoute[] = [];
  for (const route of routes) {
    const key = `${route.recommendation.route_group}:${route.recommendation.destination_name_snapshot.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(route);
  }
  return unique;
}

function mapDestinationTypeToGroup(destinationType: string): RouteGroup | null {
  switch (destinationType) {
    case "state_agency":
      return "State";
    case "federal_agency":
      return "Federal";
    case "local_agency":
    case "law_enforcement":
      return "Local";
    case "consumer_org":
      return "Other";
    default:
      return null;
  }
}

function mapIntakeMethodsToActions(intakeMethods: string[]) {
  const actions = new Set<string>();
  for (const method of intakeMethods) {
    if (method === "web_form" || method === "portal") {
      actions.add("open_form");
    }
    if (method === "phone") {
      actions.add("call");
    }
    if (method === "email") {
      actions.add("email");
    }
  }
  actions.add("share_packet");
  actions.add("export_packet");
  actions.add("save_for_later");
  return [...actions];
}

function sourceLabelFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./u, "");
  } catch {
    return "Verified source";
  }
}

function formatMailingAddress(
  mailingAddress:
    | {
        line1?: string;
        line2?: string | null;
        city?: string;
        state?: string;
        postal_code?: string;
      }
    | null,
) {
  if (!mailingAddress) {
    return null;
  }

  return [mailingAddress.line1, mailingAddress.line2, mailingAddress.city && mailingAddress.state ? `${mailingAddress.city}, ${mailingAddress.state} ${mailingAddress.postal_code ?? ""}`.trim() : null]
    .filter(Boolean)
    .join(", ");
}

function parseAddressContext(address: string | null) {
  if (!address) {
    return {
      city: null,
      state: null,
    };
  }

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const city = parts.length >= 2 ? (parts.at(-2) ?? null) : null;
  const tail = parts.at(-1) ?? "";
  const stateMatch = tail.match(/\b([A-Z]{2})\b/u);

  return {
    city,
    state: stateMatch?.[1] ?? null,
  };
}

function extractStateCode(text: string) {
  const normalized = text.toLowerCase();
  for (const [name, code] of Object.entries(US_STATE_CODES)) {
    if (normalized.includes(name)) {
      return code;
    }
  }
  const abbrMatch = text.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/u);
  return abbrMatch?.[1] ?? null;
}

const US_STATE_CODES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function compact(values: Array<string | null>) {
  return values.filter((value): value is string => Boolean(value));
}
