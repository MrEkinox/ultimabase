import { ArrowRight, ArrowUpRight } from 'lucide-react'

import { currentDocumentationPath } from '../../lib/docs-versions'
import { siteConfig } from '../../lib/site'
import { ButtonLink, Section, TextLink } from '../primitives'
import { ApplicationProof } from './application-proof'
import { ArchitectureFlow } from './architecture-flow'
import { pluginGroups } from './content'
import { DataCapabilities, WriteCapabilities } from './data-capabilities'
import { IdentityCapabilities } from './identity-capabilities'
import { ExtensionCapabilities } from './extension-capabilities'
import { TransactionProof } from './transaction-proof'
import { PluginComposition } from './plugin-composition'
import { LandingFaq } from './landing-faq'

export function LandingPage() {
	return (
		<div className="ub-landing">
			<Section className="ub-landing-hero">
				<div className="ub-landing-hero-copy">
					<p className="ub-landing-kicker">TypeScript backend framework</p>
					<h1>
						Your data model.
						<br />
						<span>A working backend.</span>
					</h1>
					<p className="ub-lede">
						Define your schemas in TypeScript. Query your data with typed APIs.
						<br className="ub-desktop-break" /> Extend your backend with plugins
						for PostgreSQL, REST, GraphQL, authentication, and more—or build
						your own.
					</p>
					<div className="ub-action-row">
						<ButtonLink href={currentDocumentationPath('manual-installation')}>
							Start building <ArrowRight aria-hidden="true" />
						</ButtonLink>
						<ButtonLink
							external
							href={siteConfig.sourceExampleUrl.href}
							variant="secondary"
						>
							View runnable example <ArrowUpRight aria-hidden="true" />
						</ButtonLink>
					</div>
					<p className="ub-hero-note">
						<span className="ub-status-dot" /> Open source · Pre-release{' '}
						<span aria-hidden="true">/</span> Node.js 24+
						<span className="ub-unpublished-note">
							Packages are not published on npm yet.
						</span>
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
					For TypeScript teams building with relational data. Keep
					<strong> queries and business rules together</strong>, and choose the
					plugins your application needs.
				</p>
				<TextLink href={siteConfig.routes.docs}>
					Explore the documentation <ArrowUpRight aria-hidden="true" />
				</TextLink>
			</Section>

			<Section className="ub-capability-navigation">
				<nav aria-label="Explore product capabilities">
					<a href="#application-setup">
						<span>
							<small>OFFICIAL PLUGINS</small>
							<strong>Plugins & APIs</strong>
							<span>PostgreSQL storage. REST and GraphQL APIs.</span>
						</span>
						<ArrowRight aria-hidden="true" />
					</a>
					<a href="#data-modeling">
						<span>
							<small>CORE</small>
							<strong>Typed models & queries</strong>
							<span>Relations, computed fields, reusable queries.</span>
						</span>
						<ArrowRight aria-hidden="true" />
					</a>
					<a href="#identity-and-access">
						<span>
							<small>OFFICIAL PLUGINS</small>
							<strong>Authentication & access</strong>
							<span>Sessions, row filters, field rules and ACLs.</span>
						</span>
						<ArrowRight aria-hidden="true" />
					</a>
					<a href="#business-behavior">
						<span>
							<small>PLUGIN EXTENSIONS</small>
							<strong>Your business logic</strong>
							<span>Transactional hooks and custom operations.</span>
						</span>
						<ArrowRight aria-hidden="true" />
					</a>
				</nav>
			</Section>

			<Section
				className="ub-landing-composition"
				id="application-setup"
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
						PostgreSQL stores your data. Typegen generates your application’s
						types, without a generated runtime client.
					</p>
					<TextLink href={currentDocumentationPath('core/application')}>
						Configure an application <ArrowUpRight aria-hidden="true" />
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
				<PluginComposition />
			</Section>

			<Section className="ub-landing-flow">
				<ArchitectureFlow />
			</Section>

			<Section className="ub-landing-details">
				<TransactionProof />
				<WriteCapabilities />
			</Section>

			<IdentityCapabilities />
			<DataCapabilities />
			<ExtensionCapabilities />

			<LandingFaq />

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
