import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import { ArrowRight, ArrowUpRight } from 'lucide-react'

import { siteConfig } from '../../lib/site'
import { TextLink } from '../primitives'
import { transportExamples } from './transport-content'

/** The result is an explained contract of the linked example, not a live request. */
export function ArchitectureFlow() {
	return (
		<figure className="ub-transport" aria-labelledby="runtime-flow-title">
			<figcaption className="ub-transport-heading">
				<div>
					<h2 id="runtime-flow-title">
						Different APIs.
						<br />
						Same rules.
					</h2>
				</div>
				<p>
					Create an article from TypeScript, REST, or GraphQL. In the runnable
					example, the same title Hook trims whitespace before application
					validation and persistence.
				</p>
			</figcaption>
			<p className="ub-demo-eyebrow ub-api-call-label">
				MAKE A REQUEST / RUNNABLE EXAMPLE
			</p>
			<div className="ub-transport-proof">
				<Tabs
					items={transportExamples.map((example) => example.label)}
					className="ub-transport-tabs"
				>
					<div className="ub-demo-panels">
						{transportExamples.map((example) => (
							<Tab key={example.label} value={example.label} forceMount>
								<ServerCodeBlock
									code={example.code}
									lang={example.lang}
									themes={{ light: 'github-light', dark: 'github-dark' }}
									codeblock={{
										allowCopy: false,
										className: 'ub-transport-code',
									}}
								/>
								<p className="ub-transport-caption">{example.caption}</p>
							</Tab>
						))}
					</div>
				</Tabs>
				<div className="ub-transport-result">
					<p className="ub-demo-eyebrow">ONE SHARED TITLE HOOK</p>
					<code className="ub-title-input">{'"  Hello UltimaBase  "'}</code>
					<ArrowRight aria-hidden="true" />
					<code className="ub-title-output">"Hello UltimaBase"</code>
					<p>
						The saved title is the same. Each API keeps its own response format.
					</p>
					<TextLink href={siteConfig.fullStackExampleUrl.href}>
						See the complete example <ArrowUpRight aria-hidden="true" />
					</TextLink>
				</div>
			</div>
		</figure>
	)
}
