import { FrameworkApplication, Schema } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

describe('relation where Typegen declarations', () => {
	it('keeps contextual callbacks out of snapshots and generated files', () => {
		const secretResolverText = 'private-relation-where-resolver-body'
		const Target = Schema.define({
			className: 'TypegenRelationWhereTarget',
			fields: (field) => ({ visible: field.boolean() }),
		})
		const Source = Schema.define({
			className: 'TypegenRelationWhereSource',
			fields: (field) => ({
				targets: field.relation({
					target: 'TypegenRelationWhereTarget',
					where: ({ where }) =>
						secretResolverText.length > 0 ? where.eq('visible', true) : where,
				}),
			}),
		})
		const generated = generateApplicationTypes({
			application: new FrameworkApplication({
				plugins: [],
				schemas: [Source, Target],
			}),
			applicationId: 'fixture.relation-where',
		})

		expect(JSON.stringify(generated.snapshot)).not.toContain(secretResolverText)
		expect(generated.contents).not.toContain(secretResolverText)
		expect(
			generated.snapshot.schemas[0]?.fields.find(
				({ name }) => name === 'targets',
			),
		).toMatchObject({
			name: 'targets',
			value: { kind: 'relation', target: 'TypegenRelationWhereTarget' },
		})
	})
})
