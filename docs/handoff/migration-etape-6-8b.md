# Migration, sous-étape 6.8b : retrait de l'ancienne forme, de Typegen et des gabarits ; ADR-0329

Branche `migration/remove-old-form` (worktree `../ub-step6-8b`), basée sur
`main` local 5a3f0047 (fusion de 6.8a). Site : branche auxiliaire
`migration/remove-old-form-website` (worktree `../ub-step6-8b-website`,
agent délégué), reprise ici par fusion.

## Portée

1. Ancienne forme de déclaration : options de plugin dans `define(...)`
   (`access`, `hooks`, `validation`, `acl`, `postgres`, `rest`, `graphql`,
   `softDelete`…), types, chemins et tests qui n'existent que pour elle.
2. Typegen : paquet, plugin, fichiers générés, connaissance de Typegen dans
   Core, `withPluginTypegenConformance`, budgets de performance, site,
   contraintes yarn, tsconfig, vitest, outillage.
3. Machinerie des gabarits de projection (handoffs 6.0, 6.3, 6.6c).
4. ADR-0329 : contrat de rôle vers `@ultimabase/plugin-kit`.
5. Formulations périmées (`.with({})` de contournement, « Typegen »).

Critère de fin : sur le dernier commit de code, `yarn install --immutable`,
`yarn validate:full` sans `dist` ni `*.tsbuildinfo`, `yarn test:e2e:built`,
`yarn website:test` à 0 ; audit DX contre une base 5a3f0047 construite ;
banc forme D TS6 (50, 200) et TS7.

## État

Code, tests, documentation du dépôt et site faits (branche du site fusionnée
en 3542e656). Porte finale verte sur a063b857 (voir Preuves). Audit DX fait.

## Inventaire

### Supprimé

- `packages/typegen/**` (paquet, plugin, CLI, tests, budgets
  `hybrid-authoring` et `typegen-editor` et leurs sondes).
- Core : `plugins/typegen-contracts.ts`, `plugins/typegen-declarations.ts`
  (+ tests), `schema/schema/declared-option-validation.ts`,
  `runtime/context/subject-capabilities.ts` (ADR-0329).
- Testing : `plugins/typegen-check.ts` (`withPluginTypegenConformance`,
  contrat `typegen`).
- Fixtures simulant Typegen : `tests/fixtures/plugin-options.d.ts`,
  `packages/{access,hooks,postgres}-plugin/tests/fixtures/options.generated.d.ts`,
  `tests/e2e/fixtures/open-kernel-types.ts`.
- `examples/schema-form-d/tools/typegen-dump.mjs` et la branche `typegen` de
  `tools/campaign.mjs` (les lignes Typegen de `results/` restent, historiques).

### Noms publics retirés ou renommés

- Core racine : `generatedApplicationContractVersion`,
  `HasUltimaBaseGeneratedRegistry`, `UltimaBaseGenerated*` (16 interfaces),
  `SchemaTypeInfoByName`, `SchemaTypeInfoByNameOrBase`,
  `OwnedPluginFieldType`, `PluginFieldTypegen`, `FieldBuilderMethodTypegen`,
  `ApplicationOperationHandleForName`, et le protocole de rôle
  (`requestRoleResolverCapability`, `RequestRoleResolver`,
  `requireCurrentRequestRoleResolver`, `resolveRequestRoleReference`,
  `RequestRoleReference`, `RequestRoleSubject`, `RequestRoleResolutionInput`,
  désormais dans plugin-kit).
- Renommés : `FieldTypegenState` → `FieldTypeState`,
  `ScalarFieldTypegenState` → `ScalarFieldTypeState`, `FieldTypegenPresence` →
  `FieldTypePresence`, `FieldTypegenStateOf` → `FieldTypeStateOf`,
  `ResolveFieldTypegenState` → `ResolveFieldTypeState`,
  `RelationFieldTypegenState` → `RelationFieldTypeState`,
  `readFieldTypegenState` → `readFieldTypeState`.
- Core `/plugin` : `defineTypegenReference`, `isTypegenReference`,
  `TypegenReference`, `CompiledTypegenGraph`, `CompiledTypegenOption`,
  `OwnedTypegenReference`, `TypegenDeclarations`, `TypegenReferenceRegistrar`,
  `PluginTypegenContributionContext`, `SchemaOptionTypegenDescriptor`,
  `PluginModelSurfaceSource`, `PluginSchemaPatchSource`,
  `PluginSourceSchemaFieldValues`, `SchemaFactoryShapeBrand` ; ajout
  `readCurrentCapabilityProvider`, `CurrentCapabilityProvider` (ADR-0329).
