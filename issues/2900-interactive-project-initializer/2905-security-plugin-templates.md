# 2905: Compose security plugins safely

- Status: planned
- Milestone: 29
- Packages: `@ultimabase/create-app`, official security plugins
- Depends on: 2904
- ADR: decision from issue 2901, ADR-0235

## Goal

Make Password Auth, Access, Roles, and Object ACLs selectable without implying
that identity grants authorization or that a generated example is ready for
public exposure.

## Acceptance criteria

- [ ] Each selected plugin adds its actual package and valid application-local
      configuration; the generated starter demonstrates a capability only when
      its policy, schema, and required providers are present.
- [ ] Password Auth has an explicit User schema, development Master key and
      audit setup, and no accidental transport exposure of private credentials
      or operations. Secrets are ignored by Git and never printed by the CLI.
- [ ] Access and ACL remain separate policy choices. Roles provide identities
      but no grants by themselves. The generator never treats a valid session
      as permission to read or mutate application data.
- [ ] If a requested combination cannot be configured safely, selection fails
      before writing a project with a clear reason; it is never silently
      downgraded to anonymous or unprotected behavior.
- [ ] TS and JS outputs use the same Runtime graph and behavior, differing
      only in Typegen and language tooling.

## Tests

- [ ] Generated-project tests cover each security plugin, Auth with and
      without Access, role-backed ACLs, default-denied cases, Master audit, and
      no leaked secrets or private routes.
- [ ] Review security plugin guides, pre-exposure guidance, and Quick Start in
      the same issue while retaining the unpublished-command warning.

## Out of scope

- A new authentication provider, administrator UI, or automatic production
  access-policy design.
