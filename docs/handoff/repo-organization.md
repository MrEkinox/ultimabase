# Organisation du dépôt : comparaison et recommandations

Statut : inventaire en lecture seule (2026-10-08), volet parallèle du
[plan API](api-challenge-plan.md). Aucune commande lourde n'a été lancée.
Les faits sur les dépôts de référence ont été vérifiés le 2026-10-08 par
l'API GitHub (listes de fichiers, `turbo.json`, `nx.json`, workflows) et la
documentation officielle ; ce qui vient de mémoire est marqué **[mémoire]**,
les chiffres non mesurés **[estimation]**.

## 1. État actuel

- **Racine** : `packages/` (22 paquets publiables), `apps/website` (Next.js +
  Fumadocs), `examples/` (`minimal`, `todo-backend`), `tests/` (`e2e`,
  `fixtures`, `performance`), `tooling/` (`ci`, `dx-audit`, `eslint`,
  `tsconfig`, `vitest`, `documentation`, `architecture`, `codemods` vide),
  `docs/` (292 ADR, concepts, engineering, handoff). Fichiers : `README`,
  `ARCHITECTURE`, `ROADMAP`, `AGENTS`, `CLAUDE`, `CONTRIBUTING`, `SECURITY`,
  `LICENSE`.
- **Outillage** : Yarn 4.9.2 (`nodeLinker: node-modules`), contraintes
  `yarn.config.cjs`, tsdown par paquet (publint + attw inclus dans `build`),
  `tsc --build` global, projets Vitest racine (`unit`, `types`, `performance`,
  `e2e`, `postgres-e2e`, `coverage-*`, `website-*`), Changesets (groupe fixe
  `core` + `shared`, prereleases `next`, publication OIDC manuelle).
- **CI** (`ci.yml`) : `select` (planificateur `tooling/ci` au-dessus de
  `dorny/paths-filter` et `yarn workspaces list --since --recursive`) →
  `build` une fois (artefact) → matrice `packages`, `transversal`,
  `coverage` (2 workers, complète seulement si entrées partagées ou manuel),
  `website` → `quality`. Aucun cache de tâches, seulement `.yarn/cache`.
- **Validation locale** : `validate:full` 742 s (performance 180 s,
  couverture 291 s, le reste ≈ 271 s pour format, typecheck, lint, build,
  contraintes, docs — déduit, non ventilé) ; `validate:affected` 209 s sur un
  changement d'une ligne ([simplification.md](simplification.md)).
- **Contribution** : deux modèles d'issue Markdown (`implementation`,
  `community-plugin`), pas de `config.yml`, pas de modèle de PR, pas de
  `CODE_OF_CONDUCT`, pas de `CODEOWNERS`, `SECURITY.md` sans contact, ni
  Renovate ni Dependabot.
- **Exemples** : deux applications testées par `tests/e2e`
  (`loadMinimalExample`). `create-app` génère ses projets depuis des chaînes
  TypeScript (`base-template.ts`, `api-template.ts`, `security-template.ts`) :
  deux sources de vérité pour « une application UltimaBase type ».
