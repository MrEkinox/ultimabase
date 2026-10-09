# Revue du plugin Yoga (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/graphql-yoga-plugin.md).

## Concept

Conservé : transport HTTP de GraphQL (`POST /graphql`), séparé du schéma
(`graphql-plugin`) pour pouvoir changer de transport ; réponses
GraphQL-over-HTTP standard ; contexte venant du socle HTTP. Déjà réglé :
`bodyLimit` hérité du socle HTTP (revue REST, décision 4) ; installé avec
GraphQL par le preset `apiServer({ graphql: true })`.

## Décisions

1. **Introspection activée hors production**, désactivée en production ;
   une valeur explicite l'emporte.
2. **Explorateur sans introspection = refus de démarrer** avec un message
   clair ; lien par une capacité « introspection disponible » publiée par
   Yoga et exigée par l'explorateur (aucune dépendance cachée).
3. **Règle commune développement / production pour tous les plugins** :
   chaque plugin lit `NODE_ENV` dans sa fabrique (jamais Core, ADR-0292) ;
   `production` = production, toute autre valeur = développement ; une option
   explicite l'emporte toujours. S'applique à `schemaPolicy`, l'adresse
   d'écoute, `allowWithoutRule: 'development'`, l'introspection et les
   explorateurs.
4. **Plus tard** : requêtes `GET` (avec une politique de cache), requêtes
   persistées, envoi de fichiers et abonnements (plugins Files et Realtime).

Revue validée par l'utilisateur le 2026-10-09.
