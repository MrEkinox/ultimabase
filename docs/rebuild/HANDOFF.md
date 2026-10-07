# Passation de la reconstruction UltimaBase

Dernière mise à jour : 2026-10-07. Ce document permet à une nouvelle session de
reprendre la reconstruction sans le contexte de la session précédente.

## Mission (résumé du cahier des charges initial)

Reconstruire UltimaBase dans `/Users/mrekinox/Desktop/claude-test/claude-ultimabase`
en prenant comme référence fonctionnelle `/Users/mrekinox/Desktop/claude-test/ultimadatabase`
(commit `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`). La source reste intacte, en lecture seule.

- **Ce qui doit rester identique** : la DX applicative et TypeScript (imports, signatures,
  inférence, diagnostics, autocomplétion, hovers), tous les comportements, erreurs et
  garanties de sécurité, ainsi que l'extensibilité publique pour les plugins.
- **Priorités** : 1. parité, sécurité, DX ; 2. simplicité et maintenabilité ; 3. réduction du code ; 4. performances.
- **Livrable final** : une reconstruction autonome, les commandes d'installation et de
  validation, une matrice des capacités avec preuves de parité, les résultats exacts des
  validations, les écarts, la comparaison avant/après des mesures, l'explication des
  simplifications réelles.
- **Règles** : travailler en local, ne jamais pousser ni publier. Signaler toute
  validation non exécutée : elle ne compte pas comme réussie.

## Méthode retenue

Il s'agit d'une reconstruction progressive, à parité vérifiée à chaque étape.

1. Le premier commit de `main` (`edf3032`) est l'instantané **non modifié** de la référence.
   `git diff edf3032 main` mesure donc toute la reconstruction.
2. Chaque package (ou périmètre de Core) est réécrit dans un worktree isolé, sur la branche
   `rebuild/<nom>`, selon [PROTOCOL.md](PROTOCOL.md) :
   - les tests publics restent inchangés et servent d'oracle ;
   - les tests internes sont portés sans perdre une seule assertion ;
   - chaque validation est rejouée.
3. Le coordinateur relit le diff, notamment les fichiers hors périmètre et les casts
   ajoutés, puis fusionne dans `main` en `--no-ff`.
4. Core est découpé en 5 périmètres réécrits en parallèle. Les symboles qu'un périmètre
   expose aux autres restent figés : voir [core-interfaces/](core-interfaces/README.md).
   Une passe d'intégration transversale est prévue une fois les 5 fusionnés.

Outils :

- `tooling/rebuild-worktree.sh <nom>` crée `../claude-ultimabase-worktrees/<nom>` avec les
  dépendances installées. Il réutilise la branche `rebuild/<nom>` si elle existe.
- `node tooling/measure-rebuild.mjs [racine]` donne une mesure reproductible (fichiers
  suivis par git, lignes non vides). Elle s'applique aussi à la référence.
- Les tests unitaires consomment les `dist` : lancer `yarn build` (environ 45 s) avant
  les tests. `tsc --build` écrase les `dist` des packages référencés, il faut donc
  relancer `yarn build` après.

## État au 2026-10-07

### Fusionné dans `main` (validé)

Toutes les validations listées dans le protocole ont été rejouées pour ces trois
packages. Le détail figure dans leur `REBUILD.md`.

