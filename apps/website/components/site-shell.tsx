import { siteConfig } from '../lib/site'
import { Brand } from './brand'
import { TextLink } from './primitives'

export function SiteFooter() {
	return (
		<footer className="ub-site-footer" data-site-footer>
			<div className="ub-footer-inner">
				<div className="ub-footer-identity">
					<Brand />
					<p>
						A typed backend framework in {siteConfig.releaseStatus} development.
					</p>
				</div>
				<nav aria-label="Footer">
					{siteConfig.navigation.map((item) => (
						<TextLink href={item.href} key={item.label}>
							{item.label}
						</TextLink>
					))}
				</nav>
			</div>
		</footer>
	)
}
