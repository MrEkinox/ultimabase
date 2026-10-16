import { UltimaBase } from '@ultimabase/core'
import { plugin } from '@ultimabase/core/plugin'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { expect, it } from 'vitest'

import { App } from '../src/schema.ts'

// What `plugins` offers at runtime, beyond the methods its type allows here.
interface UntypedRules {
	readonly audit: (enabled: boolean) => never
	readonly flagReason: (reason: string) => never
}

it('rejects a rule passed to define', () => {
	expect(() =>
		App.Schema.define({
			className: 'Note',
			fields: (f) => ({ body: f.string() }),
			// @ts-expect-error -- plugin rules go in the final .with(...).
			flagReason: 'Spam',
		}),
	).toThrow(
		'Unknown schema option: flagReason. define() takes className, fields and indexes; plugin rules go in the final .with(...) (ADR-0297)',
	)
})

it('offers a rule only after its feature', () => {
	const declare = () =>
		App.Schema.define({
			className: 'Note',
			fields: (f) => ({ body: f.string() }),
		}).with((plugins) => {
			// @ts-expect-error -- `flagReason` needs `flaggable: true` first.
			void plugins.flagReason
			return (plugins as unknown as UntypedRules).flagReason('Spam')
		})
	// The rules slot is a type: the option itself accepts the text.
	expect(declare).not.toThrow()
})

it('rejects a rule whose plugin is not installed', () => {
	const declare = () =>
		UltimaBase.Schema.define({
			className: 'Note',
			fields: (f) => ({ body: f.string() }),
		}).with((plugins) => {
			// @ts-expect-error -- no installed plugin declares `audit`.
			void plugins.audit
			return (plugins as unknown as UntypedRules).audit(true)
		})
	// `plugins` has one method per installed rule (ADR-0339).
	expect(declare).toThrow('plugins.audit is not a function')
})

it('checks a peer range against the installed plugin version', () => {
	// The pre-release GraphQL plugin is 0.0.0: a `^1.0.0` peer cannot install.
	const tooNew = plugin({
		id: 'community.too-new',
		core: '^0.0.0',
		version: '1.0.0',
		peers: [{ pluginId: '@ultimabase/graphql-plugin', version: '^1.0.0' }],
		contributions: [],
	})
	const Application = UltimaBase.use(graphqlPlugin(), tooNew)
	// Construction checks the plugin graph, before any effect.
	expect(() => new Application({ schemas: [] })).toThrow(
		'Plugin "community.too-new" requires @ultimabase/graphql-plugin version "^1.0.0", but version "0.0.0" is installed.',
	)
})

it('checks the Core range against the installed Core version', () => {
	//#region core-range
	// The pre-release Core is 0.0.0: a `^1.0.0` Core range cannot install.
	const forCore1 = plugin({
		id: 'community.for-core-1',
		core: '^1.0.0',
		version: '1.0.0',
		contributions: [],
	})
	const Application = UltimaBase.use(forCore1)
	expect(() => new Application({ schemas: [] })).toThrow(
		'Plugin "community.for-core-1" requires @ultimabase/core version "^1.0.0", but version "0.0.0" is installed.',
	)
	//#endregion core-range
})
