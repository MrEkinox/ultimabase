import { UltimaBase } from '@ultimabase/core'
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
