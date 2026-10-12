# Migration, sous-étape 6.8b : retrait de l'ancienne forme, de Typegen et des gabarits ; ADR-0329

Branche `migration/remove-old-form` (worktree `../ub-step6-8b`), basée sur
`main` local 5a3f0047 (fusion de 6.8a).

## Portée

1. Ancienne forme de déclaration : options de plugin dans `define(...)`
   (`access`, `hooks`, `validation`, `acl`, `postgres`, `rest`, `graphql`,
   `softDelete`…), types, chemins et tests qui n'existent que pour elle.
   Forme D seule (`define({ className, fields })`, méthodes de forme, `.with`
   final).
2. Typegen : paquet `@ultimabase/typegen`, son plugin, les fichiers générés,
   la connaissance de Typegen dans Core (contrats, recherches
   `UltimaBaseGenerated*`, exception des statiques), `withPluginTypegenConformance`,
   budgets de performance (`hybrid-authoring`, `typegen-editor`), pages du
   site, contraintes yarn, tsconfig, vitest, outillage.
3. Machinerie des gabarits de projection (handoffs 6.0, 6.3, 6.6c) une fois
   sans utilisateur.
4. ADR-0329 : contrat de rôle vers `@ultimabase/plugin-kit`.
5. Formulations périmées (« relation handles », `.with({})` de contournement).

Critère de fin : sur le dernier commit de code, `yarn install --immutable`,
`yarn validate:full` sans `dist` ni `*.tsbuildinfo`, `yarn test:e2e:built`,
`yarn website:test` à 0 ; audit DX contre une base 5a3f0047 construite,
différences expliquées par cause ; banc forme D TS6 (50, 200) et TS7.

## État

Démarrage.

## Prochaine action vérifiable

Retirer le paquet `@ultimabase/typegen` et ses consommateurs directs.
