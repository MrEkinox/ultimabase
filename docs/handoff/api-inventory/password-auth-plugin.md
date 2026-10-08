# Fiche plugin : `@ultimabase/password-auth-plugin`

Phase 1 du défi API ([plan](../api-challenge-plan.md)). Mesures sur
l'application sonde `node_modules/.cache/inventory-policy/src/app/user.ts`,
`application.ts`, `usage.ts` (avec Typegen) et `probes/p2.ts`, `probes/p6.ts`
(sans Typegen), typées avec `node_modules/.bin/tsc` strict/NodeNext.

## 1. Rôle et installation

Identité locale nom d'utilisateur + mot de passe : schéma `User`, hachage
Argon2id, sessions opaques révocables, six opérations neutres (signUp, login,
refresh, logout, changePassword, logoutEverywhere), résolution de session
HTTP (Bearer, cookie optionnel).

```ts
const AppUser = PasswordUserSchema.define(Base.Schema, { className: 'User', fields: … })
const auth = passwordAuthPlugin({ user: AppUser })
const Application = Base.use(auth)
new Application({ masterAuthority: new MasterAuthority({ keys, onUse }), schemas: [AppUser, …] })
```

Options (`packages/password-auth-plugin/src/plugin.ts`) :

| Option        | Défaut                                              | Remarque                                                                    |
| ------------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| `user`        | `PasswordUser` intégré, ajouté automatiquement      | un `User` personnalisé doit **aussi** figurer dans `schemas`                |
| `password`    | Argon2id 64 Mio, 3 passes, 4 voies, `policyVersion` | toute modification exige d'incrémenter `policyVersion` ; bornes de sécurité |
| `session`     | glissante 7 j, absolue 30 j                         | `expiresInMs`, `absoluteExpiresInMs`                                        |
| `http.cookie` | désactivé (Bearer seul)                             | `name` doit commencer par `__Host-`, `sameSite` défaut `lax`                |

- Défauts sûrs. Exigences cachées : `signUp` exige une **`MasterAuthority`
  configurée** (élévation auditée), même si l'application n'utilise jamais de
  clé Master ; le mode cookie exige `httpPlugin` (peer) et une politique
  navigateur compatible, vérifiée au démarrage.
- Privilèges critiques `storage:private`, `authority:elevate` et revendication
  `environment:native-code` (argon2 natif), avec raisons d'auteur (ADR-0290).
- Dépend de `@ultimabase/http-plugin` (package), pas de REST ni GraphQL.

## 2. Ce qu'il ajoute aux schémas

- Schéma `User` : champ injecté `username` (unique, immuable, requis) ;
  noms réservés `password`, `passwordHash`, `credential`, `session`.
- `className` **imposé à `'User'`** (`PasswordUserSchemaOptions.className: 'User'`,
  vérifié par `@ts-expect-error` dans `probes/p6.ts`).
- Collections privées (vérificateurs, empreintes de session) hors Query,
  Typegen, REST, GraphQL, Hooks et Access.
- Statiques de la classe User : `signUp`, `login`, `refresh`, `logout`,
  `changePassword`, `logoutEverywhere`, `current`.
- Opérations exposées seulement si listées :
  `restPlugin({ operations: passwordAuthOperationList })` →
  `POST /api/v1/auth/{sign-up,login,refresh,logout,change-password,logout-everywhere}` ;
  même liste à repasser à `graphqlPlugin({ operations })`.
- Mode cookie : routes propres **`/auth/v1/*`** (préfixe différent de REST
  `/api/v1/auth/*`) qui posent un cookie `HttpOnly`/`Secure`.
- Jetons de contexte `passwordPrincipal` (`{ user: Pointer<User> }`) et
  `passwordSession`.

