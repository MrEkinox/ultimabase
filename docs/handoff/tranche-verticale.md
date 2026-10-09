# Tranche verticale de la forme D sur le vrai Core (2026-10-09)

Branche `spike/schema-form-d` (worktree `/Users/mrekinox/Desktop/ub-slice`,
basée sur `main` local `116cf14e`). Ne jamais pousser. Preuve demandée par
ADR-0297 (`docs/adr/0297-declare-schemas-without-typegen.md` sur la branche
`api-challenge`) avant le gel de la décision 4.

## Périmètre

1. Core : capture des cibles `() => X` sans résolution ; `define({ className, fields })`
   chaînable ; méthodes de forme et entrées de règles fournies par les plugins via
   des emplacements génériques ; `.with({...})` final non générique ; `Register` et
   types nommés. L'ancien `define({... access, hooks ...})` + Typegen continue de marcher.
2. Plugins réels : Soft Delete (`.softDelete()`), Access (`access`), Hooks (`hooks`),
   opérateur `where` apporté par un plugin.
3. Fixture : schémas en cycle dans des fichiers séparés, ligne `Register`, usages,
   assertions exactes, 8 fautes du protocole.
4. Preuve depuis les paquets construits (`dist/*.d.ts`).
5. Infobulles TS 6.0.3 (service de langage) et TS 7.0.2 (LSP), source et construit.
6. Exécution PostgreSQL (Testcontainers).
7. Mesures 10/50/200 contre Typegen réel, TS6 et TS7.

## État

- [x] 1 Core : cibles, chaîne, emplacements, `Register`, types nommés, contrôle `mappedBy`
- [x] 2 Plugins : Access, Hooks, Soft Delete (`.softDelete()`), ACL (`.acl()` + règle,
      opérateur `contains` typé sans Typegen)
- [x] 3 Fixture `examples/schema-form-d` (TodoUser, Todo, Tag ; 8 fautes en `@ts-expect-error`)
- [x] 4 Construit : 0 erreur contre `dist/*.d.ts`
- [x] 5 Infobulles TS6/TS7 source/construit (`examples/schema-form-d/results/`)
- [x] 6 Exécution : `tests/e2e/schema-form-d.postgres.e2e.test.ts` 5/5 (construit et source)
- [x] 7 Mesures : `examples/schema-form-d/results/{campaign.jsonl,summary.md}`

## Décisions

- Cibles : `field.pointer/relation({ target })` accepte un thunk ou un nom
  généré ; le type du thunk est capturé dans `DeferredSchemaTarget<F>`
  (`deferred-targets.ts`) et lu paresseusement (`SchemaTypeInfoFor`,
  `SchemaRelationshipSource`). `mappedBy` d'un thunk : `string`, vérifié à
  l'enregistrement.
- Pointeur : la cible n'est inférée que par `Readonly<{ target: TTarget, … }>`
  ajouté hors de `CompatibleFieldOptionsExtension`, la base passant en
  `NoInfer` : l'`Omit` générique de l'extension faisait évaluer le thunk
  (TS7022 sur auto-pointeur `parent`).
