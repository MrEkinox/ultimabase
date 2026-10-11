# Migration, sous-étape 6.3 : ACL et Roles (ADR-0321, ADR-0322)

Branche `migration/acl-roles` (worktree `../ub-step6-3`), basée sur `main`
local a0d7ff3c (fusion de 6.2). En parallèle : 6.6a (socle HTTP et Hono) dans
`../ub-step6-6a` ; ce travail ne touche `packages/http-plugin` et
`packages/server-hono-plugin` qu'au niveau des imports si nécessaire.

## Portée

ADR-0321 (décisions 1 à 9) et ADR-0322 (décisions 1 à 5), conséquences
comprises : `.acl()` par l'emplacement `SchemaFieldsHKT`, règles
`.with({ acl })` (`default` obligatoire, `existingRows`, `clientSharing`),
`new ACL(principal)` et groupe `'write'`, ACL explicite de Master sans
`resolveInput`, `grant`/`revoke` atomiques, `select: { acl }`, `entries()`,
rattrapage à l'activation dans la synchronisation PostgreSQL ;
`App.RoleSchema.define` en forme D, plusieurs schémas de rôles, fin du
contournement `Register` de l'étape 4, `includedRoles`, `has`/`current`,
`ensure`. Exemples, gabarits create-app et documentation.

Critère de fin : porte complète sur le dernier commit de code
(`yarn validate:full`, `yarn test:e2e:built`, `yarn website:test`), audit DX
expliqué, banc forme D TS6/TS7.

## État

En cours.

## Décisions prises (non fixées par les ADR, à confirmer)

## Approches rejetées

## Preuves

## Prochaine action vérifiable

Implémentation des extensions génériques de Core (fabriques de schémas,
entrée de mise à jour d'un champ de plugin, métadonnées de rattrapage).
