import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../../errors/framework-error.js'
import { describeSchemaMutationConflict } from './unique-conflict.js'

const target = {
	className: 'Todo',
	command: 'restoreOne',
	id: '0199325a-0c00-7000-8000-000000000301',
	original: { slug: 'my-task', title: 'Task' },
}

describe('unique conflicts of plugin commands', () => {
	it('names the command, the row and the fields, not their values', () => {
		const cause = new FrameworkError(
			'UNIQUE_VIOLATION',
			'PostgreSQL rejected a duplicate unique index value.',
			{
				publicMessage: 'A Todo with the same slug already exists.',
				publicDetails: { fields: ['slug'], schema: 'Todo' },
			},
		)
		const described = describeSchemaMutationConflict(cause, target)

		expect(described).toBeInstanceOf(FrameworkError)
		expect(described).toMatchObject({
			cause,
			code: 'UNIQUE_VIOLATION',
			internalDetails: {
				command: 'restoreOne',
				values: { slug: 'my-task' },
			},
			publicDetails: { fields: ['slug'], schema: 'Todo' },
			publicMessage: `Cannot run restoreOne on Todo ${target.id}: slug is now used by another row.`,
		})
	})

	it('stays generic when the adapter does not name the fields', () => {
		const cause = new FrameworkError('UNIQUE_VIOLATION', 'Duplicate value.', {})

		expect(describeSchemaMutationConflict(cause, target)).toMatchObject({
			internalDetails: { command: 'restoreOne', values: {} },
			publicMessage: `Cannot run restoreOne on Todo ${target.id}: a unique value is now used by another row.`,
		})
	})

	it('leaves every other failure untouched', () => {
		const denied = new FrameworkError('PERMISSION_DENIED', 'Denied.', {})
		const failure = new TypeError('adapter down')

		expect(describeSchemaMutationConflict(denied, target)).toBe(denied)
		expect(describeSchemaMutationConflict(failure, target)).toBe(failure)
	})
})
