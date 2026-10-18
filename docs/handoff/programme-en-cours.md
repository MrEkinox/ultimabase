# Programme en cours (2026-10-18)

Note de passation du coordinateur, à vérifier contre l'arbre avant de s'y fier. Les notes de travail
plus anciennes sont dans le tag `api-challenge-archive`.

## Comment reprendre

- Une session par chantier, qui part de cette note et de la mémoire.
- Au début de chaque tâche, conseiller un modèle et un niveau d'effort (tableau dans
  [le brief des agents](../engineering/agent-brief.md)).
- Agents : suivre le brief (tests ciblés et `yarn validate:package`, un seul agent lourd à la fois).
  Coordinateur : une `yarn validate:full` par fusion dans `main`, plus `yarn website:test` si le site
  change et `yarn typecheck:typescript-7` si les types changent.

## Nettoyage de l'amplification : terminé

Fait : doc à source unique (ADR-0343), README racine court, régions orphelines retirées, couverture
par paquet et jobs de CI groupés (ADR-0342), configuration d'exemples partagée, fichiers statiques de
`create-app` réels, bases de test partagées (`tooling/vitest/`), mutations de plugin sur les étapes
natives (ADR-0344, faille Access corrigée), tests propres d'`auth-plugin`, `testing` et `plugin-kit`
(94 %, 96 % et 99 % des branches ; bugs corrigés : course de première ligne privée avec ADR-0345,
deux défauts de `testApplication`, commandes `update` sans `data` avec ADR-0346), 42 ADR remplacés
archivés (tag `adr-superseded-archive`), index d'architecture à jour, `ultima-base.ts` sous la limite.

Mesure après nettoyage : commit médian 3 fichiers (7 avant) ; aucun commit de code récent n'a touché la
doc ni les exemples ; validation locale ≈ 12 min ; CI complète ≈ 63 minutes facturées (97 avant).

Abandonné : types de champs génériques (les survols par type sont le contrat ; voir ac5c9a48).

## Ensuite

1. ADR « vocabulaire et exposition » : spike fait, [ADR-0347](../adr/0347-one-operation-vocabulary-and-shared-exposure.md)
   proposé sur la branche `adr/vocabulary-exposure`, en attente de validation. Choix de l'utilisateur
   (2026-10-18) : périmètre §2.1 + §2.3 seulement ; hiérarchie `all` > `read`/`write` > opération >
   méthode, définie par Core ; clé `expose` possédée par Core (avertissement si aucun transport), avec exceptions par transport
   dans `rest`/`graphql` qui gagnent sur `expose` ; options communes (`default`, `hide`, `pagination`,
   `publicWrites`) sur les transports, une fois dans `apiServer()`, jamais sur `App` ;
   diagnostic Access au démarrage (avertissement hors production, échec en production), sans retirer
   de route. Écarté : vocabulaire des seules méthodes ou des seules opérations, `expose` dans
   `api-server` ou dans un plugin d'exposition, options d'exposition sur `App` (laisse croire qu'elles
   bornent l'API serveur), retrait des routes refusées (révèle l'absence de règle, prive Master par HTTP).
   Prochaine action vérifiable : après validation, un test qui fixe l'effet des droits ACL sur une
   commande de plugin (aucun test ne le couvre), puis la tranche verticale (catalogue, `expose`,
   options communes des transports, REST sur un exemple, déclarations compilées, audit DX, banc forme D TS 6 et 7).
1. ADR « commandes » (revue DX §4.1, §4.2, §4.5) et ADR « corbeille » (§4.4), séparés de l'ADR-0347.
1. ADR « erreurs » (revue DX §3.3).
1. Tests propres des paquets encore autour de 76 à 79 % des branches : `access-plugin` d'abord
   (sécurité), puis `roles-plugin`, `validation-plugin`, `postgres-plugin`.
1. Le reste de [la revue DX](revue-dx.md) et de [la revue de la déclaration](revue-dx-declaration.md) :
   sections 1, 3 (sauf 3.3) et 5.1 traitées par les ADR-0339 à 0341.
1. Migrations de base de données, préparation de la publication (versions en lockstep, liens des
   README vers l'URL publique du site), OAuth, benchmarks de la section Comparaison.

À ne faire que si un ADR change le démarrage d'une application : le code de démarrage répété dans les
17 exemples, les modèles en chaînes de `create-app`, les listes d'exports retirés dans les tests.
