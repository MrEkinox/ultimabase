# Applications

Applications in this directory are private workspaces and are never published
as framework packages.

- `playground`: exercises the framework as an application developer would.
- `benchmark`: measures runtime, query compilation, and transport overhead.
- `website`: hosts the public product pages and documentation. Run it with
  `yarn website:dev`, and validate it independently with `yarn website:typecheck`,
  `yarn website:lint`, and `yarn website:build`.

The root package build deliberately uses `--no-private`, so adding a deployable
application does not change the build graph of publishable UltimaBase packages.
