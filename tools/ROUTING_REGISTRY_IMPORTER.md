# Routing Registry Importer

This tool compiles the reviewed routing seed files into:

- a normalized import bundle JSON
- a SQL upsert script for `dossier_backend.destination*` and `dossier_backend.verification_record`
- an import report with counts, warnings, and errors

Default reviewed inputs:

- `/home/grey/codex-dossier/docs/routing-seed-pack/routing_registry_batch1_federal_core_expanded_review.csv`
- `/home/grey/codex-dossier/docs/routing-seed-pack/routing_registry_batch2_state_consumer_50_states_dc_review.csv`

Run:

```bash
python /home/grey/codex-dossier/tools/routing_registry_importer.py
```

Override inputs:

```bash
python /home/grey/codex-dossier/tools/routing_registry_importer.py \
  --input /home/grey/codex-dossier/docs/routing-seed-pack/routing_registry_batch1_federal_core_expanded_review.csv \
  --input /home/grey/codex-dossier/docs/routing-seed-pack/routing_registry_import_example.json
```

Generated outputs land in:

- `/home/grey/codex-dossier/generated/routing-registry/`
