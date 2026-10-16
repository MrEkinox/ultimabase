import { UltimaBase } from '@ultimabase/core'
import { plugin } from '@ultimabase/core/plugin'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { expect, it } from 'vitest'

import { App } from '../src/schema.ts'

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
		}).with({
			// @ts-expect-error -- `flagReason` needs `flaggable: true` first.
			flagReason: 'Spam',
		})
	// The rules slot is a type: the option itself accepts the text.
	expect(declare).not.toThrow()
})

it('rejects a rule whose plugin is not installed', () => {
	const declare = () =>
		UltimaBase.Schema.define({
			className: 'Note',
			fields: (f) => ({ body: f.string() }),
		}).with({
			// @ts-expect-error -- no installed plugin declares `audit`.
			audit: true,
		})
	// `.with` takes the rules the installed plugins declare (ADR-0339).
	expect(declare).toThrow('audit is not a rule of an installed plugin')
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
