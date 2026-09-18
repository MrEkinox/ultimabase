# 2905: Compose security plugins safely

- Status: completed
- Milestone: 29
- Packages: `@ultimabase/create-app`, official security plugins
- Depends on: 2904
- ADR: decision from issue 2901, ADR-0235

## Goal

Make Password Auth, Access, Roles, and Object ACLs selectable without implying
that identity grants authorization or that a generated example is ready for
public exposure.

## Acceptance criteria

- [x] Each selected plugin adds its actual package and valid application-local
      configuration; the generated starter demonstrates a capability only when
      its policy, schema, and required providers are present.
- [x] Password Auth has an explicit User schema, development Master key and
      audit setup, and no accidental transport exposure of private credentials
      or operations. Secrets are ignored by Git and never printed by the CLI.
- [x] Access and ACL remain separate policy choices. Roles provide identities
      but no grants by themselves. The generator never treats a valid session
      as permission to read or mutate application data.
- [x] If a requested combination cannot be configured safely, selection fails
      before writing a project with a clear reason; it is never silently
      downgraded to anonymous or unprotected behavior.
- [x] TS and JS outputs use the same Runtime graph and behavior, differing
      only in Typegen and language tooling.

## Tests

- [x] Generated-project tests cover each security plugin, Auth with and
      without Access, role-backed ACLs, default-denied cases, Master audit, and
      no leaked secrets or private routes.
- [x] Review security plugin guides, pre-exposure guidance, and Quick Start in
      the same issue while retaining the unpublished-command warning.

## Out of scope

- A new authentication provider, administrator UI, or automatic production
  access-policy design.

## Handoff

- Documentation impact: public website documentation. Quick Start's local
  implementation status now includes security choices; the package README
  explains their exact generated behavior. Reviewed the Access, Password Auth,
  Roles, Object ACL, and Master Authority guides; their current contracts remain
  accurate and the unpublished-command warning remains visible.
- Password Auth contributes an explicit `User` schema and keeps private
  operations off transports. Roles use the exact Password Auth User when
  selected together, or a local Member schema otherwise. Access explicitly
  denies Task CRUD for ordinary callers; an empty Task ACL independently denies
  object reads, updates, and deletes, but does not govern creation. No role or
  session creates an implicit grant.
- A local Master key is generated only for Docker mode and written to ignored
  `.env` after optional dependency installation. Existing-database mode
  requires a private value, rejects the example placeholder, and audits only
  event metadata. The starter's Master Task write is trusted server work.
- Verified all four individual security choices and representative combinations
  in both language templates, TypeScript Typegen/typecheck for seven security
  combinations, and generated JavaScript and TypeScript projects against
  PostgreSQL. The committed Testcontainers regression checks role-backed ACL
  reads, anonymous denial, Access default denial, Master audit, and no key leak
  or automatic route exposure. No combination required an architectural
  exception or silent downgrade.
- Scope beyond acceptance criteria: none.
