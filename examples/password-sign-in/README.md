# Password sign-in

Sign-up and sign-in with a password (`authPlugin()`, `passwordPlugin()`), the
reset and verification emails, and access rules that read the signed-in
user: a draft is its author's, an editor deletes anyone's post.

- `src/user.ts`: the `User` model and its registration.
- `src/models.ts`: the `Post`, `Poll` and `Vote` models and their rules.
- `src/requests/`: the GraphQL requests and responses the pages show.
- `src/mail.ts`: the emails password sends, kept in a list.
- `src/app.ts`: the application.
- `src/app.test.ts`: each rule, used over GraphQL.
- `src/sessions.test.ts`: the session token, the cookie, and server code.
- `src/back-office.test.ts`: shorter sessions, as a back office sets them.
- `src/password.test.ts`: reset, verification, change and the sign-in limit.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/password-sign-in` runs its tests.
