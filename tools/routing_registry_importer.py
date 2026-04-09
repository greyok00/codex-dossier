#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import NAMESPACE_URL, uuid5


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUTS = [
    ROOT / "docs" / "routing-seed-pack" / "routing_registry_batch1_federal_core_expanded_review.csv",
    ROOT / "docs" / "routing-seed-pack" / "routing_registry_batch2_state_consumer_50_states_dc_review.csv",
]
DEFAULT_OUTPUT_DIR = ROOT / "generated" / "routing-registry"

VALID_DESTINATION_TYPES = {
    "business",
    "corporate",
    "local_agency",
    "state_agency",
    "federal_agency",
    "regulator",
    "law_enforcement",
    "consumer_org",
    "other",
}
VALID_INTAKE_METHODS = {"web_form", "email", "phone", "mail", "portal", "in_person"}
VALID_TRUST_LEVELS = {"official", "verified", "directory", "unconfirmed"}
VALID_STATUS = {"active", "inactive"}
VALID_VERIFICATION_RESULTS = {"verified", "changed", "failed", "unreachable", "skipped"}
VALID_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DC", "DE", "FL",
    "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA",
    "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE",
    "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI",
    "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV",
    "WY",
}


class ImportValidationError(Exception):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compile routing registry CSV/JSON seed files into normalized records, "
            "a SQL upsert script, and an import report."
        )
    )
    parser.add_argument(
        "--input",
        action="append",
        dest="inputs",
        help="Input CSV or JSON file. Repeatable. Defaults to the reviewed Batch 1 and Batch 2 CSVs.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory. Defaults to {DEFAULT_OUTPUT_DIR}",
    )
    parser.add_argument(
        "--import-batch-id",
        default=f"routing-registry-import-{utc_now().strftime('%Y%m%dT%H%M%SZ')}",
        help="Logical import batch identifier for generated artifacts.",
    )
    parser.add_argument(
        "--fail-on-warning",
        action="store_true",
        help="Exit non-zero if warnings are present.",
    )
    return parser.parse_args()


def clean_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def clean_email(value: Any) -> str | None:
    text = clean_string(value)
    return text.lower() if text else None


def normalize_phone(value: Any) -> str | None:
    text = clean_string(value)
    if not text:
        return None
    digits = re.sub(r"\D", "", text)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        return f"+1-{digits[0:3]}-{digits[3:6]}-{digits[6:10]}"
    return text


def clean_url(value: Any) -> str | None:
    text = clean_string(value)
    if not text:
        return None
    return text


def ensure_url(value: str | None, field_name: str) -> str:
    if not value:
        raise ImportValidationError(f"{field_name} is required")
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ImportValidationError(f"{field_name} must be an absolute http/https URL")
    return value


def parse_iso_date(value: Any, field_name: str) -> date:
    text = clean_string(value)
    if not text:
        raise ImportValidationError(f"{field_name} is required")
    try:
        return date.fromisoformat(text)
    except ValueError as exc:
        raise ImportValidationError(f"{field_name} must be YYYY-MM-DD") from exc


def parse_iso_datetime(value: Any, field_name: str) -> datetime:
    text = clean_string(value)
    if not text:
        raise ImportValidationError(f"{field_name} is required")
    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ImportValidationError(f"{field_name} must be ISO 8601") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def split_pipe_list(value: Any) -> list[str]:
    text = clean_string(value)
    if not text:
        return []
    parts = [item.strip() for item in text.split("|")]
    seen: set[str] = set()
    result: list[str] = []
    for item in parts:
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result


def ordered_unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def ensure_choice(value: str | None, valid: set[str], field_name: str) -> str:
    if not value:
        raise ImportValidationError(f"{field_name} is required")
    if value not in valid:
        allowed = ", ".join(sorted(valid))
        raise ImportValidationError(f"{field_name} must be one of: {allowed}")
    return value


def normalize_state(value: Any, field_name: str, required: bool = False) -> str | None:
    text = clean_string(value)
    if not text:
        if required:
            raise ImportValidationError(f"{field_name} is required")
        return None
    upper = text.upper()
    if upper not in VALID_STATES:
        raise ImportValidationError(f"{field_name} must be a U.S. state code or DC")
    return upper


