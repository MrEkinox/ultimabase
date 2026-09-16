import { renderMermaidSVG } from 'beautiful-mermaid'

interface MermaidProps {
	readonly chart: string
	readonly description: string
}

export function Mermaid({ chart, description }: MermaidProps) {
	// Documentation authors own the diagram source; no request data enters SVG rendering.
	const svg = renderMermaidSVG(chart, {
		bg: 'var(--color-fd-background)',
		fg: 'var(--color-fd-foreground)',
		transparent: true,
	})
	// The renderer embeds a remote font import; local Fumadocs fonts and fallbacks suffice.
	const selfContainedSvg = svg.replace(
		/@import url\('https:\/\/fonts\.googleapis\.com\/[^']+'\);\s*/u,
		'',
	)

	return (
		<div
			aria-label={description}
			className="my-6 max-w-full overflow-x-auto [&_svg]:mx-auto"
			dangerouslySetInnerHTML={{ __html: selfContainedSvg }}
			role="img"
		/>
	)
}
