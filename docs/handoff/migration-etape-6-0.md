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

## État (commits wip(plugin-facade))

Fait et vérifié par tests ciblés :

- Exports d'auteur déplacés (163 noms, 29 valeurs ; liste = tout ce que
  `foundation.ts` exportait depuis `./plugins/`) ; importeurs, sortie Typegen
  (`import type * as CorePlugin from '@ultimabase/core/plugin'` pour
  `PluginSchemaMutationDefinition`/`PluginOperationDefinition`), chemins des
  services de langage et `tsconfig.source.json` de la forme D (ses 20 erreurs
  préexistantes venaient de `core/plugin` non mappé : 0 maintenant).
- Core : emplacements (`schema-extensions.ts`, `source-projections.ts`),
  enregistrement de la forme dans les options sous un symbole
  (`DeclaredSchemaShape`, `SchemaShapeOf`) pour ne pas heurter les sélecteurs
  des gabarits (`.acl()` pose l'option `acl`), `SchemaCommands`,
  `plugin<…, TSource>`, `readSchemaRules`, mutations `target: 'many'`
  (`target-resolution.ts`, enveloppe `plugin-schema-mutation-many`,
  `ApplicationSchemaMutationManyMethod`), reformulation des violations
  d'unicité des commandes (`unique-conflict.ts`), `null` accepté pour un champ
  optionnel dans l'effet d'une commande.
- plugin-kit `define-plugin/` ; http-plugin `httpRoutes`.
- Soft Delete réécrit sur `definePlugin` (aucun `plugin()` brut) ; tests
  unitaires, de type, intellisense et e2e PostgreSQL du paquet en forme D.
- Sondes : `tests/e2e/fixtures/plugin-facade/{audit,archive,health}.ts`,
  `tests/e2e/plugin-facade.postgres.e2e.test.ts` (6 tests verts).
- Tests racine, exemple minimal (types régénérés), create-app, sondes de
  performance Typegen, README racine.

Reste : tests Core/plugin-kit/http-plugin des nouveautés, compilation TS7,
documentation (site, README des paquets), porte complète, audit DX, banc.

## Décisions prises (non fixées par l'ADR, à confirmer)

- Méthode de forme : un seul argument optionnel, objet d'options ; omis =
  `{}` (validateur appelé sur `{}`).
- `command()` : options `target: 'one' | 'many'` et `checkReadable: 'before'`
  en plus de `authority`/`effect`/`data` (Soft Delete en a besoin).
- Commandes de requête à une ligne : liaisons REST et GraphQL sans entrée
  générées par plugin-kit (temporaire jusqu'à 6.6, commentaire TEMPORARY) pour
  garder les routes que Soft Delete exposait (`/soft-delete-one`,
  `softDeleteOne<Classe>`, plus `restore-one`). Les commandes `Many` n'ont pas
  de liaison (Core la refuse).
- Noms des mutations : `<paquet sans @, / → .>.<méthode kebab>.<commande kebab>`
  (`ultimabase.soft-delete-plugin.soft-delete.restore-one`).
- Règle Access d'une commande `Many` : sa propre clé (`softDeleteMany`).
- Message de conflit à la restauration : générique dans Core pour toute
  commande de plugin, `Cannot run restoreOne on Todo <id>: slug is now used by
  another row.` ; les valeurs restent dans `internalDetails` (les règles de
  lecture de champ peuvent les cacher).
- `restoreOne/Many` : autorité `request` (règle Access, fermée par défaut
  avec Access) ; `purgeOne/Many` : Master.
- Statiques des emplacements non évaluées pour un nom de classe généré par
  Typegen (ancienne forme) : les surfaces générées les typent déjà ; sinon la
  sonde Typegen « current » passait de 4,1 s à 17,6 s à 10 schémas.

## Preuves

(complétées à la porte finale)

## Prochaine action vérifiable

Tests Core (emplacements, many-row, accesseur, conflit), plugin-kit et
`httpRoutes` ; puis documentation et porte.
