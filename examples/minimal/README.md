# Minimal REST and GraphQL application

This runnable example is the smallest complete authenticated UltimaBase
multi-transport vertical. It starts a framework-owned Hono listener on port
`1337`, stores data in PostgreSQL, and mounts REST and Yoga GraphQL as sibling
transports over one HTTP application.

Every public request requires
`X-UltimaBase-Application-Id: minimal`. REST is mounted under `/api/v1` and
GraphQL accepts `POST /graphql`. The application exposes only
`ExampleAuthor`, `ExampleArticle`, and `ExamplePrivateNote` CRUD plus the
explicit `ExampleArticle` soft-delete mutation, `example.status`, and four
Password Auth operations. `ExampleRole` and the internal
`ExampleSoftDeleteEvent` audit schema have no generated CRUD roots, and Password
Auth credentials and session storage never enter either public schema.

Access, ACL, Hooks, Validation, Roles, Password Auth, REST, GraphQL, Yoga,
HTTP, Hono, and PostgreSQL remain explicit independently removable plugins.
The schema factory installs REST and GraphQL before declaring schemas, so their
`rest` and `graphql` options are typed from source; the application extends that same flat plugin
chain and explicitly registers the schemas at construction.
REST and GraphQL normalize requests into the same Core operation pipeline;
their offset envelopes and Relay connections remain intentionally different
wire representations.

## Run it

From the repository root, build the packages and supply a development database
plus a server-only Master key:

```sh
corepack yarn build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_minimal \
ULTIMABASE_MASTER_KEY=development-only-secret \
  corepack yarn workspace @ultimabase/example-minimal start
```

The server listens at `http://127.0.0.1:1337`.

## REST and GraphQL use the same Runtime

Create an article through REST:

```sh
curl http://127.0.0.1:1337/api/v1/classes/ExampleArticle \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --data '{"slug":"hello-rest","title":"  Hello REST  "}'
```

Create another through Yoga GraphQL:

```sh
curl http://127.0.0.1:1337/graphql \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --data '{"query":"mutation Create($input: ExampleArticleCreateInput!) { createExampleArticle(input: $input) { id slug title } }","variables":{"input":{"slug":"hello-graphql","title":"  Hello GraphQL  "}}}'
```

Both titles are trimmed by the same Hook, validated by the same Validation
plugin, authorized by the same Access and ACL policies, and persisted in the
same automatic mutation transaction.

## Official soft delete

The application installs `softDeletePlugin({ defaultMode: 'disabled' })` and
then makes each schema's intent explicit:

- `ExampleAuthor` uses `replace-delete`, so its ordinary `deleteOne`, REST
  `DELETE`, and GraphQL delete mutation keep the logical delete contract while
  PostgreSQL writes a tombstone.
- `ExampleArticle` uses `explicit`, so native delete remains a hard delete and a
  separately authorized `softDelete` command is added.
- `ExamplePrivateNote` omits the option and therefore inherits `disabled`.

An authenticated direct call can use the generated application schema handle or
the same command on a loaded model. The example helper validates a real Password
Auth session before entering the ambient request context:

```ts
import {
	softDeleteArticle,
	softDeleteArticleFromModel,
} from './src/soft-delete.ts'

await softDeleteArticle(ultimabase, articleId, sessionToken)
await softDeleteArticleFromModel(ultimabase, anotherArticleId, sessionToken)
```

The matching REST and GraphQL calls are generated from that same mutation
descriptor; they are not custom business handlers:

```sh
curl "http://127.0.0.1:1337/api/v1/classes/ExampleArticle/ARTICLE_ID/soft-delete" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer SESSION_TOKEN' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --data '{"select":{"id":true,"isDeleted":true,"title":true}}'
```

```graphql
mutation SoftDelete($id: ID!) {
	softDeleteExampleArticle(input: { id: $id }) {
		id
		isDeleted
		title
	}
}
```

Every ordinary read, count, existence check, pointer, and relation traversal
excludes the resulting tombstone. `access.delete` and `access.softDelete` remain
independent decisions. The Hooks plugin likewise reports `delete`,
`softDelete`, `restore`, and `purge` as distinct logical operations. This
example writes one `ExampleSoftDeleteEvent` in the same transaction to make the
logical operation and its physical `update` or `delete` effect observable
without adding a public audit route.

Restoration and irreversible purge are server-only Master operations:

