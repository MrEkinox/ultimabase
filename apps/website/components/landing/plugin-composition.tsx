import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc'
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'

import { currentDocumentationPath } from '../../lib/docs-versions'
import { TextLink } from '../primitives'
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
								className: 'ub-application-codeblock',
								viewportProps: { style: { maxHeight: 'none' } },
								title: 'src/application.ts',
							}}
						/>
						{example.label !== 'TypeScript' && (
							<p className="ub-preset-note">
								Local evaluation without an access policy. The acknowledgement
								permits exposure; it does not add authorization. Requests
								require <code>X-UltimaBase-Application-Id: articles</code>.
							</p>
						)}
					</Tab>
				))}
			</Tabs>
			<p className="ub-setup-note">
				Checks an existing database schema without changing it. The{' '}
				<TextLink href={currentDocumentationPath('manual-installation')}>
					installation guide
				</TextLink>{' '}
				covers database setup and shutdown.
			</p>
		</div>
	)
}
