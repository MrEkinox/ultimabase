# Releasing UltimaBase

UltimaBase uses Changesets for independent changelogs, SemVer versions, internal dependency ranges, stable releases, and `next` prereleases.

## Record a public change

Run `yarn changeset`, select every affected package, choose the smallest correct bump, and commit the generated Markdown file with the implementation.

The foundational packages form one fixed version group:

- `@ultimabase/core`
- `@ultimabase/shared`

A bump to one member bumps the pair to the same version. Schema, Query, Access,
application, and Runtime changes are all recorded against Core. Official
plugins remain independently versioned.

## Core releases move plugin Core ranges

Core rejects a plugin whose `core` range the installed Core does not satisfy
(ADR-0338). Core knows its version from `coreVersion` in
`packages/core/src/plugins/core-version.ts`, and every official plugin (each
`*-plugin` package, plus Plugin Kit's `definePlugin` and `defineOperation`)
declares in its manifest the range its package publishes for
`@ultimabase/core`: `workspace:^` is published as `^<Core version>`.
Changesets updates neither, so after `yarn changeset version` bumps Core:

1. Set `coreVersion` to the new Core version;
   `packages/core/src/plugins/core-version.test.ts` fails until it matches
   `packages/core/package.json`.
2. Replace the `core` range of every official plugin manifest, in its value and
   its declared type, with `^<new version>`;
   `tests/e2e/official-plugin-manifests.e2e.test.ts` fails until each one
   matches. When the new version leaves the previous range (any `0.x` release
   or a new major), also replace that range in the examples, tests, templates
   and documentation: the graph check fails every plugin left behind.
3. Commit these changes to the `Release packages` pull request before merging
   it.

When the new Core version leaves the previous range, Changesets also releases
every official plugin with at least a patch bump
(`updateInternalDependencies: "patch"`), so the updated manifests ship with
the Core they accept.

## One-time GitHub setup

Allow GitHub Actions to create pull requests with a writable `GITHUB_TOKEN`. Create an `npm` environment, add required reviewers for publication approval, and restrict it to release branches.

## Stable releases

Pushes to `main` update a `Release packages` pull request through Changesets. Review its versions and changelogs like any other change.

After merging that pull request:

1. Open the `Release` workflow in GitHub Actions.
2. Select `Run workflow` on `main`.
3. Approve the protected `npm` environment when prompted.

The workflow runs every test, builds and validates every archive, publishes unpublished versions, creates package tags, and requests npm provenance.

## `next` prereleases

Use a dedicated branch so prerelease state never blocks stable work on `main`:

```sh
git switch -c release/next
yarn changeset pre enter next
yarn changeset version
yarn test:all
```

Commit `.changeset/pre.json`, package versions, dependency ranges, and changelogs. Push the branch, then manually run the `Release` workflow against `release/next`. Changesets publishes versions such as `0.1.0-next.0` with the npm `next` distribution tag.

Add and version further Changesets on the same branch for subsequent prereleases. When the release is stable:

```sh
yarn changeset pre exit
yarn changeset version
```

Merge the resulting stable versions into `main` before running the workflow there.

## npm trusted publishing

For every existing `@ultimabase/*` package, configure npm trusted publishing with:

- provider: GitHub Actions;
- owner: `MrEkinox`;
- repository: `ultimadatabase`;
- workflow: `release.yml`;
- allowed action: `npm publish`;
- optional GitHub environment: `npm`.

The workflow grants only `id-token: write` and uses a GitHub-hosted runner. npm then authenticates with a short-lived OIDC credential and generates provenance automatically.

New package names need a one-time bootstrap publication through the optional `NPM_TOKEN` repository secret before their trusted publisher can be configured. Use a granular token limited to the new packages, configure trusted publishing immediately afterwards, then remove the token.

npm cannot generate provenance from a private GitHub repository. The workflow is ready for provenance, but attestations will begin only after this repository becomes public.

## Local release verification

Before merging release metadata, run:

```sh
yarn changeset status
yarn test:pack
```

To test version calculation without touching the working tree, copy the repository to a temporary directory, add a disposable Changeset there, run `yarn changeset version`, and finish with `yarn workspaces foreach --all --no-private pack --dry-run`.
