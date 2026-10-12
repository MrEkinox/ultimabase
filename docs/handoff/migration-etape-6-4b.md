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
- exposition REST/GraphQL/HTTP, create-app, documentation.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
contre d59522ad expliqué ; pas de banc sauf changement des types de Core.

## Conception retenue (à confirmer)

- Le socle définit et protège les champs `emailVerified` (booléen, défaut
  `false`) et `emailVerifiedAt` ; il les ajoute au User quand une méthode
  déclare posséder l'e-mail du User (`userEmail: true`, c'est le cas de
  `password({ identifier: 'email' })`). Types : ni création ni mise à jour
  (état `forbidden`), l'`email` reste immuable dans les types.
- Écritures protégées : à l'exécution `email` (identifiant e-mail) devient
  modifiable, mais la garde finale du socle refuse toute écriture de `email`,
  `emailVerified` et `emailVerifiedAt` (création : seulement les défauts) sans
  le marqueur interne de contexte du socle, Master compris
  (`VALIDATION_ERROR`, code `field.protected`).
- Jetons : 32 octets aléatoires, préfixes `ub_r1.` (réinitialisation),
  `ub_v1.` (vérification), `ub_c1.` (changement d'e-mail) ; seul le SHA-256
  est stocké (collection privée `auth-tokens`) ; le jeton courant de chaque
  usage est désigné par la ligne d'état du User (compare-and-swap), un
  nouveau jeton remplace et supprime l'ancien, la consommation est atomique et
  unique.
- Les flux vivent dans la méthode mot de passe (identifiant e-mail), avec des
  groupes d'options : `reset: { sendResetEmail, expiresInMs }`,
  `verification: { sendVerificationEmail, requireVerifiedEmail, expiresInMs }`,
  `emailChange: { sendConfirmationEmail, sendNoticeEmail, expiresInMs }`. Les
  opérations sont toujours installées avec l'identifiant e-mail
  (`passwordEmailOperations`) ; une demande sans rappel configuré répond
  `AUTH_NOT_CONFIGURED` (501).
- Rappels exécutés après commit (`runAfterCommit`), hors de la requête.

## État

En cours : implémentation.

## Prochaine action vérifiable

Implémenter le socle (jetons, champs, garde, services), puis la méthode.
