# Migration, sous-étape 6.4b : réinitialisation, vérification et changement d'e-mail (ADR-0326)

Branche `migration/auth-recovery` (worktree `../ub-step6-4b`), basée sur
`main` local d59522ad (fusion de 6.4a).

## Portée

ADR-0326, décisions 6, 7, 8 (changement d'e-mail), 9 et 10 :

- réinitialisation du mot de passe (`requestPasswordReset`, `resetPassword`) ;
- vérification d'e-mail (`emailVerified`, `emailVerifiedAt`,
  `requestEmailVerification`, `verifyEmail`, `requireVerifiedEmail`) ;
- changement d'e-mail (`requestEmailChange`, `confirmEmailChange`) ;
- événements `afterPasswordReset`, `afterEmailVerified`, `afterEmailChanged`
  émis ;
- exposition HTTP (`/api/auth/*`), REST, GraphQL typé, create-app,
  documentation (READMEs, page du site).

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
contre d59522ad expliqué ; pas de banc (types de Core inchangés).

## État

Implémentation, tests et documentation faits ; porte finale verte sur
605ce60f (dernier commit de code), audit DX expliqué ; worktree de référence
retiré.

## Décisions (à confirmer par l'utilisateur)

Sécurité :

1. **Jetons** : 32 octets aléatoires (base64url, 43 caractères) avec un
   préfixe par usage (`ub_r1.` réinitialisation, `ub_v1.` vérification,
   `ub_c1.` changement d'e-mail) ; seul le SHA-256 est stocké (collection
   privée `auth-tokens`, index uniques `id` et `digest`, cascade sur le User).
   Le jeton courant de chaque usage est désigné par la ligne d'état du User
   (`tokenIds`, compare-and-swap) : un nouveau jeton remplace et supprime
   l'ancien ; la consommation est atomique (une seule réussit sous
   concurrence) et supprime la ligne. Un jeton émis pour un e-mail remplacé
   depuis est refusé (`AUTH_INVALID_TOKEN`, réponse uniforme : inconnu,
   expiré, utilisé, remplacé ou d'un autre usage).
2. **Durées** (`expiresInMs`, bornées) : réinitialisation 1 h (5 min à 24 h),
   vérification 24 h (5 min à 7 jours), changement d'e-mail 1 h (5 min à
   24 h).
3. **Réponses identiques** : `requestPasswordReset` et
   `requestEmailVerification` répondent `{ accepted: true }` (adresse connue,
   inconnue ou mal formée) ; même limitation (clé = e-mail normalisé, que le
   compte existe ou non), mêmes lectures (lecture leurre du User par un id
   aléatoire pour une adresse inconnue), rappel exécuté après commit hors de
   la requête (sa durée et son échec n'atteignent jamais le client). Écart
   résiduel : pour un compte existant (non vérifié pour la vérification),
   l'écriture du jeton (une insertion, une mise à jour d'état, au plus une
   suppression). Alternative non retenue : plancher de durée de réponse fixe.
4. **Limitation** (seuils de 6.4a réutilisés, sans événement
   `afterLoginFailed`) : chaque demande de réinitialisation ou de vérification
   compte une tentative par (e-mail, adresse) — 5 libres — et par e-mail —
   20 libres —, puis délais croissants (`AUTH_TOO_MANY_ATTEMPTS`). Les
   jetons invalides sont comptés par adresse cliente (20 libres), seulement
   sous HTTP. Une réinitialisation réussie remet à zéro les compteurs de
   connexion et de demandes de cet e-mail. `requestEmailChange` vérifie le
   mot de passe sous la limitation de `changePassword` (`user:<id>`).
5. **`requireVerifiedEmail`** : bloque la **connexion** par mot de passe
   (`AUTH_EMAIL_NOT_VERIFIED`, 403) après un mot de passe correct, tant que
   l'e-mail n'est pas vérifié ; un mauvais mot de passe reste
   `AUTH_INVALID_CREDENTIALS` (l'état de vérification n'est révélé qu'au
   détenteur du mot de passe). L'inscription renvoie toujours sa première
   session (comme `preventLoginWithUnverifiedEmail` de Parse) et les
   sessions existantes continuent ; `refresh` n'est pas bloqué. Justification :
   la connexion est la porte ; le client peut redemander un e-mail ; un
   imposteur ayant pris l'adresse d'une victime est évincé par la
   réinitialisation de la victime (toutes les sessions révoquées).
   Alternatives : bloquer aussi `refresh`, ou ne pas émettre de session à
   l'inscription (type de résultat conditionnel).
