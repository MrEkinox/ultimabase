# Revue du plugin serveur Hono (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/server-hono-plugin.md), README du
paquet. Les décisions qui changent un contrat public donneront un ADR à la
migration.

## Concept

Conservé : serveur Node sans route propre qui sert le socle HTTP ; mode géré
(écoute ouverte et fermée avec l'application) et mode « application Hono
existante ». Déjà réglé : `PORT` puis 1337 (2026-10-08), adresse d'écoute
exportée par `address()` (ADR-0295) ; routes personnalisées et `/health` sans
le mode « application existante » (revue HTTP).

## Décisions

1. **Adresse d'écoute selon l'environnement** : `HOST` s'il est défini, sinon
   `127.0.0.1` en développement et toutes les interfaces en production
   (`NODE_ENV=production`) ; une valeur explicite l'emporte ;
   `honoServerPlugin()` sans argument suffit.
2. **Tests sans port** : `ultimabase.plugin(httpPlugin).fetch(request)` dans le
   socle HTTP (indépendant du serveur), même chemin qu'une vraie requête ;
   contrôle des en-têtes dupliqués conservé pour le réseau ; message clair
   quand une requête n'a pas les en-têtes d'une connexion réseau.
3. **Arrêt propre borné** (vérifié : les nouvelles requêtes sont déjà
   refusées et celles en cours attendues, mais sans limite) :
   `shutdownTimeoutMs` (10 s par défaut), puis fermeture forcée des
   connexions restantes.
4. **Compression** `compression: true`, désactivée par défaut (souvent faite
   par le proxy ou le CDN).
5. **`browserPolicyOwner` facultatif** en mode « application existante » :
   demandé seulement si CORS est activé dans le socle HTTP.
6. **Messages en termes de paquet** : une capacité porte une indication
   facultative (« installez `@ultimabase/http-plugin` »), affichée quand elle
   manque ; profite à tous les plugins sans que Core en connaisse un.
7. **Paquet renommé** `hono-server-plugin` (cohérent avec `honoServerPlugin`).
8. **Plus tard** : serveurs pour Bun, Deno, Cloudflare Workers (socle Fetch
   standard).
9. **Documenté** : HTTPS (TLS) et HTTP/2 absents volontairement, assurés par le proxy ou la plateforme.

Revue validée par l'utilisateur le 2026-10-09.
