# Migration, sous-étape 6.4a : socle d'authentification et méthode mot de passe (ADR-0326)

Branche `migration/auth-foundation` (worktree `../ub-step6-4a`), basée sur
`main` local 48a448e8 (fusion de 6.6c). En parallèle : un agent d'exploration
dans `../ub-spike-with` (non touché).

## Portée

ADR-0326, décisions 1 à 5, 8 (sans le changement d'e-mail), 9 et 10 :

- paquet socle `@ultimabase/auth-plugin` : `authPlugin({ methods, session,
linking })`, fabrique `App.UserSchema.define` (forme D, nom de classe libre,
  une par instance), sessions communes, principal de Core, transport HTTP
  (Bearer et cookie sous un préfixe), résultats typés, inscription par le
  privilège d'élévation, erreurs nommant le champ manquant ;
- paquet méthode `@ultimabase/auth-password` : `password({ identifier,
policy })` ; retrait de `@ultimabase/password-auth-plugin` ;
- liaison de comptes (collection privée, unicité `(method, providerUserId)`,
  liste, option `linking`, garde de la dernière méthode), prouvée par une
  méthode factice de test ;
- limitation des tentatives par compte et par compte + adresse ;
- sessions (`listSessions`, `revokeSession`, `logoutEverywhere`, Master
  `listSessions(user)` / `revokeSessions(user)`, `revokeOnPasswordChange`) ;
- `changePassword`, `deleteAccount` avec réauthentification récente ;
- événements typés sans secret.

Reporté à 6.4b : réinitialisation du mot de passe, vérification d'e-mail,
changement d'e-mail. OAuth hors portée.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

En cours. Fait :

- ADR-0326 copié et listé parmi les acceptés.
- Extensions génériques (voir décisions 1 à 4) avec tests.

## Décisions prises (non fixées par l'ADR, à confirmer)

1. **Élévation d'un plugin sans `masterAuthority`** (Core,
   `runtime/engine/application-binding.ts`) : un `useMasterKey: true` émis par
   du code de plugin détenant `authority:elevate` réussit sans autorité
   configurée, par une autorité interne sans clé exposée par application,
   auditée dans le journal de l'application (`debug`, « Plugin elevated to
   Master », raison et `requestId`). Avec une `masterAuthority` configurée,
   rien ne change (son `onUse` audite). Le code d'application exige toujours
   une autorité. Effet de bord : Roles (`ensure`) et ACL profitent aussi de
   cette élévation sans clé.
2. **Stockage privé `findMany`** (Core + PostgreSQL) : `lookups` (index non
   uniques) dans `definePrivateCollection`, `findMany({ where, limit })`
   (1 à 1 000, ordre non spécifié, `where` = un index unique ou une
   recherche déclarés). Empreinte inchangée pour une collection sans
   `lookups`. Le contrat d'adaptateur renvoie une liste pour `find-many`.
3. **Adresse du client pour les résolveurs HTTP** (`http-plugin`) :
   `clientAddress` dans `HttpContextResolverInput`, calculée comme pour la
   limitation (`trustProxy`).
4. **Référence de schéma possédé dans les liaisons GraphQL**
   (`graphql-plugin`) : `{ kind: 'owned-schema' }` (et `createFieldsFrom: {
kind: 'owned-schema' }`) désigne l'unique schéma ajouté ou revendiqué par
   le plugin de la liaison, pour un plugin dont l'application choisit le nom
   de classe.

## Approches rejetées

## Preuves

## Prochaine action vérifiable

Créer `packages/auth-plugin` (socle) puis `packages/auth-password`.