- **Docs** : `apps/website/content/docs/1.0.0`, frontmatter `sources`
  vérifié. 135 blocs ` ```ts ` écrits à la main ; seuls les extraits de la
  page d'accueil sont compilés (`landing-samples.content.test.ts`). Ni
  `<include>`, ni Twoslash.
- **Dette de contrat** : constat de l'agent **invalidé par le
  coordinateur** (2026-10-08) : `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` et
  `README.md` ne contiennent plus aucune de ces références depuis leur
  réécriture (`grep` sans résultat sur la branche `api-challenge`).
- **Détails de build** : `build` = `yarn workspaces foreach --all
--topological --no-private run build` sans `--parallel`, donc séquentiel
  d'après la doc Yarn **[mémoire]** ; `tsc --build` et tsdown écrivent tous
  deux dans `dist`, et tsdown supprime `tsconfig.tsbuildinfo` : le typecheck
  qui suit un build repart à froid.

## 2. Comparaison

| Dépôt                                                                 | Monorepo et tâches                                                                                                                                                | Exemples et modèles                                                                                                                                                                   | Docs                                                                                    | Contribution                                                                                                        | Release                                                          |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [vitejs/vite](https://github.com/vitejs/vite)                         | pnpm, pas d'orchestrateur ; CI saute les jobs via `tj-actions/changed-files`                                                                                      | `playground/` (~70 cas) = fixtures des tests `test-serve`/`test-build`                                                                                                                | `docs/` VitePress + `@shikijs/vitepress-twoslash`                                       | issue forms YAML (bug, feature, docs, `config.yml`), PR template avec politique IA, CoC au niveau de l'organisation | scripts maison, aperçus `pkg-pr-new`, ecosystem-ci               |
| [vercel/next.js](https://github.com/vercel/next.js)                   | pnpm + [`turbo.json`](https://github.com/vercel/next.js/blob/canary/turbo.json) (build seulement)                                                                 | `examples/` (231), `create-next-app --example` ; `templates` dans le paquet                                                                                                           | `docs/` dans le dépôt, site séparé ; `errors/` = une page par message d'erreur          | forms, `DISCUSSION_TEMPLATE`, `CODEOWNERS`, PR template, CoC                                                        | canal `canary`, workflows maison                                 |
| [TanStack/query](https://github.com/TanStack/query)                   | pnpm + [Nx](https://github.com/TanStack/query/blob/main/nx.json) (cache build/lint/types/tests, Nx Cloud, `nx affected`, agents distribués)                       | `examples/<framework>/*` (28 pour React), publiés comme modèles par `pkg-pr-new --template`                                                                                           | `docs/` Markdown rendu par tanstack.com **[mémoire]**                                   | bug form + `config.yml`, PR template, `CODEOWNERS`, `AI_POLICY.md`                                                  | Changesets + aperçus                                             |
| [payloadcms/payload](https://github.com/payloadcms/payload)           | pnpm + [`turbo.json`](https://github.com/payloadcms/payload/blob/main/turbo.json) (build seulement, lint non caché)                                               | `templates/` (blank, website, ecommerce, **plugin**…) et `examples/` (18), téléchargés par `create-payload-app` (`download-template`, `download-example`, `configure-plugin-project`) | `docs/` dans le dépôt                                                                   | forms, PR template, `CODEOWNERS`, `SECURITY`, guide de reproduction                                                 | scripts maison, prereleases canary                               |
| [better-auth/better-auth](https://github.com/better-auth/better-auth) | pnpm + [Turborepo](https://github.com/better-auth/better-auth/blob/main/turbo.json) avec cache distant (`TURBO_TOKEN`) + `actions/cache` de `.turbo` ; **tsdown** | `demo/` (nextjs, expo, electron…), `e2e/` (adapter, integration, smoke)                                                                                                               | `docs/` **Fumadocs** + `fumadocs-typescript`                                            | forms, CoC, `SECURITY`, `CODEOWNERS`                                                                                | Changesets, `verify-changesets`, aperçus `pkg-pr-new`, dist-tags |
| [honojs/hono](https://github.com/honojs/hono)                         | un seul paquet, pas d'orchestrateur                                                                                                                               | `benchmarks/`, `runtime-tests/`, `perf-measures/`                                                                                                                                     | dépôt séparé [honojs/website](https://github.com/honojs/website) (VitePress + Twoslash) | forms, PR template, `docs/CONTRIBUTING.md`, CoC, `MIGRATION.md`                                                     | `release.yml` (non examiné)                                      |
| **UltimaBase**                                                        | Yarn 4, aucun cache de tâches, planificateur maison                                                                                                               | 2 exemples testés ; modèles `create-app` codés en dur                                                                                                                                 | Fumadocs dans `apps/website`, `sources` vérifiées, code non inclus                      | 2 modèles Markdown, ni CoC ni PR template                                                                           | Changesets, `next`, OIDC                                         |

Constantes : aucun de ces dépôts ne cache la couverture, les E2E ou les
budgets de performance ; Turborepo/Nx y cachent surtout `build`, parfois lint
et types.

## 3. Écarts classés

| Écart                                                              | Valeur  | Effort |
| ------------------------------------------------------------------ | ------- | ------ |
| Références mortes dans `AGENTS.md`/`CLAUDE.md`                     | haute   | faible |
| Issue forms YAML, `config.yml`, PR template, CoC, contact sécurité | haute   | faible |
| Build séquentiel, chronométrage par étape absent                   | haute   | faible |
| Docs sans code inclus depuis des exemples testés                   | haute   | moyen  |
| Exemples et modèles `create-app` dédoublés                         | haute   | moyen  |
| Pas de modèle de plugin pour la communauté                         | haute   | moyen  |
| Aperçus de paquets par PR, Renovate, zizmor, titres de PR          | moyenne | faible |
| Cache de tâches (Turborepo/Nx)                                     | moyenne | élevé  |
| Twoslash dans les docs                                             | moyenne | moyen  |
| `playground/`, Discussions/RFC, `CODEOWNERS`                       | faible  | faible |

## 4. Turborepo ou Nx

**Compatibilité.** La [politique de support Turborepo](https://turborepo.dev/docs/support-policy)
annonce « yarn 1+ » stable, Plug'n'Play compris : Yarn 4 en `node-modules`
convient. Nx accepte aussi Yarn Berry **[mémoire]**.

**Ce qui se cacherait.**

- `build` par paquet (tsdown + publint + attw) : bon candidat. Prérequis :
  séparer les sorties de `tsc --build` de celles de tsdown (même `dist`
  aujourd'hui ; deux tâches qui écrivent les mêmes sorties sont une erreur
  classique de cache), et déclarer `tsdown.config.ts` racine, `LICENSE` et les
  `tsconfig` comme entrées.
- `typecheck` : un seul programme `tsc --build` global, déjà incrémental ; le
  découper par paquet change le contrat pour un gain faible.
- `lint` : trois invocations globales ; il faudrait des scripts par paquet.
  `eslint --cache` donne l'essentiel nativement, mais il ignore les
  dépendances de type entre fichiers des règles typées : réservé au local,
  jamais au gate.
- Tests unitaires et de types par paquet : possibles (scripts `test` déjà
  présents), mais `yarn test` passe par les projets racine.
- **Non cachables** : couverture (un dénominateur global), performance
  (mesure de la machine), PostgreSQL E2E (Docker), `tests/e2e` (pas un
  workspace), fichiers Typegen générés suivis
  (`examples/*/.ultimabase/schema.generated.d.ts`, entrées = sources +
  `dist` des plugins) sauf déclaration exhaustive.

**Gains attendus [estimation].** Couverture et performance font ≈ 64 % de
`validate:full` et restent incompressibles par cache. Avec cache chaud, le
gain porte sur une partie des ≈ 271 s restantes : 2 à 4 min, soit un gate de
≈ 8 à 10 min. `validate:affected` : 30 à 90 s de moins quand des paquets non
touchés seraient reconstruits. En CI, le build est déjà fait une seule fois et
le planificateur saute déjà les paquets non affectés (équivalent de
`turbo --affected`) : gain de 1 à 3 min par PR ordinaire sur re-push, quasi nul
sur une exécution complète, dont le chemin critique est la couverture à 2
workers. À confirmer par les durées réelles des jobs GitHub.

**Interaction avec `tooling/ci`.** `selection.ts` associe des suites racine
(`tests/e2e`) à leurs paquets consommateurs ; Turborepo ne sait l'exprimer que
si `tests/` devient un ou plusieurs workspaces. Choix : Turborepo comme simple
exécuteur/cache de `build` sous le planificateur actuel, ou réécriture du
planificateur (coûteuse, sans bénéfice prouvé).

**Coûts et risques.** Surface de configuration (`inputs`, `outputs`, `env`
pour `DATABASE_URL`, `ULTIMABASE_COVERAGE_WORKERS`…), faux succès si une
entrée est oubliée, cache distant à héberger : Vercel Remote Cache gratuit
([doc](https://turborepo.dev/docs/core-concepts/remote-caching)), serveur
auto-hébergé (`ducktors/turborepo-remote-cache`…) ou `actions/cache` de
`.turbo` comme Better Auth. Nx ajoute `nx.json`, une clé d'activation pour ses
caches S3 gratuits et met en garde contre l'empoisonnement des caches par
bucket ([doc](https://nx.dev/remote-cache)) ; son écosystème de plugins et
d'agents ne sert pas ici. L'ADR-0275 a explicitement rejeté « une nouvelle
dépendance de graphe de tâches » : toute adoption exige un ADR qui la remplace.

**Verdict.** Nx : non. Turborepo : pas maintenant. D'abord mesurer chaque
étape et appliquer les correctifs natifs (R3) ; si `build` + lint + typecheck
dépassent encore ≈ 3 min à chaud, prototyper Turborepo pour `build` seul
(cache local + `actions/cache`), mesuré contre la même machine, avec ADR.

## 5. Recommandations ordonnées

1. ~~Réparer le contrat des contributeurs.~~ Sans objet : déjà fait (voir
   section 1).
2. **Fichiers de communauté.** `CODE_OF_CONDUCT.md` (Contributor Covenant) ;
   `SECURITY.md` pointant vers le signalement privé de GitHub ; issue forms
   YAML (bug avec reproduction, proposition de fonctionnalité, proposition de
   plugin communautaire convertie) et `config.yml` (issues vierges
   désactivées, liens docs/sécurité) ; `PULL_REQUEST_TEMPLATE.md` reprenant la
   section « Pull requests » de `CONTRIBUTING` (impact documentaire, ADR,
   tests lancés, Changeset, usage d'IA). Le modèle `implementation` reste
   interne. Pas d'ADR ; activer le signalement privé est un réglage GitHub à
   confirmer par l'utilisateur.
3. **Accélérations natives mesurées.** Chronométrer chaque étape de
   `validate:full` ; essayer `foreach --parallel --topological` pour `build` ;
   garder `tsconfig.tsbuildinfo` hors du `clean` de tsdown ou séparer les
   sorties ; `eslint --cache` en local seulement. Pas d'ADR si le gate vérifie
   la même chose ; sinon note dans l'ADR-0291.
4. **Docs incluant le code des exemples.** Fumadocs MDX inclut un fichier ou
   une région (`<include>./x.ts#region</include>` avec `//#region`,
   [doc](https://fumadocs.dev/docs/mdx/include)) : les guides affichent des
   régions d'exemples testés, et un test de contenu signale les blocs `ts` non
   inclus et non compilés. Après le choix de l'API cible (sinon double
   réécriture). ADR léger : change la règle de source des extraits.
