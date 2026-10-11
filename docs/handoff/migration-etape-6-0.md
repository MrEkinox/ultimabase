# Migration, sous-étape 6.0 : façade `definePlugin` et emplacements HKT (ADR-0316)

Branche `migration/plugin-facade` (worktree `../ub-step6-0`), basée sur `main`
local 73109860. Spike de référence : `../ub-spike-plugins` (branche
`spike/plugin-facade`, a8689a71..c46be543), repris en qualité production.

## Portée (ADR-0316, décisions 1 à 7)

1. Emplacements `SchemaFieldsHKT`, `SchemaStaticsHKT`, `SchemaRulesHKT`
   (absorbe `schemaOptions` pour les plugins migrés), `SchemaCommands` ;
   méthodes de forme génériques enregistrées par la chaîne. Les gabarits
   restent pour ACL, PostgreSQL, REST et GraphQL (sous-étapes 6.3, 6.5, 6.6).
2. `definePlugin`, `shapeMethod`, `command` (plugin-kit) ; `httpRoutes`
   (http-plugin).
3. Paramètre de type `source` explicite de `plugin()`.
4. Exports d'auteur de plugin de `@ultimabase/core` déplacés vers
   `@ultimabase/core/plugin`.
5. Accesseur public des valeurs de `.with` pour le plugin déclarant.
6. Mutations de schéma de plugin sur plusieurs lignes (`where`).
7. Soft Delete migré en entier ; `readDeleted` reporté à 6.1.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

Démarrage : ADR copié et indexé.

## Décisions

(à compléter)

## Approches rejetées

(à compléter)

## Preuves

(à compléter)

## Prochaine action vérifiable

Déplacement des exports d'auteur vers `@ultimabase/core/plugin`, puis
`yarn typecheck` code 0.
