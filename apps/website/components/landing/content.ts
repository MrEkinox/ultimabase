import { siteConfig } from '../../lib/site'

export interface LandingFeature {
	readonly description: string
	readonly href: string
	readonly index: string
	readonly title: string
}

export const applicationExample = `import { Schema, UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { typegenPlugin } from '@ultimabase/typegen'

const Article = Schema.define({
  className: 'Article',
  fields: (field) => ({
    slug: field.string({ indexed: 'unique', required: true }),
    title: field.string({ required: true }),
  }),
})

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined) {
  throw new TypeError('DATABASE_URL is required')
}

const app = new UltimaBase({
  schemas: [Article],
  plugins: [
    typegenPlugin(),
    postgresPlugin({ url: databaseUrl }),
  ],
})

await app.start()`

export const landingFeatures: readonly LandingFeature[] = Object.freeze([
	{
		description:
			'Drizzle stays private while schemas, queries, constraints, and lifecycle remain framework-owned.',
		href: '/docs/operations/postgres',
		index: '01',
		title: 'PostgreSQL, without leaking the adapter',
	},
	{
		description:
			'Every mutation and database work started by its hooks share one automatic transaction.',
		href: '/docs/mutations/transactions',
		index: '02',
		title: 'Automatic mutation transactions',
	},
	{
		description:
			'Typed pointers, relations, inclusions, nested writes, and contextual views use one model.',
		href: '/docs/data-modeling/relations',
		index: '03',
		title: 'Relationships with one meaning',
	},
	{
		description:
			'Core structural checks compose with optional Standard Schema application validation.',
		href: '/docs/guides/validation',
		index: '04',
		title: 'Validation at the right boundary',
	},
	{
		description:
			'Authentication, Access, Roles, and ACL stay independently removable and monotonically restrictive.',
		href: '/docs/security/overview',
		index: '05',
		title: 'Explicit security capabilities',
	},
	{
		description:
			'Generated declarations improve autocomplete without becoming runtime truth or a required client.',
		href: '/docs/concepts/typegen',
		index: '06',
		title: 'Replaceable Typegen declarations',
	},
])

export const minimalExampleUrl = new URL(
	'tree/main/examples/minimal',
	`${siteConfig.repositoryUrl.href}/`,
).href