6. **Changement d'e-mail** : la demande exige le mot de passe actuel (et
   marque la session comme authentifiée récemment), n'indique jamais si
   l'adresse est prise ; la confirmation (jeton seul, sans session) vérifie
   l'unicité (lecture préalable du credential), puis les index uniques du User
   (`email`) et du credential (`identifier`) tranchent les confirmations
   simultanées : la perdante reçoit `AUTH_EMAIL_CHANGE_REJECTED` (testé avec
   deux confirmations concurrentes). Les sessions sont conservées ; l'ancienne
   adresse est notifiée après commit ; le nouvel e-mail est vérifié. Une
   réinitialisation ou un changement de mot de passe annule un changement
   d'e-mail en attente (sinon le voleur du mot de passe pourrait confirmer
   après la récupération du compte par la victime).
7. **Champs protégés** : avec un identifiant e-mail, `email`, `emailVerified`
   et `emailVerifiedAt` ne sont écrits que par les flux d'authentification,
   Master compris (garde finale du socle, marqueur interne de contexte ;
   `VALIDATION_ERROR` code `field.protected`) ; une création garde les
   défauts. Types : les deux champs de vérification sont hors des entrées de
   création et de mise à jour, `email` reste immuable dans les types.
8. **Données personnelles** : les rappels reçoivent la ligne User et les
   adresses ; `afterEmailVerified` et `afterEmailChanged` portent des e-mails
   (documenté) ; jamais de jeton ni de mot de passe dans les événements
   (testé).

Architecture :

9. **Répartition** : le socle définit les champs de vérification
   (`AuthEmailVerificationFields`, ajoutés quand une méthode déclare
   `userEmail: true`), les jetons, la protection des champs et les services
   (`issueToken`, `findToken`, `consumeToken`, `cancelToken`, `readUser`,
   `markEmailVerified`, `changeEmail`, `completePasswordReset`,
   `checkAttempt`, `countAttempt`) ; les flux vivent dans la méthode mot de
   passe, propriétaire de l'e-mail et du credential (identifiant e-mail
   seulement). Écart assumé avec la lettre d'ADR-0326 décision 7, qui place
   `sendVerificationEmail` et `verifyEmail` dans le socle : seule une méthode
   possède aujourd'hui l'e-mail du User ; une future méthode à e-mail (lien
   magique) réutilisera les mêmes services.
10. **Options** : `password({ identifier: 'email', reset: { sendResetEmail,
expiresInMs }, verification: { sendVerificationEmail, requireVerifiedEmail,
expiresInMs }, emailChange: { sendConfirmationEmail, sendNoticeEmail,
expiresInMs } })` ; ces groupes sont refusés (types et exécution) pour
    `identifier: 'username'`.
11. **Opérations** : `passwordEmailOperations` (`requestPasswordReset`,
    `resetPassword`, `requestEmailVerification`, `verifyEmail`,
    `requestEmailChange`, `confirmEmailChange`), toujours installées avec
    l'identifiant e-mail (listes `hide` stables) ; une demande sans son groupe
    répond `AUTH_NOT_CONFIGURED` (501). Statiques du User et GraphQL typés
    conditionnés à `identifier: 'email'`. Routes HTTP
    `/api/auth/request-password-reset`, `reset-password` (efface le cookie),
    `request-email-verification`, `verify-email`, `request-email-change`
    (session requise), `confirm-email-change` ; les routes anonymes ignorent un
    cookie périmé (`AuthHttpRoute.anonymous`).
12. **Codes** : socle `AUTH_INVALID_TOKEN` (400), `AUTH_EMAIL_NOT_VERIFIED`
    (403), `AUTH_NOT_CONFIGURED` (501) ; méthode `AUTH_EMAIL_CHANGE_REJECTED`
    (400) ; un nouveau mot de passe invalide à la réinitialisation réutilise
    `AUTH_PASSWORD_CHANGE_REJECTED`. `login` déclare
    `AUTH_EMAIL_NOT_VERIFIED`.
13. **Exécution des écritures protégées** : l'`email` d'un identifiant e-mail
    devient modifiable à l'exécution (le type reste immuable) pour que le
    socle puisse le changer ; conséquence visible : les entrées de création et
    de mise à jour générées par GraphQL et REST listent `email`,
    `emailVerified` et `emailVerifiedAt`, que la garde refuse. Alternative non
    retenue (changement plus large) : ajouter les champs par patch de schéma
    avec `mutationInput: 'forbidden'` et les écrire par une mutation de schéma
    propre au socle, ce qui demanderait de déplacer les champs des méthodes
    hors de `UserSchema.define` et d'exécuter une mutation Master interne.
14. **create-app** : REST masque toutes les opérations d'authentification
    (dont `passwordEmailOperations`) ; GraphQL expose les autres et masque les
    flux e-mail tant qu'aucun rappel n'est configuré (commentaire généré) ;
    note du README généré mise à jour.

