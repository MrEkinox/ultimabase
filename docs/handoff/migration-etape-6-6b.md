# Migration, sous-étape 6.6b : REST (ADR-0324)

Branche `migration/rest` (worktree `../ub-step6-6b`), basée sur `main` local
4a81b6c6 (fusion de 6.6a). GraphQL, l'explorateur et le preset sont 6.6c.

## Portée

ADR-0324, décisions 1 à 8 et conséquences :

1. Préfixe `/api` sans version, en-tête `X-UltimaBase-Rest-Version`.
2. `.with({ rest: { … } })` par les noms de méthodes (commandes de plugin
   comprises), hors des gabarits ; liaison automatique de 6.0 retirée pour
   REST (gardée pour GraphQL jusqu'à 6.6c).
3. `publicWrites` (ADR-0294), `acknowledgeUnverifiedProtection` retiré.
4. Erreurs détaillées `details: { parameter, path, reason }` et 405.
5. Opérations publiques déclarées par leur propriétaire (F1) et `hide`.
6. `defineOperation({ name, input, output, handler })`.
7. `restPlugin({ openapi: true })` et `/api/openapi.json`.
8. Comportement gardé.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

En cours.

## Décisions prises (non fixées par l'ADR, à confirmer)

## Approches rejetées

## Preuves

## Prochaine action vérifiable

Implémentation Core (opérations publiques, commandes sans liaison).
