# Programme en cours (2026-10-17)

Note de passation du coordinateur. Elle remplace la branche `api-challenge`, archivée dans le tag
`api-challenge-archive`. À vérifier contre l'arbre avant de s'y fier.

## Mode de travail

- Agents : tests ciblés, `yarn validate:affected`, lint et format seulement ; un seul agent lourd à la
  fois ; les petits changements sans agent.
- Coordinateur : une seule `yarn validate:full` par lot avant fusion dans `main`, plus
  `yarn website:test` si le site change et `yarn typecheck:typescript-7` si les types changent ;
  benchmark forme D et audit DX seulement quand les types sensibles ou la surface publique changent.
- CI GitHub : couverture par paquet (ADR-0342, amendement), paquets regroupés en 5 jobs au plus.

## Nettoyage de l'amplification des changements

Fait : doc à source unique (ADR-0343), README racine court, régions orphelines retirées, couverture
par paquet, jobs de CI groupés, configuration d'exemples partagée et fichiers statiques de
`create-app` réels, bases de test partagées (`tooling/vitest/test-database.ts`,
`memory-database.ts`).

Abandonné : types de champs génériques (les survols par type sont le contrat ; voir ac5c9a48).
Reporté : partage REST/GraphQL de l'exposition, à traiter dans l'ADR « vocabulaire et exposition »
(ce qui manque à Core : un plan d'exposition générique des commandes de schéma ; à Plugin Kit : des
aides pour écrire un transport).

En cours : ADR-0344, les mutations de plugin partagent les étapes de politique natives (faille
corrigée : les règles `where` des champs ne s'appliquaient pas aux commandes `…Many` de plugin).

Restant :

1. Tests propres d'`auth-plugin` (42 % des branches), `testing` et `plugin-kit`.
2. Archiver les ADR remplacés pour réduire ce que les agents lisent.
3. Nouvel audit d'amplification.

## Ensuite

- ADR « vocabulaire et exposition » (revue DX §2.1, §2.3, §4.x), avec un spike avant.
- ADR « erreurs » (revue DX §3.3).
- Le reste de [la revue DX](revue-dx.md) et de [la revue de la déclaration](revue-dx-declaration.md) :
  sections 1, 3 (sauf 3.3) et 5.1 traitées par les ADR-0339 à 0341.
- Migrations de base de données, préparation de la publication (versions en lockstep, liens des
  README vers l'URL publique du site), OAuth, benchmarks de la section Comparaison.
