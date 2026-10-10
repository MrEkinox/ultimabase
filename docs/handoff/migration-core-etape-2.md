# Migration de Core, étape 2 : principal neutre, prédicats, `PublicError`, `can()`, résultats lisibles (ADR-0304 à 0306)

Branche `migration/principal-policies` (worktree `../ub-step2`), basée sur
`main` local c1098e7e (étape 1). Plan d'ensemble :
`docs/handoff/migration-core.md` sur la branche `api-challenge`.

## Périmètre

ADR acceptés, copiés dans `docs/adr/` et inscrits dans `docs/adr/README.md` :

- ADR-0304 : `Principal` de Core (`Pointer` typé par nom via `Register`),
  fournisseur unique, résolution une fois par contexte de requête, héritée,
  conservée sous `useMasterKey` ; `PolicyPredicate`, `isAuthenticated` ;
  consommateurs (Access, Hooks, ACL, Roles, GraphQL `execute({ principal })`) ;
  Roles sans dépendance vers Access ; `passwordPrincipal` limité à la session ;
  modèles create-app sans `passwordPrincipal` dans les règles.
- ADR-0305 : `PublicError` exportée (classe de base interne renommée),
  REST 400 et GraphQL `extensions.code`, masquage des autres erreurs,
  journalisation seule après commit ; `ultimabase.can()`.
- ADR-0306 : contrôle de lisibilité des résultats de mutation, préimage de
  suppression, résultats en préimage déclarés par Soft Delete, exemption
  `select: { id: true }`, sélections « id seul » REST et GraphQL, modèles et
  exemples.

Hors périmètre (étape 6) : `allowWithoutRule`, refonte des options Access,
autres décisions de revue non écrites dans ces ADR.

## État

- [ ] ADR copiés et inscrits
- [ ] ADR-0305 `PublicError`
- [ ] ADR-0304 principal et prédicats
- [ ] ADR-0306 résultats lisibles
- [ ] ADR-0305 `can()`
- [ ] Documentation
- [ ] Porte finale

## Décisions

(à compléter)

## Tentatives écartées

(à compléter)

## Preuves

(à compléter)

## Prochaine action vérifiable

Implémenter `PublicError` (ADR-0305) et ses tests.
