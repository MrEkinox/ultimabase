# Étape 7 : documentation vérifiée (ADR-0330), tranche Soft Delete

Branche `docs/verified-soft-delete` (worktree `ub-step7`, base `main`
fe385287). Prototype sur une seule fonctionnalité, à relire par
l'utilisateur avant d'étendre aux autres.

## Périmètre

1. `examples/soft-delete/` : application forme D complète, tests
   `testApplication`, exécutée par `tests/e2e/examples-form-d.postgres.e2e.test.ts`
   et `yarn typecheck:typescript-7`.
2. Page Soft Delete : chaque bloc TS est un `<include>` d'une région.
3. README du paquet : régions copiées par `yarn docs:regions`, vérifiées par
   `tooling/documentation/readme-regions.test.ts`.
4. Test de contenu `apps/website/tests/verified-code.content.test.ts`.
5. Essai Twoslash : en cours.

## État

- Fait : points 1 à 4.
- Prochaine action vérifiable : essai Twoslash, puis gate complète.
