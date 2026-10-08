# Passation : nettoyage après la reconstruction

Branche `cleanup/post-rebuild`, partie de `main` (`15834e81`). Ce fichier est
supprimé quand le travail est fusionné dans `main`.

## Mandat

Le projet a été écrit avec ChatGPT Codex, puis reconstruit package par package
avec Claude. Objectif : repartir de bases saines en supprimant ce qui ne sert
plus et en simplifiant l'interne, **sans changer la DX** (exports, types,
inférence, hovers, complétions, diagnostics, comportements, erreurs), sauf
accord explicite de l'utilisateur. Le projet n'est pas publié.

Décisions de l'utilisateur (2026-10-08) :

- historique Codex : tag Git puis suppression de l'arbre actif ;
- code : nettoyage sûr puis refactors internes, prouvés par `yarn validate:full`
  et le DX audit ;
- release : supprimer les 166 changesets ; la PR GitHub #1 « Release packages »
  devient obsolète, l'utilisateur la fermera (aucune action GitHub sans
  confirmation) ;
- hors nettoyage : limite de taille du corps des routes cookie de
  password-auth et vraies contraintes Yarn maintenant ; versions `'0.0.0'` en
  dur avant la première publication (noté dans `ROADMAP.md`).

## Référence de comparaison

- Worktree `../ultimadatabase-baseline` détaché sur `main` (`15834e81`),
  installé et construit : racine `<baselineRoot>` du DX audit.
- Tags locaux, non poussés : `reference-archive` (`0ae7767`) et
  `rebuild-archive` (`15834e81`).

## Phases

1. Archive et documentation de travail : changesets, `issues/`, `docs/plans/`,
   `CURRENT_PLAN.md`, `HISTORIQUE_SUPPRESSIONS.md`, `tooling/issues`,
   `REBUILD*.md`, `docs/rebuild/` sauf `DIFFERENCES.md`, apps vides, notes du
   site ; `ROADMAP.md` court ; site re-pointé ; `AGENTS.md`, `CLAUDE.md`,
   `CONTRIBUTING.md` réécrits ; `dx-audit` déplacé dans `tooling/dx-audit`.
2. Nettoyage sûr du code et de la configuration (dépendances inutilisées,
   exports morts, petites duplications, `test:pack:built`, tsconfig).
3. Contraintes Yarn réelles (`yarn.config.cjs`).
4. Limite de taille du corps des routes cookie de password-auth.
5. Refactors internes de Core, par petites étapes.

## État

- Phases 1 à 4 : commits `ddc22c17`, `e73d2b48`, `de595ac0`, `68b3b18e`.
  - `yarn validate:full` : exit 0 en 1 087 s (référence : exit 0 en 1 146 s).
    `yarn test` 567 fichiers / 2 705 tests (référence 568 / 2 723 : −2 fichiers
    et −22 tests de `tooling/issues`, −1 test CI de `check:issues`, +1 fichier
    et +5 tests de limite de corps). Couverture 92,33 / 86,14 / 97,35 / 92,92
    (référence 92,31 / 86,11 / 97,33 / 92,9).
  - DX audit contre la référence : 0 différence (35 775 enregistrements).
  - Contraintes Yarn : violations injectées détectées (dépendance Core →
    plugin-kit, roles → graphql-plugin, plage TypeScript divergente,
    `sideEffects`), puis exit 0 après restauration.
  - Limite de corps password-auth : l'e2e échoue sans le correctif
    (`expected 200 to be 401`) et passe avec (5/5).
- Phase 5 : à faire (voir ci-dessous).

## Constat : `typecheck` après `build`

`tsc --build` émet dans `dist/`, puis tsdown (`clean: true`) remplace `dist/`
par son bundle. Le `tsbuildinfo` reste et croit les fichiers par module
présents : après un changement de forme d'un export, le `typecheck` suivant
réémet seulement une partie des fichiers et échoue (TS7016 sur
`dist/index.d.ts`). La CI n'est pas touchée (arbre propre). Contournement :
supprimer `packages/*/dist` et les `*.tsbuildinfo` avant de valider.

## Approches rejetées

- `create-app/tsdown.config.ts` qui étend la configuration racine : le
  chargeur natif de Node ne résout pas `../../tsdown.config.js` vers le `.ts`,
  et importer `.ts` exigerait `allowImportingTsExtensions` à la racine. Gain de
  dix lignes, annulé.
- Les helpers `includesString` dupliqués (deux lignes chacun) restent locaux :
  un module partagé coûterait plus qu'il ne rapporte.
- `revalidateRuntimeMutationOperation` reste : un test interne et l'audit
  `single-pass-validation-audit` le référencent explicitement.

## Pistes notées pour plus tard

- Course du module-runner Vitest dans `loadMinimalExample`
  (`tests/e2e/rest-public-vertical-support.ts`) et `testTimeout` explicite du
  projet postgres-e2e : corrigeables maintenant que les tests publics ne sont
  plus un oracle figé (changement de test uniquement).
