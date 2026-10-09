# Revue de create-app (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/create-app.md).

## Déjà réglé

Correctifs du 2026-10-08 (imports et lignes vides des gabarits, tâche créée
une seule fois, `docker compose up -d --wait`) ; retrait de pg-vector du
catalogue (ADR-0298, 2026-10-09). Par les décisions des autres revues, le
gabarit passe d'environ 57 lignes à une quinzaine : forme D, preset
`apiServer`, ligne `Register`, plus de Typegen (ni script, ni plugin, ni
écriture au démarrage), plus d'en-tête d'application, défauts selon
l'environnement (adresse, `schemaPolicy`, introspection), plus de liste
d'opérations répétée, plus de `.env` exigé pour vérifier les types.

## Décisions

1. **Script `dev`** : `node --watch --env-file=.env src/main.ts` (TypeScript
   exécuté par Node 24, sans compilation) ; remplaçable plus tard par la
   commande `ultimabase dev` (fichier de configuration et CLI toujours en
   attente).
2. **REST coché par défaut**, dans les questions comme avec `--yes`.
3. **Starter en mode prototype** :
   `accessPlugin({ allowWithoutRule: { all: 'development' } })` ; tout marche
   en développement avec un avertissement, refus de démarrer en production
   tant que les règles ne sont pas écrites (message explicatif).
4. **Premier test généré** `tests/task.test.ts` avec `testApplication` et un
   script `test`.
5. **Docker par défaut** pour la base (avec `--wait`) ; si Docker est absent,
   create-app le détecte et propose la base existante avec un message clair.
6. **Projets générés vérifiés par Prettier et ESLint** dans les tests de
   create-app.
7. **Publication** : `npm create @ultimabase/app` ne fonctionnera qu'après la
   publication des paquets.

Revue validée par l'utilisateur le 2026-10-09.
