# @ultimabase/create-app

The standalone UltimaBase project initializer. Its proposed npm entry point is
`npm create @ultimabase/app@latest`; the package has not been published.

The interactive and flag-only selection flows normalize to one project plan.
The local executable now generates the base PostgreSQL project in TypeScript
or JavaScript, with either a runnable Task starter or an empty application.
TypeScript automatically runs Typegen before typecheck and build; JavaScript
does not depend on Typegen or TypeScript. The database can be an existing
disposable instance or a generated local Docker Compose service. Later
milestone 29 issues add optional plugin composition, packed-project
verification, and the full Quick Start journey.

Run the built local executable with `node dist/cli.js --help`, or generate a
base project with `node dist/cli.js --name notes --yes --no-install`. The
selection validates npm package names, available plugin IDs, plugin
prerequisites, and a new destination. The grouped prompt includes all 16
official plugins; Typegen is automatic for TypeScript and absent for
JavaScript. `--yes` accepts the documented defaults and never authorizes
overwriting an existing target. Optional plugin choices currently fail with
an explicit message before any files are written while their templates are
implemented in the next issues.

The project generator is not ready for application setup until milestone 29
closes.
