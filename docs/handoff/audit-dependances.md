# Audit des dépendances UltimaBase — 2026-10-09

Arbre audité : `/Users/mrekinox/Desktop/ub-small`, branche `main` (5f604d3d), Yarn 4.9.2, `nodeLinker: node-modules`.
Rapport seul : aucun fichier, lockfile ni manifeste modifié ; aucun build ni test lancé.
Commandes : `yarn npm audit --all --recursive --json` (exit 1), idem `--environment production` (exit 1),
`yarn npm info <pkg> --fields version,time --json` (un par un), `yarn why`, `yarn explain peer-requirements`
(0 pair non satisfait), scan d'imports via le parseur `typescript` de `node_modules` (src, tests, `dist/`).

## 1. Vulnérabilités

Aucune CI ne lance `yarn npm audit` (`.github/workflows/*.yml` : aucune occurrence).

| Sév.                    | Paquet (installé → corrigé)                                                                  | Chemin                                                               | Env.              | Paquet publié touché au runtime ? |
| ----------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------- | --------------------------------- |
| CRITICAL                | next 16.3.5 → ≥16.3.6 (RCE `next/og` ImageResponse, GHSA-vcvr-r3jv-pc5j)                     | apps/website (privé)                                                 | prod              | Non (site privé)                  |
| HIGH                    | next 16.3.5 → ≥16.3.8 (SSRF Image Optimization) + 4 MODERATE + 1 LOW                         | apps/website                                                         | prod              | Non                               |
| HIGH                    | sharp 0.35.4 → 0.35.5 (librsvg)                                                              | next → apps/website                                                  | prod              | Non                               |
| HIGH                    | @graphql-tools/utils 11.2.2 → ≥12.0.1 (prototype pollution `mergeDeep`, GHSA-7mx3-vvmw-hjmv) | graphql-yoga 5.24.1 → **@ultimabase/graphql-yoga-plugin**            | prod              | **Oui** (voir note)               |
| HIGH                    | source-map-js 1.2.1 → 1.2.2 (DoS)                                                            | postcss 8.5.23 (next) ; magicast (@vitest/coverage-v8)               | prod (site) / dev | Non                               |
| HIGH ×2, MOD ×6, LOW ×3 | undici 8.9.0 → 8.10.2+                                                                       | node-gyp 13.0.1 ← argon2 (**password-auth-plugin**), nan, fsevents…  | prod (selon Yarn) | Non au runtime (note)             |
| HIGH ×2, MOD ×1         | brace-expansion 2.1.4 / 5.0.9 → 2.1.7 / 5.0.12                                               | minimatch ← eslint, typescript-eslint, readdir-glob (testcontainers) | dev               | Non                               |
| HIGH                    | braces 3.0.3 → **aucun correctif publié** (≤3.0.3 vulnérable)                                | micromatch ← @changesets/*, fast-glob                                | dev               | Non                               |
| HIGH + LOW              | @grpc/grpc-js 1.14.4 → 1.14.5                                                                | dockerode ← testcontainers (@testcontainers/postgresql, root)        | dev               | Non                               |
| MODERATE                | sprintf-js 1.0.3 → **aucun correctif** (argparse 1 épingle `~1.0.2`)                         | js-yaml 3 ← read-yaml-file (@changesets)                             | dev               | Non                               |
| Dépréciation            | yuku-parser/yuku-codegen 0.8.1 bindings, yuku-analyzer 0.10.2 bindings                       | rolldown-plugin-dts (tsdown) ; fumadocs-mdx (site)                   | dev/site          | Non                               |
| Dépréciation            | glob 10.5.0                                                                                  | archiver-utils ← testcontainers                                      | dev               | Non                               |

Notes :

- **graphql-yoga-plugin** : dépendance runtime `graphql-yoga: ^5.22.0`. Seul graphql-yoga **≥5.24.4** dépend de
  `@graphql-tools/utils ^12.0.3` (5.24.2 : `^11.2.0`, 5.24.3 : `^11.2.2`, vérifié via `yarn npm info`). Une installation
  neuve chez un consommateur résout 5.24.4 (corrigé), mais la plage autorise les versions vulnérables et le lockfile du
  dépôt teste 5.24.1. Exploitabilité réelle via les entrées UltimaBase : **non vérifiée**.
- **argon2 → node-gyp** : node-gyp est ajouté par Yarn (`via npm:latest`, dépendance implicite des paquets natifs) ; argon2
  déclare `node-gyp-build` (binaires précompilés). undici n'est donc utilisé qu'à la compilation, pas au runtime.
  À noter : argon2 0.45.1 déclare `cross-env` en dépendance runtime (bizarrerie amont, sans impact sécurité connu).
- **Site** : `next.config.mjs` n'est pas un export statique (rewrites, `next start`) et utilise `next/og`
  (`app/icon.tsx`, `app/(marketing)/opengraph-image.tsx`, sans paramètres). Déploiement public : **non vérifié**
  (aucun workflow de déploiement trouvé).
- Correctifs atteignables **sans toucher aux manifestes** (plages amont compatibles, vérifié) : grpc-js (`^1.11.1` → 1.14.6),
  brace-expansion (`^2.0.1` → 2.1.7, `^5.0.8` → 5.0.12), source-map-js (`^1.2.1` → 1.2.2), undici (`^8.4.1` → 8.11.2).
  Pas de correctif : braces, sprintf-js (outillage changesets uniquement).

## 2. Dépendances directes en retard

Retards **majeurs** :

| Paquet                       | Déclaré → installé          | Dernière           | Commentaire                                                                                                      |
| ---------------------------- | --------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| typescript                   | ^6.0.3 → 6.0.3              | 7.0.2 (2026-07-08) | Bloqué : typescript-eslint 8.71.1 exige `typescript >=4.8.4 <6.1.0`. Impact Typegen/language service non évalué. |
| vitest + @vitest/coverage-v8 | 4.1.11 (exact)              | 5.0.3              | Exact-pin ; tag `V4` = 4.1.11 (à jour sur la ligne 4).                                                           |
| @changesets/cli              | ^2.29.7 → 2.31.1            | 3.0.3              | Tire braces/sprintf-js/js-yaml 3 ; disparition en v3 **non vérifiée**.                                           |
| validate-npm-package-name    | ^7.0.2 (runtime create-app) | 8.0.0              | v8 exige Node `^24.15.0` alors que nos `engines` disent `>=24.0.0`.                                              |
| tsdown                       | ^0.22.14                    | 0.23.0             | 0.x : mineur potentiellement cassant ; rolldown-plugin-dts plus récent (yuku déprécié) **non vérifié**.          |
| @types/node                  | ^24.0.0 → 24.13.6           | 26.6.4             | **Volontaire** (engines Node ≥24) ; aucune action.                                                               |

Paquets notables :

- **drizzle-orm** 1.0.0-rc.4 = dist-tag `rc` (le `latest` 0.45.4 est la ligne stable 0.x) : à jour sur la RC.
- **graphql** 17.0.2, **zod** 4.6.5, valibot 1.5.0, semver, uuid, jiti, argon2, react 19.3.0, tailwind : à jour.
- **hono** 4.13.8 → 4.13.13 ; **@hono/node-server** 2.1.1 → 2.1.4 ; **pg** 8.23.0 → 8.23.1 ; **graphql-yoga** 5.24.1 → 5.24.4 (sécurité) ;
  @graphql-tools/utils 12.0.1 → 12.0.3 ; fast-equals 6.0.4 → 6.1.1.
- **eslint** 10.11.0 → 10.12.0 ; **typescript-eslint** épinglé 8.65.0 → 8.71.1 (raison de l'épinglage non retrouvée dans le log).
- **next** 16.3.5 → 16.4.0 (sécurité) ; **fumadocs-core/ui** 16.15.12 → 16.16.2 ; fumadocs-mdx 15.4.3 → 15.4.6 ; lucide-react 1.47 → 1.53 ;
  playwright/playwright-core 1.63.0 → 1.64.0 ; prettier 3.9.8 → 3.9.9 ; publint 0.3.24 → 0.3.25 ; @testcontainers/postgresql 12.1.0 → 12.2.0.
- Planchers de plage obsolètes (installé ≫ plancher) : `pg ^8.16.3` (8.23.0), `zod ^4.4.3` (4.6.5), `prettier ^3.6.2` (3.9.8),
  `@types/pg ^8.15.5` (8.23.1), `semver ^7.7.3` (7.8.5). Pour les paquets publiés, un consommateur peut résoudre une version
  plus ancienne que celle testée.

## 3. Dépendances inutilisées ou mal placées (packages/*)

Méthode : parcours récursif de chaque paquet (hors `node_modules`/`dist`), imports/exports/`import()`/`require`/`import type`,
séparés en src non-test, tests (`*.test.ts`, `*.test-d.ts`, `tests/`, `fixtures/`) et config ; contrôle croisé avec `dist/index.{js,d.ts}`.

- **Déclarées en `dependencies` mais jamais importées** : aucune. Toutes apparaissent dans `dist/` (externes, `neverBundle`).
- **Importées par src mais non déclarées** : aucune. **Dépendance runtime utilisée seulement en test** : aucune.
- **Surface de types publique** (imports tiers dans `dist/index.d.ts`) : `graphql` (graphql-plugin), `hono` + `node:net`
  (server-hono-plugin), `@standard-schema/spec` (plugin-kit, validation-plugin). graphql-yoga, drizzle-orm et pg ne fuient pas
  dans les déclarations.
- **`@types/*` signalés « non importés »** (`@types/semver`, `@types/pg`, `@types/validate-npm-package-name`) : faux positifs,
  ils typent semver/pg/validate-npm-package-name (sans types embarqués) ; restent en dev car absents des `.d.ts`.
- **Imports de tests non déclarés (hoisting / liens `node_modules/@ultimabase/*`)** :
  - Tiers : `hono`, `@hono/node-server` (password-auth-plugin, graphql-plugin), `graphql` (password-auth-plugin), `zod`
    (graphql-plugin, hooks-plugin, rest-plugin), `pg` (testing), `playwright` (server-hono-plugin). Fournis par la racine
    ou par un autre workspace.
  - Workspaces : la plupart des `tests/e2e/*.postgres.e2e.test.ts` importent postgres/hooks/access/validation-plugin sans les
    déclarer. Autorisé par les contraintes pour les plugins (devDeps non vérifiées), **mais pas pour les fondations** :
    `packages/core/tests/e2e/` (16 fichiers, ex. `runtime-postgres-fixture.ts`) importe access/hooks/postgres/validation-plugin
    et testing. `yarn.config.cjs` affirme « Foundations stay independent of concrete plugins even in their tests » : la
    règle n'est contournée que parce que les imports ne sont pas déclarés.

## 4. Doublons

- **Une seule copie** : typescript (hors outil), graphql 17.0.2, hono 4.13.8, drizzle-orm 1.0.0-rc.4, pg 8.23.0, pg-types 2.2.0,
  @types/pg, zod, valibot, vitest, vite, @standard-schema/spec, react, @types/react : identité de types préservée dans le dépôt.
- **@graphql-tools/utils** : 12.0.1 (racine, graphql-plugin) + 11.2.2 (`graphql-yoga/node_modules`). Doublon et vulnérable ;
  disparaît avec graphql-yoga ≥5.24.4 (dépend de `^12.0.3`).
- **@types/node** : 24.13.6 (racine) + 26.6.2 imbriqué sous `@types/pg`, `@types/dockerode`, `@types/ssh2-streams`, protobufjs…
  (`@types/pg` déclare `@types/node: "*"`), 18.x et 12.x sous des outils. Masqué par `skipLibCheck: true` ; impact sur les
  types globaux d'un consommateur de postgres-plugin **non vérifié** (`@types/pg` n'est pas dans la surface publique).
- typescript 5.6.1-rc sous `@arethetypeswrong/core` (outil, normal). rolldown 1.2.1 (tsdown) + 1.1.5 (vite) : outillage, sans effet.
- Risque côté consommateurs (pas un doublon actuel) : `graphql` et `hono` sont des `dependencies` alors qu'ils apparaissent dans
  les `.d.ts` publics ; aucun `peerDependencies` dans le dépôt. Un consommateur avec une autre version obtiendrait deux copies
  (erreurs `instanceof GraphQLSchema`, types Hono incompatibles).

## 5. Actions priorisées

1. [no decision] Monter `graphql-yoga` à `^5.24.4` dans graphql-yoga-plugin : supprime la HIGH runtime d'un paquet publié et le doublon @graphql-tools/utils.
2. [no decision] Monter `next` ≥16.3.8 (16.4.0) dans apps/website (CRITICAL + HIGH, sharp 0.35.5 à confirmer avec next 16.4.0).
3. [no decision] Rafraîchir le lockfile pour grpc-js, brace-expansion, source-map-js, undici (`yarn up -R <pkg>`) : correctifs dans les plages existantes.
4. [yes/no: ajouter `yarn npm audit --environment production --recursive` en CI ?] Recommandé, en non bloquant d'abord (braces/sprintf-js sans correctif).
5. [yes/no: passer `graphql` et `hono` en `peerDependencies` des plugins qui les exposent ?] Recommandé pour l'identité des types ; contrat public → ADR-0288.
6. [yes/no: déplacer les e2e Postgres de `packages/core/tests/e2e` vers `tests/e2e` racine ?] Recommandé pour respecter la règle « fondations indépendantes même en test ».
7. [no decision] Mises à jour mineures compatibles : hono, @hono/node-server, pg, eslint, fast-equals, fumadocs, playwright, prettier, publint, testcontainers (puis `yarn validate:full`).
8. [yes/no: migrer vers Vitest 5 ?] Majeur isolé sur sa propre branche ; peu de risque produit, coût de validation.
9. [yes/no: adopter validate-npm-package-name 8 ?] Seulement en relevant `engines.node` à `>=24.15.0` (ADR si contrat public).
10. [yes/no: viser TypeScript 7 ?] Pas maintenant : typescript-eslint ne le supporte pas (`<6.1.0`) ; réévaluer après l'expérience de typage en cours.
11. [no decision] Relever les planchers de plage (`pg`, `zod`, `semver`…) vers les versions testées, via `yarn constraints` (plage unique).
