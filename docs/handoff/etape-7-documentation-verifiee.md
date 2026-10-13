# Étape 7 : documentation vérifiée (ADR-0330), tranche Soft Delete

Branche `docs/verified-soft-delete` (worktree `ub-step7`, base `main`
fe385287). Prototype sur une seule fonctionnalité, à relire par
l'utilisateur avant d'étendre aux autres. À supprimer une fois fusionné.

## Ce qui existe

- `examples/soft-delete/` : application forme D (Post en mode par défaut,
  Comment en mode `command`, Article avec index unique partiel, Member et
  StaffRole pour `readDeleted: hasRole(Moderator)`, REST par `apiServer`),
  11 tests `testApplication` dans 4 fichiers. Exécutée par
  `tests/e2e/examples-form-d.postgres.e2e.test.ts` (compilation et tests) et
  `yarn typecheck:typescript-7`.
- Page `plugins/official/soft-delete.mdx` : 15 `<include cwd …>` de régions,
  1 bloc `twoslash`, 0 bloc TS non marqué (les blocs bash, json et graphql ne
  sont pas classés).
- README du paquet : 6 blocs copiés depuis les régions entre marqueurs
  `<!-- region <chemin>#<noms> -->` / `<!-- endregion -->` par
  `yarn docs:regions` (`tooling/documentation/sync-readme-regions.ts`,
  `--check`). Vérifié par `tooling/documentation/readme-regions.test.ts`
  (projet `unit`, donc `validate:full` et le job CI « repository »).
- Tests de contenu : `verified-code.content.test.ts` (classement, régions
  résolues, compteurs) et `compiled-snippets.content.test.ts` (Twoslash sans
  build du site).

## Décisions

- Drapeaux de bloc : `twoslash` (compilé) et `unverified` (marqué). Pas de
  troisième drapeau « compile » : un extrait compilé passe par Twoslash.
- `<include cwd>` : chemins relatifs à `apps/website` (`../../examples/…`),
  plus lisibles que sept `../` relatifs au fichier MDX. Prettier impose le
  chemin sur sa propre ligne, indenté ; Fumadocs l'accepte.
- Extraction maison (`tooling/documentation/code-regions.ts`) alignée sur
  Fumadocs (marqueurs imbriqués retirés, dédentation), parce que la fonction
  de Fumadocs n'est pas exportée.
- Les blocs « flux » de la page viennent des tests (`tests/*.test.ts`) : les
  assertions juste après la région prouvent la prose. Les déclarations
  viennent de `src/`.
- Comment et Article n'ont pas de règles Access (fermés sauf Master) : une
  ligne `access:` dans un bloc README exige l'import d'`accessPlugin` (test
  `active-contracts`). Le bloc README de Post concatène
  `factory,moderators,post`.
- L'exemple n'installe pas GraphQL : avec `ultimabaseTesting()`, Vitest
  charge deux royaumes `graphql` (« Cannot use GraphQLEnumType … from another
  module or realm »). La racine contourne par `server.deps.inline`
  (`tooling/vitest/runtime.ts`) ; `@ultimabase/testing/vitest` ne le fait
  pas. À corriger dans le paquet testing (hors périmètre).
- L'ancien bloc « Many rows » purgeait après `restoreMany` : `purgeMany` ne
  voit que les tombstones, il ne supprimait donc rien. La région corrigée
  supprime de nouveau avant la purge.
- La sélection CI marque `documentation` quand `examples/` change.
- Twoslash conservé : `fumadocs-twoslash` 3.3.1 (twoslash 0.3.9, TypeScript 6),
  `explicitTrigger: true`, pas de cache de types (une clé sur le seul texte
  masquerait un changement d'API). La version 4 dépend de `typescript ~7.0.2`
  sous ce nom et échoue à l'installation (patch TypeScript intégré de Yarn
  4.9.2 : `_tsc.js` absent).
- Piège : `vfsRoot` avec une barre finale fait disparaître silencieusement
  l'erreur d'une propriété en trop ; le test utilise `path.resolve`.

## Chiffres

- Build du site à froid (`rm -rf apps/website/.next`), même machine :
  sans Twoslash 43,4 s et 43,5 s ; avec un bloc Twoslash 47,5 s, 48,3 s et
  48,1 s (+4,5 s, environ 10 %). Test de contenu Twoslash : 1,7 s.
- Blocs TS/JS : pages 15 inclus, 1 compilé, 0 marqué `unverified`,
  158 non marqués ; README 6 inclus, 184 non marqués.

## Ajouter une fonctionnalité

Voir `examples/README.md` (« Feature examples and documentation ») et
`apps/website/docs/editorial-contract.md#code-samples`.

## Prochaine action vérifiable

Gate complète sur le dernier commit (voir le rapport), puis relecture du
format par l'utilisateur.
