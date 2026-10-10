# Migration de Core, étape 3a : filtres, mises à jour, lectures requises et liens (ADR-0307, ADR-0308)

Branche `migration/query-write-api` (worktree `../ub-step3`), basée sur
`main` local 6402dd95 (étape 2). Plan d'ensemble :
`docs/handoff/migration-core.md` sur la branche `api-challenge`.

## Périmètre

ADR acceptés, copiés dans `docs/adr/` et inscrits dans `docs/adr/README.md`
(ADR-0067, 0134, 0152 et 0243 annotés ; ADR-0182 déplacé dans les
remplacés) :

- ADR-0307 : raccourci d'égalité dans tout `where` (GraphQL garde `{ eq }`),
  `{ increment }` / `{ decrement }` en objets et retrait des fabriques,
  `findOneOrThrow` à la place de `get`, cible des mutations singulières par
  `where` seulement.
- ADR-0308 : vocabulaire de liens unique (`connect` / `create` / `update` /
  `null` pour les pointeurs ; `connect` / `disconnect` / `create` /
  `update` / `set` pour les relations ; `{ set: [] }` remplace
  `{ clear: true }`), `Pointer` brut ou identifiant refusé dans `data`,
  visibilité de chaque cible `connect` / `set` / `disconnect`, Roles, REST
  et GraphQL par les mêmes commandes.

Hors périmètre : ADR-0309 et ADR-0310 (étape 3b : pagination, données
simples, retrait des modèles et des poignées de relation) ; refontes de
plugins non écrites dans ces ADR (étape 6). Les poignées de relation et les
modèles restent, adaptés au strict nécessaire.

## État

- [x] ADR copiés et inscrits
- [ ] ADR-0307 mises à jour atomiques en objets
- [ ] ADR-0307 `findOneOrThrow`, cible `where` seule
- [ ] ADR-0307 raccourci d'égalité
- [ ] ADR-0308 liens
- [ ] Documentation (site, README, exemples, create-app)
- [ ] Porte finale

## Décisions (à confirmer par l'utilisateur)

## Tentatives écartées

## Preuves

## Prochaine action vérifiable

ADR-0307, mises à jour atomiques en objets.
