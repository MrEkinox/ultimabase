const inputs = [
	{ detail: 'Immutable Query and model commands', label: 'TypeScript' },
	{ detail: 'Versioned resource protocol', label: 'REST' },
	{ detail: 'Schema and plugin operations', label: 'GraphQL' },
] as const

const stages = [
	'Normalize one operation',
	'Validate and authorize',
	'Run hooks and transaction',
	'Persist through PostgreSQL',
] as const

export function ArchitectureFlow() {
	return (
		<figure className="ub-flow" aria-labelledby="runtime-flow-title">
			<figcaption>
				<p className="ub-section-index">02 / One execution model</p>
				<h2 id="runtime-flow-title">Three entry points. One Runtime.</h2>
				<p>
					Transport syntax changes. Validation, policy, hooks, transactions, and
					persistence semantics do not.
				</p>
			</figcaption>

			<div className="ub-flow-diagram">
				<ul aria-label="Application entry points" className="ub-flow-inputs">
					{inputs.map((input) => (
						<li key={input.label}>
							<strong>{input.label}</strong>
							<span>{input.detail}</span>
						</li>
					))}
				</ul>

				<div aria-hidden="true" className="ub-flow-connector">
					<span />
					<span>one operation</span>
				</div>

				<ol aria-label="Shared runtime stages" className="ub-flow-stages">
					{stages.map((stage, index) => (
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