Exemples réels : `examples/minimal/src/schema.ts` (opérations listées deux
fois, `PasswordUser` par défaut), `examples/minimal/src/create-application.ts`
(cookie `__Host-minimal-session`), `examples/minimal/src/soft-delete.ts`
(`app.plugin('@ultimabase/password-auth-plugin').runWithSession(...)`).

## 3. API pour le développeur

- **Personnaliser l'utilisateur** : forme spéciale
  `PasswordUserSchema.define(Base.Schema, options)` (comme `RoleSchema`) ;
  ordre imposé : base de schémas → User → `passwordAuthPlugin({ user })` →
  application. Le User ne peut donc pas utiliser d'option de schéma apportée
  par Password Auth lui-même.
- **Inscription** : `AppUser.signUp({ username, password, ...champs })` — un
  objet plat ; champs requis inférés depuis la source.
- **Contexte serveur** : `app.plugin(auth).runWithSession(token, () => …)` ;
  `current`, `changePassword`, `logoutEverywhere` n'existent que dans ce
  contexte. Pas d'API d'administration (révoquer les sessions d'un autre
  utilisateur, lister les sessions).
- **Côté règles** : `context.getValue(passwordPrincipal)?.user` partout (Access,
  Hooks, Roles `resolveCurrent`, virtuels). ACL, elle, reçoit le principal par
  la capacité neutre.
- **Nom d'utilisateur** : 3 à 64 caractères, lettres, chiffres, `.`, `_`, `-`
  (`src/normalization.ts`) : **une adresse e-mail est refusée** (`@`).
- Manquent par rapport à Better Auth / Parse : connexion par e-mail,
  vérification d'e-mail, réinitialisation de mot de passe, OAuth, MFA,
  limitation de débit ou verrouillage, hooks `beforeLogin`. Parse :
  `Parse.User.signUp/logIn/become(token)`, `requestPasswordReset`,
  `_Session` interrogeable. Better Auth : `auth.api.signUpEmail`, plugins
  `twoFactor`, `admin`, routes montées par une ligne.

## 4. Frictions mesurées

| Cas                                                               | Résultat                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `signUp` sans fichier généré                                      | entrée exacte ; `signed.user.displayName` **`unknown`** (`Type 'unknown' is not assignable to type 'string'`, `probes/p2.ts`)                                                                                                                                |
| `AppUser.current()` sans fichier généré                           | `{ readonly [x: string]: unknown; readonly id: string; … }` (859 car.)                                                                                                                                                                                       |
| `app.operation('ultimabase.password-auth.login')` sans génération | exact (248 car.) mais résultat `PasswordAuthenticationResult<PasswordUserReference>` (champs perdus)                                                                                                                                                         |
| `PasswordUserSchema.define` avec `access` sans génération         | `TS2345 … not assignable to parameter of type 'never'` sur l'objet (`user.ts:6`)                                                                                                                                                                             |
| Avec génération                                                   | tout est exact ; `signed` 205 car., `current()` 913 car.                                                                                                                                                                                                     |
| `signUp({ username, password })` sans `displayName`               | `Argument of type '{ username: string; password: string; }' is not assignable to parameter of type 'PasswordSignUpInput<{ displayName: NonDefaultedStringField<true, false, false>; …` (328 car.) : le champ manquant n'est pas nommé dans la première ligne |
| `className: 'Account'`                                            | refusé (`TS2322`)                                                                                                                                                                                                                                            |
| Relation `target: 'Post'` vers un schéma non enregistré           | compile ; seul le Runtime le détecte                                                                                                                                                                                                                         |

Lignes : User 16, installation 4 (+ `MasterAuthority` 4), exposition REST +
GraphQL 2 à 10 lignes selon qu'on utilise `passwordAuthOperationList`.

## 5. Dépendances à Typegen

- Entrée de `signUp` : source (`PasswordSignUpInput<TFields>`,
  `src/sign-up-input.ts`).