| Package                 | Prod. avant | Prod. après | Notes                                                                                                                                                                                  |
| ----------------------- | ----------: | ----------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| acl-permissions-plugin  |       3 188 |       2 687 | Un seul modèle d'état ACL.                                                                                                                                                             |
| hooks-plugin            |       4 145 |       3 421 | Un seul dispatcher. Un écart documenté dans [DIFFERENCES.md](DIFFERENCES.md) (`__proto__`).                                                                                            |
| rest-plugin             |       4 320 |       3 696 | Erreurs, transports et routes unifiés.                                                                                                                                                 |
| core / schema           |      16 616 |      15 267 | WIP repris puis relu ; 2 écarts sur entrées non typées (DIFFERENCES.md). Voir `packages/core/REBUILD-core-schema.md`.                                                                  |
| core / runtime-app      |      10 914 |       9 998 | WIP repris ; régression de rollback du WIP corrigée ; 1 écart (handles internes non exposés). Voir `packages/core/REBUILD-core-runtime-app.md`.                                        |
| core / plugins          |      14 525 |      13 822 | WIP repris ; 4 régressions du WIP corrigées ; 3 contrôles inatteignables retirés (preuve dans le REBUILD, vérifiée par le coordinateur). Voir `packages/core/REBUILD-core-plugins.md`. |
| core / runtime-pipeline |      12 290 |      11 261 | WIP repris ; 3 écarts du WIP corrigés. Voir `packages/core/REBUILD-core-runtime-pipeline.md`.                                                                                          |
| core / query            |       9 276 |       8 586 | WIP repris ; parité vérifiée par sonde runtime (303 cas) et identité de types. Voir `packages/core/REBUILD-core-query.md`.                                                             |
| graphql-plugin          |       7 620 |       6 661 | Contexte de compilation partagé ; SDL imprimée identique sur 85 applications de test.                                                                                                  |
| postgres-plugin         |       9 307 |       7 966 | `dist/index.d.ts` identique ; 1 écart `__proto__` (DIFFERENCES.md).                                                                                                                    |
| access-plugin           |       4 438 |       3 653 | Une seule `AccessScope` ; 2 défauts fail-open de la référence corrigés (DIFFERENCES.md).                                                                                               |
| password-auth-plugin    |       3 567 |       3 359 | Modules épinglés par les tests et la doc ; parité vérifiée par comparaison runtime des deux bundles.                                                                                   |
| http-plugin             |       2 338 |       2 080 | Registre de définitions partagé ; 1 écart TOCTOU sur les en-têtes (DIFFERENCES.md).                                                                                                    |
| roles-plugin            |       2 192 |       2 015 | Helpers de résolution partagés ; 8 622 comparaisons aléatoires identiques à la référence.                                                                                              |
| testing                 |       1 243 |       1 162 | Runner et suite simplifiés ; `dist/index.d.ts` identique.                                                                                                                              |
| plugin-kit              |         778 |         722 | Contrats d’événements en `WeakSet` ; `dist/index.d.ts` identique.                                                                                                                      |
| create-app              |       1 656 |       1 557 | Tables de conditions partagées ; oracle de parité sur 196 608 rendus de projets, 0 différence.                                                                                         |
| typegen                 |       3 018 |       2 733 | Filtres et identifiants unifiés ; sorties générées identiques (80 sorties distinctes) ; budgets de performance à requalifier au calme.                                                 |
| server-hono-plugin      |         431 |         424 | Déjà minimal ; un cast retiré.                                                                                                                                                         |
| pg-vector-plugin        |         202 |         201 | Déjà minimal.                                                                                                                                                                          |
| apollo-sandbox-plugin   |         197 |         192 | Déjà minimal ; HTML/CSP identiques.                                                                                                                                                    |
| graphiql-plugin         |         188 |         183 | Déjà minimal ; HTML/CSP identiques.                                                                                                                                                    |
| graphql-http            |          76 |          72 | 1 écart TOCTOU sur `path` (DIFFERENCES.md).                                                                                                                                            |
| shared                  |          74 |          74 | Inchangé (déjà minimal).                                                                                                                                                               |

Total de la production (script de mesure) : **114 742 → 104 478 lignes** (main `f9297bb`). Les tests sont
inchangés (127 476 lignes).

Les 5 périmètres de Core sont fusionnés (2026-10-07). Main intégré, validé par le
coordinateur : `yarn build` OK ; unit + types 558 fichiers / 2 709 tests ; e2e
`packages/core tests/e2e` 219/219 ; postgres-e2e 191/191 ; `yarn test:pack:built`
173/173. La passe d'intégration transversale de Core reste à faire.

