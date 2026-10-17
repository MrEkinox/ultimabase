# @ultimabase/auth-password

The password sign-in method for `@ultimabase/auth-plugin`: sign-up, login,
password changes and the email flows (reset, verification, email change), with
Argon2id hashing.

## Installation

```sh
npm install @ultimabase/auth-plugin @ultimabase/auth-password @ultimabase/core
```

`@ultimabase/core` is a peer dependency, and `@ultimabase/auth-plugin` is
required beside it.

## Example

Sign up and log in, from the tested
[`examples/auth`](../../examples/auth/README.md) application:

<!-- region ../../examples/auth/tests/sign-up.test.ts#sign-up,login -->

```ts
const { user, session } = await Member.signUp({
	displayName: 'Ada',
	email: 'ada@example.com',
	password: 'correct horse battery staple',
})

const login = await Member.login({
	email: ' Ada@Example.com ',
	password: 'correct horse battery staple',
})
```

<!-- endregion -->

## Documentation

- [Password Authentication](../../apps/website/content/docs/1.0.0/plugins/official/password-authentication.mdx)
