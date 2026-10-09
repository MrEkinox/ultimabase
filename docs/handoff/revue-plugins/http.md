# Revue du plugin HTTP (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/http-plugin.md), README du paquet.
Les décisions qui changent un contrat public donneront un ADR à la migration.

## Concept

Conservé : socle Fetch commun (REST, GraphQL, authentification, outils),
indépendant du serveur (Hono aujourd'hui, Bun, Deno ou Cloudflare demain),
ne connaît ni REST ni GraphQL ; contexte anonyme par défaut enrichi par les
résolveurs ; Master seulement par son en-tête et seulement s'il est activé ;
`Cache-Control: private, no-store` par défaut ; `X-UltimaBase-Request-Id` dans
chaque réponse.

## Décisions

1. **En-tête d'application facultatif** : sans en-tête, la requête va à
   l'unique application du processus ; un en-tête qui ne correspond pas est
   refusé (clients Parse existants compatibles) ; `appId` facultatif (défaut
   `'main'`) ; `requireApplicationId: true` pour plusieurs applications
   derrière un même proxy.
2. **Erreurs exactes** : `HTTP_APPLICATION_UNKNOWN` (404) pour un `appId`
   faux ; refus CORS explicite pour un préflight sans politique
   (« CORS is not enabled: configure browser.origins ») au lieu de 401.
3. **CORS par origines** :
   `browser: { origins: ['https://app.example.com'], credentials: true }` ;
   méthodes déduites des routes montées ; en-têtes déclarés par les plugins
   installés via la capacité existante (`Content-Type`, `Authorization` avec
   l'authentification, en-tête Master seulement s'il est activé).
4. **`master: true`** au lieu de `{ enabled: true }`.
5. **Routes personnalisées sans écrire de plugin** :
   `httpPlugin({ routes: [route.get('/health', (request, { context }) => …)] })`
   (dans les options du plugin HTTP, pas dans `new App` : Core ne connaît pas
   HTTP) ; le gestionnaire reçoit le contexte de la requête ; plus de
   `protocol` ni d'identifiant de plugin à inventer ; route de santé intégrée
   `health: '/health'` (200 ou 503 selon `ultimabase.health()`).
6. **Délai par défaut de 30 s** (`requestTimeoutMs` réglable).
7. **Limitation par IP** (décidée avec l'authentification) :
   `trustProxy` (nombre ou adresses des proxys de confiance),
   `rateLimit: { default: { perMinute } }`, stockage en mémoire par défaut et
   remplaçable ; l'authentification ajoute ses limites plus strictes.
8. **Avertissements au démarrage** quand rien ne peut répondre (REST sans
   HTTP, routes sans serveur).
9. **Fin de la revue des transports** : un utilitaire ou un paquet regroupé
   pour lancer REST et GraphQL sans déclarer les sept paquets un à un
   (demande de l'utilisateur).
