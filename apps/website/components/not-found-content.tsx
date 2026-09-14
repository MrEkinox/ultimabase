import { BrandMark } from './brand-mark'
import { ButtonLink, Section } from './primitives'
import { siteConfig } from '../lib/site'

/** Keeps route-level and global 404 responses on the same recovery path. */
export function NotFoundContent() {
	return (
		<main className="ub-not-found">
			<Section width="reading">
				<div className="ub-not-found-mark">
					<BrandMark size={40} />
					<span>{siteConfig.name}</span>
				</div>
				<p className="ub-eyebrow">404 · {siteConfig.releaseStatus}</p>
				<h1>Page not found</h1>
				<p className="ub-lede">
					This address is not part of the current UltimaBase preview. Return to
					the product overview or continue from the documentation entry point.
				</p>
				<div className="ub-action-row">
					<ButtonLink href="/">Product overview</ButtonLink>
					<ButtonLink href={siteConfig.routes.docs} variant="secondary">
						Documentation
					</ButtonLink>
				</div>
			</Section>
		</main>
	)
}
