import { currentDocumentationPath } from '../../lib/docs-versions'
import { siteConfig } from '../../lib/site'

import type { ExampleScenario, ExampleSourceRegion } from './types'

const repositorySourceUrl = (source: ExampleSourceRegion): string =>
	new URL(
		`blob/main/${source.path}#L${String(source.startLine)}-L${String(source.endLine)}`,
		`${siteConfig.repositoryUrl.href}/`,
	).href

export const exampleSourceUrl = repositorySourceUrl

export const minimalExampleCommand =
	'corepack yarn workspace @ultimabase/example-minimal start'

export const exampleScenarios: readonly ExampleScenario[] = Object.freeze([
	{
		code: `export const ExampleArticle = Schema.define({
  className: 'ExampleArticle',
  fields: (field) => ({
    author: field.pointer({ target: 'ExampleAuthor' }),
    published: field.boolean({ default: true }),
    slug: field.string({ indexed: 'unique', required: true }),
    title: field.string({ required: true }),
  }),
  graphql: true,
  rest: true,
})`,
		codeLabel: 'src/schema.ts',
		documentation: [
			{
				href: currentDocumentationPath('core/data-modeling/schemas'),
				kind: 'Concept',
				label: 'Schemas',
			},
			{
				href: currentDocumentationPath('getting-started/first-application'),
				kind: 'Task guide',
				label: 'Build a first application',
			},
			{
				href: currentDocumentationPath('core/data-modeling/fields'),
				kind: 'Reference',
				label: 'Fields',
			},
		],
		index: '01',
		outcome:
			'Define one typed article model with persistence, validation, policies, and public API intent kept together.',
		slug: 'model-the-schema',
		sources: [
			{
				endLine: 181,
				expectedText: "className: 'ExampleArticle'",
				kind: 'Application code',
				label: 'Article schema and stored fields',
				path: 'examples/minimal/src/schema.ts',
				startLine: 153,
			},
		],
		steps: [
			'Read the field declarations before the policy blocks below them.',
			'Notice that relations name schema targets, never database tables.',
			'Run Typegen after changing the graph to refresh editor declarations.',
		],
		summary:
			'Start with the authoritative TypeScript graph, not transport schemas.',
		title: 'Model the schema',
	},
	{
		code: `const article = await ExampleArticle.findOne(
  {
    select: { displayTitle: true, labels: true, viewerLabel: true },
    where: { slug: { eq: 'hello-rest' } },
  },
  { ultimabase },
)`,
		codeLabel: 'direct-query.ts',
		documentation: [
			{
				href: currentDocumentationPath('core/reading-data/overview'),
				kind: 'Concept',
				label: 'Query overview',
			},
			{
				href: currentDocumentationPath('guides/test-an-application'),
				kind: 'Task guide',
				label: 'Test an application',
			},
			{
				href: currentDocumentationPath('core/application/direct-typescript'),
				kind: 'Reference',
				label: 'TypeScript API',
			},
		],
		index: '02',
		outcome:
			'Execute a typed query directly against a selected UltimaBase application and receive only the requested shape.',
		slug: 'query-directly',
		sources: [
			{
				endLine: 193,
				expectedText: 'ExampleArticle.findOne',
				kind: 'Repository instructions',
				label: 'Maintained direct-query example',
				path: 'examples/minimal/README.md',
				startLine: 173,
			},
		],
		steps: [
			'Use the schema class for ordinary server-side calls.',
			'Pass the selected application explicitly when more than one may exist.',
			'Select only the persisted, related, or virtual fields the caller needs.',
		],
		summary: 'Call the same Runtime without crossing an HTTP boundary.',
		title: 'Query directly',
	},
	{
		code: `curl http://127.0.0.1:1337/api/v1/classes/ExampleArticle \\
  --request POST \\
  --header 'Content-Type: application/json' \\
  --header 'X-UltimaBase-Application-Id: minimal' \\
  --data '{"slug":"hello-rest","title":"Hello REST"}'`,
		codeLabel: 'REST request',
		documentation: [
			{
				href: currentDocumentationPath('plugins/official/http-and-apis/http'),
				kind: 'Concept',
				label: 'HTTP applications',
			},
			{
				href: currentDocumentationPath('getting-started/next-steps'),
				kind: 'Task guide',
				label: 'Choose a public API',
			},
			{
				href: currentDocumentationPath('plugins/official/http-and-apis/rest'),
				kind: 'Reference',
				label: 'REST API',
			},
		],
		index: '03',
		outcome:
			'Create rows through REST and GraphQL while preserving one validation, policy, hook, and transaction path.',
		slug: 'call-rest-and-graphql',
		sources: [
			{
				endLine: 61,
				expectedText: 'Both titles are trimmed by the same Hook',
				kind: 'Repository instructions',
				label: 'REST and GraphQL requests',
				path: 'examples/minimal/README.md',
				startLine: 37,
			},
			{
				endLine: 109,
				expectedText: 'graphqlYogaPlugin',
				kind: 'Application code',
				label: 'Transport composition',
				path: 'examples/minimal/src/create-application.ts',
				startLine: 59,
			},
		],
		steps: [
			'Start the application and keep the application ID header on every request.',
			'Create one article with the REST request shown here.',
			'Use POST /graphql for the equivalent generated GraphQL mutation.',
		],
		summary: 'Compare sibling transports over one selected application.',
		title: 'Call REST and GraphQL',
	},
	{
		code: `curl http://127.0.0.1:1337/graphql \\
  --request POST \\
  --header 'Content-Type: application/json' \\
  --header 'X-UltimaBase-Application-Id: minimal' \\
  --data '{"query":"mutation SignUp($input: PasswordAuthCredentialsInput!) { signUp(input: $input) { session { token } } }","variables":{"input":{"username":"ada","password":"correct horse battery staple"}}}'`,
		codeLabel: 'sign-up.sh',
		documentation: [
			{
				href: currentDocumentationPath(
					'core/security-foundations/security-model',
				),
				kind: 'Concept',
				label: 'Security model',
			},
			{
				href: currentDocumentationPath('guides/build-an-authenticated-api'),
				kind: 'Task guide',
				label: 'Build an authenticated API',
			},
			{
				href: currentDocumentationPath(
					'plugins/official/authentication-and-authorization/access',
				),
				kind: 'Reference',
				label: 'Access policies',
			},
		],
		index: '04',
		outcome:
			'Create a user session, send it as a Bearer token, and let independent Access and ACL policies narrow data.',
		slug: 'authenticate-and-authorize',
		sources: [
			{
				endLine: 89,
				expectedText: 'passwordAuthOperations.signUp',
				kind: 'Application code',
				label: 'Authentication and operation installation',
				path: 'examples/minimal/src/create-application.ts',
				startLine: 59,
			},
			{
				endLine: 342,
				expectedText: 'authentication adds a request',
				kind: 'Repository instructions',
				label: 'Session flow',
				path: 'examples/minimal/README.md',
				startLine: 314,
			},
		],
		steps: [
			'Call the explicitly installed signUp operation and retain its opaque token.',
			'Send the token with Authorization: Bearer on later REST or GraphQL calls.',
			'Treat authentication as request identity; it does not create Core Master authority.',
		],
		summary:
			'Add identity without conflating a user session with trusted authority.',
		title: 'Authenticate and authorize',
	},
	{
		code: `const article = await ExampleArticle.createOne(
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
  },
  { ultimabase },
)`,
		codeLabel: 'nested-write.ts',
		documentation: [
			{
				href: currentDocumentationPath('core/data-modeling/relationships'),
				kind: 'Concept',
				label: 'Relations',
			},
			{
				href: currentDocumentationPath('guides/write-nested-data'),
				kind: 'Task guide',
				label: 'Write nested data',
			},
			{
				href: currentDocumentationPath('core/writing-data/nested-writes'),
				kind: 'Reference',
				label: 'Nested writes',
			},
		],
		index: '05',
		outcome:
			'Create and connect related rows in one logical mutation and one automatic transaction.',
		slug: 'write-related-data',
		sources: [
			{
				endLine: 291,
				expectedText: 'Every child object and relation change',
				kind: 'Repository instructions',
				label: 'Atomic nested-write journey',
				path: 'examples/minimal/README.md',
				startLine: 210,
			},
		],
		steps: [
			'Create or load the related IDs before the root mutation.',
			'Place pointer and relation commands inside the root data object.',
			'Use include when the response must return the final related graph.',
		],
		summary: 'Write a related graph without issuing manual adapter operations.',
		title: 'Write related data',
	},
	{
		code: `displayTitle: field.virtual({
  output: (output) => output.string({ nullable: false }),
  select: { title: true },
  resolve: ({ item }) => \`Article: \${item.title}\`,
})`,
		codeLabel: 'src/schema.ts',
		documentation: [
			{
				href: currentDocumentationPath('core/data-modeling/fields'),
				kind: 'Concept',
				label: 'Field kinds',
			},
			{
				href: currentDocumentationPath('guides/add-virtual-fields'),
				kind: 'Task guide',
				label: 'Add virtual fields',
			},
			{
				href: currentDocumentationPath('core/reading-data/selections'),
				kind: 'Reference',
				label: 'Selections',
			},
		],
		index: '06',
		outcome:
			'Return computed fields through direct calls, REST, and GraphQL without storing or accepting them as input.',
		slug: 'resolve-virtual-fields',
		sources: [
			{
				endLine: 249,
				expectedText: 'authenticatedTitle: field.virtual',
				kind: 'Application code',
				label: 'Virtual field declarations',
				path: 'examples/minimal/src/schema.ts',
				startLine: 182,
			},
		],
		steps: [
			'Declare the output shape and the smallest persisted dependency selection.',
			'Resolve from the selected item and, when needed, request context.',
			'Ask for the virtual field in an ordinary selection; never send it in mutation data.',
		],
		summary: 'Compute output-only values inside the shared result pipeline.',
		title: 'Resolve virtual fields',
	},
	{
		code: `await softDeleteArticle(ultimabase, articleId, sessionToken)

await restoreArticle(ultimabase, articleId)
await purgeArticle(ultimabase, obsoleteArticleId)`,
		codeLabel: 'soft-delete.ts',
		documentation: [
			{
				href: currentDocumentationPath(
					'plugins/official/data-and-persistence/soft-delete',
				),
				kind: 'Concept',
				label: 'Soft delete',
			},
			{
				href: currentDocumentationPath(
					'plugins/official/data-and-persistence/soft-delete',
				),
				kind: 'Task guide',
				label: 'Add soft delete',
			},
			{
				href: currentDocumentationPath('core/writing-data/delete'),
				kind: 'Reference',
				label: 'Delete commands',
			},
		],
		index: '07',
		outcome:
			'Hide an article with an explicit logical operation while keeping restore and purge server-only.',
		slug: 'soft-delete-data',
		sources: [
			{
				endLine: 69,
				expectedText: 'softDeleteArticle',
				kind: 'Test helper',
				label: 'Session and Master helpers used by E2E tests',
				path: 'examples/minimal/src/soft-delete.ts',
				startLine: 6,
			},
			{
				endLine: 307,
				expectedText: "softDelete: 'explicit'",
				kind: 'Application code',
				label: 'Article policy and lifecycle hooks',
				path: 'examples/minimal/src/schema.ts',
				startLine: 251,
			},
		],
		steps: [
			'Install the plugin, then select explicit or replace-delete behavior per schema.',
			'Authorize softDelete independently from hard delete.',
			'Keep restoration and irreversible purge behind trusted server authority.',
		],
		summary:
			'Make logical deletion explicit in policy, hooks, and transport exposure.',
		title: 'Soft-delete data',
	},
])

export function findExampleScenario(slug: string): ExampleScenario | undefined {
	return exampleScenarios.find((scenario) => scenario.slug === slug)
}
