# Revue du plugin Password Auth (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md). Source :
[fiche d'inventaire](../api-inventory/password-auth-plugin.md), README du
paquet. Les décisions qui changent un contrat public donneront un ADR à la
migration.

## Concept

Conservé : identité locale par identifiant et mot de passe, Argon2id,
sessions opaques révocables, secrets en stockage privé (hors requêtes, REST,
GraphQL, Hooks, Access), opérations exposées seulement si elles sont listées,
authentification HTTP par `Bearer` et cookie `__Host-` en option.

## Décisions

1. **Fabrique `App.PasswordUserSchema.define`** : plus de double liste
   (`Base` puis `Base.use(auth)`), plus d'option `user:`, `className` libre
   (aujourd'hui imposé à `'User'`), un schéma utilisateur par instance de
   plugin.
2. **Le plugin fournit le « principal courant »** (capacité neutre de Core) :
   `context.principal` / `principal` partout ; `passwordPrincipal` reste pour
   lire la session elle-même.
3. **Connexion par e-mail** : `identifier: 'username' | 'email'` (défaut
   `username`) ; `email` ajoute un champ unique, normalisé, au format validé ;
   `login({ email, password })`.
4. **Plus de `MasterAuthority` pour l'inscription** : le plugin utilise son
   privilège d'élévation déjà déclaré ; `MasterAuthority` ne sert qu'aux clés
   Master venues d'un transport.
5. **Un seul préfixe de routes** en `Bearer` et en cookie ; le mode cookie ne
   change que la réponse.
6. **Résultats typés** (`Model<"TodoUser">`) pour `signUp`, `login`,
   `current` (forme D).
7. **Erreur d'inscription qui nomme le champ manquant**.
8. **Gardé** : options `password` (Argon2id, `policyVersion`) et `session`,
   cookie `__Host-`, stockage privé, exposition seulement si listée.
9. **Reporté à la revue des transports** : la liste d'opérations répétée dans
   `restPlugin({ operations })` et `graphqlPlugin({ operations })`.

## Restructuration décidée : socle d'authentification et méthodes

Décidée le 2026-10-09 (ADR à la migration ; remplace la décision 1 pour le
nom de la fabrique et déplace la décision 3) : besoin proche d'OAuth et de
plusieurs méthodes liées au même utilisateur.

- **Socle `authPlugin`** : schéma utilisateur (`App.UserSchema.define`, un par
  instance), sessions uniques quelle que soit la méthode, principal courant
  (capacité neutre), transport HTTP (`Bearer`, cookie, un seul préfixe),
  liaison de comptes.
- **Méthodes en paquets séparés**, qui dépendent du socle mais jamais les unes
  des autres : `password` (code actuel déplacé ; `identifier: 'username' |
'email'`), `oauth` (Google, GitHub et fournisseur OpenID Connect générique),
  puis méthodes de la communauté (lien magique, passkeys, SAML…).

  ```ts
  authPlugin({
  	methods: [
  		password({ identifier: 'email' }),
  		oauth.google({ clientId, clientSecret }),
  	],
  })
  ```

- **Liaison de comptes** : même concept que les `authData` de Parse, mais en
  collection privée (une ligne `{ user, provider, providerUserId, … }`, index
  unique `(provider, providerUserId)`, jetons des fournisseurs jamais dans la
  ligne utilisateur, plusieurs comptes par fournisseur possibles) ; fonction
  listant les méthodes liées d'un utilisateur. Option
  `linking: 'verified-email' | 'manual'`, liaison automatique seulement par
  e-mail vérifié des deux côtés (défaut).
- Le paquet `password-auth-plugin` se scinde en `auth-plugin` et méthode
  `password`.

## Liaison de comptes : choix argumenté

La collection privée de comptes (modèle Better Auth, Auth.js, Lucia) est
préférée aux `authData` de Parse et à un champ par fournisseur : secrets hors
de la ligne utilisateur, unicité garantie par index, aucun changement de
schéma pour un nouveau fournisseur, plusieurs comptes par fournisseur. On
garde l'idée des `authData` de vérifier côté serveur un jeton obtenu par le
client (connexion mobile).

## Fonctionnalités ajoutées (validées le 2026-10-09)

Première publication : 1 à 6, 8 et 9 ; plus tard : 7. L'envoi des e-mails
reste à l'application (rappels), le plugin n'embarque aucun service d'e-mail.

1. **Réinitialisation du mot de passe** : `requestPasswordReset({ email })`
   (même réponse que le compte existe ou non), `resetPassword({ token,
newPassword })` ; jeton aléatoire stocké haché, usage unique, expiration
   courte (1 h par défaut), nouveaux jetons annulant les anciens ; toutes les
   sessions révoquées après réinitialisation ; soumis à la limitation des
   tentatives ; rappel `sendResetEmail`.
2. **Vérification d'e-mail** : champ `emailVerified` (et date) ajouté par le
   socle ; `sendVerificationEmail` + `verifyEmail({ token })` ;
   `requireVerifiedEmail` optionnel ; e-mail garanti par le fournisseur ou
   réinitialisation réussie = vérifié.
3. **Limitation des tentatives** : par compte en base (délais croissants,
   remis à zéro au succès, partagé entre serveurs), par paire compte et IP
   pour éviter le blocage volontaire d'une victime ; limite globale par IP
   dans le plugin HTTP (proxys de confiance configurables, stockage en
   mémoire par défaut, remplaçable pour plusieurs serveurs).
4. **Gestion des sessions** : `listSessions()` (appareil, IP, création,
   dernier usage), `revokeSession(id)`, `logoutEverywhere()` ; administrateur
   (Master) : `auth.listSessions(user)`, `auth.revokeSessions(user)` ;
   `revokeOnPasswordChange` activé par défaut.
5. **Événements** `afterSignUp`, `afterLogin`, `afterLoginFailed`,
   `afterLogout`, `afterPasswordReset`, `afterEmailVerified`,
   `afterEmailChanged` : écoutés par l'application, charge utile typée sans
   secret, « au mieux ».
6. **OAuth** : redirection web (code d'autorisation, PKCE, `state`, `nonce`)
   et jeton mobile (`loginWithIdToken`, signature vérifiée) ; préréglages
   Google et GitHub, fournisseur OpenID Connect générique ; `mapProfile` ;
   adresses de retour en liste autorisée ; jetons des fournisseurs non
   conservés par défaut (`storeTokens` chiffré avec une clé de
   l'application) ; impossible de retirer sa dernière méthode ; liaison
   automatique seulement par e-mail vérifié.
7. **Plus tard** : double authentification (TOTP, codes de secours) et
   passkeys, comme méthodes.
8. **Changer son mot de passe et son e-mail** : `changePassword({
currentPassword, newPassword })` (autres sessions révoquées, limitation des
   tentatives) ; `requestEmailChange({ currentPassword, newEmail })` puis
   confirmation sur la nouvelle adresse, notification de l'ancienne.
   **Réauthentification récente** pour les opérations sensibles : mot de passe
   actuel ou connexion de moins de quelques minutes (utilisateurs sans mot de
   passe, connectés par un fournisseur).
9. **Supprimer son compte** avec réauthentification récente : révocation des
   sessions, suppression des comptes liés et des secrets.
