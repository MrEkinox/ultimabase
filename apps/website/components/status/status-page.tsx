import { localizePath, type SiteLocale } from '../../lib/i18n'
import { ButtonLink, Eyebrow, Section, TextLink } from '../primitives'
import { statusPages, type StatusPageContent } from './content'

export interface StatusPageProps {
	readonly content: StatusPageContent
	readonly locale: SiteLocale
}

export function StatusPage({ content, locale }: StatusPageProps) {
	return (
		<article className="ub-status-page">
			<Section className="ub-status-hero" width="reading">
				<Eyebrow>{content.eyebrow}</Eyebrow>
				<h1>{content.title}</h1>
				<p className="ub-lede">{content.description}</p>
				<p className="ub-status-summary">{content.summary}</p>
			</Section>

			<Section className="ub-status-navigation" width="reading">
				<nav aria-label="Status pages">
					{statusPages.map((page) => (
						<TextLink
							aria-current={page.slug === content.slug ? 'page' : undefined}
							href={localizePath(locale, `/status/${page.slug}`)}
							key={page.slug}
						>
							{page.eyebrow}
						</TextLink>
					))}
				</nav>
			</Section>

			<Section className="ub-status-sections" width="reading">
				{content.sections.map((section) => (
					<section className="ub-status-section" key={section.index}>
						<p className="ub-section-index">{section.index}</p>
						<h2>{section.title}</h2>
						<p className="ub-status-section-body">{section.body}</p>
						<ul>
							{section.items.map((item) => (
								<li key={item.title}>
									<h3>{item.title}</h3>
									<p>{item.description}</p>
									{item.href === undefined ? null : item.external === true ? (
										<a href={item.href} rel="noreferrer" target="_blank">
											Open {item.title}
										</a>
									) : (
										<TextLink href={localizePath(locale, item.href)}>
											Read {item.title}
										</TextLink>
									)}
								</li>
							))}
						</ul>
					</section>
				))}

				<div className="ub-status-action">
					<ButtonLink
						{...(content.primaryAction.external === true
							? { external: true }
							: {})}
						href={
							content.primaryAction.external === true
								? content.primaryAction.href
								: localizePath(locale, content.primaryAction.href)
						}
					>
						{content.primaryAction.title}
					</ButtonLink>
					<ButtonLink
						href={localizePath(
							locale,
							content.slug === 'release-status'
								? '/status/roadmap'
								: '/status/release-status',
						)}
						variant="secondary"
					>
						{content.slug === 'release-status' ? 'Roadmap' : 'Release status'}
					</ButtonLink>
				</div>
			</Section>
		</article>
	)
}
