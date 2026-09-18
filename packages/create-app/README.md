# @ultimabase/create-app

The standalone UltimaBase project initializer. Its proposed npm entry point is
`npm create @ultimabase/app@latest`; the package has not been published.

Issue 2902 implements the interactive and flag-only selection contract. It
prints a validated project plan without writing files. Later milestone 29
issues add TypeScript and JavaScript templates, official plugin composition,
packed-project verification, and the public Quick Start journey.

Run the built local executable with `node dist/cli.js --help`, or preview a
non-interactive selection with `node dist/cli.js --name notes --yes`. The
selection validates npm package names, available plugin IDs, plugin
prerequisites, and a new destination. The grouped prompt includes all 16
official plugins; Typegen is automatic for TypeScript and absent for
JavaScript. `--yes` accepts the documented defaults and never authorizes
overwriting an existing target.

The project generator is not ready for application setup until milestone 29
closes.
