import { describe, expect, it } from 'vitest'

import { defineEnum } from '../fields/builtins/shared-enum.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

// ADR-0310: two different shared enums with one name fail at construction.
describe('shared enum names', () => {
	it('accepts one shared enum reused across schemas and embedded fields', () => {
		const Priority = defineEnum('SharedPriority', ['low', 'high'])
		const Task = UltimaBase.Schema.define({
			className: 'SharedEnumTask',
			fields: (field) => ({ priority: field.enum({ values: Priority }) }),
		})
		const Project = UltimaBase.Schema.define({
			className: 'SharedEnumProject',
			fields: (field) => ({
				settings: field.object({
					fields: (child) => ({ priority: child.enum({ values: Priority }) }),
				}),
			}),
		})

		expect(() => new UltimaBase({ schemas: [Task, Project] })).not.toThrow()
	})

	it('rejects two different shared enums with the same name', () => {
		const First = defineEnum('DuplicatePriority', ['low', 'high'])
		const Second = defineEnum('DuplicatePriority', ['low', 'high'])
		const Task = UltimaBase.Schema.define({
			className: 'DuplicateEnumTask',
			fields: (field) => ({ priority: field.enum({ values: First }) }),
		})
		const Project = UltimaBase.Schema.define({
			className: 'DuplicateEnumProject',
			fields: (field) => ({
				settings: field.object({
					fields: (child) => ({ priority: child.enum({ values: Second }) }),
				}),
			}),
		})

		expect(() => new UltimaBase({ schemas: [Task, Project] })).toThrow(
			new TypeError(
				'Two different shared enums are named DuplicatePriority (DuplicateEnumTask.priority and DuplicateEnumProject.settings.priority); declare it once with defineEnum and reuse it',
			),
		)
	})
})
