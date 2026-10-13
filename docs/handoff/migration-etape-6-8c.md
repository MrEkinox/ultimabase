# Migration, sous-étape 6.8c : TypeScript 7, seuils, restes Typegen, durée de la couverture

Branche `migration/finish` (worktree `../ub-step6-8c`), basée sur `main` local
54470be1 (fusion de 6.8b). Dernière sous-étape de la migration.

## Critère de fin

Sur le dernier commit de code : `yarn install --immutable`, `yarn validate:full`
sans `dist` ni `*.tsbuildinfo`, `yarn test:e2e:built`, `yarn website:test` et
`yarn typecheck:typescript-7` à 0 ; audit DX contre une base 54470be1
construite. Assertions des tests publics inchangées (titres seulement).

## Portée

1. Page TypeScript 7 du site.
2. Job de CI TypeScript 7 (`typescript-7` = `npm:typescript@7.0.2`).
3. Amendement d'ADR-0297 (seuils révisés).
4. Restes Typegen (fixtures, titres, ADR remplacés, filtre de
   `open-kernel-proof.postgres`, `DIFFERENCES.md`, échantillon
   `private-sessions.ts`).
5. `AGENTS.md`, `CLAUDE.md` (textes validés).
6. Durée de la couverture.
7. Suppression des passations fusionnées.

## État

- [x] 2. Job TS7 : script `tooling/ci/typescript-7.ts`, `yarn typecheck:typescript-7`,
      `tooling/tsconfig/test-typescript-7.json`, cas `tests/register-cycle/`, job
      `typescript-7` dans `ci.yml`, `tests/README.md`.
- [x] 1. Page `operations/typescript-7` (navigation, plan, propriété
      `project-initializer`, test de navigation mis à jour).
- [x] 3. Amendement d'ADR-0297 et note 6.8c.
- [x] 4. ADR : 0177, 0184, 0185, 0198, 0217, 0265, 0285 remplacés ; 0173,
      0175, 0187, 0193, 0262 remplacés en partie (parties Typegen) ;
      `DIFFERENCES.md` ; échantillon `private-sessions.ts` (vérifié TS6 et TS7).
      Fixtures et titres : à faire après la mesure de couverture.
- [ ] 4 bis. Filtre du champ de plugin (`open-kernel-proof.postgres`) :
      bloqué, demande un changement de type public (voir Décisions).
- [x] 5. `AGENTS.md`, `CLAUDE.md`, `current-architecture.md`.
- [ ] 6. Couverture : mesure « avant » en cours.
- [x] 7. Passations fusionnées supprimées (dont `simplification.md` et
      `api-challenge-plan.md`, plus référencés que par des ADR comme preuve).

## Décisions

- Alias `typescript-7` : le binaire `tsc` de `node_modules/.bin` reste
  TypeScript 6 (vérifié après reconstruction complète de `.bin`).
- `tsc --build tsconfig.json tooling/tsconfig/test.json` en TS7 construit les
  projets en parallèle : le programme de test lisait des déclarations pas
  encore émises. Le script lance donc `--build tsconfig.json` puis
  `--project` pour les tests.
- Quatre tests de champs de Core exclus en TS7 (`test-typescript-7.json`) :
  TS7 signale « No overload matches this call » sur la propriété fautive,
  sous la directive `@ts-expect-error` multi-ligne. Ne pas modifier le corps
  des tests ; à l'utilisateur de décider s'il faut déplacer les directives.
- Cas `register-cycle` portés du spike (`mixed`, `empty-fields`, `pointer`
  avec sondes de solidité, `roles`) ; `empty-fields` reproduit le cycle
  (TS2502/TS7022) en TS6 et TS7 depuis les sources quand on remet l'ancien
  `RegisteredApplication` (vérifié puis annulé).

- Filtre d'un type de champ de plugin : le Runtime accepte `eq`/`in` sur un
  champ de plugin qui a un `storageCodec` ; le type du champ ne porte pas
  cette information (pg-vector n'a pas de codec). Typer l'égalité exige un
  marqueur de type public (porteur à la `FieldContainsInputCarrier`, ou
  paramètre de `PluginFieldDefinition`) : changement de contrat public, donc
  ADR (ADR-0288). Non fait ; le cast reste, commentaire mis à jour.

## Preuves

- `yarn typecheck:typescript-7` depuis un arbre sans `dist` ni
  `*.tsbuildinfo` → 0, 17,6 s (build 4,7 s, tests 5,7 s).
- Erreur de type volontaire dans un cas → sortie 1 (vérifié puis retiré).
- `ci.yml` analysé par `yaml` (aucune erreur, `needs` connus) ; `actionlint`
  indisponible.

## Prochaine action vérifiable

Amendement d'ADR-0297 et page TS 7 du site.