- Contrats : clé `typegen` de `defineSchemaOption`/`defineFieldOption`/
  `definePluginFieldFamily`, `methodType` des contextes de famille, privilège
  `typegen:reference`, volet `typegen` de `contributeDeclarations`,
  `CompiledApplication.typegenGraph` et `pluginFieldTypes` (remplacés par
  `operations` et `schemaSurfaces`), `typegenGraph`/`fieldBuilderMethods`/
  `pluginFieldTypes` du contexte de setup, `input` des définitions compilées
  de mutation et des faits d'opération, second argument de
  `defineOperationValue`, `SchemaOptionDefinition` perd son 3ᵉ paramètre de type.
- Plugins : `SchemaAccessOption`, `SchemaHooksOption`,
  `SchemaValidationOption` ; second argument `exportName` de
  `stringFieldsInput` (auth-plugin) ; `withPluginTypegenConformance` et
  `PluginTypegenConformanceOptions` (testing/plugins).
- Plugin-kit ajoute le protocole de rôle (7 noms ci-dessus).

## Décisions (non fixées par les ADR)

1. **Refus de l'ancienne forme à l'exécution** : `App.Schema.define` et
   `Schema.defineSpecialized` refusent toute clé hors `className`, `fields`,
   `indexes` : « Unknown schema option: access. define() takes className,
   fields and indexes; plugin rules go in the final .with(...) (ADR-0297) ».
   Les fabriques de plugin (`RoleSchema`, `UserSchema`) gardent leur marqueur
   d'identité interne par `defineFactorySchema`.
2. **Options de schéma** : elles ne projettent plus aucun type (gabarits
   `schemaOptions`/`schemaFields`/`schemaClass` retirés) ; un plugin type son
   entrée `.with` par un emplacement de règles. `schemas.patch` et
   `models.extend` rendent un reçu inerte `PluginSourceReceipt<never>`
   (garde le motif `return [options, patch]`).
3. **Inspection compilée** : `compile().typegenGraph` devient
   `compile().operations` et `compile().schemaSurfaces` (faits sans
   `input`/`result`).
4. **Noms d'état de champ** renommés (`Typegen` → `Type`) plutôt que gardés.
5. **`SchemaTypeInfo`** : les recherches générées sont retirées
   (`SchemaTypeInfoByName…`, `UltimaBaseGenerated*`) ; le contrat à neuf
   entrées reste, car les contrats source de la forme D l'implémentent et
   Query le lit.
6. **ADR-0329** : Core gagne `readCurrentCapabilityProvider(token)` (générique,
   sans « rôle ») ; plugin-kit garde le même message
   `PLUGIN_CAPABILITY_MISSING` et le même identifiant de capacité.
7. **Plugins communautaires des tests** (`alternative-policy`,
   `alternative-behavior`, `open-kernel-value`) : règles typées par un
   emplacement de règles ; `decimalLedger` devient une méthode de forme
   `.decimalLedger({...})` avec un emplacement de champs.
8. **ADR** : ADR-0280, 0281 et 0283 passent en « superseded » par ADR-0297 ;
   note datée ajoutée à ADR-0297.
9. **Non modifiés** : `AGENTS.md` et `CLAUDE.md` gardent des mentions de
   Typegen (« retained typing boundaries », budget `hybrid-authoring`) ; à
   corriger par l'utilisateur.

## Preuves (dernier commit de code a063b857)

- `YARN_CACHE_FOLDER=…/ultimadatabase/.yarn/cache yarn install --immutable` → 0.
- `packages/*/dist` et `*.tsbuildinfo` (hors `node_modules`) supprimés, puis
  `yarn validate:full` → 0 : format, typecheck, lint (0 erreur ; avertissements
  de taille de fichier seulement), build, performance (1 fichier, 2 tests),
  couverture 715 fichiers / 3731 tests, sans erreur de type, constraints,
  website:validate 17 fichiers / 66 tests. Un premier passage avait échoué au
  seul `format:check` (50 fichiers édités par script) : corrigé par Prettier
  en a063b857.
- `yarn test:e2e:built` → 0 : 139 fichiers / 607 tests (`create-app-packed`
  compris, sans relance).
- `yarn website:test` → 0 : 8 fichiers / 59 tests.

## Audit DX (base 5a3f0047 construite, `--only` tous les paquets des deux arbres, `tests`, `examples/minimal`, `examples/todo-backend`)

`node tooling/dx-audit/run.mjs ../ub-step6-8b-baseline . --only …` :
10583 différences (39948 enregistrements base / 35404 candidat), sortie 0.
Classement par cause (script de tri hors dépôt) :