5. **Exemples = modèles `create-app`.** Les exemples focalisés prévus deviennent
   la source unique ; `create-app --example <nom>` les copie (embarqués dans le
   paquet ou téléchargés comme `create-next-app`/`create-payload-app`) ; les
   chaînes codées en dur disparaissent. ADR (modifie le contrat de
   l'ADR-0249), phase 6 du plan.
6. **Modèle de plugin.** `examples/plugin-starter` (ou `create-app --template
plugin`, comme `templates/plugin` de Payload) : paquet, tests publics,
   `definePlugin`. Avec la façade `definePlugin`, même ADR.
7. **Après publication.** Aperçus par PR avec `pkg-pr-new` (Vite, TanStack,
   Better Auth ; l'application GitHub doit être installée **[mémoire]**),
   Renovate ou Dependabot, `zizmor` sur les workflows, contrôle des titres de
   PR. Réglages GitHub : confirmation utilisateur ; pas d'ADR sauf Renovate
   (politique de dépendances).
8. **Turborepo conditionnel** (section 4), ADR remplaçant le rejet de
   l'ADR-0275.
9. **Pas de `playground/` séparé.** Le `playground/` de Vite est un jeu de
   fixtures de tests ; ici `examples/` et `tests/fixtures` jouent ce rôle. Un
   script `dev` (build en watch + application) sur `examples/minimal` suffit.
   Pas d'ADR.
10. **Discussions et RFC** quand une communauté existe ; les ADR restent la
    décision interne.

Twoslash : à revoir après la stabilisation de l'API. La page
[Fumadocs Twoslash](https://fumadocs.dev/docs/markdown/twoslash) mentionne le
compilateur natif TypeScript 7, alors que le dépôt est en TypeScript 6 :
compatibilité, coût de build du site et besoin des déclarations Typegen à
vérifier par un prototype.

## 6. Ce qu'il ne faut pas copier

- **231 exemples à la Next.js** : coût de maintenance ; quelques exemples
  focalisés et testés valent mieux.
- **Agents distribués Nx Cloud** (TanStack) : échelle sans rapport.
- **Dizaines de workflows et de robots** (Next.js : auto-fermeture,
  verrouillage, relances) : hostile pour une petite communauté.
- **Playground servant de tests** (Vite) : mélange fixtures et oracle public,
  contraire à la règle des tests publics.
- **Bruit à la racine** (Payload : `.idea`, configs Sentry, `.cursor`,
  `.codex`, `.agents`) : garder `AGENTS.md` + `CLAUDE.md`.
- **Docs dans un dépôt séparé** (Hono) : casse les `sources` vérifiées et la
  règle « docs dans le même changement ».
- **Releases maison** (Vite, Payload, Next.js) : Changesets est déjà le
  standard de TanStack et Better Auth.
- **Changesets générés automatiquement** (`auto-changeset` de Better Auth) :
  affaiblit le choix délibéré du SemVer.
- **Cache distant par bucket sans modèle de confiance** : risque
  d'empoisonnement, signalé par Nx lui-même.
