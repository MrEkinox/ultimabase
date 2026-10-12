import { applicationExample } from './content'

const httpImports = `import { httpPlugin } from '@ultimabase/http-plugin'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'`
const httpPlugins = `    httpPlugin(),
    honoServerPlugin(),`

/** Both HTTP presets extend the same explicit, statically checked application. */
const withTransport = (imports: string, plugins: string) =>
	applicationExample
		.replace(
			'import { Article }',
			`${httpImports}\n${imports}\nimport { Article }`,
		)
		.replace(
			"    postgresPlugin({ schemaPolicy: 'fail' }),",
			`    postgresPlugin({ schemaPolicy: 'fail' }),\n${httpPlugins}\n${plugins}`,
		)

export const compositionExamples = [
	{
		label: 'TypeScript',
		code: applicationExample,
		note: 'PostgreSQL only. Direct calls, with no HTTP listener.',
	},
	{
		label: 'REST',
		code: withTransport(
			"import { restPlugin } from '@ultimabase/rest-plugin'",
			`    restPlugin({ publicWrites: true }),`,
		),
		note: 'HTTP selects the application; Hono listens locally. REST generates /api routes.',
	},
	{
		label: 'GraphQL',
		code: withTransport(
			`import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'`,
			`    graphqlPlugin({ publicWrites: true }),
    graphqlYogaPlugin(),`,
		),
		note: 'GraphQL builds the schema; Yoga mounts /graphql. HTTP and Hono handle local requests.',
	},
] as const