```ts
import { purgeArticle, restoreArticle } from './src/soft-delete.ts'

await restoreArticle(ultimabase, articleId)
await purgeArticle(ultimabase, obsoleteArticleId)
```

They are absent from REST and GraphQL. V1 also deliberately excludes
include-deleted queries, deletion metadata, cascade behavior, uniqueness reuse,
retention jobs, automatic purge, bulk soft delete, and nested soft delete.

## Contextual relation views

Relations may define one reusable read subset directly on the source field.
`ExampleArticle.contributors` uses a static target filter, while `reviewers`
uses Password Auth request context:

```ts
contributors: field.relation({
	target: 'ExampleAuthor',
	where: { listed: { eq: true } },
}),
reviewers: field.relation({
	target: 'ExampleAuthor',
	where: ({ context, where }) =>
		context.getValue(passwordPrincipal) === undefined
			? where.eq('audience', 'public')
			: where,
}),
```

The same declaration shapes direct relation handles, nested inclusions, REST
relationship projections, GraphQL connections, and the visible universe used
by `some`, `none`, `every`, `count`, `isEmpty`, and `isNotEmpty`. A caller's
target `where` is added with logical `AND`; ordering, offset, and limit run
after filtering. `ExampleAuthor.articles` and `contributions` show the same
contract on inverse pointer and inverse relation storage.

This is presentation logic, not security. The example's independent Author
Access filter and ACL can still hide rows that satisfy a relation filter, while
another relation or root query may expose a row excluded only by shaping.
Master bypasses Access and ACL but does not automatically bypass relation
shaping; here a Master request without a Password Auth principal still sees the
public `reviewers` view. The callback is synchronous, request-local, and gets no
source item, adapter, transport request, or transaction. V1 deliberately omits
async and source-item-dependent filters and exposes no transport-specific
bypass.

Relationship writes keep physical membership semantics. Connecting an
unlisted contributor still creates the edge, and a later `disconnect` removes
it; only the read projection omits that contributor.

## Virtual result fields

`ExampleArticle` also demonstrates output-only values computed by Core. Its
stored `presentation` object uses the restricted embedded builder, while its
virtual fields cover primitive, nullable, list, structured, asynchronous, and
request-aware results:

```ts
const article = await ExampleArticle.findOne(
	{
		select: {
			displayTitle: true,
			labels: true,
			optionalSubtitle: true,
			summary: true,
			viewerLabel: true,
		},
		where: { slug: { eq: 'hello-rest' } },
	},
	{ ultimabase },
)
```

Core privately loads only the persisted dependencies declared by each virtual
field. Those values do not appear in the returned model unless the caller also
selects them. `viewerLabel` reads the real request context and distinguishes an
anonymous request, a Password Auth session, and audited Master authority.
`authenticatedTitle` is independently protected by Access and is omitted from
anonymous output while remaining available to an authenticated request or
Master.

REST selects the same fields with
`?select=id,displayTitle,labels,optionalSubtitle,summary,viewerLabel`. GraphQL
selects the corresponding model fields, including the nested
`ExampleArticleSummary` object. Neither transport exposes a virtual field in
create or update data, nested-write input, `where`, or `orderBy`.

## Atomic nested writes

One singular mutation can connect an existing pointer, create relation targets,
connect existing relation targets, and return the final included graph. The
field already identifies `ExampleAuthor`, so relationship commands need only
canonical object IDs:

```ts
const article = await ExampleArticle.createOne(
	{
		data: {
			author: { connect: existingAuthorId },
			contributors: {
				create: [{ name: 'Grace' }],
				connect: [existingContributorId],
			},
			slug: 'nested-writes',
			title: 'Nested writes',
		},
		include: {
			author: { select: { name: true } },
			contributors: { select: { id: true, name: true } },
		},
	},
	{ ultimabase },
)

const createdContributor = article.contributors.find(
	(contributor) => contributor.name === 'Grace',
)
if (createdContributor === undefined) throw new Error('Missing contributor')

const updated = await ExampleArticle.updateOne(
	{
		id: article.id,
		data: {
			contributors: {
				update: [
					{
						id: createdContributor.id,
						data: { name: 'Grace Hopper' },
					},
				],
				disconnect: [existingContributorId],
			},
		},
		include: {
			author: { select: { name: true } },
			contributors: { select: { id: true, name: true } },
		},
	},
	{ ultimabase },
)
```

