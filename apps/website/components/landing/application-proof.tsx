import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import { ArrowDown, FileCode2 } from 'lucide-react'

import { demoExamples } from './demo-content'

/** Mounted panels share a grid cell, reserving height without clipping larger text. */
export function ApplicationProof() {
	return (
		<figure
			className="ub-proof"
			aria-labelledby="ub-proof-caption"
			data-testid="visual-system-motion"
		>
			<Tabs
				items={demoExamples.map((example) => example.label)}
				className="ub-demo-tabs"
			>
				<div className="ub-demo-panels">
					{demoExamples.map((example) => (
						<Tab
							key={example.label}
							value={example.label}
							forceMount
							className="ub-demo-panel"
						>
							<div className="ub-demo-code">
								<div className="ub-editor-label">
									<span>
										<FileCode2 aria-hidden="true" /> {example.file}
									</span>
									<span>TypeScript</span>
								</div>
								<ServerCodeBlock
									code={example.code}
									lang="ts"
									themes={{ dark: 'github-dark', light: 'github-light' }}
									codeblock={{ allowCopy: false, className: 'ub-code' }}
								/>
							</div>
							<div className="ub-demo-result">
								<p className="ub-demo-eyebrow">SCHEMA → TYPES</p>
								<h2>{example.title}</h2>
								<p>{example.description}</p>
								<dl aria-label="Model field types" className="ub-field-types">
									{example.fields.map((field) => (
										<div key={field.name}>
											<dt>
												<code>{field.name}</code>
											</dt>
											<dd>
												<code>{field.type}</code>
											</dd>
										</div>
									))}
								</dl>
								<p className="ub-demo-note">{example.note}</p>
							</div>
						</Tab>
					))}
				</div>
			</Tabs>
			<figcaption id="ub-proof-caption">
				<span>
					Direct TypeScript. Requires a started application and generated
					Typegen declarations.
				</span>
				<a href="#application-setup">
					See the setup <ArrowDown aria-hidden="true" />
				</a>
			</figcaption>
		</figure>
	)
}
