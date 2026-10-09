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
