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
		readonly firstLine: string
		readonly note: string
		readonly primaryAction: string
		readonly secondLine: string
		readonly secondaryAction: string
		readonly status: string
	}>
	readonly preview: Readonly<{
		readonly caption: string
		readonly link: string
	}>
	readonly principle: Readonly<{
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
			'Relationships, writes, validation, security, and types each have a clear place in the application graph.',
		featureLink: 'Explore',
		index: '03 / The details',
		title: 'The same rules reach the hard parts.',
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
			'Define schemas and choose plugins in TypeScript. Direct calls, REST, and GraphQL share one Runtime.',
		firstLine: 'One graph.',
		note: 'Node.js 24+ · TypeScript · Apache-2.0',
		primaryAction: 'Start building',
		secondLine: 'Every API.',
		secondaryAction: 'View on GitHub',
		status: `${siteConfig.releaseStatus} · open source`,
	},
	preview: {
		caption:
			'One schema and two explicit plugins. No generated Runtime client.',
		link: 'Explore the application graph',
	},
	principle: {
		description:
			'Choose the capabilities that belong in your application. Each plugin declares its contribution and the privileges or environmental access it needs. Remove it, and its behavior goes with it.',
		index: '01 / Explicit composition',
		title: 'A small core. A deliberate stack.',
	},
	status: {
		description:
			'UltimaBase is in active pre-release development. Explore the API, read the release status, and help shape what comes next.',
		eyebrow: 'Build with us',
		primaryAction: 'Read Manual Installation',
		title: 'Build on a contract you can inspect.',
	},
})
