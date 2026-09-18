import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'

import { compositionExamples } from './composition-content'

/** These complete presets are compiled and their plugin graphs validated in the content suite. */
export function PluginComposition() {
	return (
		<div className="ub-application-code">
			<div className="ub-code-overline">
				<span>CONFIGURE YOUR APPLICATION</span>
				<span>Choose an API</span>
			</div>
			<Tabs
				items={compositionExamples.map((example) => example.label)}
				className="ub-composition-tabs"
			>
				{compositionExamples.map((example) => (
					<Tab key={example.label} value={example.label}>
						<p className="ub-preset-note">{example.note}</p>
						<ServerCodeBlock
							code={example.code}
							lang="ts"
							themes={{ light: 'github-dark', dark: 'github-dark' }}
							codeblock={{
								allowCopy: false,
								className: 'ub-application-codeblock',
								viewportProps: { style: { maxHeight: 'none' } },
								title: 'src/application.ts',
							}}
						/>
					</Tab>
				))}
			</Tabs>
		</div>
	)
}
