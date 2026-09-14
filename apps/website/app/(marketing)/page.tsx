import {
	ButtonLink,
	Callout,
	CodeSurface,
	Eyebrow,
	Section,
} from '../../components/primitives'
import { siteConfig } from '../../lib/site'

const foundationExample = `const app = new UltimaBase({
  schemas: [Article],
  plugins: [postgresPlugin(), restPlugin()],
})`

export default function HomePage() {
	return (
		<div className="ub-foundation-page">
			<Section className="ub-foundation-hero">
				<div className="ub-foundation-copy">
					<Eyebrow>{siteConfig.releaseStatus} · developer preview</Eyebrow>
					<h1>A typed backend foundation for explicit applications.</h1>
					<p className="ub-lede">
						One application graph, deliberate plugins, and the same runtime path
						from TypeScript to public APIs.
					</p>
					<div className="ub-action-row">
						<ButtonLink href="/docs">Read the documentation</ButtonLink>
						<ButtonLink
							external
							href={siteConfig.repositoryUrl.href}
							variant="secondary"
						>
							Explore the repository
						</ButtonLink>
					</div>
				</div>
				<CodeSurface code={foundationExample} label="Application foundation" />
			</Section>

			<Section className="ub-foundation-note" width="reading">
				<Callout title="Visual foundation">
					This restrained system is the shared base for the product story and
					documentation. Final landing-page copy follows in its own issue.
				</Callout>
			</Section>
		</div>
	)
}
