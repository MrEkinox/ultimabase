import { describe, expect, it } from 'vitest'

import type { CompiledMutationCommand } from '../../plugins/command-graph.js'
import { UltimaBase } from '../application/ultima-base.js'
import { validateSchemaMutationEffect } from './effect.js'

// Regression: update effects looked fields up with `persistedFields[name]`, so
// an inherited `Object.prototype` name such as `toString` reached field option
// checks and failed with an internal TypeError instead of the effect error.

const EffectItem = UltimaBase.Schema.define({
	className: 'SchemaMutationEffectOwnKeysItem',
	fields: (field) => ({ title: field.string() }),
})

const command = {
	definition: { effect: 'update', name: 'archive' },
	owner: { kind: 'plugin', name: 'effect-own-keys' },
} as unknown as CompiledMutationCommand

describe('schema mutation update effects keyed by field names', () => {
	it('rejects inherited Object.prototype names like any undeclared field', () => {
		for (const name of ['missing', 'toString', 'constructor']) {
			expect(() =>
				validateSchemaMutationEffect(
					command,
					EffectItem,
					{},
					{
						data: { [name]: 'value' },
					},
				),
			).toThrow(
				expect.objectContaining({
					code: 'PLUGIN_OPERATION_INVALID',
					message: `Schema mutation archive cannot replace field ${name}.`,
				}),
			)
		}
	})
})
