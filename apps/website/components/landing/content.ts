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
		readonly secondaryAction: string
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
		href: '/docs/guides/validate-input',
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
		href: '/docs/getting-started/project-structure',
		index: '06',
		title: 'Replaceable Typegen declarations',
	},
])

const frenchLandingFeatures: readonly LandingFeature[] = Object.freeze([
	{
		description:
			'Drizzle reste privé tandis que les schémas, requêtes, contraintes et cycles de vie appartiennent au framework.',
		href: '/docs/operations/postgres',
		index: '01',
		title: 'PostgreSQL, sans exposer l’adaptateur',
	},
	{
		description:
			'Chaque mutation et le travail de base de données lancé par ses hooks partagent une transaction automatique.',
		href: '/docs/mutations/transactions',
		index: '02',
		title: 'Transactions automatiques pour les mutations',
	},
	{
		description:
			'Pointeurs typés, relations, inclusions, écritures imbriquées et vues contextuelles suivent un même modèle.',
		href: '/docs/data-modeling/relations',
		index: '03',
		title: 'Des relations au sens unique',
	},
	{
		description:
			'Les contrôles structurels de Core se composent avec la validation applicative Standard Schema optionnelle.',
		href: '/docs/guides/validate-input',
		index: '04',
		title: 'La validation à la bonne frontière',
	},
	{
		description:
			'Authentification, Access, Roles et ACL restent indépendamment retirables et ne peuvent que restreindre.',
		href: '/docs/security/overview',
		index: '05',
		title: 'Des capacités de sécurité explicites',
	},
	{
		description:
			'Les déclarations générées améliorent l’autocomplétion sans devenir la vérité du Runtime ni un client obligatoire.',
		href: '/docs/getting-started/project-structure',
		index: '06',
		title: 'Des déclarations Typegen remplaçables',
	},
])

export const landingCopy: Readonly<Record<'en' | 'fr', LandingCopy>> =
	Object.freeze({
		en: {
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
				primaryAction: 'Read Getting Started',
				secondaryAction: 'Inspect the runnable example',
				title: 'Active pre-release development.',
			},
		},
		fr: {
			evidence: {
				description:
					'Le framework est en préversion, mais ces contrats sont implémentés et couverts sur les points d’entrée publics.',
				featureLink: 'Lire le contrat',
				index: '03 / Fondations disponibles',
				title: 'Pensé pour ce qui devient difficile plus tard.',
			},
			features: frenchLandingFeatures,
			flow: {
				connector: 'une opération',
				description:
					'La syntaxe du transport change. La validation, les règles, les hooks, les transactions et la persistance conservent le même sens.',
				entryPointsLabel: 'Points d’entrée de l’application',
				index: '02 / Un seul modèle d’exécution',
				inputs: [
					{ detail: 'Query immuable et commandes de modèle', label: 'TypeScript' },
					{ detail: 'Protocole de ressources versionné', label: 'REST' },
					{ detail: 'Opérations de schéma et de plugin', label: 'GraphQL' },
				],
				stages: [
					'Normaliser une opération',
					'Valider et autoriser',
					'Exécuter hooks et transaction',
					'Persister dans PostgreSQL',
				],
				stagesLabel: 'Étapes partagées du Runtime',
				title: 'Trois points d’entrée. Un seul Runtime.',
			},
			hero: {
				description:
					'UltimaBase transforme des schémas TypeScript statiques et des plugins explicites en un graphe d’application unique. Les appels directs, REST et GraphQL passent par le même Runtime typé.',
				note: 'Node.js 24+ · TypeScript · Apache-2.0',
				primaryAction: 'Commencer',
				secondaryAction: 'Voir sur GitHub',
				status: 'préversion · open source',
				title: 'Définissez vos données une fois. Gardez des API cohérentes.',
			},
			principle: {
				callout:
					'Retirez un plugin et son comportement disparaît. Core n’installe pas d’imitation neutre et ne choisit jamais silencieusement un remplaçant.',
				calloutTitle: 'Aucun mode caché du framework',
				description:
					'PostgreSQL, transports, authentification, validation, Access, Hooks et outils de développement sont installés comme plugins. Chacun déclare ses contributions, ses privilèges et ses accès à l’environnement.',
				index: '01 / Composition explicite',
				title: 'Core reste réduit. Les capacités restent visibles.',
			},
			status: {
				description:
					'L’architecture est déjà conséquente et l’API utilisable. Des changements volontaires restent possibles avant la finalisation du premier contrat stable.',
				eyebrow: 'Transparent par défaut',
				primaryAction: 'Lire Bien démarrer',
				secondaryAction: 'Voir l’exemple exécutable',
				title: 'Développement actif en préversion.',
			},
		},
	})

export const minimalExampleUrl = new URL(
	'tree/main/examples/minimal',
	`${siteConfig.repositoryUrl.href}/`,
).href
