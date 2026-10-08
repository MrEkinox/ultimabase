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
- Phase 5 : `1efe939b` (`assertPlainObject`, 86 gardes), `d348771b`
  (`typecheck` après `build`), `18b4d8da` (import séquentiel de l'exemple
  minimal, `testTimeout` 20 s des projets postgres-e2e : 55 suites / 191 tests
  de `tests/e2e` passent).
- Gate final sur `18b4d8da` (arbre de build propre) :
  - premier `validate:full` : un seul échec, le budget relatif
    `hybrid-authoring` de Typegen pendant la couverture (318,98 ms pour
    318,59 ms, +0,12 %) ; relancé seul 3/3 réussis ;
  - second `validate:full` complet : exit 0 en 1 085 s ; `yarn test` 567 /
    2 705 ; couverture 646 / 2 969, 92,54 / 86,36 / 97,35 / 93,14 ;
  - DX audit : 0 différence (35 775 enregistrements).
- Taille (`yarn measure:size`, lignes non vides) : documentation 89 445 →
  42 774, outillage 7 814 → 5 694, tests 128 181 → 127 803, production
  104 141 → 104 099 ; fichiers suivis 3 068 → 2 090.

## Prochaine action vérifiable

Revue par l'utilisateur, puis fusion `--no-ff` de `cleanup/post-rebuild` dans
`main` et suppression de ce fichier. Pousser la branche, `main` et les tags
`reference-archive` / `rebuild-archive`, et fermer la PR GitHub #1, exigent
chacun une confirmation explicite.

## Constat corrigé : `typecheck` après `build`

`tsc --build` émet dans `dist/`, puis tsdown remplaçait `dist/` par son bundle
en laissant le `tsbuildinfo`, qui croyait encore les fichiers par module
présents : après un changement de forme d'un export, le `typecheck` suivant
n'en réémettait qu'une partie et échouait. Reproduit (un export ajouté à
http-plugin après `yarn build` : 126 erreurs TS2307), puis corrigé : tsdown
supprime aussi `tsconfig.tsbuildinfo` en vidant `dist/`. Même scénario après
correction : exit 0. Coût : le premier `typecheck` après un build recompile
les packages reconstruits, comme la CI.

## Approches rejetées

- `create-app/tsdown.config.ts` qui étend la configuration racine : le
  chargeur natif de Node ne résout pas `../../tsdown.config.js` vers le `.ts`,
  et importer `.ts` exigerait `allowImportingTsExtensions` à la racine. Gain de
  dix lignes, annulé.
- Les helpers `includesString` dupliqués (deux lignes chacun) restent locaux :
  un module partagé coûterait plus qu'il ne rapporte.
- Un helper générique pour les trois « bound Core foundation providers »
  (`application-request-execution`, `-schema-mutation-surface`,
  `-operation-transport-planning`) : états, libération et ordre des messages
  diffèrent ; il faudrait une demi-douzaine de messages en paramètres pour un
  gain net d'environ 60 lignes et un risque sur l'ordre des erreurs.
- `revalidateRuntimeMutationOperation` reste : un test interne et l'audit
  `single-pass-validation-audit` le référencent explicitement.

## Pistes notées pour plus tard

- Course du module-runner Vitest dans `loadMinimalExample`
  (`tests/e2e/rest-public-vertical-support.ts`) et `testTimeout` explicite du
  projet postgres-e2e : corrigeables maintenant que les tests publics ne sont
  plus un oracle figé (changement de test uniquement).
