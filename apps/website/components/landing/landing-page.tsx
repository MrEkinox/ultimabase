import {
	ArrowDown,
	ArrowRight,
	ArrowUpRight,
	Blocks,
	Braces,
} from 'lucide-react'

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
					<span className="ub-equation-label">YOUR APPLICATION</span>
					<div className="ub-equation-schema">
						<div className="ub-equation-card-heading">
							<Braces />
							<strong>Your schemas</strong>
						</div>
						<div className="ub-equation-items">
							<span>Article</span>
							<span>Author</span>
							<span>…</span>
						</div>
					</div>
					<div className="ub-equation-connector">
						<span>+</span>
					</div>
					<div className="ub-equation-plugins">
						<div className="ub-equation-card-heading">
							<Blocks />
							<strong>Your plugins</strong>
						</div>
						<div className="ub-equation-items">
							<span>PostgreSQL</span>
							<span>REST</span>
							<span>GraphQL</span>
							<span>Password auth</span>
							<span>Hooks</span>
							<span className="ub-equation-custom">+ Your own</span>
						</div>
					</div>
					<div className="ub-equation-result">
						<ArrowDown />
						<strong>Typed data APIs</strong>
					</div>
				</div>
				<ApplicationProof />
			</Section>

			<Section
				className="ub-intro"
				aria-label="Built for TypeScript developers"
			>
				<p>
					For <strong>TypeScript</strong> teams building on relational data.
					<br />
					<strong>Define your business rules once</strong>, and apply them
					across <strong>TypeScript</strong>, <strong>REST</strong>, and{' '}
					<strong>GraphQL</strong>.
				</p>
				<TextLink href={siteConfig.routes.docs}>
					Explore the documentation <ArrowUpRight aria-hidden="true" />
				</TextLink>
			</Section>

			<Section className="ub-capability-navigation">
				<nav aria-label="Explore product capabilities">
					<a href="#application-setup">
						Plugins & APIs <ArrowRight aria-hidden="true" />
					</a>
					<a href="#data-modeling">
						Data modeling <ArrowRight aria-hidden="true" />
					</a>
					<a href="#identity-and-access">
						Authentication & access <ArrowRight aria-hidden="true" />
					</a>
					<a href="#business-behavior">
						Extensions <ArrowRight aria-hidden="true" />
					</a>
				</nav>
			</Section>

			<Section
				className="ub-landing-composition"
				id="application-setup"
				aria-label="Example application configuration"
			>
				<div className="ub-composition-copy">
					<p className="ub-section-label">Plugins</p>
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

			<Section className="ub-landing-start" aria-labelledby="start-title">
				<div>
					<h2 id="start-title">Build your first backend.</h2>
					<p>
						Start with a working application. Explore its schemas, plugins, and
						APIs.
					</p>
				</div>
				<div className="ub-start-actions">
					<ButtonLink external href={siteConfig.sourceExampleUrl.href}>
						Open the example <ArrowUpRight aria-hidden="true" />
					</ButtonLink>
					<ButtonLink
						href={currentDocumentationPath('manual-installation')}
						variant="secondary"
					>
						Installation guide <ArrowRight aria-hidden="true" />
					</ButtonLink>
				</div>
				<p className="ub-start-status">
					<span>Apache-2.0</span>
					<span aria-hidden="true">·</span>
					<TextLink href={siteConfig.routes.releaseStatus}>
						Pre-release
					</TextLink>
				</p>
			</Section>
		</div>
	)
}
