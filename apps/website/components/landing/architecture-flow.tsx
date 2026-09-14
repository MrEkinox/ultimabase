import type { LandingFlowCopy } from './content'

export interface ArchitectureFlowProps {
	readonly copy: LandingFlowCopy
}

export function ArchitectureFlow({ copy }: ArchitectureFlowProps) {
	return (
		<figure className="ub-flow" aria-labelledby="runtime-flow-title">
			<figcaption>
				<p className="ub-section-index">{copy.index}</p>
				<h2 id="runtime-flow-title">{copy.title}</h2>
				<p>{copy.description}</p>
			</figcaption>

			<div className="ub-flow-diagram">
				<ul aria-label={copy.entryPointsLabel} className="ub-flow-inputs">
					{copy.inputs.map((input) => (
						<li key={input.label}>
							<strong>{input.label}</strong>
							<span>{input.detail}</span>
						</li>
					))}
				</ul>

				<div aria-hidden="true" className="ub-flow-connector">
					<span />
					<span>{copy.connector}</span>
				</div>

				<ol aria-label={copy.stagesLabel} className="ub-flow-stages">
					{copy.stages.map((stage, index) => (
						<li key={stage}>
							<span>{String(index + 1).padStart(2, '0')}</span>
							{stage}
						</li>
					))}
				</ol>
			</div>
		</figure>
	)
}
