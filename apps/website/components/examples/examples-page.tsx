import Link from 'next/link'

import { siteConfig } from '../../lib/site'
import {
	ButtonLink,
	Callout,
	CodeSurface,
	Eyebrow,
	Section,
} from '../primitives'
import {
	exampleScenarios,
	exampleSourceUrl,
	minimalExampleCommand,
} from './content'
import type { ExampleScenario } from './types'

const startCommand = `corepack yarn build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_minimal \\
ULTIMABASE_MASTER_KEY=development-only-secret \\
  ${minimalExampleCommand}`

const endpointRows = [
	['REST base', 'http://127.0.0.1:1337/api/v1'],
	['GraphQL', 'POST http://127.0.0.1:1337/graphql'],
	['Application header', 'X-UltimaBase-Application-Id: minimal'],
] as const

export function ExamplesIndexPage() {
	return (
		<div className="ub-examples">
			<Section className="ub-examples-hero">
				<div>
					<Eyebrow>Maintained · runnable · source-linked</Eyebrow>
					<h1>Learn from the application we actually test.</h1>
					<p className="ub-lede">
						Seven short journeys explain the maintained minimal application.
						Every path points back to the exact repository source and the
						canonical documentation behind it.
					</p>
					<div className="ub-action-row">
						<ButtonLink href="/examples/model-the-schema">
							Start the first journey
						</ButtonLink>
						<ButtonLink
							external
							href={`${siteConfig.repositoryUrl.href}/tree/main/examples/minimal`}
							variant="secondary"
						>
							Open the complete example
						</ButtonLink>
					</div>
				</div>
				<div className="ub-example-facts" aria-label="Example facts">
					<p>Example 01</p>
					<strong>
						@ultimabase/
						<wbr />
						example-minimal
					</strong>
					<span>PostgreSQL · REST · GraphQL · Password Auth</span>
				</div>
			</Section>

			<Section className="ub-example-start">
				<div className="ub-example-start-copy">
					<p className="ub-section-index">Run the maintained application</p>
					<h2>One local server. No website-only fork.</h2>
					<p>
						Use Node.js 24+, Corepack, and PostgreSQL 17. From a built checkout,
						the command starts the exact application exercised by repository E2E
						tests.
					</p>
					<dl className="ub-endpoint-list">
						{endpointRows.map(([term, value]) => (
							<div key={term}>
								<dt>{term}</dt>
								<dd>{value}</dd>
							</div>
						))}
					</dl>
				</div>
				<CodeSurface code={startCommand} label="terminal" language="Shell" />
			</Section>

			<Section className="ub-example-boundary" width="reading">
				<Callout title="Pre-release and local-development boundaries">
					The example uses a destructive <code>schemaPolicy: 'override'</code>,
					a development-only Master key, and repository workspace packages. Keep
					the key on the server, use a disposable database, and follow the
					installation guide when consuming published packages from another
					project.
				</Callout>
				<div className="ub-source-legend" aria-label="Source label meanings">
					<div>
						<strong>Application code</strong>
						<span>Copyable framework composition.</span>
					</div>
					<div>
						<strong>Repository instructions</strong>
						<span>Commands for this monorepo checkout.</span>
					</div>
					<div>
						<strong>Test helper</strong>
						<span>Evidence, not a browser-safe client API.</span>
					</div>
				</div>
			</Section>

			<Section className="ub-example-journeys">
				<div className="ub-section-heading">
					<div>
						<p className="ub-section-index">Choose a journey</p>
						<h2>From graph to production boundaries.</h2>
					</div>
					<p>
						Read in order for a complete path, or enter at the task you need.
					</p>
				</div>
				<ol className="ub-example-grid">
					{exampleScenarios.map((scenario) => (
						<li key={scenario.slug}>
							<Link href={`/examples/${scenario.slug}`}>
								<span>{scenario.index}</span>
								<h3>{scenario.title}</h3>
								<p>{scenario.summary}</p>
								<strong>Open journey →</strong>
							</Link>
						</li>
					))}
				</ol>
			</Section>
		</div>
	)
}

interface ExampleScenarioPageProps {
	readonly scenario: ExampleScenario
}

export function ExampleScenarioPage({ scenario }: ExampleScenarioPageProps) {
	const currentIndex = exampleScenarios.findIndex(
		(entry) => entry.slug === scenario.slug,
	)
	const nextScenario = exampleScenarios[currentIndex + 1]

	return (
		<article className="ub-example-detail">
			<Section className="ub-example-detail-hero">
				<div>
					<Link className="ub-example-back" href="/examples">
						← All examples
					</Link>
					<Eyebrow>
						Journey {scenario.index} /{' '}
						{String(exampleScenarios.length).padStart(2, '0')}
					</Eyebrow>
					<h1>{scenario.title}</h1>
					<p className="ub-lede">{scenario.summary}</p>
				</div>
				<aside>
					<span>Outcome</span>
					<p>{scenario.outcome}</p>
				</aside>
			</Section>

			<Section className="ub-example-workflow">
				<div>
					<p className="ub-section-index">Shortest path</p>
					<ol>
						{scenario.steps.map((step) => (
							<li key={step}>{step}</li>
						))}
					</ol>
				</div>
				<CodeSurface code={scenario.code} label={scenario.codeLabel} />
			</Section>

			<Section className="ub-example-evidence">
				<div>
					<p className="ub-section-index">Maintained source</p>
					<h2>Inspect the code behind this journey.</h2>
				</div>
				<ul className="ub-source-list">
					{scenario.sources.map((source) => (
						<li key={`${source.path}:${String(source.startLine)}`}>
							<span>{source.kind}</span>
							<a
								href={exampleSourceUrl(source)}
								rel="noreferrer"
								target="_blank"
							>
								<strong>{source.label}</strong>
								<code>
									{source.path}:{source.startLine}–{source.endLine}
								</code>
							</a>
						</li>
					))}
				</ul>
			</Section>

			<Section className="ub-example-related">
				<p className="ub-section-index">Understand the contract</p>
				<div className="ub-related-grid">
					{scenario.documentation.map((link) => (
						<Link href={link.href} key={link.href}>
							<span>{link.kind}</span>
							<strong>{link.label}</strong>
						</Link>
					))}
				</div>
				{nextScenario === undefined ? (
					<ButtonLink href="/docs/operations/production-checklist">
						Continue to production readiness
					</ButtonLink>
				) : (
					<ButtonLink href={`/examples/${nextScenario.slug}`}>
						Next: {nextScenario.title}
					</ButtonLink>
				)}
			</Section>
		</article>
	)
}