**Qualifié (échec intermittent `not-compiled`)** : l'erreur
`SchemaCompilationError: Schema ExampleArticle has not been compiled by an application`,
vue dans des exécutions complètes de postgres-e2e sous charge, est **préexistante dans la
référence** (1 exécution complète sur 8 sur chaque arbre, clone de référence
`/Users/mrekinox/Desktop/claude-test/ub-ref`). Cause prouvée par injection de délai
(3/3 sur les deux arbres) : course du module runner Vitest 4.1 / Vite 8.1. Les
`vi.importActual` parallèles de `loadMinimalExample` (`tests/e2e/rest-public-vertical-support.ts`)
et `invalidate: !cached` font évaluer `examples/minimal/src/schema.ts` deux fois dans un
worker ; le test garde une copie de `ExampleArticle`, l'application compile l'autre. Les
tests restent inchangés (règle du protocole). Atténuations possibles hors périmètre :
importer `schema.ts` avant les trois autres modules, ou donner un `testTimeout` explicite
au projet postgres-e2e (les cascades « Another UltimaBase application is active » viennent
du timeout de 5 s par défaut, sur les deux arbres).

**À requalifier sur machine calme (1)** : après la fusion d'access-plugin (main `fcc7d82`,
charge ≈ 60), `create-app-packed.e2e.test.ts` › « writes a valid graph for each official
plugin selected alone » dépasse 120 s, y compris relancé seul. Même symptôme que sur
la référence sous charge. Un agent l'a vu passer seul à charge ≈ 26 (6/6, 58,7 s) ; non qualifié tant qu'il n'a pas été rejoué au calme, sur la
référence et sur la reconstruction.

### Branches WIP interrompues (historique : toutes reprises et fusionnées)

La limite d'usage a interrompu ces cinq agents en pleine réécriture. Leur travail non
committé a été sauvegardé tel quel. Il peut ne pas compiler.

| Branche                         | Périmètre (`packages/core/src/…`)                                                                                                      | Lignes prod. | État du WIP                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -----------: | --------------------------------------------------------------------------- |
| `rebuild/core-query`            | `query/**`, `access/**`                                                                                                                |       ~8 700 | Un commit de l'agent et un WIP de 2 fichiers. Début de travail.             |
| `rebuild/core-runtime-pipeline` | `runtime/{pipeline,enforcement,behaviors,validation,operations,contributions,relation-filters,relations,virtual-fields,nested-writes}` |      ~13 000 | Un commit et un WIP de 3 fichiers. Début de travail.                        |
| `rebuild/core-schema`           | `schema/**`                                                                                                                            |      ~16 500 | WIP : 63 fichiers, +3 106 / −4 630. Bien avancé, non testé.                 |
| `rebuild/core-plugins`          | `plugins/**`, `application/**`, `errors/**`, `foundation.ts`, `index.ts`                                                               |      ~14 000 | WIP : 29 fichiers, +1 637 / −2 473. En cours (`capability-host.ts`).        |
| `rebuild/core-runtime-app`      | le reste de `runtime/**`, `private-storage/**`                                                                                         |      ~11 000 | WIP : 40 fichiers, +1 506 / −2 452. Tests unitaires Core pas encore lancés. |

**Reprise du 2026-10-07 (session 2)** : les agents `core-schema`, `core-plugins`,
`core-runtime-app` et `core-runtime-pipeline` ont été relancés dans leurs worktrees
(`../claude-ultimabase-worktrees/<nom>`), avec consigne de committer des checkpoints et
de tenir `packages/core/REBUILD-<périmètre>.md` à jour. `core-schema` est fusionné ; `core-query` a été lancé ensuite. Si cette session est interrompue, chaque branche contient le dernier
checkpoint de l'agent : relire son `REBUILD-*.md` avant de reprendre.

Pour reprendre une branche WIP :

1. Lancer `tooling/rebuild-worktree.sh <nom>`.
2. Lancer `yarn build`.
3. Faire passer `yarn vitest run --project unit packages/core`.
4. Terminer le protocole.

Si le WIP est trop cassé, `git reset --hard main` sur la branche et repartir proprement.
Les `REBUILD-core-*.md` n'avaient pas encore été écrits.

### Pas encore commencé

Packages : postgres-plugin (9 307), graphql-plugin (7 620), access-plugin (4 438),
password-auth-plugin (3 567), typegen (3 018), http-plugin (2 338), roles-plugin (2 192),
create-app (1 656), testing (1 243), plugin-kit (778), graphql-yoga-plugin (731),
soft-delete-plugin (710), validation-plugin (663), server-hono-plugin (431),
pg-vector-plugin (202), apollo-sandbox-plugin (197), graphiql-plugin (188), graphql-http (76),
shared (74).

