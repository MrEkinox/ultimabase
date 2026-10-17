# Handoff — ADR-0341, décision 1 (résultats d'écriture)

- Portée : une écriture sans `select` renvoie `{ id }` (TypeScript, REST, commandes de plugin, Master) ;
  une sélection explicite au-delà de `id` ou un `include` garde ADR-0306.
- Branche : `feat/adr-0341-results` (worktree `ub-adr-0341`). Décisions 2–6 : autre agent, `ub-adr-0341-auth`.
- Règle retenue pour `select: {}` : une sélection explicite suit la grammaire des lectures, donc `{}`
  (forme d'exclusion vide) demande tous les champs lisibles et passe le contrôle ADR-0306.

## État

- [x] Tests rouges : `tests/e2e/write-results.postgres.e2e.test.ts`, conversion de
      `tests/e2e/readable-mutation-results.postgres.e2e.test.ts`, tests de types Core et Soft Delete.
- [ ] Core (exécution + types), conversions, docs, bench, audit DX, gate.

## Prochaine action vérifiable

`yarn vitest run --project postgres-e2e tests/e2e/write-results.postgres.e2e.test.ts` passe.