def build_mailing_address(
    line1: Any,
    line2: Any,
    city: Any,
    state: Any,
    postal_code: Any,
    country: str = "US",
) -> dict[str, Any] | None:
    payload = {
        "line1": clean_string(line1),
        "line2": clean_string(line2),
        "city": clean_string(city),
        "state": normalize_state(state, "mailing_address_state", required=False),
        "postal_code": clean_string(postal_code),
        "country": country,
    }
    if not any(value for key, value in payload.items() if key != "country"):
        return None
    return payload


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def stable_uuid(namespace_name: str, parts: list[Any]) -> str:
    token = "::".join("" if part is None else json_dumps(part) if isinstance(part, (dict, list)) else str(part) for part in parts)
    return str(uuid5(uuid5(NAMESPACE_URL, f"https://dossier.local/{namespace_name}"), token))


def cadence_days(destination_type: str) -> int:
    if destination_type == "federal_agency":
        return 30
    if destination_type == "state_agency":
        return 45
    if destination_type in {"local_agency", "law_enforcement"}:
        return 30
    return 30


def next_review_due(last_verified: date, destination_type: str) -> datetime:
    return datetime.combine(last_verified + timedelta(days=cadence_days(destination_type)), time.min, timezone.utc)


def destination_canonical_key(destination: dict[str, Any]) -> tuple[str, str, str, str, str, str]:
    return (
        destination["destination_name"],
        destination["destination_type"],
        destination["jurisdiction_state"] or "",
        destination["jurisdiction_county"] or "",
        destination["jurisdiction_city"] or "",
        destination["source_url"],
    )


def intake_identity(intake: dict[str, Any]) -> tuple[str, str | None, str | None, str | None, str]:
    return (
        intake["intake_method"],
        intake["complaint_url"],
        intake["email"],
        intake["phone"],
        json_dumps(intake["mailing_address_json"]),
    )


def rule_identity(rule: dict[str, Any]) -> tuple[str, str, str, int, str]:
    return (
        json_dumps(rule["incident_categories_json"]),
        json_dumps(rule["business_types_json"]),
        json_dumps(rule["jurisdiction_rules_json"]),
        rule["priority_weight"],
        json_dumps(rule["exclusions_json"]) + "::" + rule["reason_template"],
    )


def verification_identity(record: dict[str, Any]) -> tuple[str, str, str]:
    return (
        record["source_url"],
        record["checked_at"],
        record["result"],
    )


def sql_quote(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value).replace("'", "''")
    return f"'{text}'"


def sql_json(value: Any) -> str:
    return f"{sql_quote(json.dumps(value, ensure_ascii=True, separators=(',', ':'), sort_keys=True))}::jsonb"


@dataclass
class CompiledDestination:
    destination: dict[str, Any]
    intakes: list[dict[str, Any]] = field(default_factory=list)
    rules: list[dict[str, Any]] = field(default_factory=list)
    verification_records: list[dict[str, Any]] = field(default_factory=list)
    source_files: list[str] = field(default_factory=list)
    source_kinds: list[str] = field(default_factory=list)
    merged_from: int = 0


