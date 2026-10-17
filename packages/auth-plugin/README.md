# @ultimabase/auth-plugin

The authentication foundation: the User schema, sessions, account linking and
the HTTP auth routes. Sign-in methods such as `@ultimabase/auth-password` plug
into it; it grants no authorization.

## Installation

```sh
npm install @ultimabase/auth-plugin @ultimabase/auth-password @ultimabase/core
```

`@ultimabase/core` is a peer dependency. The application also needs a database
plugin and at least one sign-in method.

## Example

Running work in a session, from the tested
[`examples/auth`](../../examples/auth/README.md) application:

<!-- region ../../examples/auth/tests/sessions.test.ts#current,principal -->

```ts
const auth = ultimabase.plugin(authPlugin)
const me = await auth.runWithSession(session.token, () => Member.current())

const notes = await auth.runWithSession(session.token, async () => {
	await Note.createOne({ data: { author: user.id, body: 'Call Grace' } })
	return Note.findMany()
})
```

<!-- endregion -->

## Documentation

- [Password Authentication](../../apps/website/content/docs/1.0.0/plugins/official/password-authentication.mdx)
- [Request Identity](../../apps/website/content/docs/1.0.0/core/security-foundations/request-identity.mdx)
- [HTTP](../../apps/website/content/docs/1.0.0/plugins/official/http.mdx)
