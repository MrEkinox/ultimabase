# Migration de Core, étape 3b : pagination par position et résultats en données simples (ADR-0309, ADR-0310)

Branche `migration/plain-results` (worktree `../ub-step3b`), basée sur
`main` local 4cd8a553 (étape 3a). Plan d'ensemble :
`docs/handoff/migration-core.md` sur la branche `api-challenge`.

## Périmètre

ADR acceptés, copiés dans `docs/adr/` et inscrits dans `docs/adr/README.md`
(ADR-0109, 0115, 0150, 0151, 0201 et 0227 passés en « superseded » ;
ADR-0022, 0118, 0155, 0192, 0228, 0238 et 0245 annotés) :

- ADR-0309 : `take` / `skip`, `findMany({ after })` par position avec
  départage par `id`, position validée puis transformée en filtre de
  l'appelant, `skip` et `after` exclusifs, encodeur partagé dans
  `@ultimabase/core/plugin`, REST `take` / `skip` / `after` et `nextCursor`,
  GraphQL Relay `first` / `after`, `cursorSecret` et
  `ULTIMABASE_CURSOR_SECRET` retirés, prédicat de position PostgreSQL sans
  `OFFSET`.
- ADR-0310 : résultats en objets simples gelés ; retrait des modèles
  constructibles, des méthodes d'instance, des poignées de relation et de la
  surface `model` des plugins ; `Pointer` sans `findOne` / `exists` ;
  `Model<T>`, `CreateInput<T>`, `UpdateInput<T>` ; enums `values` en tableau
  ou `defineEnum` ; `toJSON(value)` partagé avec REST.

Ordre : ADR-0309 d'abord (point de contrôle), puis ADR-0310.

## État

- [x] ADR copiés et inscrits
- [ ] ADR-0309 Core (noms, `after`, ordre total, filtre de position)
- [ ] ADR-0309 encodeur `@ultimabase/core/plugin`
- [ ] ADR-0309 PostgreSQL, REST, GraphQL
- [ ] ADR-0309 tests et documentation
- [ ] ADR-0310
- [ ] Porte finale

## Décisions (à confirmer par l'utilisateur)

## Reports et conflits

## Tentatives écartées

## Preuves

## Prochaine action vérifiable

ADR-0309 dans Core : renommer `limit` / `offset` en `take` / `skip`.
