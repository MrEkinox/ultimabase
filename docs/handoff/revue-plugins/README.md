# Revue de l'API, plugin par plugin (2026-10-09)

Étape 3 du [plan](../api-challenge-plan.md), terminée le 2026-10-09. Chaque
fichier liste les décisions validées par l'utilisateur ; celles qui changent
un contrat public donneront un ADR (ADR-0288) au moment de la migration.

| Revue                                                  | Fichier                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| Forme de déclaration, requêtes, démarrage (transverse) | [../api-ideale-decisions.md](../api-ideale-decisions.md), ADR-0297       |
| Core                                                   | [core.md](core.md)                                                       |
| Access                                                 | [access.md](access.md)                                                   |
| Hooks                                                  | [hooks.md](hooks.md)                                                     |
| Validation                                             | [validation.md](validation.md)                                           |
| ACL                                                    | [acl.md](acl.md)                                                         |
| Roles                                                  | [roles.md](roles.md)                                                     |
| Authentification (socle + méthodes)                    | [password-auth.md](password-auth.md)                                     |
| Soft Delete                                            | [soft-delete.md](soft-delete.md)                                         |
| PostgreSQL                                             | [postgres.md](postgres.md)                                               |
| Contrat des adaptateurs de base                        | [adaptateurs.md](adaptateurs.md) ([audit](../audit-adaptateurs-base.md)) |
| pg-vector                                              | [pg-vector.md](pg-vector.md), ADR-0298                                   |
| HTTP                                                   | [http.md](http.md)                                                       |
| REST                                                   | [rest.md](rest.md)                                                       |
| GraphQL                                                | [graphql.md](graphql.md)                                                 |
| Yoga                                                   | [graphql-yoga.md](graphql-yoga.md)                                       |
| Explorateurs GraphQL                                   | [graphql-explorers.md](graphql-explorers.md)                             |
| Serveur Hono                                           | [hono.md](hono.md)                                                       |
| Preset `api-server`                                    | [api-server.md](api-server.md)                                           |
| Testing                                                | [testing.md](testing.md)                                                 |
| create-app                                             | [create-app.md](create-app.md)                                           |

Typegen n'est pas revu : il est supprimé par ADR-0297.

## Règles transverses issues des revues

- Vocabulaire de requête et d'écriture à la Prisma ; toute divergence est
  justifiée.
- Core ne connaît aucun plugin : ce qui appartient à un plugin se déclare dans
  ses options (routes dans `httpPlugin`, événements dans `hooksPlugin`), jamais
  dans `new App`.
- Développement / production : chaque plugin lit `NODE_ENV` dans sa fabrique,
  `production` = production, une option explicite l'emporte.
- Un échec après commit ne rejette jamais l'appel ; les effets extérieurs vont
  dans `afterCommit` (« au mieux ») ; les hooks transactionnels peuvent être
  rejoués.
- Les ouvertures (`allowWithoutRule`, `publicWrites`, `clientSharing`…) sont
  explicites, et refusées ou signalées en production quand elles sont
  réservées au développement.