## Amendement 6.4b (2026-10-12, options A validées par l'utilisateur)

1. **`requireVerifiedEmail` sans session** : `signUp` crée l'utilisateur et
   renvoie `{ user, verificationRequired: true }` sans session ni cookie
   (`services.signUpPendingVerification`, `afterSignUp` avec
   `sessionId: null`) ; `login` et `refresh` du socle refusent les
   utilisateurs non vérifiés (`AUTH_EMAIL_NOT_VERIFIED`,
   `AuthMethodImplementation.requireVerifiedEmail`). Type conditionnel :
   `password<TIdentifier, TRequireVerifiedEmail>` → `PasswordSignUpOutcome`
   (statiques) ; GraphQL `PasswordSignUpPendingPayload` ; OpenAPI : sortie
   déclarée de l'opération `signUp` (`output`). Le jeton d'opération `signUp`
   a désormais le résultat union `PasswordSignUpResult`.
2. **Champs e-mail en entrée interdite** : déplacés hors de
   `UserSchema.define` ; le socle ajoute `email` (unique, nullable en base,
   rempli dans la transaction de création), `emailVerified`,
   `emailVerifiedAt` par patch de schéma `mutationInput: 'forbidden'` ; les
   flux écrivent par la mutation de schéma Master `ultimabase.auth.write-email`
   (statique d'exécution `ultimabaseAuthWriteEmail` sur la classe User, typée
   par Typegen si l'application l'utilise), dont le résolveur exige le
   marqueur interne. La garde n'accepte plus de création de User hors des flux
   (`auth.user-creation`) ; administration et amorçage :
   `auth.createUser({ data, email })`. `signUp` prend `email` à côté des champs
   de création (types, GraphQL `PasswordSignUpInput`). Correctif REST :
   l'OpenAPI excluait déjà les champs immuables mais pas l'entrée interdite
   (bogue préexistant, aussi pour Soft Delete) ; régression testée avec le
   champ `archivedAt` du plugin de test de REST.

