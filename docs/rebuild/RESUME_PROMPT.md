# Prompt de reprise

Copier le bloc ci-dessous dans une nouvelle session Claude Code ouverte dans
`/Users/mrekinox/Desktop/claude-test/claude-ultimabase`.

```text
Tu reprends la reconstruction d'UltimaBase.

Dépôt de travail : /Users/mrekinox/Desktop/claude-test/claude-ultimabase (branche main).
Référence fonctionnelle, en lecture seule, à ne jamais modifier :
/Users/mrekinox/Desktop/claude-test/ultimadatabase
(commit 0ae7767f7b75dd6c640ca547f9ff85b60f46e69d).

Commence par lire, en entier :
1. docs/rebuild/HANDOFF.md : la mission complète, la méthode, l'état exact, les branches
   WIP, les validations de référence et les enseignements ;
2. docs/rebuild/PROTOCOL.md : les règles de réécriture et de validation par package ;
3. docs/rebuild/DIFFERENCES.md et docs/rebuild/core-interfaces/README.md.

Ensuite :
- Vérifie l'état réel (git log, git branch, node tooling/measure-rebuild.mjs .). Ne te fie
  pas au résumé sans contrôle.
- Reprends les 5 branches WIP rebuild/core-* : termine chaque réécriture et fais-la passer
  par toutes les validations du protocole. Si un WIP est trop cassé, réinitialise la
  branche sur main et refais-le proprement. Fusionne chaque périmètre validé dans main
  (--no-ff), après avoir relu le diff : fichiers hors périmètre, casts ajoutés, tests
  modifiés.
- Puis réécris les packages restants listés dans HANDOFF.md, en commençant par les plus
  gros (postgres-plugin, graphql-plugin, access-plugin, password-auth-plugin, typegen,
  http-plugin, roles-plugin…). Utilise des sous-agents dans des worktrees isolés
  (tooling/rebuild-worktree.sh), 3 ou 4 en parallèle au maximum. Demande-leur de
  committer des checkpoints au fil de l'eau.
- Fais ensuite la passe d'intégration de Core. Les interfaces entre périmètres peuvent
  alors évoluer, à condition de mettre à jour tous les consommateurs.
- Traite la documentation historique et l'outillage de processus, puis documente la
  correspondance des validations.
- Termine par la validation complète sur machine calme (yarn validate:full,
  yarn test:e2e, yarn test:pack, couverture comprise), sur la référence et sur la
  reconstruction. Livre ensuite le rapport final demandé dans HANDOFF.md (matrice des
  capacités avec preuves, résultats exacts, écarts, mesures avant/après, simplifications
  réelles).

Contraintes absolues :
- parité fonctionnelle, sécurité et DX TypeScript avant tout ;
- ne jamais affaiblir ni supprimer une assertion de test ;
- pas de `any` ni de cast injustifié ;
- consigner tout écart dans DIFFERENCES.md ;
- ne jamais pousser ni publier ;
- signaler toute validation non exécutée.
Mets à jour HANDOFF.md à chaque étape importante.
```
