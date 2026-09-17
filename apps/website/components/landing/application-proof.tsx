import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import { ArrowDown, Check, FileCode2 } from 'lucide-react'

import { readExample, schemaExample, writeExample } from './content'

const themes = { dark: 'github-dark', light: 'github-light' }

/** Server-rendered examples use native Fumadocs tabs, including keyboard navigation. */
export function ApplicationProof() {
	return (
		<figure
			className="ub-proof"
			aria-labelledby="ub-proof-caption"
			data-testid="visual-system-motion"
		>
			<div className="ub-proof-editors">
				<div className="ub-proof-schema">
					<div className="ub-editor-label">
						<span>
							<FileCode2 aria-hidden="true" /> article.ts
						</span>
						<span>01 / DEFINE</span>
					</div>
					<ServerCodeBlock
						code={schemaExample}
						lang="ts"
						themes={themes}
						codeblock={{ className: 'ub-code', allowCopy: false }}
					/>
				</div>
				<div className="ub-proof-query">
					<div className="ub-editor-label">
						<span>
							<FileCode2 aria-hidden="true" /> application.ts
						</span>
						<span>02 / USE</span>
					</div>
					<Tabs items={['Read data', 'Write data']} className="ub-demo-tabs">
						<Tab>
							<ServerCodeBlock
								code={readExample}
								lang="ts"
								themes={themes}
								codeblock={{ className: 'ub-code', allowCopy: false }}
							/>
						</Tab>
						<Tab>
							<ServerCodeBlock
								code={writeExample}
								lang="ts"
								themes={themes}
								codeblock={{ className: 'ub-code', allowCopy: false }}
							/>
						</Tab>
					</Tabs>
				</div>
			</div>
			<div className="ub-proof-output">
				<span className="ub-result-label">
					<ArrowDown aria-hidden="true" /> Typed data APIs
				</span>
				<span>Schema-aware inputs. Selected results. Immutable models.</span>
				<Check aria-hidden="true" />
			</div>
			<figcaption id="ub-proof-caption">
				Direct TypeScript with a started PostgreSQL application and generated
				Typegen declarations. <span>Setup below ↓</span>
			</figcaption>
		</figure>
	)
}
