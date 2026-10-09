# Revue des explorateurs GraphQL (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/graphql-explorers.md).

## Concept

Conservé : page d'explorateur sans clé ni autorité intégrée, CSP stricte avec
nonce, blocage en production sauf `allowInProduction: true`. Déjà réglé :
`environment` facultatif (règle commune développement / production, revue
Yoga), refus de démarrer sans introspection (revue Yoga), messages en termes
de paquet (revue Hono).

## Décisions

1. **Un seul plugin** `graphqlExplorerPlugin({ ui: 'graphiql' | 'apollo-sandbox' })`
   (GraphiQL par défaut) remplace `graphiql-plugin` et `apollo-sandbox-plugin`
   (≈ 290 lignes dupliquées, un paquet de moins).
2. **URL simple** `/graphiql` (ou `/apollo-sandbox`) ; préfixe
   `/__ultimabase/apps/{appId}` seulement en mode multi-applications.
3. **Preset** : `apiServer({ graphql: { explorer: 'graphiql' } })`, actif hors
   production.
4. **Chargement depuis le CDN (vérifié)** : GraphiQL a des versions figées et
   une empreinte sur la feuille de style mais pas sur les scripts → ajouter les
   empreintes d'intégrité dans la carte d'imports ; Apollo Sandbox charge un
   script non figé sans empreinte (`…/v2/embeddable-sandbox.umd.production.min.js`,
   aucune version figée proposée par Apollo) → risque documenté, limité par
   l'activation en développement seulement.
5. **`graphql-http` gardé** (contrat neutre « où est l'API GraphQL », jamais
   importé par le développeur).
6. **Plus tard** : fonctionnement hors ligne (fichiers servis en local) si le
   besoin se présente ; limite documentée.

Revue validée par l'utilisateur le 2026-10-09.