- 3917 : paquet `@ultimabase/typegen` retiré ;
- 3000 : machinerie des gabarits retirée (4ᵉ argument de `DeclaredSchema`
  `Readonly<{}>` → `Readonly<Record<never, never>>`, surface de classe
  `ConfiguredSchemaResult` → `SchemaReference`, `Readonly<...> &` en moins,
  compteurs `... N more ...` décalés, `operations`/`schemaSurfaces`) ;
- 1280 : noms et contrats Typegen retirés (`UltimaBaseGenerated*`,
  `TypegenReference`, clés `typegen`) ;
- 1181 : sites d'usage réécrits dans cette branche (forme D, tests retirés) ;
- 305 : signature de `define()` sans options de plugin (ancienne forme) ;
- 310 environ : noms d'état de champ renommés (`Typegen` → `Type`), comptés
  dans les catégories ci-dessus quand le survol change aussi ;
- 171 : contrat de rôle déplacé vers plugin-kit (ADR-0329) ;
- 70 : types d'option de l'ancienne forme retirés ;
- 659 lus à la main : mêmes causes sous d'autres textes (survols plus
  développés car plus courts, ordre d'union `"draft" | "published"` inversé
  dans un prototype, déclarations privées de `dist`).
- Complétions : les seules entrées perdues sont les noms retirés (Typegen,
  protocole de rôle sorti de Core, `readFieldTypegenState` renommé) et
  `access`/`hooks` dans `define({...})`, désormais proposés dans `.with`.

## Banc forme D (`examples/schema-form-d`, base 5a3f0047 contre a063b857)

Alternance base/branche, 3 passages, médianes en ms ; charge sur 1 minute
2,7 à 3,7 (12 cœurs ; machine pas entièrement calme, mêmes conditions pour
les deux arbres). TS6 : `tools/bench.mjs`, TS7 : `tools/lsp-bench.mjs`.

| Mesure                      | Base 50 | Branche 50 | Base 200 | Branche 200 |
| --------------------------- | ------: | ---------: | -------: | ----------: |
| TS6 froid                   |    4722 |       4468 |    16541 |       15498 |
| TS6 édition → diagnostic    |    1940 |       1852 |     6139 |        5567 |
| TS6 édition → tous fichiers |    3748 |       3576 |    16591 |       15772 |
| TS6 édition de schéma       |    2120 |       1997 |     6173 |        5552 |
| TS6 tas max (Mio)           |     907 |        855 |     2110 |        1793 |
| TS7 premier diagnostic      |     736 |        625 |     2303 |        2025 |
| TS7 édition → diagnostic    |     651 |        541 |     2123 |        1894 |
| TS7 édition de schéma       |     822 |        713 |     2340 |        2128 |
| TS7 édition de règle        |     426 |        319 |     1144 |         934 |

Cibles ADR-0297 (amendement 2) : TS6 ≤ 1 s à 50 (1,85 s : non atteinte),
TS6 ≤ 3 s à 200 (5,57 s : non atteinte), TS7 ≤ 0,5 s à 50 (0,54 s : non
atteinte de peu). La branche gagne 5 à 17 % sur la base partout ; les cibles
restent un travail de migration (coût des types source de Core). Dossiers
`gen/` supprimés après le banc.

## Reporté en 6.8c

- Renommer les fixtures `*-no-typegen.mjs` et les titres de test « without
  Typegen » qui ne décrivent plus une alternative.
- Classer les ADR de l'ère Typegen encore « accepted » (0173, 0175, 0177,
  0184, 0185, 0187, 0193, 0198, 0217, 0262, 0265, 0285) : remplacés ou non.
- `AGENTS.md`/`CLAUDE.md` : mentions de Typegen et du budget
  `hybrid-authoring` (à modifier par l'utilisateur).
- Typage d'un filtre sur un type de champ de plugin en forme D
  (`open-kernel-proof.postgres`, `as never` commenté).
- `docs/rebuild/DIFFERENCES.md` mentionne encore Typegen.
- Échantillon `private-sessions.ts` de `runtime-and-infrastructure.mdx` déjà
  en erreur de type sur la base (rappel de l'agent du site).
- Cibles de performance ADR-0297 non atteintes (tableau ci-dessus).

## Prochaine action vérifiable

Revue du coordinateur, puis fusion `--no-ff` dans `main` après
`yarn validate:full` sur le résultat de fusion ; supprimer ce handoff et le
worktree `../ub-step6-8b-website` (branche `migration/remove-old-form-website`,
déjà fusionnée) une fois fusionné.
