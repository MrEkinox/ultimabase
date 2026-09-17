import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'

import { currentDocumentationPath } from '../../lib/docs-versions'
import { siteConfig } from '../../lib/site'
import { ButtonLink, Eyebrow, Section, TextLink } from '../primitives'
import { ApplicationProof } from './application-proof'
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
						<ButtonLink href={siteConfig.routes.docs}>
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
				<div className="ub-landing-hero-proof">
					<ApplicationProof />
				</div>
			</Section>

			<Section
				className="ub-landing-principle"
				aria-label="Example application configuration"
			>
				<div className="ub-landing-principle-copy">
					<p className="ub-section-index">{copy.principle.index}</p>
					<h2>{copy.principle.title}</h2>
					<p>{copy.principle.description}</p>
					<p className="ub-principle-caption">{copy.preview.caption}</p>
					<TextLink href={currentDocumentationPath('core/application')}>
						{copy.preview.link} <span aria-hidden="true">↗</span>
					</TextLink>
				</div>
				<div className="ub-application-code">
					<ServerCodeBlock
						code={applicationExample}
						lang="ts"
						themes={{ light: 'github-dark', dark: 'github-dark' }}
						codeblock={{
							className: 'ub-application-codeblock',
							title: 'src/application.ts',
						}}
					/>
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
							<TextLink href={feature.href}>{feature.linkLabel}</TextLink>
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
						<ButtonLink external href={siteConfig.sourceExampleUrl.href}>
							{copy.status.primaryAction}
						</ButtonLink>
					</div>
				</div>
			</Section>
		</div>
	)
}
