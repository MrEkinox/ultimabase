# Revue du plugin PostgreSQL (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/postgres-plugin.md), README du paquet.
Les décisions qui changent un contrat public donneront un ADR à la migration.

## Concept

Conservé : adaptateur officiel (Drizzle interne jamais exposé, aucun SQL brut
public), `url` ou `pool`, trois politiques de synchronisation
(`override`/`fail`/`ignore`), aucune suppression destructive de colonne ou de
table, `postgres: { table }` dans `.with()` et `postgres: { renamedFrom }` sur
un champ.

Déjà réglé : `schemaPolicy` selon `NODE_ENV` (ADR-0292, implémenté) ;
`postgresPlugin()` lit `DATABASE_URL` au démarrage, `url` explicite prioritaire
(décision 1 des formes) ; messages d'échec de synchronisation avec table,
colonne, changement, SQLSTATE et aide (2026-10-08) ; code du pilote dans
l'échec de connexion (ADR-0296).

## Décisions

1. **Renommage oublié détecté** : en `override`, refus de démarrer si une table
   gérée contient une colonne non gérée `NOT NULL` sans défaut (elle
   bloquerait toutes les insertions) ; suggestion de `renamedFrom` quand un
   champ disparaît et un autre du même type apparaît.
2. **Conversions de type** : en `override`, seules les conversions sûres
   (élargissements) s'appliquent automatiquement ; les autres sont refusées
   avec un message qui renvoie vers une migration (aujourd'hui `float` →
   `string` est converti en silence).
3. **Journal des changements appliqués** en `override` (vérifié : aujourd'hui
   le résumé n'existe que dans les erreurs) : une ligne par modification.
4. **Réglages de connexion en mode `url`** :
   `postgresPlugin({ connection: { max, ssl, statementTimeoutMs, … } })`.
5. **Index partiels génériques** (déplacés dans Core par l'audit des adaptateurs, voir adaptateurs.md) :
   `indexes: [{ fields: ['slug'], unique: true, where: { isDeleted: false } }]`,
   filtre typé avec le vocabulaire `where` ; remplace `ignoreDeleted` de la
   revue Soft Delete (aucun lien entre les deux plugins).
6. **Colonnes en `snake_case` par défaut** (`created_at`), cohérentes avec les
   tables (`blog_posts`) et confortables en SQL manuel ; rien n'est publié,
   le changement ne coûte rien.
7. **`renamedFrom` gardé** jusqu'au plugin de migrations (un renommage y
   deviendra une étape) ; la doc explique qu'on peut le retirer une fois le
   renommage appliqué partout.
8. **Gardé** : `url` ou `pool`, trois politiques, aucune suppression
   destructive, aucun SQL brut ni type Drizzle exposé.
9. **Nouvelles tentatives de connexion au démarrage** :
   `connection: { connectRetries: 5 }` (délai croissant), utile avec Docker et
   Kubernetes en production.
10. **Santé** (remplacé par `ultimabase.health()` neutre de Core, voir adaptateurs.md) : `ping()` sur l'export du plugin, pour les sondes de santé (la route
    `/health` relève des transports).
11. **Débogage** : `debug: { logQueries, slowQueryMs }` (requêtes et durées,
    jamais les valeurs ; le seuil de lenteur est utilisable en production).
12. **Documenté** : pas de SQL manuel via UltimaBase (contournerait Access,
    ACL, Soft Delete et les hooks) ; pour un rapport, le mode `pool` et ses
    propres requêtes hors d'UltimaBase, sans aucune règle ; schéma PostgreSQL
    dédié via `search_path` dans l'URL.
13. **Plus tard** : répliques en lecture. Migrations : chantier dédié.

Revue validée par l'utilisateur le 2026-10-09.
