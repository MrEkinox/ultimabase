# Migration, sous-étape 6.2 : Hooks et Validation (ADR-0318, ADR-0319)

Branche `migration/hooks-validation` (worktree `../ub-step6-2`), basée sur
`main` local 50209ff0 (fusion de 6.1). En parallèle : 6.5 (PostgreSQL) dans
`../ub-step6-5`, sans toucher `packages/postgres-plugin`.

## Portée

ADR-0318 (décisions 1 à 8) et ADR-0319 (décisions 1 à 9), conséquences
comprises ; règles dans `.with({ hooks })` / `.with({ validation })` en forme
D, ancienne forme sur les mêmes types jusqu'à 6.8 ; utilitaire de
`@ultimabase/testing` qui attend le travail post-commit ; exemples, gabarits
create-app et documentation.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

En cours.

## Décisions prises (non fixées par les ADR, à confirmer)

À compléter.

## Approches rejetées

À compléter.

## Preuves

À compléter.

## Prochaine action vérifiable

Implémentation (Core d'abord : travail d'arrière-plan, étape de validation).
