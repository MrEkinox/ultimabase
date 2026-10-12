/** These excerpts share one Article schema and an explicitly started application. */
export const schemaExample = `import { UltimaBase } from '@ultimabase/core'

export const Article = UltimaBase.Schema.define({
  className: 'Article',
  fields: (f) => ({
    title: f.string({ required: true }),
    published: f.boolean({ required: true, default: false }),
  }),
})`

export const readExample = `const articles = await Article.findMany(
  {
    where: { published: { eq: true } },
    select: { title: true },
    orderBy: { title: 'asc' },
    take: 3,
  }
)`

export const writeExample = `const article = await Article.createOne(
  {
    data: {
      title: 'Hello, world',
      published: true,
    },
  }
)`

export const applicationExample = `import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { Article } from './article.js'

// postgresPlugin() reads DATABASE_URL when the application starts.
const Application = UltimaBase.use(
    postgresPlugin({ schemaPolicy: 'fail' }),
)
const app = new Application({ schemas: [Article] })

// Once per application: name-keyed types, no generation step.
declare module '@ultimabase/core' {
  interface Register {
    readonly app: typeof app
  }
}

await app.start()`

export const pluginGroups = [
	{ name: 'Store', detail: 'PostgreSQL', href: 'plugins/official/postgresql' },
	{ name: 'Expose', detail: 'REST · GraphQL', href: 'plugins/overview' },
	{
		name: 'Identify',
		detail: 'Passwords · Sessions',
		href: 'plugins/official/password-authentication',
	},
	{
		name: 'Authorize',
		detail: 'Access · ACL',
		href: 'core/security-foundations/security-model',
	},
	{ name: 'Extend', detail: 'Hooks · Validation', href: 'plugins/overview' },
] as const
