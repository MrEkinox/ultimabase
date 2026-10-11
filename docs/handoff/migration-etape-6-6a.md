# Migration, sous-étape 6.6a : socle HTTP et serveur Hono (ADR-0323)

Branche `migration/http` (worktree `../ub-step6-6a`), basée sur `main` local
a0d7ff3c. En parallèle : 6.3 (ACL et Roles) dans `../ub-step6-3` ;
`packages/acl-permissions-plugin` et `packages/roles-plugin` ne sont pas
touchés.

## Portée

ADR-0323, décisions 1 à 13 et conséquences : en-tête d'application
facultatif, CORS par origines, `master: true`, routes d'application,
route de santé, valeurs par défaut (délai, taille du corps, en-têtes de
sécurité), limitation par adresse, journal des requêtes, `fetch()` sans port,
paquet renommé `@ultimabase/hono-server-plugin`, arrêt borné, compression,
`browserPolicyOwner` facultatif. REST et GraphQL gardent leurs options (6.6b,
6.6c) ; seulement adaptés là où le socle l'impose.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6.

## État

- Renommage du paquet Hono fait (répertoire, nom, importeurs, gabarits,
  contraintes, listes).
- Implémentation : en cours.

## Décisions prises (non fixées par l'ADR, à confirmer)

(à compléter)

## Approches rejetées

(à compléter)

## Preuves

(à compléter)

## Prochaine action vérifiable

Implémenter les décisions 1 à 9 dans `packages/http-plugin`, puis 11 à 13
dans `packages/hono-server-plugin`.
