# Handoff — ADR-0341, décision 1 (résultats d'écriture)

- Portée : une écriture sans `select` renvoie `{ id }` (TypeScript, REST, commandes de plugin, Master) ;
  une sélection explicite au-delà de `id` ou un `include` garde ADR-0306.
- Branche : `feat/adr-0341-results` (worktree `ub-adr-0341`). Décisions 2–6 : autre agent, `ub-adr-0341-auth`.
- Règle retenue pour `select: {}` : une sélection explicite suit la grammaire des lectures, donc `{}`
  (forme d'exclusion vide) demande tous les champs lisibles et passe le contrôle ADR-0306.

## État

- [x] Tests rouges : `tests/e2e/write-results.postgres.e2e.test.ts`, conversion de
      `tests/e2e/readable-mutation-results.postgres.e2e.test.ts`, tests de types Core et Soft Delete.
- [x] Core (exécution + types) : `normalizeWriteSelection`/`normalizeWriteProjection`
      (schema-command-execution.ts), `executeSchemaCreateOne`, enveloppes des mutations de plugin ;
      `SchemaMutationResult` et `PluginSchemaMutationResult` → `id` + champs inclus.
- [x] Conversions : tests unitaires/e2e, exemples (régions resynchronisées), modèles create-app, landing.
- [x] Docs : pages Core writing-data, REST, Access, Soft Delete, defaults, guide de test ; READMEs ; ADR-0306/0341.
- [ ] Bench form D, audit DX, gate complet.

## Prochaine action vérifiable

Bench form D (TS 6/7, 50/200) contre une base construite de main a85c032e, puis audit DX et gate.
