# Password sign-in

Sign-up and sign-in with a password (`authPlugin()`, `passwordPlugin()`), the
reset and verification emails, and access rules that read the signed-in
user: a draft is its author's, an editor deletes anyone's post.

- `src/models.ts`: the `User` and `Post` models and their rules.
- `src/mail.ts`: the emails password sends, kept in a list.
- `src/app.ts`: the application.
- `src/app.test.ts`: each rule, used over GraphQL.
- `src/sessions.test.ts`: the session token, the cookie, and server code.
- `src/password.test.ts`: reset, verification, change and the sign-in limit.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/password-sign-in` runs its tests.
