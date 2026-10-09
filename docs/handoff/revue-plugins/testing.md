# Revue du paquet testing (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/testing.md), README du paquet, guide
`test-an-application.mdx`.

## Concept

Conservé : suite de conformance des plugins (manifeste, privilèges,
déterminisme, isolation, instances multiples), `PostgresTestWorker` (un
schéma isolé par worker). Déjà réglé : requêtes HTTP en mémoire
(`http.fetch`, revue Hono), GraphQL sans réseau avec `principal` (revue
GraphQL), message de `readVitestPoolId` (2026-10-08) ; suite de conformance
des adaptateurs reportée au chantier MongoDB (adaptateurs.md).

## Décisions

1. **Tester la vraie application en une ligne** :
   `await using t = await testApplication(ultimabase)` démarre l'application
   de production (mêmes plugins, mêmes règles) sur un schéma isolé ; fermeture
   automatique. Possible parce que `postgresPlugin()` lit `DATABASE_URL` au
   démarrage : l'utilitaire fournit une connexion isolée par worker.
   `TEST_DATABASE_URL` par défaut, sinon PostgreSQL lancé par Testcontainers.
2. **Ce que fournit `t`** : `reset()` (vidage rapide entre tests, par une
   capacité d'adaptateur neutre ; `TRUNCATE` pour PostgreSQL), `fetch(path)`
   (HTTP en mémoire), `as(principal, fn)` et `asMaster(fn)`, `afterCommit()`
   (attendre les `afterCommit` et événements en cours). L'injection de
   principal n'existe que dans une application démarrée par
   `testApplication`, jamais en production.
3. **Configuration Vitest** `@ultimabase/testing/vitest` :
   `test: { ...ultimabaseTesting() }` (PostgreSQL lancé une fois, schéma par
   worker, ménage final ; plus de `readVitestPoolId` à appeler).
4. **Exports séparés** : `@ultimabase/testing` (applications) et
   `@ultimabase/testing/plugins` (conformance).
5. **`withPluginTypegenConformance` retiré** avec Typegen (ADR-0297).
6. **Revue create-app** : générer un premier test qui utilise
   `testApplication`.

Revue validée par l'utilisateur le 2026-10-09.
