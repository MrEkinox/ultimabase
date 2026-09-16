import { currentDocumentationPath } from '../../lib/docs-versions'
import { siteConfig } from '../../lib/site'

export const statusPageSlugs = [
	'release-status',
	'roadmap',
	'contributing',
] as const

export type StatusPageSlug = (typeof statusPageSlugs)[number]

export interface StatusItem {
	readonly description: string
	readonly external?: boolean
	readonly href?: string
	readonly title: string
}

export interface StatusSection {
	readonly body: string
	readonly index: string
	readonly items: readonly StatusItem[]
	readonly title: string
}

export interface StatusAction {
	readonly external?: boolean
	readonly href: string
	readonly title: string
}

export interface StatusPageContent {
	readonly description: string
	readonly eyebrow: string
	readonly primaryAction: StatusAction
	readonly sections: readonly StatusSection[]
	readonly slug: StatusPageSlug
	readonly summary: string
	readonly title: string
}

const repositoryFile = (path: string): string =>
	new URL(`blob/main/${path}`, `${siteConfig.repositoryUrl.href}/`).href

const repositoryTree = (path: string): string =>
	new URL(`tree/main/${path}`, `${siteConfig.repositoryUrl.href}/`).href

export const statusPages: readonly StatusPageContent[] = Object.freeze([
	{
		description:
			'What you can evaluate today, and which promises deliberately wait for a stable release.',
		eyebrow: 'Release status',
		primaryAction: {
			href: currentDocumentationPath(),
			title: 'Evaluate the framework',
		},
		sections: [
			{
				body: 'The repository implements a substantial end-to-end framework and verifies it continuously. Pre-release means the public contract can still change deliberately before the first stable line.',
				index: '01 / Available now',
				items: [
					{
						description:
							'Static schemas, immutable queries and models, shared Runtime execution, transactions, and PostgreSQL persistence are implemented.',
						href: currentDocumentationPath(),
						title: 'Application foundations',
					},
					{
						description:
							'Validation, Hooks, Access, Roles, ACL, authentication, transports, explorers, and tooling are explicit optional packages.',
						href: currentDocumentationPath('plugins/overview'),
						title: 'Official plugin system',
					},
					{
						description:
							'Direct TypeScript, experimental REST v1, and GraphQL share the same operation and policy path.',
						href: currentDocumentationPath(
							'core/application/direct-typescript',
						),
						title: 'Public execution paths',
					},
				],
				title: 'A real framework, still before 1.0',
			},
			{
				body: 'Documentation uses the intended npm package names so applications can be prepared for distribution. Verify the package channel you install; this site does not announce a stable release or compatibility window.',
				index: '02 / Installation contract',
				items: [
					{
						description:
							'Package changes use Changesets, independent SemVer, archive validation, and an approval-gated release workflow.',
						external: true,
						href: repositoryFile('docs/RELEASING.md'),
						title: 'Release process',
					},
					{
						description:
							'Documentation samples use package roots and are marked pre-release; generated declarations never become Runtime truth.',
						href: currentDocumentationPath('getting-started/installation'),
						title: 'Intended npm experience',
					},
				],
				title: 'Prepared for packages, not claiming a stable channel',
			},
			{
				body: 'No release date, long-term support window, migration guarantee, hosted service, or production support commitment has been announced. Adopt with that change budget in mind.',
				index: '03 / Not promised yet',
				items: [
					{
						description:
							'The active package line already has an explicit documentation version. Additional maintained lines will appear in the same selector without changing older URLs.',
						external: true,
						href: repositoryFile('CONTRIBUTING.md'),
						title: 'Versioned documentation policy',
					},
					{
						description:
							'The roadmap is issue-driven and intentionally carries no delivery dates.',
						href: '/status/roadmap',
						title: 'Roadmap policy',
					},
				],
				title: 'Plan for deliberate pre-release change',
			},
		],
		slug: 'release-status',
		summary:
			'UltimaBase is in active pre-release development. Its documented foundations are implemented and tested, while naming, compatibility, publication, and launch decisions remain provisional.',
		title: 'Built enough to evaluate. Early enough to change.',
	},
	{
		description:
			'How completed foundations, active work, and future ideas are separated without invented dates.',
		eyebrow: 'Roadmap',
		primaryAction: {
			external: true,
			href: repositoryTree('issues'),
			title: 'Browse the issue roadmap',
		},
		sections: [
			{
				body: 'The framework already has a complete typed path from static schema declarations through Runtime and PostgreSQL, plus sibling REST and GraphQL transports.',
				index: '01 / Completed foundations',
				items: [
					{
						description:
							'Schemas, Query, immutable models, application compilation, plugin capabilities, validation, policy, Hooks, and transaction invariants.',
						href: currentDocumentationPath(
							'core/application/application-graph',
						),
						title: 'Core and plugin kernel',
					},
					{
						description:
							'PostgreSQL, HTTP application selection, REST, Password Auth, GraphQL, Yoga, and optional explorers.',
						href: currentDocumentationPath('plugins/overview'),
						title: 'Public verticals',
					},
					{
						description:
							'Nested writes, contextual fields and relations, plugin schema mutations, and official soft deletion.',
						href: currentDocumentationPath('guides/write-nested-data'),
						title: 'Recent data capabilities',
					},
				],
				title: 'Shipped means completed and verified',
			},
			{
				body: 'The issue backlog is the executable roadmap. A milestone explains intent, and each small issue records dependencies, scope, acceptance criteria, and completion evidence.',
				index: '02 / How work advances',
				items: [
					{
						description:
							'Only ready work with completed dependencies can begin. One issue stays the unit of implementation and review.',
						external: true,
						href: repositoryFile('issues/README.md'),
						title: 'Issue contract',
					},
					{
						description:
							'Architecture decisions are proposed before public boundaries, storage, dependency direction, or security semantics change.',
						href: currentDocumentationPath('reference/architecture-decisions'),
						title: 'Decision discipline',
					},
				],
				title: 'Small issues turn intent into evidence',
			},
			{
				body: 'Realtime, jobs, cache, additional authentication integrations, OpenAPI, SDKs, administration, and other ecosystem work remain possible issue-tracked capabilities — not features this page promises or dates.',
				index: '03 / Future work',
				items: [
					{
						description:
							'Planned and deferred issues preserve intent. Their acceptance criteria may still evolve before implementation begins.',
						external: true,
						href: repositoryFile('ROADMAP.md'),
						title: 'Milestone intent',
					},
					{
						description:
							'Use the release-status page, not a planned issue, to decide what can be evaluated today.',
						href: '/status/release-status',
						title: 'Current maturity',
					},
				],
				title: 'Planned is not shipped',
			},
		],
		slug: 'roadmap',
		summary:
			'UltimaBase plans through a dependency-checked issue backlog. Completed issues are evidence; planned issues are direction, not delivery commitments.',
		title: 'Evidence first. Milestones second. Dates never invented.',
	},
	{
		description:
			'The shortest path from one scoped issue to a verified contribution and current public documentation.',
		eyebrow: 'Contributing',
		primaryAction: {
			external: true,
			href: repositoryFile('CONTRIBUTING.md'),
			title: 'Read the contribution guide',
		},
		sections: [
			{
				body: 'Start from one ready issue, verify its dependencies, and keep implementation, tests, examples, and documentation in the same focused change.',
				index: '01 / Choose a unit of work',
				items: [
					{
						description:
							'Read the repository guide, active plan, package contracts, and relevant architecture decisions before changing code.',
						external: true,
						href: repositoryFile('AGENTS.md'),
						title: 'Understand the contract',
					},
					{
						description:
							'Confirm that the selected issue is ready and every dependency is terminal before implementation.',
						external: true,
						href: repositoryTree('issues'),
						title: 'Pick one ready issue',
					},
				],
				title: 'One issue, one coherent change',
			},
			{
				body: 'Public behavior, types, and failure paths need proportionate evidence. Use Vitest, add compile-time coverage for generic public APIs, and run focused checks before broader repository gates.',
				index: '02 / Prove the result',
				items: [
					{
						description:
							'Runtime tests, type tests, package-root export checks, immutable-builder coverage, and PostgreSQL integration tests protect different boundaries.',
						href: currentDocumentationPath('guides/test-an-application'),
						title: 'Test the public behavior',
					},
					{
						description:
							'Run typecheck, tests, lint, and build as justified by the scope, and record anything that could not run.',
						external: true,
						href: repositoryFile('CONTRIBUTING.md#definition-of-done'),
						title: 'Meet the definition of done',
					},
				],
				title: 'Verification is part of implementation',
			},
			{
				body: 'Every change classifies documentation impact as none, internal engineering documentation, public website documentation, or both. Public behavior and contracts normally require a website review in the same issue.',
				index: '03 / Keep readers current',
				items: [
					{
						description:
							'Compiled samples, ownership checks, and links catch mechanical drift; humans remain responsible for semantic accuracy.',
						href: currentDocumentationPath('guides/test-an-application'),
						title: 'Review documentation impact',
					},
					{
						description:
							'Pull requests explain the issue, architecture impact, documentation classification, tests, and any temporary compromise.',
						external: true,
						href: `${siteConfig.repositoryUrl.href}/pulls`,
						title: 'Open a focused pull request',
					},
				],
				title: 'Code and documentation move together',
			},
		],
		slug: 'contributing',
		summary:
			'Contributions are issue-scoped, dependency-aware, tested against public boundaries, and responsible for keeping reader documentation aligned with code.',
		title: 'Make one change easy to understand and trust.',
	},
])

export function isStatusPageSlug(value: string): value is StatusPageSlug {
	return statusPageSlugs.some((slug) => slug === value)
}

export function getStatusPage(slug: StatusPageSlug): StatusPageContent {
	const page = statusPages.find((candidate) => candidate.slug === slug)
	if (page === undefined) {
		throw new TypeError(`Unknown status page: ${slug}`)
	}
	return page
}
