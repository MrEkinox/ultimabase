import type { ReactNode } from 'react'

export interface ArchitectureDiagramProps {
	readonly description: ReactNode
	readonly steps: readonly string[]
	readonly title: string
}

/**
 * Renders architecture as a visual flow whose ordered list is also its
 * keyboard, screen-reader, print, and no-CSS fallback.
 */
export function ArchitectureDiagram({
	description,
	steps,
	title,
}: ArchitectureDiagramProps) {
	return (
		<figure className="ub-docs-diagram">
			<figcaption>
				<strong>{title}</strong>
				<span>{description}</span>
			</figcaption>
			<ol>
				{steps.map((step, index) => (
					<li key={step}>
						<span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
						{step}
					</li>
				))}
			</ol>
		</figure>
	)
}