- Emplacements Core génériques (ADR-0297) : `schemaRules` (HKT en tuple) et
  `shapeMethods` dans `PluginSourceState` ; `provideSchemaShapeMethods`
  (table d'exécution `sets` + `apply`, WeakMap par plugin) ; espace `Schema`
  par fabrique configurée (`createConfiguredSchemaNamespace`).
- `define(...)` renvoie `DeclaredSchema` = schéma utilisable (ancienne forme
  intacte) + méthodes de forme + `.with(rules)` non générique ; une méthode de
  forme est absente quand la déclaration fixe déjà les options qu'elle pose.
- Plugins : Access `AccessSchemaRules`/`AccessRules<S>`, Hooks
  `HooksSchemaRules`/`HooksRules<S>` (interfaces : un littéral imbriqué
  liait `this` au littéral), Soft Delete `.softDelete()` →
  `{ softDelete: 'replace-delete' }` seulement si `defaultMode` est `disabled`
  (sinon collision avec la mutation `softDelete` du mode explicite).

## Échecs et impasses

- **Cause racine trouvée (TS2589/TS2615 sur auto-relation)** : le type mappé
  écrit dans les branches de `ResolveSourceSchemaTemplate`
  (`source-schema-templates.ts`) capturait les paramètres `infer` non résolus
  des conditionnels englobants ; tout type de schéma paraissait générique, et
  la résolution d'un thunk (`() => Todo` vs instanciation restrictive)
  ré-instanciait puis comparait tout le graphe. Extraire ce type mappé dans un
  alias (`ResolveSourceSchemaObject`) supprime toutes les erreurs. Outil :
  `scratchpad/tools/freetp.mjs` (liste les paramètres libres d'un type).
- Variantes écartées en cours : `Readonly<TResolved>` à
  `source-projections.ts:376` (sans effet) ; branches d'`NestedPointerCreateInput`
  en interfaces (sans effet).

## Commandes et résultats

- `YARN_CACHE_FOLDER=… yarn install --immutable` : code 0 ; `yarn build` : code 0.

- `npx tsc --noEmit -p examples/schema-form-d/tsconfig.source.json` : 0 erreur
  (Todo ↔ TodoUser, auto-relation, `.softDelete().with({ access, hooks })`).
- `yarn vitest run --project types packages/soft-delete-plugin
packages/core/src/schema/schema/field-builder.test-d.ts` : 1 échec attendu
  (`rejects value-level target callbacks…` : l'ancien contrat refusait les
  thunks, ADR-0297 les impose ; corps de test non modifié).

- Registre : alias génériques par nom de classe et arrêt sur clé non littérale
  (`string extends TKey`) ; sinon la mesure de variance au moment de la
  déclaration lisait `typeof ultimabase` (TS7022). Diagnostic obtenu avec une
  copie instrumentée de `_tsc.js` (pile de résolution au cycle).
- `SchemaRef<"Todo">` est une interface : l'emplacement HKT intersecte le schéma
  avec `unknown`, ce qui faisait perdre l'alias d'une intersection.
- `Item`/`CreateInput`/`Model`… : type mappé comme corps d'alias (un résultat de
  branche conditionnelle perd le nom de l'alias) ; `CreateInput<typeof Todo>`
  écrit par le développeur reste long (argument imprimé tel quel).
- Mesure indicative (1 exécution) : sans `Register` la vérification des règles
  Access croît de façon quadratique (inférence du retour contextuel qui parcourt
  l'anneau : `isDeeplyNestedType` 4,7 s sur 18 s à 100) ; avec `Register`
  linéaire (10 → 1,69 s, 50 → 5,04 s, 100 → 9,89 s de check).
- `yarn vitest run --project postgres-e2e tests/e2e/schema-form-d.postgres.e2e.test.ts` : 5/5 (et `coverage-postgres-e2e`, depuis les sources : 5/5).

## Mesures (même session, séquentiel, 3 exécutions, médianes ; écart ≤ 6 %)

`node examples/schema-form-d/tools/campaign.mjs` (charge 1 min 1,3–3,6). Typegen
réel = sonde `ub-typing-spike/tools/real-baseline` (graphe différent, comme
BENCH.md) + son programme écrit sur disque pour `tsc` (`tools/typegen-dump.mjs`).

| N   | Variante        | Froid TS6 | Éd.→diag TS6 | tsc6 check | tsc7 check | TS7 LSP éd.→diag |
| --- | --------------- | --------- | ------------ | ---------- | ---------- | ---------------- |
| 10  | D + Register    | 2,63      | 1,13         | 1,86       | 0,55       | 0,38             |
| 10  | D sans Register | 2,88      | 0,93         | 2,08       | 0,54       | 0,31             |
| 10  | Typegen réel    | 3,55      | 2,02         | 3,11       | 0,69       | —                |
| 50  | D + Register    | 6,35      | 2,75         | 5,29       | 1,56       | 0,97             |
| 50  | D sans Register | 8,49      | 2,45         | 7,52       | 1,57       | 0,87             |
| 50  | Typegen réel    | 8,08      | 6,74         | 7,50       | 2,31       | —                |
| 200 | D + Register    | 23,33     | 9,13         | 22,15      | 6,57       | 3,29             |
| 200 | D sans Register | 73,14     | 8,41         | 70,32      | 7,43       | 3,06             |
| 200 | Typegen réel    | 43,26     | 49,40        | 42,00      | 14,92      | —                |

Lecture : avec `Register`, D est 1,9× plus rapide que Typegen à froid et 5,4×
à l'édition à 200 (TS6), 2,3× en `tsc` TS7, sans génération ; mais 14× plus
lent que le prototype (1,6 s) : coût propre des types source du vrai Core
(≈ 0,1 s par schéma). Sans `Register`, croissance quadratique des règles
Access (70 s à 200).

## Validation (fin de tranche)

- `yarn typecheck` : 1 erreur attendue (`field-builder.test-d.ts:45`, l'ancien
  contrat refusait les thunks ; ADR-0297 les impose ; corps de test non modifié).
- `yarn vitest run --project unit --project types` : 5 échecs attendus
  (ci-dessus + listes d'exports publics Core/Access/Hooks + infobulle
  `DeclaredSchema` de `@ultimabase/testing`), 2784 verts.
- `yarn vitest run --project e2e --project postgres-e2e` : 4 échecs attendus après
  correction de la JSDoc (infobulle `SchemaTarget<DeclaredSchema…>`, archives
  publiques Access/Hooks/Soft Delete qui exportent les nouveaux types), 411 verts.
- `yarn validate:affected` : plan complet → `validate:full`, arrêté à
  `yarn typecheck` (même erreur attendue). `validate:full` non relancé au-delà.
- `yarn constraints`, `prettier --check`, ESLint des fichiers touchés : 0 erreur.

## Étape 0 de la migration de Core (2026-10-09)

Plan : `docs/handoff/migration-core.md` (branche `api-challenge`). But : rendre
la tranche fusionnable dans `main` sans implémenter ADR-0299 à 0313.

- Fusion de `main` (`5c10a4c0`, retrait de pg-vector de create-app) : aucun
  conflit (`git merge --no-ff main`).
- ADR-0297 accepté (avec amendements) copié depuis `api-challenge` dans
  `docs/adr/`, ajouté à `docs/adr/README.md` ; `docs/current-architecture.md`
  signale qu'il remplace les limites Typegen pour la forme D, l'ancienne forme
  restant régie par ADR-0279/0280/0281/0283 jusqu'au retrait.
- Tests de l'ancien contrat mis à jour (seulement les assertions changées par
  ADR-0297) : `field-builder.test-d.ts` (le test qui refusait les thunks devient
  un test de régression : thunks acceptés, inclusions et filtres typés, faute de
  champ refusée), liste d'exports Core (+`isConfiguredSchemaNamespace`, +`provideSchemaShapeMethods`), surfaces Access (+`AccessRules`, +`AccessSchemaRules`), Hooks (+`HooksRules`, +`HooksSchemaRules`), Soft Delete
  empaqueté (+`SoftDeleteShapeSource`), infobulles `DeclaredSchema` (testing,
  `SchemaTarget<DeclaredSchema<`).
- Ajouts : test d'exécution `isConfiguredSchemaNamespace` ;
  `tests/e2e/schema-form-d-types.e2e.test.ts` vérifie le fixture (assertions et
  8 fautes) contre les paquets construits (TS 6 seulement ; TS 7 n'est pas une
  dépendance du dépôt).
- Docs : sections courtes forme D dans les README core, access, hooks,
  soft-delete, acl (exemples avec installation du plugin, exigée par
  `active-contracts.test.ts`), note d'attente dans roles et password-auth
  (fabriques non couvertes, amendement 3) ; site : section « Declare without
  Typegen » dans `core/data-modeling/schemas.mdx`, renvoi dans
  `guides/generate-types.mdx` ; `examples/schema-form-d/README.md`.
- Outils de mesure : chemins `ub-slice` remplacés par la résolution de
  `typescript` depuis l'exemple ; les chemins vers `ub-typing-spike` et
  `ub-small` restent (espaces de sonde locaux, documentés).
- Amendement 1 (`Register` obligatoire) **non implémenté** : rendre l'absence
  de `Register` erronée casserait chaque application de l'ancienne forme et
  les centaines de tests qui construisent plusieurs applications dans un même
  programme (une seule augmentation globale) ; reporté à l'étape 4.

Validation :

- `yarn validate:full` (dist et `*.tsbuildinfo` supprimés avant) : 1er passage
  code 1 (`active-contracts.test.ts` : exemples README sans `accessPlugin()`/
  `hooksPlugin()`, corrigé) ; 2e passage code 0 (unit/types/coverage-e2e/
  coverage-postgres-e2e 647 fichiers, 3058 tests ; performance 3/3 ; website
  66/66 ; constraints).
- `yarn test:e2e:built` (hors `validate:full`) : 104 fichiers, 418 tests verts.
- Remarque : `yarn typecheck` émet dans `packages/*/dist` (tsc --build) ; lancer
  `yarn build` après lui avant tout test empaqueté.

Audit DX (`node tooling/dx-audit/run.mjs ../ub-dx-baseline . --only <tous sauf
examples/schema-form-d>` ; l'outil plante si un exemple n'existe que d'un côté) :
3348 différences, toutes rattachées à une cause :

- attendues par ADR-0297 : `DeclaredSchema` au lieu de
  `ConfiguredSchemaResult` (1028) ; emplacements `schemaRules`/`shapeMethods`
  dans l'état source des plugins, avec troncatures décalées (997) ; nouveaux
  exports, déclarations et membres (524 ajouts) ; JSDoc de `define` et de
  `target` (233) ; types nommés `Select<"X">`/`Where<"X">`/`Item<"X">` imprimés
  aussi dans l'ancienne forme (108) ; `.with`, `.acl()`, `.softDelete()` dans
  les complétions de schémas (≈118) ; contrôle d'enregistrement au
  constructeur (37) ; sources de filtres différées (33) ; définition
  conditionnelle de `QueryResult` (31) ; signature `field.pointer` avec
  `NoInfer<…> & Readonly<{ target }>` (≈15) ; `ACLField` porte son opérande
  `contains` ;
- artefacts : renumérotation `Simplify$2/$3` privée (8) ; `usage.ts` du fixture
  lu sans son tsconfig (TS5097) ; fixture Soft Delete dont le texte Typegen est
  calculé à l'exécution (vide dans l'audit) ;
- **non annoncées par ADR-0297** : (1) `ResolveSourceSchemaObject<…>` imprimé au
  lieu de l'objet dans 69 infobulles d'options et callbacks de plugins (ACL
  `default`/`resolveInput`, GraphQL, REST, Postgres) — conséquence du correctif
  TS2589 ; essai borné : envelopper le type mappé dans `[T] extends [unknown]`
  restaure les options simples (`workflow`) sans coût mesuré sur le fixture
  (6,62 s) mais pas les entrées ACL ; annulé, décision requise ; (2) ordre des
  propriétés dans certaines infobulles de résultat/entrée de l'ancienne forme
  (todo-backend : `completed`, `dueAt` passent dans « N more »).

## Prochaine action vérifiable

Revue du coordinateur ; décision sur les deux différences d'éditeur non
annoncées (ADR ou correctif en étape 5) ; puis fusion `--no-ff` dans `main`.