- Résultats exacts du User (`signUp().user`, `login().user`, `current()`,
  requêtes) : graphe généré (ADR-0284 ; `PasswordAuthenticationResult` utilise
  `SchemaResult<TUser>`).
- `access`/`hooks` du User : options générées (ADR-0280).
- Forme autonome `PasswordUserSchema.define(options)` : constructeurs et
  options générés (`UltimaBaseGeneratedSchemaOptions`).
- Opérations : source (`PasswordAuthSource`, `src/plugin.ts`).

## 6. Propositions

1. **Option de schéma au lieu d'une forme spéciale** (une forme par concept,
   pas de `className` imposé, pas d'option `user`) : le plugin découvre le
   schéma marqué, comme Soft Delete découvre `softDelete`.

   ```ts
   // avant
   const AppUser = PasswordUserSchema.define(Base.Schema, {
   	className: 'User',
   	fields,
   })
   const Application = Base.use(passwordAuthPlugin({ user: AppUser }))
   // après
   const Base = UltimaBase.use(passwordAuthPlugin())
   const Member = Base.Schema.define({
   	className: 'Member',
   	passwordAuth: true,
   	fields,
   })
   ```

   Commandes `signUp`/`login` via les surfaces de modèle de plugin. Le cycle
   d'import disparaît (le plugin n'a plus besoin du User).

2. **Identifiant configurable** : `identifier: 'username' | 'email'` (format
   e-mail validé et normalisé), sans changer le stockage privé.
3. **Exposition en une ligne** sans lien vers REST : garder la liste explicite
   (sécurité) mais un seul jeton :

   ```ts
   // avant
   restPlugin({ operations: [statusOp, ...passwordAuthOperationList] })
   graphqlPlugin({ operations: [statusOp, ...passwordAuthOperationList] })
   // après (liste partagée par l'application, consommée par chaque transport)
   new App({ schemas, operations: [statusOp, ...passwordAuthOperationList] })
   ```

   À trancher avec les fiches REST et GraphQL.

4. **Routes cohérentes** : un seul préfixe (`/api/v1/auth/*`) en Bearer et en
   cookie, le mode cookie changeant seulement la réponse.
5. **Prérequis explicite** : erreur de démarrage claire « signUp requires a
   configured MasterAuthority » ou élévation interne sans clé (le privilège
   `authority:elevate` est déjà déclaré).
6. **Principal neutre** `context.principal` (voir fiches Hooks/Access) pour ne
   plus importer `passwordPrincipal` dans chaque règle.
7. **Feuille de route** (hors simplification) : réinitialisation de mot de
   passe et vérification d'e-mail par opérations + événements post-commit,
   limitation de débit dans le plugin HTTP.

## 7. Note sur la grille

Échelle 1 (mauvais) à 5 (excellent) ; pour le coût de migration, 5 = faible.

| Critère                | Note | Justification                                                                      |
| ---------------------- | ---- | ---------------------------------------------------------------------------------- |
| Sans génération        | 2    | entrées exactes ; résultats du User `unknown`                                      |
| Colocalisation         | 3    | User dans son fichier, mais `user:` répété dans le plugin et `schemas`             |
| Concision              | 3    | ~30 lignes avec Master et exposition ; liste d'opérations dupliquée                |
| Une forme par concept  | 2    | `PasswordUserSchema.define`, `className` imposé, deux familles de routes           |
| Révélation progressive | 3    | Bearer par défaut ; `MasterAuthority` requise sans le dire                         |
| Erreurs                | 3    | erreurs d'entrée exactes mais longues ; `never` avec `access` sans génération      |
| Hovers                 | 3    | `AppUser` 176 car. ; résultats 859–913 car.                                        |
| Performance TypeScript | 4    | non mesurée à l'échelle                                                            |
| JavaScript             | 5    | aucune génération requise                                                          |
| Coût de migration      | 2    | plugin, REST/GraphQL (liaisons), Roles/ACL (principal), exemples, create-app, site |
