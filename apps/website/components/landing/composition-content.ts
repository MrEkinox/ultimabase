import { applicationExample } from './content'

const httpImports = `import { httpPlugin } from '@ultimabase/http-plugin'
import { honoServerPlugin } from '@ultimabase/server-hono-plugin'`
const httpPlugins = `    httpPlugin({ appId: 'articles' }),
    honoServerPlugin({ host: '127.0.0.1', port: 1337 }),`

/** Both HTTP presets extend the same explicit, statically checked application. */
const withTransport = (imports: string, plugins: string) =>
	applicationExample
		.replace(
			'import { Article }',
			`${httpImports}\n${imports}\nimport { Article }`,
		)
		.replace(
			'    typegenPlugin(),',
			`    typegenPlugin(),\n${httpPlugins}\n${plugins}`,
		)

export const compositionExamples = [
	{
		label: 'TypeScript',
		code: applicationExample,
		note: 'PostgreSQL + Typegen. Direct calls, with no HTTP listener.',
	},
	{
		label: 'REST',
		code: withTransport(
			"import { restPlugin } from '@ultimabase/rest-plugin'",
			`    restPlugin({ acknowledgeUnverifiedProtection: true }),`,
		),
		note: 'HTTP selects the application; Hono listens locally. REST generates /api/v1 routes.',
	},
	{
		label: 'GraphQL',
		code: withTransport(
			`import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'`,
			`    graphqlPlugin({ acknowledgeUnverifiedProtection: true }),
    graphqlYogaPlugin(),`,
		),
		note: 'GraphQL builds the schema; Yoga mounts /graphql. HTTP and Hono handle local requests.',
	},
] as const
