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

it('offers a rule only after its shape method', () => {
	const declare = () =>
		App.Schema.define({
			className: 'Note',
			fields: (f) => ({ body: f.string() }),
		})
			// @ts-expect-error -- `flagReason` needs `.flaggable()` first.
			.with({ flagReason: 'Spam' })
	// The rules slot is a type: the option itself accepts the text.
	expect(declare).not.toThrow()
})

it('rejects a rule whose plugin is not installed', () => {
	const Note = UltimaBase.Schema.define({
		className: 'Note',
		fields: (f) => ({ body: f.string() }),
	})
		// @ts-expect-error -- no installed plugin declares `audit`.
		.with({ audit: true })
	// The application that would use it refuses to compile.
	expect(() => new UltimaBase({ schemas: [Note] }).compile()).toThrow('audit')
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
