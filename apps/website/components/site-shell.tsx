import { siteConfig } from '../lib/site'
import { Brand } from './brand'
import { TextLink } from './primitives'

const footerGroups = [
	{
		label: 'Explore',
		links: [
			{ href: siteConfig.routes.docs, label: 'Documentation' },
			{ href: siteConfig.routes.plugins, label: 'Official plugins' },
			{ href: siteConfig.routes.releaseStatus, label: 'Release status' },
		],
	},
	{
		label: 'Project',
		links: [
			{ href: siteConfig.routes.roadmap, label: 'Roadmap' },
			{ href: siteConfig.routes.contributing, label: 'Contributing' },
			{ href: siteConfig.repositoryUrl.href, label: 'GitHub' },
		],
	},
] as const

export function SiteFooter() {
	return (
		<footer className="ub-site-footer" data-site-footer>
			<div className="ub-footer-inner">
				<div className="ub-footer-identity">
					<Brand />
					<p>
						Open-source TypeScript backend framework. Pre-release APIs may
						change.
					</p>
				</div>
				<nav aria-label="Footer">
					{footerGroups.map((group) => (
						<div className="ub-footer-group" key={group.label}>
							<h2>{group.label}</h2>
							{group.links.map((item) => (
								<TextLink href={item.href} key={item.label} prefetch={false}>
									{item.label}
								</TextLink>
							))}
						</div>
					))}
				</nav>
			</div>
		</footer>
	)
}
