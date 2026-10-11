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

- Tests Core (`projection-slots.test-d.ts`, `plugin-commands.test.ts`,
  `unique-conflict.test.ts`), plugin-kit (`define-plugin.test.ts`/`.test-d.ts`),
  `http-routes.test.ts` ; documentation (page Soft Delete, guide d'auteur
  `build-a-plugin`, README Core/plugin-kit/http/Soft Delete/minimal, concepts,
  ARCHITECTURE) ; lint.

Porte, audit DX et banc faits (voir « Preuves »). Le worktree de base et les
dossiers `gen/` sont supprimés.

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
- `plugin()` : le paramètre de type `TSource` (dernier) est aussi porté par
  `PluginOptions` sous un symbole de type seulement (`[pluginStaticSourceType]?`),
  sinon la règle eslint `no-unnecessary-type-parameters` le refuse (pas de
  désactivation en ligne).
- Le réécrivain de suppression reste sur `delete-one` : `deleteMany` de Core
  est une suite de `delete-one`, donc logique aussi.
- `CommitInput.rules` : clés typées, valeurs `unknown` (pas de transtypage).
- Statiques des emplacements non évaluées pour un nom de classe généré par
  Typegen (ancienne forme) : les surfaces générées les typent déjà ; sinon la
  sonde Typegen « current » passait de 4,1 s à 17,6 s à 10 schémas.

## Ce qui reste du chemin des gabarits (à retirer quand plus personne ne l'utilise)

Clés `schemaFields`, `schemaClass`, `schemaOptions` de `PluginSourceProjection`,
`PluginSourceState` et `EmptyPluginSourceState` ; `PluginSourceSchemaProjection`,
`ResolvePluginSchemaProjection`, `ResolveSourceSchemaTemplate`,
`PluginSourceMutationMethod`, `PluginSourceSchemaFieldValues`,
`PluginSchemaPatchSource`, `PluginModelSurfaceSource`, le volet `schema` de
`PluginSchemaOptionSource`, `ConfiguredSchemaSelectorOptions`,
`ConfiguredProjectionOptions`, les reçus typés des registraires, et
`plugin-source-projections.test-d.ts`. Utilisateurs :

- ACL : champ `acl` par `PluginSchemaPatchSource`/`PluginModelSurfaceSource`
  (`acl-option.ts`, `plugin.ts`) et option `acl` → 6.3.
- PostgreSQL : option `postgres: { table }` → 6.5.
- REST (`rest`) et GraphQL (`graphql`) : options de schéma → 6.6.
- Access et Hooks : volet `schema` de leur `PluginSchemaOptionSource`
  (`access`, `hooks` dans `define`, ancienne forme) ; leur `.with` passe déjà
  par `SchemaRulesHKT` → 6.1/6.2 ou retrait de l'ancienne forme (6.8).

## Preuves (porte finale sur 1b287fb1, dernier commit de code)

- `packages/*/dist` et `*.tsbuildinfo` hors `node_modules` supprimés, puis
  `yarn validate:full` : code 0. « All matched files use Prettier code
  style! » ; lint 0 erreur (49 + 21 + 2 avertissements, tous de taille de
  fichier ; nouveaux par rapport à 73109860 : aucun en production,
  `context-and-master.test.ts` 599 → 602 lignes par le découpage des imports) ;
  performance « Test Files 3 passed (3) / Tests 4 passed (4) » ; couverture
  « Test Files 694 passed (694) / Tests 3376 passed (3376) / Type Errors no
  errors », All files 92,52 / 86,22 / 97,19 / 93,18 ; site « Test Files 17
  passed (17) / Tests 66 passed (66) ».
- `yarn test:e2e:built` : code 0, « Test Files 121 passed (121) / Tests 524
  passed (524) ».
- `yarn website:test` : code 0, « Test Files 8 passed (8) / Tests 59 passed
  (59) ».
- Budget `hybrid-authoring` : deux échecs (97,7 et 100,3 ms contre ~93) avant
  la correction de la sonde : la sonde hybride chronométrait la construction de
  l'application, la sonde Typegen non ; la construction coûte ~7 ms de plus
  (chaîne `.softDelete()` sur 48 schémas, 6 commandes chacun). Après : vert,
  seul et dans `validate:full`.