class ImportCompiler:
    def __init__(self, import_batch_id: str) -> None:
        self.import_batch_id = import_batch_id
        self.destinations: dict[tuple[str, str, str, str, str, str], CompiledDestination] = {}
        self.report: dict[str, Any] = {
            "import_batch_id": import_batch_id,
            "generated_at": utc_now().isoformat().replace("+00:00", "Z"),
            "inputs": [],
            "summary": {},
            "warnings": [],
            "errors": [],
        }

    def add_warning(self, file_path: Path, message: str, context: dict[str, Any] | None = None) -> None:
        self.report["warnings"].append(
            {"file": str(file_path), "message": message, "context": context or {}}
        )

    def add_error(self, file_path: Path, message: str, context: dict[str, Any] | None = None) -> None:
        self.report["errors"].append(
            {"file": str(file_path), "message": message, "context": context or {}}
        )

    def load(self, file_path: Path) -> None:
        suffix = file_path.suffix.lower()
        if suffix == ".csv":
            self._load_csv(file_path)
        elif suffix == ".json":
            self._load_json(file_path)
        else:
            raise ImportValidationError(f"Unsupported input file type: {file_path}")

    def _load_csv(self, file_path: Path) -> None:
        accepted = 0
        rejected = 0
        with file_path.open(newline="") as handle:
            reader = csv.DictReader(handle)
            for row_number, row in enumerate(reader, start=2):
                try:
                    compiled = self._compile_csv_row(file_path, row, row_number)
                    self._merge_compiled_destination(compiled, file_path, "csv")
                    accepted += 1
                except ImportValidationError as exc:
                    rejected += 1
                    self.add_error(file_path, str(exc), {"row_number": row_number})
        self.report["inputs"].append(
            {
                "file": str(file_path),
                "kind": "csv",
                "accepted_rows": accepted,
                "rejected_rows": rejected,
            }
        )

    def _load_json(self, file_path: Path) -> None:
        accepted = 0
        rejected = 0
        payload = json.loads(file_path.read_text())
        destinations = payload.get("destinations", [])
        if not isinstance(destinations, list):
            raise ImportValidationError(f"{file_path} destinations must be an array")
        for index, item in enumerate(destinations):
            try:
                compiled = self._compile_json_destination(file_path, item, index)
                self._merge_compiled_destination(compiled, file_path, "json")
                accepted += 1
            except ImportValidationError as exc:
                rejected += 1
                self.add_error(file_path, str(exc), {"destination_index": index})
        self.report["inputs"].append(
            {
                "file": str(file_path),
                "kind": "json",
                "accepted_destinations": accepted,
                "rejected_destinations": rejected,
            }
        )

    def _compile_csv_row(self, file_path: Path, row: dict[str, Any], row_number: int) -> CompiledDestination:
        destination_name = clean_string(row.get("destination_name"))
        destination_type = ensure_choice(clean_string(row.get("destination_type")), VALID_DESTINATION_TYPES, "destination_type")
        jurisdiction_country = clean_string(row.get("jurisdiction_country")) or "US"
        if jurisdiction_country != "US":
            raise ImportValidationError("jurisdiction_country must be US")
        jurisdiction_state = normalize_state(row.get("jurisdiction_state"), "jurisdiction_state", required=False)
        destination = {
            "id": stable_uuid(
                "destination",
                [
                    destination_name,
                    destination_type,
                    jurisdiction_country,
                    jurisdiction_state,
                    clean_string(row.get("jurisdiction_county")),
                    clean_string(row.get("jurisdiction_city")),
                    ensure_url(clean_url(row.get("source_url")), "source_url"),
                ],
            ),
            "destination_name": destination_name or self._missing("destination_name"),
            "destination_type": destination_type,
            "jurisdiction_country": jurisdiction_country,
            "jurisdiction_state": jurisdiction_state,
            "jurisdiction_county": clean_string(row.get("jurisdiction_county")),
            "jurisdiction_city": clean_string(row.get("jurisdiction_city")),
            "categories_handled_json": self._require_non_empty_list(split_pipe_list(row.get("categories_handled")), "categories_handled"),
            "source_url": ensure_url(clean_url(row.get("source_url")), "source_url"),
            "last_verified_date": parse_iso_date(row.get("last_verified_date"), "last_verified_date").isoformat(),
            "trust_level": ensure_choice(clean_string(row.get("trust_level")), VALID_TRUST_LEVELS, "trust_level"),
            "status": "active",
        }
        intake_method = ensure_choice(clean_string(row.get("intake_method")), VALID_INTAKE_METHODS, "intake_method")
        intake = {
            "id": stable_uuid(
                "destination-intake",
                [
                    destination["id"],
                    intake_method,
                    clean_url(row.get("complaint_url")),
                    clean_email(row.get("email")),
                    normalize_phone(row.get("phone")),
                    build_mailing_address(
                        row.get("mailing_address_line1"),
                        row.get("mailing_address_line2"),
                        row.get("mailing_address_city"),
                        row.get("mailing_address_state"),
                        row.get("mailing_address_postal_code"),
                    ),
                ],
            ),
            "destination_id": destination["id"],
            "intake_method": intake_method,
            "complaint_url": clean_url(row.get("complaint_url")),
            "email": clean_email(row.get("email")),
            "phone": normalize_phone(row.get("phone")),
            "mailing_address_json": build_mailing_address(
                row.get("mailing_address_line1"),
                row.get("mailing_address_line2"),
                row.get("mailing_address_city"),
                row.get("mailing_address_state"),
                row.get("mailing_address_postal_code"),
            ),
            "notes_required_fields": split_pipe_list(row.get("notes_required_fields")),
            "notes_required_documents": split_pipe_list(row.get("notes_required_documents")),
        }
        self._validate_intake(intake)

        jurisdiction_rules = {"country_equals": "US"}
        if destination["jurisdiction_state"]:
            jurisdiction_rules["state_equals"] = [destination["jurisdiction_state"]]
        if destination["jurisdiction_county"]:
            jurisdiction_rules["county_equals"] = [destination["jurisdiction_county"]]
        if destination["jurisdiction_city"]:
            jurisdiction_rules["city_equals"] = [destination["jurisdiction_city"]]

        priority_weight = self._parse_priority_weight(row.get("priority_weight"))
        rule = {
            "id": stable_uuid(
                "destination-rule",
                [
                    destination["id"],
                    split_pipe_list(row.get("incident_categories")),
                    split_pipe_list(row.get("business_types")),
                    jurisdiction_rules,
                    priority_weight,
                    split_pipe_list(row.get("exclusions")),
                    clean_string(row.get("reason_template")),
                ],
            ),
            "destination_id": destination["id"],
            "incident_categories_json": self._require_non_empty_list(split_pipe_list(row.get("incident_categories")), "incident_categories"),
            "business_types_json": self._require_non_empty_list(split_pipe_list(row.get("business_types")), "business_types"),
            "jurisdiction_rules_json": jurisdiction_rules,
            "priority_weight": priority_weight,
            "exclusions_json": split_pipe_list(row.get("exclusions")),
            "reason_template": clean_string(row.get("reason_template")) or self._missing("reason_template"),
        }

        checked_at_dt = datetime.combine(parse_iso_date(destination["last_verified_date"], "last_verified_date"), time.min, timezone.utc)
        verification = {
            "id": stable_uuid(
                "verification-record",
                [destination["id"], destination["source_url"], checked_at_dt.isoformat(), "verified"],
            ),
            "destination_id": destination["id"],
            "source_url": destination["source_url"],
            "checked_at": checked_at_dt.isoformat().replace("+00:00", "Z"),
            "result": "verified",
            "change_summary": f"Imported from reviewed CSV seed row {row_number}.",
            "checked_by": "seed_import_csv",
            "next_review_due": next_review_due(parse_iso_date(destination["last_verified_date"], "last_verified_date"), destination["destination_type"]).isoformat().replace("+00:00", "Z"),
        }

        return CompiledDestination(
            destination=destination,
            intakes=[intake],
            rules=[rule],
            verification_records=[verification],
        )

    def _compile_json_destination(self, file_path: Path, item: dict[str, Any], index: int) -> CompiledDestination:
        if not isinstance(item, dict):
            raise ImportValidationError("JSON destination item must be an object")
        destination_payload = item.get("destination")
        if not isinstance(destination_payload, dict):
            raise ImportValidationError("JSON destination item must contain a destination object")

        destination_name = clean_string(destination_payload.get("destination_name"))
        destination_type = ensure_choice(clean_string(destination_payload.get("destination_type")), VALID_DESTINATION_TYPES, "destination_type")
        jurisdiction_country = clean_string(destination_payload.get("jurisdiction_country")) or "US"
        if jurisdiction_country != "US":
            raise ImportValidationError("jurisdiction_country must be US")
        jurisdiction_state = normalize_state(destination_payload.get("jurisdiction_state"), "jurisdiction_state", required=False)
        source_url = ensure_url(clean_url(destination_payload.get("source_url")), "source_url")
        last_verified = parse_iso_date(destination_payload.get("last_verified_date"), "last_verified_date")
        destination = {
            "id": stable_uuid(
                "destination",
                [
                    destination_name,
                    destination_type,
                    jurisdiction_country,
                    jurisdiction_state,
                    clean_string(destination_payload.get("jurisdiction_county")),
                    clean_string(destination_payload.get("jurisdiction_city")),
                    source_url,
                ],
            ),
            "destination_name": destination_name or self._missing("destination_name"),
            "destination_type": destination_type,
            "jurisdiction_country": jurisdiction_country,
            "jurisdiction_state": jurisdiction_state,
            "jurisdiction_county": clean_string(destination_payload.get("jurisdiction_county")),
            "jurisdiction_city": clean_string(destination_payload.get("jurisdiction_city")),
            "categories_handled_json": self._require_non_empty_list(
                self._normalize_list(destination_payload.get("categories_handled"), "categories_handled"),
                "categories_handled",
            ),
            "source_url": source_url,
            "last_verified_date": last_verified.isoformat(),
            "trust_level": ensure_choice(clean_string(destination_payload.get("trust_level")), VALID_TRUST_LEVELS, "trust_level"),
            "status": ensure_choice(clean_string(destination_payload.get("status")) or "active", VALID_STATUS, "status"),
        }

        intakes_payload = item.get("intakes") or []
        if not isinstance(intakes_payload, list):
            raise ImportValidationError("intakes must be an array")
        intakes: list[dict[str, Any]] = []
        for intake_payload in intakes_payload:
            if not isinstance(intake_payload, dict):
                raise ImportValidationError("intake items must be objects")
            mailing_address = intake_payload.get("mailing_address")
            if mailing_address is not None and not isinstance(mailing_address, dict):
                raise ImportValidationError("mailing_address must be an object when provided")
            intake = {
                "id": stable_uuid(
                    "destination-intake",
                    [
                        destination["id"],
                        ensure_choice(clean_string(intake_payload.get("intake_method")), VALID_INTAKE_METHODS, "intake_method"),
                        clean_url(intake_payload.get("complaint_url")),
                        clean_email(intake_payload.get("email")),
                        normalize_phone(intake_payload.get("phone")),
                        mailing_address,
                    ],
                ),
                "destination_id": destination["id"],
                "intake_method": ensure_choice(clean_string(intake_payload.get("intake_method")), VALID_INTAKE_METHODS, "intake_method"),
                "complaint_url": clean_url(intake_payload.get("complaint_url")),
                "email": clean_email(intake_payload.get("email")),
                "phone": normalize_phone(intake_payload.get("phone")),
                "mailing_address_json": mailing_address,
                "notes_required_fields": self._normalize_list(intake_payload.get("notes_required_fields"), "notes_required_fields"),
                "notes_required_documents": self._normalize_list(intake_payload.get("notes_required_documents"), "notes_required_documents"),
            }
            self._validate_intake(intake)
            intakes.append(intake)
        if not intakes:
            raise ImportValidationError("JSON destination must include at least one intake")

        rules_payload = item.get("rules") or []
        if not isinstance(rules_payload, list):
            raise ImportValidationError("rules must be an array")
        rules: list[dict[str, Any]] = []
        for rule_payload in rules_payload:
            if not isinstance(rule_payload, dict):
                raise ImportValidationError("rule items must be objects")
            jurisdiction_rules = rule_payload.get("jurisdiction_rules") or {}
            if not isinstance(jurisdiction_rules, dict):
                raise ImportValidationError("jurisdiction_rules must be an object")
            priority_weight = self._parse_priority_weight(rule_payload.get("priority_weight"))
            rule = {
                "id": stable_uuid(
                    "destination-rule",
                    [
                        destination["id"],
                        self._normalize_list(rule_payload.get("incident_categories"), "incident_categories"),
                        self._normalize_list(rule_payload.get("business_types"), "business_types"),
                        jurisdiction_rules,
                        priority_weight,
                        self._normalize_list(rule_payload.get("exclusions"), "exclusions"),
                        clean_string(rule_payload.get("reason_template")),
                    ],
                ),
                "destination_id": destination["id"],
                "incident_categories_json": self._require_non_empty_list(
                    self._normalize_list(rule_payload.get("incident_categories"), "incident_categories"),
                    "incident_categories",
                ),
                "business_types_json": self._require_non_empty_list(
                    self._normalize_list(rule_payload.get("business_types"), "business_types"),
                    "business_types",
                ),
                "jurisdiction_rules_json": jurisdiction_rules,
                "priority_weight": priority_weight,
                "exclusions_json": self._normalize_list(rule_payload.get("exclusions"), "exclusions"),
                "reason_template": clean_string(rule_payload.get("reason_template")) or self._missing("reason_template"),
            }
            rules.append(rule)
        if not rules:
            raise ImportValidationError("JSON destination must include at least one rule")

        verification_records: list[dict[str, Any]] = []
        verification_payloads: list[dict[str, Any]] = []
        if isinstance(item.get("verification_record"), dict):
            verification_payloads.append(item["verification_record"])
        if isinstance(item.get("verification_records"), list):
            verification_payloads.extend([payload for payload in item["verification_records"] if isinstance(payload, dict)])
        if not verification_payloads:
            verification_payloads.append(
                {
                    "source_url": source_url,
                    "checked_at": datetime.combine(last_verified, time.min, timezone.utc).isoformat().replace("+00:00", "Z"),
                    "result": "verified",
                    "change_summary": f"Imported from nested JSON destination {index}.",
                    "checked_by": "seed_import_json",
                    "next_review_due": next_review_due(last_verified, destination_type).isoformat().replace("+00:00", "Z"),
                }
            )
        for verification_payload in verification_payloads:
            checked_at = parse_iso_datetime(verification_payload.get("checked_at"), "checked_at")
            result = ensure_choice(clean_string(verification_payload.get("result")), VALID_VERIFICATION_RESULTS, "result")
            verification = {
                "id": stable_uuid(
                    "verification-record",
                    [
                        destination["id"],
                        ensure_url(clean_url(verification_payload.get("source_url")), "source_url"),
                        checked_at.isoformat(),
                        result,
                    ],
                ),
                "destination_id": destination["id"],
                "source_url": ensure_url(clean_url(verification_payload.get("source_url")), "source_url"),
                "checked_at": checked_at.isoformat().replace("+00:00", "Z"),
                "result": result,
                "change_summary": clean_string(verification_payload.get("change_summary")) or "",
                "checked_by": clean_string(verification_payload.get("checked_by")) or "seed_import_json",
                "next_review_due": (
                    parse_iso_datetime(verification_payload.get("next_review_due"), "next_review_due").isoformat().replace("+00:00", "Z")
                    if clean_string(verification_payload.get("next_review_due"))
                    else next_review_due(last_verified, destination_type).isoformat().replace("+00:00", "Z")
                ),
            }
            verification_records.append(verification)

        return CompiledDestination(
            destination=destination,
            intakes=intakes,
            rules=rules,
            verification_records=verification_records,
        )

    def _merge_compiled_destination(self, compiled: CompiledDestination, file_path: Path, source_kind: str) -> None:
        key = destination_canonical_key(compiled.destination)
        existing = self.destinations.get(key)
        if existing is None:
            compiled.source_files = [str(file_path)]
            compiled.source_kinds = [source_kind]
            compiled.merged_from = 1
            self.destinations[key] = compiled
            return

        existing.source_files = ordered_unique(existing.source_files + [str(file_path)])
        existing.source_kinds = ordered_unique(existing.source_kinds + [source_kind])
        existing.merged_from += 1
        existing.destination["categories_handled_json"] = ordered_unique(
            existing.destination["categories_handled_json"] + compiled.destination["categories_handled_json"]
        )
        existing.destination["last_verified_date"] = max(
            existing.destination["last_verified_date"], compiled.destination["last_verified_date"]
        )
        existing.destination["trust_level"] = self._stronger_trust(
            existing.destination["trust_level"], compiled.destination["trust_level"]
        )
        existing.destination["status"] = "active" if "active" in {existing.destination["status"], compiled.destination["status"]} else "inactive"

        intake_keys = {intake_identity(item) for item in existing.intakes}
        for intake in compiled.intakes:
            identity = intake_identity(intake)
            if identity not in intake_keys:
                existing.intakes.append(intake)
                intake_keys.add(identity)

        rule_keys = {rule_identity(item) for item in existing.rules}
        for rule in compiled.rules:
            identity = rule_identity(rule)
            if identity not in rule_keys:
                existing.rules.append(rule)
                rule_keys.add(identity)

        verification_keys = {verification_identity(item) for item in existing.verification_records}
        for record in compiled.verification_records:
            identity = verification_identity(record)
            if identity not in verification_keys:
                existing.verification_records.append(record)
                verification_keys.add(identity)

    def finalize(self) -> dict[str, Any]:
        compiled_destinations = sorted(
            self.destinations.values(),
            key=lambda item: (
                item.destination["destination_type"],
                item.destination["jurisdiction_state"] or "",
                item.destination["destination_name"],
            ),
        )
        destination_count = len(compiled_destinations)
        intake_count = sum(len(item.intakes) for item in compiled_destinations)
        rule_count = sum(len(item.rules) for item in compiled_destinations)
        verification_count = sum(len(item.verification_records) for item in compiled_destinations)
        self.report["summary"] = {
            "destination_count": destination_count,
            "intake_count": intake_count,
            "rule_count": rule_count,
            "verification_record_count": verification_count,
            "by_destination_type": Counter(item.destination["destination_type"] for item in compiled_destinations),
            "warnings": len(self.report["warnings"]),
            "errors": len(self.report["errors"]),
        }
        return {
            "import_batch_id": self.import_batch_id,
            "generated_at": self.report["generated_at"],
            "source_files": sorted({source for item in compiled_destinations for source in item.source_files}),
            "summary": {
                "destination_count": destination_count,
                "intake_count": intake_count,
                "rule_count": rule_count,
                "verification_record_count": verification_count,
            },
            "destinations": [
                {
                    "destination": deepcopy(item.destination),
                    "intakes": deepcopy(item.intakes),
                    "rules": deepcopy(item.rules),
                    "verification_records": deepcopy(item.verification_records),
                    "source_files": list(item.source_files),
                    "source_kinds": list(item.source_kinds),
                    "merged_from": item.merged_from,
                }
                for item in compiled_destinations
            ],
        }

    def _stronger_trust(self, left: str, right: str) -> str:
        rank = {"unconfirmed": 0, "directory": 1, "verified": 2, "official": 3}
        return left if rank[left] >= rank[right] else right

    def _parse_priority_weight(self, value: Any) -> int:
        text = clean_string(value)
        if text is None:
            raise ImportValidationError("priority_weight is required")
        try:
            parsed = int(text)
        except ValueError as exc:
            raise ImportValidationError("priority_weight must be an integer") from exc
        if parsed < 0:
            raise ImportValidationError("priority_weight must be >= 0")
        return parsed

    def _normalize_list(self, value: Any, field_name: str) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            normalized = [clean_string(item) for item in value]
            return [item for item in normalized if item]
        raise ImportValidationError(f"{field_name} must be an array")

    def _validate_intake(self, intake: dict[str, Any]) -> None:
        if intake["complaint_url"]:
            ensure_url(intake["complaint_url"], "complaint_url")
        if not any([intake["complaint_url"], intake["email"], intake["phone"], intake["mailing_address_json"]]):
            raise ImportValidationError("destination intake must include a complaint URL, email, phone, or mailing address")

    def _require_non_empty_list(self, value: list[str], field_name: str) -> list[str]:
        if not value:
            raise ImportValidationError(f"{field_name} must not be empty")
        return value

    def _missing(self, field_name: str) -> str:
        raise ImportValidationError(f"{field_name} is required")


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n")