REST sends the same command object as its concise JSON body. GraphQL uses the
generated source-field-specific nested inputs; scalar values inside a nested
update retain GraphQL's existing update wrappers:

```json
{
	"input": {
		"id": "ARTICLE_ID",
		"data": {
			"contributors": {
				"update": [
					{
						"id": "CREATED_CONTRIBUTOR_ID",
						"data": { "name": { "set": "Grace Hopper" } }
					}
				],
				"disconnect": ["EXISTING_CONTRIBUTOR_ID"]
			}
		}
	}
}
```

Every child object and relation change independently crosses Validation, Hooks,
Access, ACL, and the ordinary Runtime lifecycle. The root, children, relation
edges, final inclusion, and buffered post-commit work share one transaction, so
any late failure rolls the entire graph back.

Trusted server code can execute the identical GraphQL application without
Yoga or HTTP:

```ts
const graphql = ultimabase.plugin('@ultimabase/graphql-plugin')
const context = ultimabase.anonymous({
	requestId: crypto.randomUUID(),
	source: 'internal',
}).context

await graphql.execute({
	context,
	document: `{
		findManyExampleArticle(first: 10) {
			nodes { id slug title }
			pageInfo { hasNextPage endCursor }
		}
	}`,
})
```

## Session flow

Sign up through the explicit GraphQL operation binding:

```sh
curl http://127.0.0.1:1337/graphql \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --data '{"query":"mutation SignUp($input: PasswordAuthSignUpInput!) { signUp(input: $input) { user { id } session { token expiresAt } } }","variables":{"input":{"username":"ada","password":"correct horse battery staple"}}}'
```

The response contains a one-time opaque `ub_s1.*` token. Send it with the
standard Bearer scheme to REST or GraphQL; authentication adds a request
principal while Core authority remains `anonymous`:

```sh
curl http://127.0.0.1:1337/graphql \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --header 'Authorization: Bearer ub_s1.REPLACE_WITH_THE_SESSION_TOKEN' \
  --data '{"query":"{ status { authority principalId } }"}'
```

`login`, `refresh`, and `logout` are mutations on the same `/graphql` endpoint.
They are available only because their exact operation tokens were selected by
`graphqlPlugin({ operations })`; installing Password Auth alone publishes
nothing.

Browser cookie mode is also enabled for `http://localhost:5173`. Cookie-changing
routes require the configured origin as CSRF proof and never return the raw
token in JSON:

```sh
curl http://127.0.0.1:1337/auth/v1/login \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Origin: http://localhost:5173' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --cookie-jar /tmp/ultimabase-minimal-cookies.txt \
  --data '{"username":"ada","password":"correct horse battery staple"}'

curl http://127.0.0.1:1337/graphql \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Origin: http://localhost:5173' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --cookie /tmp/ultimabase-minimal-cookies.txt \
  --data '{"query":"{ status { authority principalId } }"}'
```

## Audited Master flow

A Master key is trusted server-side authority, not a user session. The HTTP
plugin accepts it only because this example explicitly enables the Master
transport. The selected application verifies and audits it before GraphQL runs:

```sh
curl http://127.0.0.1:1337/graphql \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: minimal' \
  --header 'X-UltimaBase-Request-Id: trusted-maintenance-1' \
  --header 'X-UltimaBase-Master-Key: development-only-secret' \
  --data '{"query":"{ status { authority principalId } }"}'
```

The response reports authority `master`; the default audit callback records the
key ID and request ID without logging the raw key. Never place a Master key in a
browser bundle. Master bypasses authorization policies but not validation,
hooks, transactions, constraints, or integrity maintenance.

`createMinimalClient()` demonstrates the shared Fetch header handling. Its
`masterKey` option exists for trusted integration code only.

## Generated declarations and current boundary

The committed `.ultimabase/schema.generated.d.ts` provides exact editor types
for both REST and GraphQL schema options. Regenerate and verify it with:

```sh
corepack yarn workspace @ultimabase/example-minimal generate-types
corepack yarn workspace @ultimabase/example-minimal check-generated-types
corepack yarn workspace @ultimabase/example-minimal typecheck
```

The application executes the compiled declaration graph directly; generated
declarations are replaceable tooling and never Runtime truth. Subscriptions,
live queries, federation, uploads, persisted queries, `@defer`, `@stream`,
OpenAPI, generated clients, realtime, and administration remain intentionally
outside this example.
