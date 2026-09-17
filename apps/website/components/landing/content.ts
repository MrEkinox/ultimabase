import { currentDocumentationPath } from '../../lib/docs-versions'
import { siteConfig } from '../../lib/site'

export interface LandingFeature {
	readonly description: string
	readonly href: string
	readonly index: string
	readonly linkLabel: string
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
			'Define schemas and queries in UltimaBase. The PostgreSQL plugin handles storage without making your application use Drizzle.',
		href: currentDocumentationPath('plugins/official/postgresql'),
		index: '01',
		linkLabel: 'Read the PostgreSQL guide',
		title: 'PostgreSQL behind a plugin',
	},
	{
		description:
			'A mutation and the database work started by its hooks commit or roll back together.',
		href: currentDocumentationPath('core/writing-data/transactions'),
		index: '02',
		linkLabel: 'Read about transactions',
		title: 'Transactions around writes',
	},
	{
		description:
			'Define pointers and relations once, then use them in reads and nested writes across enabled entry points.',
		href: currentDocumentationPath('core/data-modeling/relationships'),
		index: '03',
		linkLabel: 'Read about relationships',
		title: 'Relationships across entry points',
	},
	{
		description:
			'Core checks data structure. Add the Validation plugin when your application needs its own field rules.',
		href: currentDocumentationPath('plugins/official/validation'),
		index: '04',
		linkLabel: 'Read the Validation guide',
		title: 'Validation you can extend',
	},
	{
		description:
			'Authentication identifies callers. Optional Access and ACL plugins enforce authorization; roles can inform those policies.',
		href: currentDocumentationPath('core/security-foundations/security-model'),
		index: '05',
		linkLabel: 'Read the security model',
		title: 'Identity separate from permissions',
	},
	{
		description:
			'Optional Typegen emits replaceable TypeScript declarations for autocomplete. Your application runs without a generated client.',
		href: currentDocumentationPath('guides/generate-types'),
		index: '06',
		linkLabel: 'Read the Typegen guide',
		title: 'Types without a generated client',
	},
])

export const landingCopy: LandingCopy = Object.freeze({
	evidence: {
		description:
			'Start with schema-backed reads and writes. Add relationships, validation, and security without building a separate path for each API.',
		index: '03 / Capabilities',
		title: 'More than basic data operations.',
	},
	features: landingFeatures,
	flow: {
		connector: 'shared operation',
		description:
			'When you add REST or GraphQL, their requests enter the same operation pipeline as direct TypeScript calls. Core validation and mutation transactions stay consistent; installed policy and Hooks plugins join that path.',
		entryPointsLabel: 'Application entry points',
		index: '02 / One execution model',
		inputs: [
			{ detail: 'Direct schema and Query calls', label: 'TypeScript' },
			{ detail: 'Routes from an optional plugin', label: 'REST' },
			{
				detail: 'Queries and mutations from an optional plugin',
				label: 'GraphQL',
			},
		],
		stages: [
			'Normalize the request',
			'Validate and apply installed policies',
			'Run installed hooks and write transactions',
			'Read or write through PostgreSQL',
		],
		stagesLabel: 'Shared runtime stages',
		title: 'Three ways in. One execution path.',
	},
	hero: {
		description:
			'UltimaBase is a TypeScript backend framework. Define schemas; plugins add storage, REST, and GraphQL.',
		firstLine: 'Typed APIs.',
		note: 'Node.js 24+ · TypeScript · Apache-2.0',
		primaryAction: 'Explore the docs',
		secondLine: 'One model.',
		secondaryAction: 'View on GitHub',
		status: `${siteConfig.releaseStatus} · open source`,
	},
	preview: {
		caption: 'Typegen adds editor types; it is not required to run the app.',
		link: 'How application assembly works',
	},
	principle: {
		description:
			'An UltimaBase application combines your schemas with only the capabilities you install. This example stores Article records in PostgreSQL and generates TypeScript declarations. Add REST, GraphQL, or security plugins when you need them.',
		index: '01 / How it works',
		title: 'One schema. The plugins you choose.',
	},
	status: {
		description:
			'The packages are not published on npm yet. Run the maintained repository example to see PostgreSQL, REST, and GraphQL working together, then check Release Status before adopting the framework.',
		eyebrow: 'Pre-release',
		primaryAction: 'Open the runnable example',
		title: 'Try UltimaBase from source.',
	},
})
