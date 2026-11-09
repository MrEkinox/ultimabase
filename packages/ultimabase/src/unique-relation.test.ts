// A unique `where` over an index that holds a `one` field filters through
// the relation (D-46): it finds only rows whose target the caller reads.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { allow, defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }
const ada = { as: asUser({ id: 'ada' }) }

const Project = defineModel({
	name: 'Project',
	fields: (f) => ({ hidden: f.boolean({ default: false }) }),
}).with({ access: { read: ({ where }) => where({ hidden: false }) } })

const Membership = defineModel({
	name: 'Membership',
	fields: (f) => ({ project: f.one(() => Project), user: f.string() }),
	indexes: [{ fields: ['project', 'user'], unique: true }],
}).with({ access: allow.public })

let app: ReturnType<typeof defineApp>
let project = ''
let row = ''
beforeEach(async () => {
	app = defineApp({ database: memory(), models: [Project, Membership] })
	await app.start()
	project = (await Project.create({ data: { hidden: true } }, M)).id
	const data = { project: { connect: { id: project } }, user: 'ada' }
	row = (await Membership.create({ data }, M)).id
})
afterEach(async () => app.stop())

it('misses a readable row whose target is hidden, which its id still finds', async () => {
	const where = { project, user: 'ada' }
	expect(await Membership.findUnique({ where }, ada)).toBeNull()
	expect(await Membership.findUnique({ where }, M)).toMatchObject({ id: row })
	const byId = { where: { id: row }, include: { project: true } } as const
	expect(await Membership.findUnique(byId, ada)).toMatchObject({
		id: row,
		project: null,
	})
})
