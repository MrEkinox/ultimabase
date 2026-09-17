import { ArrowDown, Database } from 'lucide-react'

import { currentDocumentationPath } from '../../lib/docs-versions'
import { TextLink } from '../primitives'

/** A deliberately simplified flow; optional engines are labelled as installed behavior. */
export function ArchitectureFlow() {
	return (
		<figure className="ub-flow" aria-labelledby="runtime-flow-title">
			<figcaption>
				<p className="ub-section-index">02 / ONE EXECUTION MODEL</p>
				<h2 id="runtime-flow-title">
					Different APIs.
					<br />
					Same rules.
				</h2>
				<p>
					Call from TypeScript. Add REST or GraphQL. Every entry point uses the
					same operation engine, so your application’s behavior follows the
					data.
				</p>
				<TextLink
					href={currentDocumentationPath('core/runtime/runtime-pipeline')}
				>
					Follow a request <span aria-hidden="true">↗</span>
				</TextLink>
			</figcaption>
			<div className="ub-flow-diagram">
				<ul aria-label="Application entry points" className="ub-flow-inputs">
					<li>
						<strong>TypeScript</strong>
						<span>Direct calls</span>
					</li>
					<li>
						<strong>REST</strong>
						<span>Optional plugin</span>
					</li>
					<li>
						<strong>GraphQL</strong>
						<span>Optional plugin</span>
					</li>
				</ul>
				<div className="ub-flow-merge" aria-hidden="true">
					<ArrowDown />
				</div>
				<div className="ub-runtime">
					<div className="ub-runtime-title">
						<span className="ub-runtime-dot" /> One operation engine
					</div>
					<ul aria-label="Shared runtime responsibilities">
						<li>Structural validation</li>
						<li>Installed policies &amp; hooks</li>
						<li>Mutation transactions</li>
					</ul>
				</div>
				<ArrowDown className="ub-flow-arrow" aria-hidden="true" />
				<div className="ub-flow-database">
					<Database aria-hidden="true" />
					<strong>PostgreSQL</strong>
					<span>Storage plugin</span>
				</div>
			</div>
		</figure>
	)
}
