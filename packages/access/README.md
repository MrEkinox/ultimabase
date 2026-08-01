# @ultimabase/access

Foundational contracts shared by access-control plugins.

This package defines access modes, declarative rule AST contracts, subjects, and compiler boundaries. It does not enforce CLP, ACL, roles, or field permissions by itself.

Keeping neutral contracts here prevents concrete permission plugins from depending on one another or on infrastructure.

Permission enforcement is not a named Runtime stage. Installed permission
plugins attach guards, opaque adapter constraints, and field restrictions to
schema or field hooks. Runtime transports the neutral contracts but never
interprets CLP, ACL, role, or field-permission configuration.

## Request access

`RequestAccess` is a closed discriminated union with exactly three modes:

```ts
type RequestAccess =
	| { readonly mode: 'anonymous' }
	| { readonly mode: 'user'; readonly userId: string }
	| { readonly mode: 'master'; readonly keyId: string; readonly reason: string }
```

There is no `system` mode. Authentication credentials remain outside this
contract; successful authentication contributes only the stable user identity.
Master authority also identifies the verified key without retaining its raw
value. `shouldBypassAccessBoundary` gives permission plugins one shared default:
master bypasses CLP, ACL, and field permissions, but not structural validation,
SQL constraints, transactions, business hooks, or tenant isolation.
Runtime never calls this helper; each installed policy plugin owns its bypass
decision.

## Request capabilities

Plugins can share identity-based capability tokens:

```ts
export const tenantRead = new RequestCapability('tenant:read')
```

Two tokens with the same name are intentionally different. This prevents a
transport payload from granting itself a capability by reproducing its label.
