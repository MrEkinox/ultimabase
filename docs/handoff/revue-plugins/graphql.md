# Revue du plugin GraphQL (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/graphql-plugin.md), README du paquet.
Les décisions qui changent un contrat public donneront un ADR à la migration.

## Concept

Conservé : schéma GraphQL compilé depuis les schémas UltimaBase (requêtes,
mutations, écritures imbriquées, filtres, tri, champs virtuels, opérations de
plugins), pagination Relay, fusion de schémas écrits à la main (Pothos,
Nexus), limites de protection, masquage des erreurs internes, exécution sans
réseau. Transport HTTP par le plugin Yoga.

Déjà réglé : clé de curseur configurable (`cursorSecret`,
`ULTIMABASE_CURSOR_SECRET`, 2026-10-08) ; par les décisions REST :
suppression de l'acquittement (ADR-0294), exposition des opérations par le
plugin propriétaire (F1), `defineOperation` (fin des descriptions de type
écrites à la main), vocabulaire et pagination communs.

## Décisions

1. **Option de schéma à plat, mêmes clés que REST** :
   `graphql: { count: true, typeName: 'Task' }`.
2. **Champ `health` toujours présent**, branché sur `ultimabase.health()`
   (renvoie `OK` ou `DEGRADED`, jamais le détail) : permet de démarrer sans
   schéma exposé (avertissement « aucun schéma exposé en GraphQL »). Côté
   HTTP, la route de santé du socle (revue HTTP, décision 5) est activée par
   défaut sur `/health` (200 ou 503, chemin réglable, `health: false` pour la
   couper) et sert tous les transports ; pas de route en double sous
   `/api/v1`.
3. **Indice pour une fonctionnalité désactivée** dans l'erreur de validation
   (`hint: enable graphql: { count: true } on Todo`).
4. **`totalCount`** dans les connexions, calculé seulement s'il est demandé et
   si `count` est autorisé pour le schéma.
5. **Exécution sans réseau simplifiée** : contexte anonyme par défaut,
   `principal` en option (`graphql.execute({ document, principal })`).
6. **Gardé** : pagination Relay, fusion de schémas, limites, masquage des
   erreurs internes, exécution sans réseau.
7. **Fichier SDL en développement** : `graphqlPlugin({ sdl: './schema.graphql' })`
   réécrit au démarrage, pour graphql-codegen ou gql.tada (format standard,
   pas une génération propre).
8. **Plus tard** : abonnements avec le futur plugin Realtime (prise de
   connexion WebSocket notée dans la revue HTTP) ; requêtes persistées avec
   la revue Yoga.
9. **À vérifier** : chargement groupé des inclusions et des relations
   (problème N+1) quand une liste demande une relation par nœud ; à corriger
   avant la publication si chaque nœud déclenche sa propre requête.

Revue validée par l'utilisateur le 2026-10-09 (sous réserve du point 9).
