import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'
import Image from 'next/image'

import { currentDocumentationPath } from '../../lib/docs-versions'
import { siteConfig } from '../../lib/site'
import { ButtonLink, Eyebrow, Section, TextLink } from '../primitives'
import { ArchitectureFlow } from './architecture-flow'
import { applicationExample, landingCopy } from './content'

export function LandingPage() {
	const copy = landingCopy
	return (
		<div className="ub-landing">
			<Section className="ub-landing-hero">
				<div className="ub-landing-hero-copy">
					<Eyebrow className="ub-landing-hero-kicker">
						<span aria-hidden="true" className="ub-landing-status-dot" />
						{copy.hero.status}
					</Eyebrow>
					<h1>
						<span>{copy.hero.firstLine}</span>
						<span className="ub-landing-hero-second-line">
							{copy.hero.secondLine}
						</span>
					</h1>
					<p className="ub-lede">{copy.hero.description}</p>
					<div className="ub-action-row">
						<ButtonLink href={siteConfig.routes.gettingStarted}>
							{copy.hero.primaryAction}
						</ButtonLink>
						<ButtonLink
							external
							href={siteConfig.repositoryUrl.href}
							variant="secondary"
						>
							{copy.hero.secondaryAction}
						</ButtonLink>
					</div>
					<p className="ub-hero-note">{copy.hero.note}</p>
				</div>
			</Section>

			<Section
				className="ub-landing-preview"
				aria-label="Example application configuration"
			>
				<div className="ub-preview" data-testid="visual-system-motion">
					<div className="ub-preview-topline">
						<span className="ub-preview-window-controls" aria-hidden="true">
							<i />
							<i />
							<i />
						</span>
						<span>01 / A real application</span>
						<span>Schema + explicit plugins</span>
					</div>
					<div className="ub-preview-body">
						<div className="ub-preview-code">
							<ServerCodeBlock
								code={applicationExample}
								lang="ts"
								themes={{ light: 'github-dark', dark: 'github-dark' }}
								codeblock={{
									className: 'ub-preview-codeblock',
									title: 'src/application.ts',
								}}
							/>
						</div>
						<div className="ub-preview-aside">
							<p className="ub-preview-aside-index">Configured, not assumed</p>
							<h2>{copy.preview.title}</h2>
							<p>{copy.preview.description}</p>
							<Image
								alt=""
								className="ub-preview-graph"
								height={270}
								src="/landing/application-graph.svg"
								unoptimized
								width={440}
							/>
							<ol
								className="ub-preview-inventory"
								aria-label="Configured parts"
							>
								<li>
									<span>01 / Schema</span>
									<strong>Article</strong>
									<small>slug · title</small>
								</li>
								<li>
									<span>02 / Plugin</span>
									<strong>PostgreSQL</strong>
									<small>Persistence</small>
								</li>
								<li>
									<span>03 / Plugin</span>
									<strong>Typegen</strong>
									<small>Declarations</small>
								</li>
							</ol>
						</div>
					</div>
					<div className="ub-preview-footer">
						<p>{copy.preview.caption}</p>
						<TextLink href={currentDocumentationPath('core/application')}>
							{copy.preview.link} <span aria-hidden="true">↗</span>
						</TextLink>
					</div>
				</div>
			</Section>

			<Section className="ub-landing-principle">
				<div className="ub-landing-principle-heading">
					<p className="ub-section-index">{copy.principle.index}</p>
					<h2>{copy.principle.title}</h2>
				</div>
				<div className="ub-landing-principle-detail">
					<p>{copy.principle.description}</p>
					<ol className="ub-composition-layers">
						{copy.principle.layers.map((layer, index) => (
							<li key={layer.label}>
								<span>{String(index + 1).padStart(2, '0')}</span>
								<strong>{layer.label}</strong>
								<small>{layer.description}</small>
							</li>
						))}
					</ol>
				</div>
			</Section>

			<Section className="ub-landing-flow">
				<ArchitectureFlow copy={copy.flow} />
			</Section>

			<Section className="ub-landing-evidence">
				<div className="ub-section-heading">
					<div>
						<p className="ub-section-index">{copy.evidence.index}</p>
						<h2>{copy.evidence.title}</h2>
					</div>
					<p>{copy.evidence.description}</p>
				</div>
				<ol className="ub-feature-list">
					{copy.features.map((feature) => (
						<li key={feature.index}>
							<span>{feature.index}</span>
							<div>
								<h3>{feature.title}</h3>
								<p>{feature.description}</p>
							</div>
							<TextLink href={feature.href}>
								{copy.evidence.featureLink}
							</TextLink>
						</li>
					))}
				</ol>
			</Section>

			<Section className="ub-landing-status">
				<div className="ub-landing-status-main">
					<Eyebrow>{copy.status.eyebrow}</Eyebrow>
					<h2>{copy.status.title}</h2>
					<p>{copy.status.description}</p>
					<div className="ub-action-row">
						<ButtonLink href={siteConfig.routes.gettingStarted}>
							{copy.status.primaryAction}
						</ButtonLink>
					</div>
				</div>
				<nav
					aria-label="Project information"
					className="ub-landing-project-links"
				>
					<TextLink href={siteConfig.routes.releaseStatus}>
						Release status
					</TextLink>
					<TextLink href={siteConfig.routes.roadmap}>Roadmap</TextLink>
					<TextLink href={siteConfig.routes.contributing}>
						Contributing
					</TextLink>
				</nav>
			</Section>
		</div>
	)
}