Ce qui a bougé : le champ `email` de `password({ identifier: 'email' })` (de
la méthode vers le socle, par patch) ; `AuthEmailVerificationFields` devient
`AuthEmailFields` (avec `email`) ; la garde `field.protected` disparaît (Core
refuse lui-même l'entrée interdite, `field.forbidden`).

Assertions publiques modifiées par l'amendement :
`password.test-d.ts` (entrée de `signUp` : `CreateInput & { password }` →
`CreateInput & { email; password }`) ; `tests/e2e/schema-form-d.postgres.e2e.test.ts`
(amorçage : `TodoUser.createMany({ data: [{ email }] }, master)` →
`ultimabase.plugin(authPlugin).createUser({ data: {}, email })`, assertions
inchangées) ; `packages/rest-plugin/tests/openapi.test.ts` (assertion
ajoutée : `archivedAt` absent des entrées) ; déclarations générées de
`examples/minimal` (résultat de `sign-up` `AuthenticationResult` →
`PasswordSignUpResult` ; erreurs de `refresh` + `AUTH_EMAIL_NOT_VERIFIED`).

## Approches rejetées

- Opérations installées seulement avec leur groupe d'options : les listes
  `hide` (`Object.values(...)`) échoueraient (REST refuse de masquer une
  opération absente) et les types annonceraient des statiques absentes.
- Jeton contenant l'id du User (sans collection de jetons) : expose l'id dans
  les liens.
- Écriture de `email` par une mise à jour Master ordinaire : le champ
  immuable est refusé par Core, sans contournement.

## Tests publics modifiés

- `packages/create-app/src/api-template.test.ts` (interne) : l'assertion
  `hide: [...Object.values(authOperations), ...Object.values(passwordOperations)]`
  devient la liste multi-ligne avec `...Object.values(passwordEmailOperations)`,
  plus `hide: Object.values(passwordEmailOperations)` pour GraphQL.
- `tooling/vitest/auth-public-api.ts` (classification de l'API publique) :
  noms ajoutés (socle : `AuthUserRecord`, `AuthEmailVerificationFields`,
  `AuthIssuedToken`, `AuthTokenClaim`, `AuthTokenPurpose`,
  `rejectNotConfigured`, `rejectToken`, `rejectUnverifiedEmail` ; méthode :
  types et messages des flux, `passwordEmailOperations`) ; noms privés ajoutés
  à `removed*`.
- `examples/minimal/.ultimabase/schema.generated.d.ts` régénéré : erreurs de
  `ultimabase.auth.password.login` `["AUTH_INVALID_CREDENTIALS",
"AUTH_TOO_MANY_ATTEMPTS"]` → `["AUTH_EMAIL_NOT_VERIFIED",
"AUTH_INVALID_CREDENTIALS", "AUTH_TOO_MANY_ATTEMPTS"]`.
- `packages/auth-password/tests/e2e/password-fixture.ts` : options ajoutées
  (`email`, `master`), comportement par défaut inchangé.

Aucun autre test existant modifié.

## Preuves

Porte sur 605ce60f, après suppression de `packages/*/dist` et `*.tsbuildinfo` :

- `yarn validate:full` : code 0 ; « All matched files use Prettier code
  style! » ; lint 0 erreur (48, 15 et 2 avertissements, comme 6.4a) ;
  performance « Test Files 3 passed (3) / Tests 4 passed (4) » ; couverture
  « Test Files 736 passed (736) / Tests 3632 passed (3632) / Type Errors no
  errors », All files 92.53 / 85.8 / 96.83 / 93.25 ; site « Test Files 17
  passed (17) / Tests 66 passed (66) ».
- `yarn test:e2e:built` : code 0, « Test Files 136 passed (136) / Tests 598
  passed (598) » (`create-app-packed` compris ; un premier passage pendant
  le développement avait dépassé 120 s sous charge 8–10, vert seul et dans
  la porte).
- `yarn website:test` : code 0, « Test Files 8 passed (8) / Tests 59 passed
  (59) » (124 pages statiques).

Audit DX contre d59522ad construit (`--only` tous les paquets, `tests`,
`examples/minimal`, `examples/todo-backend`) : 426 différences (39455 /
39739). auth-password 328 (nouvelles exportations, déclarations, survols et
le nouveau `password-email.test-d.ts` ; changés : `PasswordOptions`,
`PasswordStatics`, `PasswordMethod`, `PasswordUserFields` — le survol montre
désormais l'intersection conditionnelle `IsEmail<…>` au lieu du type
aplati —, erreurs de `login`, `passwordErrorCodes`, compteurs « … N more … »
des survols d'usage du User e-mail), auth-plugin 68 (nouvelles exportations,
`AuthServices`, `AuthMethodImplementation.userEmail`,
`AuthHttpRoute.anonymous`, codes d'erreur, JSDoc des événements),
examples/schema-form-d 27 (le `TodoUser` e-mail gagne `emailVerified`,
`emailVerifiedAt` et six statiques ; `eq` accepte `boolean`),
examples/minimal 1 (erreurs de `login` dans `Object.values`), tests 2
(complétions d'exportations). Core : aucune différence. Pas de banc (types de
Core inchangés).

## Preuves après l'amendement (30171fa1, dernier commit de code)

Après suppression de `packages/*/dist` et `*.tsbuildinfo` :

- `yarn validate:full` : code 0 ; « All matched files use Prettier code
  style! » ; lint 0 erreur (48, 15 et 2 avertissements) ; performance « Test
  Files 3 passed (3) / Tests 4 passed (4) » ; couverture « Test Files 736
  passed (736) / Tests 3634 passed (3634) / Type Errors no errors », All files
  92.54 / 85.86 / 96.86 / 93.25 ; site « Test Files 17 passed (17) / Tests 66
  passed (66) ».
- `yarn test:e2e:built` : code 0, « Test Files 136 passed (136) / Tests 599
  passed (599) ». Un premier passage sous charge 17–20 (autres agents) avait
  vu `create-app-packed` dépasser 120 s ; vert seul (49 s) puis dans le
  passage complet suivant.
- `yarn website:test` : code 0, « Test Files 8 passed (8) / Tests 59 passed
  (59) ».

Audit DX contre d59522ad (même périmètre) : 569 différences (39459 / 39805).
auth-password 409, auth-plugin 91, examples/schema-form-d 41, examples/minimal
23, core 3, tests 2. Delta par rapport à l'audit précédent : `email` vient de
`AuthEmailFields` (socle) au lieu de `PasswordIdentifierField` ; entrée de
`signUp` avec `email` ; `PasswordSignUpOutcome`, `PasswordSignUpResult`,
`AuthPendingSignUp`, `AuthUserCreation`, `createUser` des exportations ;
second paramètre de type `password<…, TRequireVerifiedEmail>` visible dans
les survols (`PasswordMethod<"username", false>` dans examples/minimal) ;
erreurs de `refresh`. Core : seulement les noms de morceaux privés du
bundler (sources de Core inchangées : `git diff d59522ad -- packages/core`
vide). Pas de banc. Worktree de référence retiré.

## Prochaine action vérifiable

Revue du diff par le coordinateur, confirmation des décisions de sécurité 1 à
8, puis fusion dans `main`.
