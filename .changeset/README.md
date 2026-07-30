# Changesets

Every user-visible package change should include a Changeset:

```sh
yarn changeset
```

Choose the smallest SemVer bump that describes the public impact. The foundational packages are a fixed group, so Changesets keeps their versions aligned while every package retains its own changelog.

Release and prerelease procedures are documented in [`docs/RELEASING.md`](../docs/RELEASING.md).