- TypeScript 7.0.2 (`ub-typing-spike/ts7`) : `examples/schema-form-d` et
  `gen/form-d-200` code 0 ; `tsconfig.test.json` de plugin-kit et Soft Delete
  code 0 ; Core : 12 erreurs, identiques sur la base 73109860 (positions de
  `@ts-expect-error` dans des tests de champs), aucune dans
  `projection-slots.test-d.ts`.

### Audit DX (`--only` 23 paquets, `tests`, `examples/minimal`, `examples/todo-backend`)

4 939 différences (36 804 / 37 381 enregistrements), classées par script
(motif puis lecture d'échantillons) :

| Cause                                                                                                                                                                                                        | Nombre |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -----: |
| Exports déplacés vers `@ultimabase/core/plugin` et nouveaux exports (exports, survols d'export, survols de membres des noms déplacés)                                                                        |  1 697 |
| Projection : emplacements, méthodes de forme génériques (`TArguments`, `DeclaredSchemaShape` dans les `DeclaredSchema` imprimés)                                                                             |  1 043 |
| Tests, fixtures et paquet Soft Delete réécrits ou ajoutés                                                                                                                                                    |    941 |
| `plugin()` : paramètre `TSource` (signature) et `PluginOptions<…, source>` dans les survols                                                                                                                  |    378 |
| API Soft Delete revue (exemple minimal, forme D, `deletedAt`)                                                                                                                                                |    366 |
| Façade (`definePlugin`, `httpRoutes`, `readSchemaRules`)                                                                                                                                                     |    176 |
| Mutations sur plusieurs lignes (`target`, 9ᵉ argument de `PluginSchemaMutationDefinition`, `…ManyMethod`)                                                                                                    |     97 |
| Chemins d'import ou noms de morceaux seulement                                                                                                                                                               |     52 |
| Typegen (`CorePlugin`)                                                                                                                                                                                       |      8 |
| Reste lu à la main : 9ᵉ argument `"one"` des définitions de mutation, noms déplacés imprimés sans `core.`, ordre d'union `"anonymous" \| "master"`, `… 9 more …` (deletedAt), nouveaux membres de plugin-kit |    181 |

### Banc forme D (base = 73109860, branche = 1b287fb1 ; alterné, médianes)

TypeScript 6.0.3 (3 exécutions) :

| N   | Arbre   | Charges     | Éd.→diag (s) | Exécutions     | Froid (s) | Schéma (s) | Tas (Mio) | Hover `q0` |
| --- | ------- | ----------- | -----------: | -------------- | --------: | ---------: | --------: | ---------: |
| 50  | base    | 2,9 3,0 3,1 |         2,05 | 2,03/2,04/2,05 |      4,71 |       2,09 |       851 |        199 |
| 50  | branche | 2,9 3,1 3,1 |         2,03 | 2,03/2,02/2,05 |      4,79 |       2,08 |       824 |        199 |
| 200 | base    | 2,8 3,7 3,4 |         6,88 | 7,00/6,82/6,88 |     16,17 |       6,82 |     2 434 |        199 |
| 200 | branche | 2,7 3,1 3,2 |         7,08 | 7,08/6,90/7,28 |     16,60 |       6,82 |     2 515 |        199 |

TypeScript 7.0.2 (`lsp-bench.mjs`, 3 exécutions à 50, 2 à 200) : éd.→diag
50 : 0,69 → 0,70 ; 200 : 2,23 → 2,29 ; premier diagnostic 50 : 0,78 → 0,80 ;
200 : 2,41 → 2,46 ; RSS serveur 675 → 714 Mio (50), 1 639 → 1 812 Mio (200).
`tsc --extendedDiagnostics` à 50 : 2 333 803 → 2 384 915 instanciations
(+2,2 %), vérification 4,00 → 4,03 s.

Lecture : aucun gain en 6.0, contrairement au spike (2,05 → 1,72 s), car ACL
et PostgreSQL gardent leurs gabarits (le spike les avait aussi migrés : ses
gabarits valaient `never` dans l'application du banc). Le gain attendu vient
avec 6.3 et 6.5. Survols : `.softDelete` 607 → 686 caractères (signature
générique), commandes 676/674 → 671/668/666, `isDeleted` 41, `deletedAt` 47.

## Prochaine action vérifiable

Revue du coordinateur, décisions de l'utilisateur sur les points non fixés
par l'ADR, puis fusion `--no-ff` dans `main` ; supprimer ce handoff après la
fusion.
