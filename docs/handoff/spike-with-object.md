# Handoff : spike `.with({ … })` objet (entrée de décision)

Branche `spike/with-object` (depuis `feat/define-with` 6c55ad65). Prototype, ne pas
fusionner. Journaux : `/private/tmp/claude-501/…/scratchpad/spike-with-object/`.

## Question

Garder tout ADR-0339 (clés de fonctionnalité et index dans `define`, noms de règles
déclarés à la création du plugin, règles requises, vérification à `new App`, noms
réservés, messages JavaScript, aucun membre de configuration sur la constante) mais
écrire `.with` en objet : `.with({ acl: { default }, access: { … }, rest: { … } })`.

## Commits

1. df33510c : forme objet à côté du constructeur (paramètre union, non générique),
   copies objet des cas `register-cycle` (`with-object*`), `gen.mjs --object`.
2. 6a1f5068 : objet seul, constructeur supprimé (`SchemaRulesObject` remplace
   `SchemaRulesBuilder`/`CompleteSchemaRules`/`SchemaRulesCallback`), messages
   `.with({ acl: { … } })`.
3. 9fed186d : conversion du dépôt par un script AST jetable (scratchpad
   `convert.mjs`) : 422 appels, 10 sites de tests de types à la main.
4. 857e08a9 : type requis imprimé `{ readonly acl: ACLRule<…> }`, test e2e de
   diagnostics en forme objet, copies `with-object*` supprimées.
5. 42db41e3 : tests de messages et appels JavaScript adaptés, régions README.

## Résultats (détail dans le rapport du spike)

- Cycles : 0 erreur, TS 6/7, sources/paquets construits, tous les ordres de
  fichiers racine (5 cas), anneaux 50/200 (9 ordres) en objet seul et en objet
  à côté du constructeur.
- Banc forme D (médianes de 3, charge 2,35–3,88) : objet seul TS7 0,55/1,82 s,
  TS6 1,92/5,61 s ; constructeur 0,53/1,80 et 1,90/5,60 ; `main` 0,56/1,88 et
  1,96/5,77.
- `yarn typecheck` 0, `yarn typecheck:typescript-7` 0, e2e de diagnostics 34/34,
  exemples soft-delete 13/13 et acl 16/16 ; unit+types : 17 échecs restants, tous
  dans 6 suites IntelliSense qui contiennent du code constructeur dans des chaînes.

## Prochaine action

Décision du propriétaire (objet seul ou constructeur), puis amendement d'ADR-0339
si l'objet est retenu. Supprimer ce handoff avec la branche.
