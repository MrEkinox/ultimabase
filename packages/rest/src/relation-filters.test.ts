// Filtered relations in the OpenAPI document (D-151): a filtered `many`
// takes no `set` in its update input, the others keep it; a view is in no
// data input.
import { allow, defineModel, memory } from 'ultimabase'
import { afterAll, describe, expect, it } from 'vitest'
import { rest } from './index.ts'
import { at, call, started } from './test/app.ts'

const Writer = defineModel({
	name: 'Writer',
	use: [rest()],
	fields: (f) => ({
		name: f.string(),
		notes: f.many(() => Note),
		drafts: f.many(() => Note, { from: 'notes' }),
		labels: f.many(() => Label),
	}),
}).with({
	access: allow.public,
	relations: {
		notes: { where: ({ where }) => where({ published: true }) },
		drafts: { where: ({ where }) => where({ published: false }) },
	},
})

const Note = defineModel({
	name: 'Note',
	use: [rest()],
	fields: (f) => ({
		published: f.boolean(),
		writer: f.one(() => Writer, { optional: true }),
	}),
}).with({ access: allow.public })

const Label = defineModel({
	name: 'Label',
	use: [rest()],
	fields: (f) => ({ writer: f.one(() => Writer, { optional: true }) }),
}).with({ access: allow.public })

let stop: (() => Promise<void>) | undefined
afterAll(async () => stop?.())

describe('a filtered relation in the OpenAPI document', () => {
	it('takes no set, unlike the others', async () => {
		const running = await started({}, memory(), [], [Writer, Note, Label])
		stop = async () => running.app.stop()
		const { body } = await call(running.url, 'GET', '/api/openapi.json')
		const keys = (name: string) =>
			Object.keys(at(body, 'components', 'schemas', name, 'properties') ?? {})
		expect(keys('NoteUpdateManyWithoutWriterNestedInput')).not.toContain('set')
		expect(keys('NoteUpdateManyWithoutWriterNestedInput')).toContain(
			'disconnect',
		)
		expect(keys('LabelUpdateManyWithoutWriterNestedInput')).toContain('set')
		for (const name of ['WriterCreateInput', 'WriterUpdateInput']) {
			expect(keys(name)).toContain('notes')
			expect(keys(name)).not.toContain('drafts')
		}
		expect(keys('WriterOrderByInput')).toContain('drafts')
	})
})
