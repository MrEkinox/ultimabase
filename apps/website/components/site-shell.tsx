import { localizePath, type SiteLocale } from '../lib/i18n'
import { siteConfig } from '../lib/site'
import { Brand } from './brand'
import { TextLink } from './primitives'

export interface SiteFooterProps {
	readonly locale: SiteLocale
}

export function SiteFooter({ locale }: SiteFooterProps) {
	const description =
		locale === 'fr'
			? 'Un framework backend typé en développement actif avant sa première version stable.'
			: `A typed backend framework in ${siteConfig.releaseStatus} development.`

	return (
		<footer className="ub-site-footer" data-site-footer>
			<div className="ub-footer-inner">
				<div className="ub-footer-identity">
					<Brand />
					<p>{description}</p>
				</div>
				<nav aria-label="Footer">
					{siteConfig.navigation.map((item) => (
						<TextLink
							href={
								item.external === true
									? item.href
									: localizePath(locale, item.href)
							}
							key={item.label}
						>
							{item.label}
						</TextLink>
					))}
				</nav>
			</div>
		</footer>
	)
}
