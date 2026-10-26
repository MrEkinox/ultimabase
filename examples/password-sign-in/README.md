# Password sign-in

Sign-up and sign-in with a password (`authPlugin()`, `passwordPlugin()`), and
access rules that read the signed-in user: a draft is its author's, an
editor deletes anyone's post.

- `src/models.ts`: the `User` and `Post` models and their rules.
- `src/app.ts`: the application.
- `src/app.test.ts`: each rule, used over GraphQL.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/password-sign-in` runs its tests.