Reste également :

- la passe d'intégration de Core ;
- **décision de l'utilisateur (2026-10-07) sur la documentation historique : archiver en
  place.** `issues/`, `docs/plans/`, `CURRENT_PLAN.md` et `HISTORIQUE_SUPPRESSIONS.md` restent
  comme archive figée de la référence, marquée comme telle (README / bandeau compatibles avec
  les tests de processus), avec `tooling/issues` et `yarn check:issues` intacts : aucune
  assertion supprimée. Les ADR restent (95 sont cités comme sources par le site).
  `ARCHITECTURE.md` et `docs/current-architecture.md` sont réécrits pour la reconstruction,
  et `docs/rebuild/VALIDATIONS.md` documente la correspondance des validations ;
- (énoncé d'origine) la décision sur la documentation historique (`issues/`, ADR, plans, `CURRENT_PLAN.md`,
  `HISTORIQUE_SUPPRESSIONS.md`) et sur l'outillage de processus (`tooling/issues`,
  `tooling/documentation`). Ces éléments décrivent l'architecture de la référence. Ils
  doivent être remplacés par une architecture décrivant la reconstruction, et la
  correspondance des validations doit être documentée ;
- la validation finale complète, le rapport final et la matrice des capacités.

## Validations de référence (clone de la référence, 2026-10-07, machine chargée)

| Commande                | Résultat                                                                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn validate:full`    | Arrêt à `yarn test` : 2 712/2 713. Seul échec : `packages/typegen/tests/performance/hybrid-authoring.performance.test.ts`, budget d'initialisation du language service dépassé de 0,3 % (511,7 ms contre 510,3 ms), probablement dû à la charge machine. |
| `yarn test:e2e`         | 409/410. Seul échec : `create-app-packed.e2e.test.ts`, timeout de 120 s sous charge.                                                                                                                                                                     |
| `yarn test:pack`        | 32/32 fichiers, 173/173 tests.                                                                                                                                                                                                                           |
| `yarn lint`             | OK.                                                                                                                                                                                                                                                      |
| `yarn check:issues`     | OK.                                                                                                                                                                                                                                                      |
| `yarn constraints`      | OK.                                                                                                                                                                                                                                                      |
| `yarn website:validate` | 17 fichiers, 66/66.                                                                                                                                                                                                                                      |
| `yarn test:coverage`    | **Pas encore exécuté.** À lancer sur machine calme, sur la référence et sur la reconstruction.                                                                                                                                                           |

À refaire sur machine calme pour qualifier définitivement les échecs préexistants :

```sh
git clone /Users/mrekinox/Desktop/claude-test/ultimadatabase /tmp/ub-ref
cd /tmp/ub-ref && corepack enable && yarn install --immutable
yarn validate:full && yarn test:e2e && yarn test:pack
```

Échecs environnementaux observés pendant que plusieurs agents partageaient la machine :

- port `127.0.0.1:1337` déjà utilisé (`create-app-api.postgres.e2e.test.ts`) ;
- timeouts des audits d'archives packées (`core-archive-declarations`, `core-field-builder`,
  `create-app-packed`, `typegen-generated-types`).

Ils passent quand on les relance isolément.

## Enseignements

- `apps/website/content/**` liste des fichiers sources (`sources:`) ; le projet
  `website-content` échoue si une réécriture supprime l'un d'eux. Toujours lancer
  `yarn vitest run --project website-content` après une fusion.

- Une réécriture de package coûte environ 300 k tokens d'agent pour 3 à 4 k lignes.
  Lancer au maximum 3 ou 4 agents à la fois, sinon la machine sature et la limite
  d'usage arrive vite.
- Le gain réel tourne autour de 15 à 25 % par package. Le reste correspond au contrat
  public lui-même (types, JSDoc, ordre des validations).
- Les agents doivent écrire leurs fichiers `REBUILD*.md` et committer **au fil de l'eau**
  (checkpoints), pour qu'une interruption ne laisse pas un WIP non documenté.
