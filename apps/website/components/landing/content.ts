import { currentDocumentationPath } from '../../lib/docs-versions'
import { siteConfig } from '../../lib/site'

export interface LandingFeature {
	readonly description: string
	readonly href: string
	readonly index: string
	readonly title: string
}

export interface LandingFlowCopy {
	readonly connector: string
	readonly description: string
	readonly entryPointsLabel: string
	readonly index: string
	readonly inputs: readonly Readonly<{
		readonly detail: string
		readonly label: string
	}>[]
	readonly stages: readonly string[]
	readonly stagesLabel: string
	readonly title: string
}

export interface LandingCopy {
	readonly evidence: Readonly<{
		readonly description: string
		readonly featureLink: string
		readonly index: string
		readonly title: string
	}>
	readonly features: readonly LandingFeature[]
	readonly flow: LandingFlowCopy
	readonly hero: Readonly<{
		readonly description: string
		readonly note: string
		readonly primaryAction: string
		readonly secondaryAction: string
		readonly status: string
		readonly title: string
	}>
	readonly principle: Readonly<{
		readonly callout: string
		readonly calloutTitle: string
		readonly description: string
		readonly index: string
		readonly title: string
	}>
	readonly status: Readonly<{
		readonly description: string
		readonly eyebrow: string
		readonly primaryAction: string
		readonly title: string
	}>
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
		href: currentDocumentationPath('plugins/official/postgresql'),
		index: '01',
		title: 'PostgreSQL, without leaking the adapter',
	},
	{
		description:
			'Every mutation and database work started by its hooks share one automatic transaction.',
		href: currentDocumentationPath('core/writing-data/transactions'),
		index: '02',
		title: 'Automatic mutation transactions',
	},
	{
		description:
			'Typed pointers, relations, inclusions, nested writes, and contextual views use one model.',
		href: currentDocumentationPath('core/data-modeling/relationships'),
		index: '03',
		title: 'Relationships with one meaning',
	},
	{
		description:
			'Core structural checks compose with optional Standard Schema application validation.',
		href: currentDocumentationPath('plugins/official/validation'),
		index: '04',
		title: 'Validation at the right boundary',
	},
	{
		description:
			'Authentication, Access, Roles, and ACL stay independently removable and monotonically restrictive.',
		href: currentDocumentationPath('core/security-foundations/security-model'),
		index: '05',
		title: 'Explicit security capabilities',
	},
	{
		description:
			'Generated declarations improve autocomplete without becoming runtime truth or a required client.',
		href: currentDocumentationPath('guides/generate-types'),
		index: '06',
		title: 'Replaceable Typegen declarations',
	},
])

export const landingCopy: LandingCopy = Object.freeze({
	evidence: {
		description:
			'The framework is pre-release, but these contracts are implemented and covered across the public execution paths.',
		featureLink: 'Read the contract',
		index: '03 / Shipped foundations',
		title: 'Built for the parts that become difficult later.',
	},
	features: landingFeatures,
	flow: {
		connector: 'one operation',
		description:
			'Transport syntax changes. Validation, policy, hooks, transactions, and persistence semantics do not.',
		entryPointsLabel: 'Application entry points',
		index: '02 / One execution model',
		inputs: [
			{ detail: 'Immutable Query and model commands', label: 'TypeScript' },
			{ detail: 'Versioned resource protocol', label: 'REST' },
			{ detail: 'Schema and plugin operations', label: 'GraphQL' },
		],
		stages: [
			'Normalize one operation',
			'Validate and authorize',
			'Run hooks and transaction',
			'Persist through PostgreSQL',
		],
		stagesLabel: 'Shared runtime stages',
		title: 'Three entry points. One Runtime.',
	},
	hero: {
		description:
			'UltimaBase turns static TypeScript schemas and explicit plugins into one application graph. Direct calls, REST, and GraphQL execute through the same typed Runtime.',
		note: 'Node.js 24+ · TypeScript · Apache-2.0',
		primaryAction: 'Start building',
		secondaryAction: 'View on GitHub',
		status: `${siteConfig.releaseStatus} · open source`,
		title: 'Define your data once. Keep every API honest.',
	},
	principle: {
		callout:
			'Remove a plugin and its behavior disappears. Core does not install a neutral imitation or silently choose a replacement.',
		calloutTitle: 'No hidden framework mode',
		description:
			'PostgreSQL, transports, authentication, validation, Access, Hooks, and developer tooling are installed as plugins. Each one declares what it contributes and which privileges or environmental access it needs.',
		index: '01 / Explicit composition',
		title: 'Core stays small. Capabilities stay visible.',
	},
	status: {
		description:
			'The architecture is substantial and the API is usable. Expect deliberate change while the first stable release contract is finalized.',
		eyebrow: 'Honest by default',
		primaryAction: 'Read Manual Installation',
		title: 'Active pre-release development.',
	},
})
