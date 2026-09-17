import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react'

import { currentDocumentationPath } from '../../lib/docs-versions'
import { siteConfig } from '../../lib/site'
import { ButtonLink, Section, TextLink } from '../primitives'
import { ApplicationProof } from './application-proof'
import { ArchitectureFlow } from './architecture-flow'
import { applicationExample, landingFeatures, pluginGroups } from './content'
import { FeatureVisual } from './feature-visual'

export function LandingPage() {
	return (
		<div className="ub-landing">
			<Section className="ub-landing-hero">
				<div className="ub-landing-hero-copy">
					<p className="ub-landing-kicker">
						<span aria-hidden="true">[ ub ]</span> TypeScript backend framework
					</p>
					<h1>
						Your data model.
						<br />
						<span>A working backend.</span>
					</h1>
					<p className="ub-lede">
						Build typed data APIs from TypeScript schemas.
						<br className="ub-desktop-break" /> Compose the backend you need
						with plugins for PostgreSQL, REST, GraphQL, and more.
					</p>
					<div className="ub-action-row">
						<ButtonLink href={currentDocumentationPath('manual-installation')}>
							Start building <ArrowRight aria-hidden="true" />
						</ButtonLink>
						<ButtonLink
							external
							href={siteConfig.repositoryUrl.href}
							variant="secondary"
						>
							View on GitHub <ArrowUpRight aria-hidden="true" />
						</ButtonLink>
					</div>
					<p className="ub-hero-note">
						<span className="ub-status-dot" /> Open source · Pre-release{' '}
						<span aria-hidden="true">/</span> Node.js 24+
					</p>
				</div>
				<div className="ub-hero-equation" aria-hidden="true">
					<span className="ub-equation-label">THE APPLICATION MODEL</span>
					<span className="ub-equation-schema">
						Your schemas<span>Article · Author · …</span>
					</span>
					<span className="ub-equation-plus">+</span>
					<span className="ub-equation-plugins">
						Your plugins<span>Storage · APIs · Behavior</span>
					</span>
					<span className="ub-equation-result">One backend. Yours.</span>
				</div>
				<ApplicationProof />
			</Section>

			<Section
				className="ub-intro"
				aria-label="Built for TypeScript developers"
			>
				<p>
					UltimaBase turns <strong>TypeScript schemas</strong> into typed data
					APIs. Built for developers working with relational data, it brings
					queries, transactions, and <strong>composable plugins</strong> into
					one backend.
				</p>
				<TextLink href={siteConfig.routes.docs}>
					Explore the docs <ArrowUpRight aria-hidden="true" />
				</TextLink>
			</Section>

			<Section
				className="ub-landing-composition"
				aria-label="Example application configuration"
			>
				<div className="ub-composition-copy">
					<p className="ub-section-index">01 / COMPOSE YOUR BACKEND</p>
					<h2>
						A small core.
						<br />
						Room for your stack.
					</h2>
					<p>
						Schemas, queries, and execution live in Core. Storage, APIs, hooks,
						and authorization come from the plugins you install.
					</p>
					<p>
						This application connects the Article schema to PostgreSQL. Typegen
						generates your application’s types. Your application runs without a
						generated client.
					</p>
					<TextLink href={currentDocumentationPath('core/application')}>
						How application assembly works <ArrowUpRight aria-hidden="true" />
					</TextLink>
					<div className="ub-plugin-directory">
						{pluginGroups.map((group) => (
							<TextLink
								key={group.name}
								href={currentDocumentationPath(group.href)}
							>
								<span>{group.name}</span>
								<strong>{group.detail}</strong>
								<ArrowUpRight aria-hidden="true" />
							</TextLink>
						))}
					</div>
				</div>
				<div className="ub-application-code">
					<div className="ub-code-overline">
						<span>YOUR APPLICATION</span>
						<span>Explicit by design</span>
					</div>
					<ServerCodeBlock
						code={applicationExample}
						lang="ts"
						themes={{ light: 'github-dark', dark: 'github-dark' }}
						codeblock={{
							className: 'ub-application-codeblock',
							title: 'src/application.ts',
						}}
					/>
					<p className="ub-setup-note">
						Checks an existing database schema without changing it. The{' '}
						<TextLink href={currentDocumentationPath('manual-installation')}>
							installation guide
						</TextLink>{' '}
						covers database setup and shutdown.
					</p>
				</div>
			</Section>

			<Section className="ub-landing-flow">
				<ArchitectureFlow />
			</Section>

			<Section className="ub-landing-details">
				<div className="ub-section-heading">
					<p className="ub-section-index">03 / BEYOND CRUD</p>
					<h2>
						The details that make
						<br />a backend hold together.
					</h2>
					<p>From the shape of a result to the boundary of a transaction.</p>
				</div>
				<div className="ub-feature-grid">
					{landingFeatures.map((feature) => (
						<article key={feature.index} className="ub-feature">
							<FeatureVisual kind={feature.kind} />
							<h3>{feature.title}</h3>
							<p>{feature.description}</p>
							<TextLink href={feature.href}>
								{feature.linkLabel} <ArrowUpRight aria-hidden="true" />
							</TextLink>
						</article>
					))}
				</div>
				<p className="ub-validation-note">
					<Check aria-hidden="true" /> Core checks data structure. Add the{' '}
					<TextLink
						href={currentDocumentationPath('plugins/official/validation')}
					>
						Validation plugin
					</TextLink>{' '}
					for your application’s field rules.
				</p>
			</Section>

			<Section className="ub-landing-start">
				<div>
					<p className="ub-section-index">OPEN SOURCE / APACHE-2.0</p>
					<h2>
						Your next backend
						<br />
						starts with a schema.
					</h2>
					<p>
						UltimaBase is in active pre-release development. APIs may change,
						and packages are not published on npm yet. Start with the runnable
						source example.
					</p>
				</div>
				<div className="ub-start-actions">
					<ButtonLink external href={siteConfig.sourceExampleUrl.href}>
						Open the runnable example <ArrowUpRight aria-hidden="true" />
					</ButtonLink>
					<TextLink href={siteConfig.routes.releaseStatus}>
						Read the release status <ArrowRight aria-hidden="true" />
					</TextLink>
				</div>
			</Section>
		</div>
	)
}
