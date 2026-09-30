import { Schema, UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

describe('virtual field Typegen declarations', () => {
	it('fingerprints inert metadata without retaining resolver code', () => {
		const secretResolverText = 'private-virtual-resolver-body'
		const Virtual = Schema.define({
			className: 'TypegenVirtual',
			fields: (field) => ({
				name: field.string({ required: true }),
				displayName: field.virtual({
					output: (output) => output.string({ nullable: false }),
					resolve: ({ item }) =>
						`${String(item.name)}${secretResolverText.slice(0, 0)}`,
					select: { name: true },
				}),
			}),
		})
		const generated = generateApplicationTypes({
			ultimabase: new UltimaBase({ schemas: [Virtual] }),
			applicationId: 'fixture.virtual',
		})

		expect(generated.snapshot.schemas[0]?.virtualFields).toMatchObject([
			{
				kind: 'string',
				name: 'displayName',
				select: ['id', 'name'],
				typegen: { list: false, nullable: false },
			},
		])
		expect(JSON.stringify(generated.snapshot)).not.toContain(secretResolverText)
		expect(generated.contents).toContain('export type TypegenVirtualOutput = {')
		expect(generated.contents).toContain('readonly displayName: string')
		expect(generated.contents).not.toMatch(
			/export type TypegenVirtualCreateInput = \{[^}]*displayName/u,
		)
	})
})