def build_sql(bundle: dict[str, Any]) -> str:
    lines = [
        "-- Generated by tools/routing_registry_importer.py",
        f"-- import_batch_id: {bundle['import_batch_id']}",
        f"-- generated_at: {bundle['generated_at']}",
        "BEGIN;",
        "",
    ]
    for item in bundle["destinations"]:
        destination = item["destination"]
        lines.extend(
            [
                "INSERT INTO dossier_backend.destination (",
                "  id,",
                "  destination_name,",
                "  destination_type,",
                "  jurisdiction_country,",
                "  jurisdiction_state,",
                "  jurisdiction_county,",
                "  jurisdiction_city,",
                "  categories_handled_json,",
                "  source_url,",
                "  last_verified_date,",
                "  trust_level,",
                "  status",
                ") VALUES (",
                f"  {sql_quote(destination['id'])},",
                f"  {sql_quote(destination['destination_name'])},",
                f"  {sql_quote(destination['destination_type'])}::dossier_enum.destination_type_enum,",
                f"  {sql_quote(destination['jurisdiction_country'])},",
                f"  {sql_quote(destination['jurisdiction_state'])},",
                f"  {sql_quote(destination['jurisdiction_county'])},",
                f"  {sql_quote(destination['jurisdiction_city'])},",
                f"  {sql_json(destination['categories_handled_json'])},",
                f"  {sql_quote(destination['source_url'])},",
                f"  {sql_quote(destination['last_verified_date'])}::date,",
                f"  {sql_quote(destination['trust_level'])}::dossier_enum.trust_level_enum,",
                f"  {sql_quote(destination['status'])}",
                ")",
                "ON CONFLICT (id) DO UPDATE SET",
                "  destination_name = EXCLUDED.destination_name,",
                "  destination_type = EXCLUDED.destination_type,",
                "  jurisdiction_country = EXCLUDED.jurisdiction_country,",
                "  jurisdiction_state = EXCLUDED.jurisdiction_state,",
                "  jurisdiction_county = EXCLUDED.jurisdiction_county,",
                "  jurisdiction_city = EXCLUDED.jurisdiction_city,",
                "  categories_handled_json = EXCLUDED.categories_handled_json,",
                "  source_url = EXCLUDED.source_url,",
                "  last_verified_date = EXCLUDED.last_verified_date,",
                "  trust_level = EXCLUDED.trust_level,",
                "  status = EXCLUDED.status,",
                "  updated_at = now();",
                "",
            ]
        )

        for intake in item["intakes"]:
            lines.extend(
                [
                    "INSERT INTO dossier_backend.destination_intake (",
                    "  id,",
                    "  destination_id,",
                    "  intake_method,",
                    "  complaint_url,",
                    "  email,",
                    "  phone,",
                    "  mailing_address_json,",
                    "  notes_required_fields,",
                    "  notes_required_documents",
                    ") VALUES (",
                    f"  {sql_quote(intake['id'])},",
                    f"  {sql_quote(intake['destination_id'])}::uuid,",
                    f"  {sql_quote(intake['intake_method'])}::dossier_enum.intake_method_enum,",
                    f"  {sql_quote(intake['complaint_url'])},",
                    f"  {sql_quote(intake['email'])},",
                    f"  {sql_quote(intake['phone'])},",
                    f"  {sql_json(intake['mailing_address_json']) if intake['mailing_address_json'] is not None else 'NULL'},",
                    f"  {sql_json(intake['notes_required_fields'])},",
                    f"  {sql_json(intake['notes_required_documents'])}",
                    ")",
                    "ON CONFLICT (id) DO UPDATE SET",
                    "  destination_id = EXCLUDED.destination_id,",
                    "  intake_method = EXCLUDED.intake_method,",
                    "  complaint_url = EXCLUDED.complaint_url,",
                    "  email = EXCLUDED.email,",
                    "  phone = EXCLUDED.phone,",
                    "  mailing_address_json = EXCLUDED.mailing_address_json,",
                    "  notes_required_fields = EXCLUDED.notes_required_fields,",
                    "  notes_required_documents = EXCLUDED.notes_required_documents,",
                    "  updated_at = now();",
                    "",
                ]
            )

        for rule in item["rules"]:
            lines.extend(
                [
                    "INSERT INTO dossier_backend.destination_rule (",
                    "  id,",
                    "  destination_id,",
                    "  incident_categories_json,",
                    "  business_types_json,",
                    "  jurisdiction_rules_json,",
                    "  priority_weight,",
                    "  exclusions_json,",
                    "  reason_template",
                    ") VALUES (",
                    f"  {sql_quote(rule['id'])},",
                    f"  {sql_quote(rule['destination_id'])}::uuid,",
                    f"  {sql_json(rule['incident_categories_json'])},",
                    f"  {sql_json(rule['business_types_json'])},",
                    f"  {sql_json(rule['jurisdiction_rules_json'])},",
                    f"  {sql_quote(rule['priority_weight'])},",
                    f"  {sql_json(rule['exclusions_json'])},",
                    f"  {sql_quote(rule['reason_template'])}",
                    ")",
                    "ON CONFLICT (id) DO UPDATE SET",
                    "  destination_id = EXCLUDED.destination_id,",
                    "  incident_categories_json = EXCLUDED.incident_categories_json,",
                    "  business_types_json = EXCLUDED.business_types_json,",
                    "  jurisdiction_rules_json = EXCLUDED.jurisdiction_rules_json,",
                    "  priority_weight = EXCLUDED.priority_weight,",
                    "  exclusions_json = EXCLUDED.exclusions_json,",
                    "  reason_template = EXCLUDED.reason_template,",
                    "  updated_at = now();",
                    "",
                ]
            )

        for record in item["verification_records"]:
            lines.extend(
                [
                    "INSERT INTO dossier_backend.verification_record (",
                    "  id,",
                    "  destination_id,",
                    "  source_url,",
                    "  checked_at,",
                    "  result,",
                    "  change_summary,",
                    "  checked_by,",
                    "  next_review_due",
                    ") VALUES (",
                    f"  {sql_quote(record['id'])},",
                    f"  {sql_quote(record['destination_id'])}::uuid,",
                    f"  {sql_quote(record['source_url'])},",
                    f"  {sql_quote(record['checked_at'])}::timestamptz,",
                    f"  {sql_quote(record['result'])},",
                    f"  {sql_quote(record['change_summary'])},",
                    f"  {sql_quote(record['checked_by'])},",
                    f"  {sql_quote(record['next_review_due'])}::timestamptz",
                    ")",
                    "ON CONFLICT (id) DO UPDATE SET",
                    "  destination_id = EXCLUDED.destination_id,",
                    "  source_url = EXCLUDED.source_url,",
                    "  checked_at = EXCLUDED.checked_at,",
                    "  result = EXCLUDED.result,",
                    "  change_summary = EXCLUDED.change_summary,",
                    "  checked_by = EXCLUDED.checked_by,",
                    "  next_review_due = EXCLUDED.next_review_due;",
                    "",
                ]
            )

    lines.append("COMMIT;")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    compiler = ImportCompiler(args.import_batch_id)
    input_files = [Path(path) for path in args.inputs] if args.inputs else list(DEFAULT_INPUTS)

    for file_path in input_files:
        if not file_path.exists():
            compiler.add_error(file_path, "Input file does not exist")
            continue
        compiler.load(file_path)

    bundle = compiler.finalize()
    bundle_path = output_dir / "routing_registry_compiled_bundle.json"
    report_path = output_dir / "routing_registry_import_report.json"
    sql_path = output_dir / "routing_registry_seed_upsert.sql"

    write_json(bundle_path, bundle)
    write_json(report_path, compiler.report)
    sql_path.write_text(build_sql(bundle))

    summary = compiler.report["summary"]
    print(f"Compiled destinations: {summary['destination_count']}")
    print(f"Compiled intakes: {summary['intake_count']}")
    print(f"Compiled rules: {summary['rule_count']}")
    print(f"Compiled verification records: {summary['verification_record_count']}")
    print(f"Warnings: {summary['warnings']}")
    print(f"Errors: {summary['errors']}")
    print(f"Bundle: {bundle_path}")
    print(f"Report: {report_path}")
    print(f"SQL: {sql_path}")

    if compiler.report["errors"]:
        return 1
    if args.fail_on_warning and compiler.report["warnings"]:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
