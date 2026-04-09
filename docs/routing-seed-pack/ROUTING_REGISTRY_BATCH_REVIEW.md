# Routing Registry Batch Review

Status: Review-ready
Last updated: 2026-04-07

Reviewed files:

- `/home/grey/codex-dossier/docs/routing-seed-pack/routing_registry_batch1_federal_core_expanded_review.csv`
- `/home/grey/codex-dossier/docs/routing-seed-pack/routing_registry_batch2_state_consumer_50_states_dc_review.csv`
- `/home/grey/codex-dossier/docs/routing-seed-pack/routing_registry_first_seed_rows_review.csv`
- `/home/grey/codex-dossier/docs/routing-seed-pack/routing_registry_import_example.json`
- `/home/grey/codex-dossier/docs/routing-seed-pack/routing_registry_seed_template.csv`

## Applied cleanup

- Normalized `FTC ReportFraud Portal` as the federal fraud route name.
- Standardized phone values in the seed pack to `+1-NNN-NNN-NNNN`.
- Corrected the Connecticut complaint contact to the complaint-center toll-free number: `+1-800-842-2649`.
- Normalized the Connecticut complaint email to `DCP.complaints@ct.gov`.
- Added explicit import guidance that one flat CSV row represents one intake method and multi-intake destinations expand into multiple `destination_intake` records on import.

## Batch 1 checks

- Row count: `9`
- Coverage: federal core routes
- Trust level: all rows use `official`
- Phone format: all rows normalized
- Required route fields present: `destination_name`, `destination_type`, `jurisdiction`, `complaint_url`, `source_url`, `last_verified_date`, `trust_level`

Batch 1 exclusion vocabulary:

- `emergency_only`
- `employment_discrimination_only`
- `general_consumer_only`
- `general_consumer_only_without_health_or_privacy_signal`
- `general_retail_only`
- `housing_condition_only_without_discrimination_signal`
- `housing_only`
- `non_communications_only`
- `non_financial_product_only`
- `private_dispute_only_without_civil_rights_signal`
- `wage_only`
- `workplace_only`

## Batch 2 checks

- Row count: `51`
- Jurisdiction coverage: all `50` states plus `DC`
- Duplicate jurisdictions: none
- Missing phones: none
- Missing complaint URLs: none
- Missing source URLs: none
- Trust level: all rows use `official`
- Priority weight: all rows use `90`
- Phone format: all rows normalized

Batch 2 exclusion vocabulary:

- `housing_discrimination_federal_priority`
- `regulated_financial_product_federal_priority`
- `workplace_only`

## Import readiness

These files are now consistent enough for importer work to begin against the locked flat CSV and nested JSON shapes.
