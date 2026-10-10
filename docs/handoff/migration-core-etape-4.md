# Migration de Core, étape 4 : cycle de vie, autorité, défauts d'environnement et diagnostics (ADR-0311, ADR-0312, ADR-0313, amendement 1 d'ADR-0297)

Branche `migration/lifecycle-authority` (worktree `../ub-step4`), basée sur
`main` local 53c6ae38 (étape 3b). Plan d'ensemble :
`docs/handoff/migration-core.md` sur la branche `api-challenge`.

## Périmètre

ADR acceptés, copiés dans `docs/adr/` et inscrits dans `docs/adr/README.md`
(ADR-0058, 0066, 0094, 0153 et 0191 annotés) :

- ADR-0311 : `start()` renvoie l'application ; `ultimabase.transaction(fn)` ;
  `useMasterKey: boolean` ; sous-chemin `@ultimabase/core/plugin`
  (contexte de requête, `anonymous(app, options)`, `withContext(app, context)`,
  `authorizeMasterKey(app, rawKey)`, classes `WhereBuilder` / `QueryBuilder`),
  builders en types seulement dans l'entrée principale.
- ADR-0312 : assistant `NODE_ENV` unique dans `@ultimabase/plugin-kit` ;
  `schemaPolicy`, `DATABASE_URL` au `start()`, adresse d'écoute Hono,
  introspection Yoga, `environment` des explorateurs dérivé avec
  `allowInProduction` ; journal `debug` des valeurs dérivées.
- ADR-0313 : `new App({ logger, logLevel })`, `logger: false`, lignes préfixées
  par le paquet du plugin, `pluginPrivileges.logger` retiré ; une ligne `info`
  après `start()`, rapport des privilèges en `debug` ; avertissements `warn`
  listés ; `defineCapability({ hint })`.
- ADR-0297, amendement 1 : `Register` obligatoire (erreur de type claire),
  écrit par `create-app`.

Hors périmètre (étape 6, migration d'Access) : `allowWithoutRule`, sa valeur
`'development'` (ADR-0312) et son avertissement (ADR-0313).

## État

- [x] ADR copiés et inscrits
- [ ] ADR-0311
- [ ] ADR-0313
- [ ] ADR-0312
- [ ] ADR-0297 amendement 1
- [ ] Documentation
- [ ] Porte finale

## Décisions (à confirmer par l'utilisateur)

## Reports et conflits

## Tentatives écartées

## Preuves

## Prochaine action vérifiable

ADR-0311 dans Core.
