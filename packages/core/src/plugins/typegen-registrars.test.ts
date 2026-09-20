import { describe, expect, it } from 'vitest'

import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import {
	defineTypegenReference,
	type TypegenReference,
} from './typegen-contracts.js'
import {
	createTypegenReferenceRegistrar,
	snapshotTypegenDeclarations,
	type MutableTypegenDeclarations,
} from './typegen-declarations.js'

const owner: PluginSchemaContributionOwner = {
	kind: 'plugin',
	pluginId: 'fixture.typegen',
	version: '1.2.3',
}

describe('owner-bound Typegen registrars', () => {
	it('enforces nominal, unique references and closed registration sessions', () => {
		let open = true
		const declarations: MutableTypegenDeclarations = {
			references: [],
		}
		const registrars = createTypegenReferenceRegistrar(
			owner,
			declarations,
			() => {
				if (!open) throw new TypeError('closed')
			},
		)
		const reference = defineTypegenReference({
			exportName: 'State',
			module: 'x',
		})

		expect(() => {
			registrars.register({
				exportName: 'State',
				module: 'x',
			} as TypegenReference)
		}).toThrow('must be created')
		registrars.register(reference)
		expect(() => {
			registrars.register(reference)
		}).toThrow('already registered')
		expect(snapshotTypegenDeclarations(declarations)).toEqual({
			references: [{ owner, reference }],
		})
		open = false
		expect(() => {
			registrars.register(reference)
		}).toThrow('closed')
	})
})
