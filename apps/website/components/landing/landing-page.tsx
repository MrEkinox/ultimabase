import { siteConfig } from '../../lib/site'
import { localizePath, type SiteLocale } from '../../lib/i18n'
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
	landingCopy,
	minimalExampleUrl,
} from './content'

export interface LandingPageProps {
	readonly locale: SiteLocale
}

export function LandingPage({ locale }: LandingPageProps) {
	const copy = landingCopy[locale]

	return (
		<div className="ub-landing">
			<Section className="ub-landing-hero">
				<div className="ub-landing-hero-copy">
					<Eyebrow>{copy.hero.status}</Eyebrow>
					<h1>{copy.hero.title}</h1>
					<p className="ub-lede">{copy.hero.description}</p>
					<div className="ub-action-row">
						<ButtonLink href={localizePath(locale, siteConfig.routes.gettingStarted)}>
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

				<CodeSurface
					code={applicationExample}
					label="schema-and-application.ts"
				/>
			</Section>

			<Section className="ub-landing-principle" width="reading">
				<p className="ub-section-index">{copy.principle.index}</p>
				<h2>{copy.principle.title}</h2>
				<p>{copy.principle.description}</p>
				<Callout title={copy.principle.calloutTitle}>
					{copy.principle.callout}
				</Callout>
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
					<p>
						{copy.evidence.description}
					</p>
				</div>
				<ol className="ub-feature-list">
					{copy.features.map((feature) => (
						<li key={feature.index}>
							<span>{feature.index}</span>
							<div>
								<h3>{feature.title}</h3>
								<p>{feature.description}</p>
							</div>
							<TextLink href={localizePath(locale, feature.href)}>
								{copy.evidence.featureLink}
							</TextLink>
						</li>
					))}
				</ol>
			</Section>

			<Section className="ub-landing-status" width="reading">
				<Eyebrow>{copy.status.eyebrow}</Eyebrow>
				<h2>{copy.status.title}</h2>
				<p>{copy.status.description}</p>
				<div className="ub-action-row">
					<ButtonLink href={localizePath(locale, siteConfig.routes.gettingStarted)}>
						{copy.status.primaryAction}
					</ButtonLink>
					<ButtonLink external href={minimalExampleUrl} variant="secondary">
						{copy.status.secondaryAction}
					</ButtonLink>
				</div>
			</Section>
		</div>
	)
}
