# Migration, sous-étape 6.1 : règles Access, ouvertures explicites et permissions de plugin (ADR-0317)

Branche `migration/access` (worktree `../ub-step6-1`), basée sur `main`
local 97607147 (fusion de 6.0).

## Portée (ADR-0317, décisions 1 à 7)

1. Une règle d'opération (`true` / `false` / filtre, ne rien renvoyer est une
   erreur de type) avant chargement ; forme détaillée `{ where, item }` des
   mutations ; granularité `read` à membres facultatifs ; clés de commandes de
   plugin, même forme, avec `input`.
2. `allowWithoutRule` remplace `default` (clés, priorité, valeurs `true` /
   `'development'` / prédicat / `false` ; refus de `'development'` au
   `start()` en production ; une ligne `warn` par ouverture ; une ouverture
   `write` est une politique explicite pour ADR-0294).
3. Règles de champ partielles.
4. `anyOf`, `allOf`, `not` gardés ; `allowAll`, `denyAll`, `allOperations`,
   `allMutations` retirés.
5. Diagnostic de refus (`info` hors production, `debug` en production).
6. Ligne `info` au démarrage : schémas sans règle Access.
7. Permissions de plugin génériques dans Core ; Access les accorde ; Soft
   Delete `readDeleted`.

Hors portée : décisions des autres revues (ACL 6.3, transports 6.6…),
`publicWrites` lui-même (ADR-0294, transports en 6.6).

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

- ADR-0317 copié depuis `api-challenge` ; ADR-0293 et ADR-0294 (acceptés,
  absents de `main`) copiés aussi pour pouvoir marquer les parties
  remplacées ; index mis à jour (ADR-0222 : option `default` remplacée).

## Décisions prises (non fixées par l'ADR, à confirmer)

(à compléter)

## Approches rejetées

(à compléter)

## Preuves

(à compléter)

## Prochaine action vérifiable

Permissions de plugin dans Core (déclaration, interrogation, Master), avec
tests unitaires.
