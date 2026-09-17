import { currentDocumentationPath } from '../../lib/docs-versions'

/** These excerpts share one Article schema and an explicitly started application. */
export const schemaExample = `import { Schema } from '@ultimabase/core'

export const Article = Schema.define({
  className: 'Article',
  fields: (field) => ({
    title: field.string({ required: true }),
    slug: field.string({
      required: true, indexed: 'unique',
    }),
    published: field.boolean({ default: false }),
  }),
})`

export const readExample = `const articles = await Article.findMany(
  {
    where: { published: { eq: true } },
    select: { title: true, slug: true },
    limit: 3,
  },
  { ultimabase: app },
)

articles[0]?.title // string | undefined
articles[0]?.slug  // string | undefined`

export const writeExample = `const article = await Article.createOne(
  {
    data: {
      title: 'A place for your ideas',
      slug: 'a-place-for-your-ideas',
      published: true,
    },
  },
  { ultimabase: app },
)

article.title // string`

export const applicationExample = `import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { typegenPlugin } from '@ultimabase/typegen'
import { Article } from './article.js'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

const app = new UltimaBase({
  schemas: [Article],
  plugins: [
    postgresPlugin({ url, schemaPolicy: 'fail' }),
    typegenPlugin(),
  ],
})

await app.start()`

export const pluginGroups = [
	{ name: 'Store', detail: 'PostgreSQL', href: 'plugins/official/postgresql' },
	{ name: 'Expose', detail: 'REST · GraphQL', href: 'plugins/overview' },
	{
		name: 'Authorize',
		detail: 'Access · ACL',
		href: 'core/security-foundations/security-model',
	},
	{ name: 'Extend', detail: 'Hooks · Validation', href: 'plugins/overview' },
] as const

export const landingFeatures = [
	{
		index: '01',
		title: 'Writes that belong together.',
		description:
			'A mutation and the database work started by its hooks commit or roll back together. Nested writes share that transaction.',
		href: currentDocumentationPath('core/writing-data/transactions'),
		linkLabel: 'Explore transactions',
		kind: 'transaction',
	},
	{
		index: '02',
		title: 'Your data has relationships.',
		description:
			'Declare pointers and relations in your schema. Read related records and make nested writes through the same data APIs.',
		href: currentDocumentationPath('core/data-modeling/relationships'),
		linkLabel: 'Explore relationships',
		kind: 'relation',
	},
	{
		index: '03',
		title: 'Identity is only the beginning.',
		description:
			'Authentication identifies a caller. Optional Access and ACL plugins decide what they can do. Roles grant nothing on their own.',
		href: currentDocumentationPath('core/security-foundations/security-model'),
		linkLabel: 'Read the security model',
		kind: 'security',
	},
	{
		index: '04',
		title: 'Types stay close to your code.',
		description:
			'Get schema-aware fields and query results. Typegen generates declarations from your application, including installed plugins. Your app runs without a generated client.',
		href: currentDocumentationPath('guides/generate-types'),
		linkLabel: 'Meet Typegen',
		kind: 'types',
	},
] as const
