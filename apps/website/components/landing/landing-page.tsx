import { siteConfig } from '../../lib/site'
import {
	ButtonLink,
	Callout,
	CodeSurface,
	Eyebrow,
	Section,
	TextLink,
} from '../primitives'
import { ArchitectureFlow } from './architecture-flow'
import {
	applicationExample,
	landingFeatures,
	minimalExampleUrl,
} from './content'

export function LandingPage() {
	return (
		<div className="ub-landing">
			<Section className="ub-landing-hero">
				<div className="ub-landing-hero-copy">
					<Eyebrow>{siteConfig.releaseStatus} · open source</Eyebrow>
					<h1>Define your data once. Keep every API honest.</h1>
					<p className="ub-lede">
						UltimaBase turns static TypeScript schemas and explicit plugins into
						one application graph. Direct calls, REST, and GraphQL execute
						through the same typed Runtime.
					</p>
					<div className="ub-action-row">
						<ButtonLink href={siteConfig.routes.gettingStarted}>
							Start building
						</ButtonLink>
						<ButtonLink
							external
							href={siteConfig.repositoryUrl.href}
							variant="secondary"
						>
							View on GitHub
						</ButtonLink>
					</div>
					<p className="ub-hero-note">Node.js 24+ · TypeScript · Apache-2.0</p>
				</div>

				<CodeSurface
					code={applicationExample}
					label="schema-and-application.ts"
				/>
			</Section>

			<Section className="ub-landing-principle" width="reading">
				<p className="ub-section-index">01 / Explicit composition</p>
				<h2>Core stays small. Capabilities stay visible.</h2>
				<p>
					PostgreSQL, transports, authentication, validation, Access, Hooks, and
					developer tooling are installed as plugins. Each one declares what it
					contributes and which privileges or environmental access it needs.
				</p>
				<Callout title="No hidden framework mode">
					Remove a plugin and its behavior disappears. Core does not install a
					neutral imitation or silently choose a replacement.
				</Callout>
			</Section>

			<Section className="ub-landing-flow">
				<ArchitectureFlow />
			</Section>

			<Section className="ub-landing-evidence">
				<div className="ub-section-heading">
					<div>
						<p className="ub-section-index">03 / Shipped foundations</p>
						<h2>Built for the parts that become difficult later.</h2>
					</div>
					<p>
						The framework is pre-release, but these contracts are implemented
						and covered across the public execution paths.
					</p>
				</div>
				<ol className="ub-feature-list">
					{landingFeatures.map((feature) => (
						<li key={feature.index}>
							<span>{feature.index}</span>
							<div>
								<h3>{feature.title}</h3>
								<p>{feature.description}</p>
							</div>
							<TextLink href={feature.href}>Read the contract</TextLink>
						</li>
					))}
				</ol>
			</Section>

			<Section className="ub-landing-status" width="reading">
				<Eyebrow>Honest by default</Eyebrow>
				<h2>Active pre-release development.</h2>
				<p>
					The architecture is substantial and the API is usable. Expect
					deliberate change while the first stable release contract is
					finalized.
				</p>
				<div className="ub-action-row">
					<ButtonLink href={siteConfig.routes.gettingStarted}>
						Read Getting Started
					</ButtonLink>
					<ButtonLink external href={minimalExampleUrl} variant="secondary">
						Inspect the runnable example
					</ButtonLink>
				</div>
			</Section>
		</div>
	)
}
