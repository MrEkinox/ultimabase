// Rights that follow from the data: a project's members read its tasks, its
// owner writes them. The server sets the projects up as Master.
import { asUser, testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Person, Project, Task } from './projects.ts'

testApplication(app)

const asMaster = { as: master }

/** Ada owns a project Grace is a member of; Alan is in none. */
async function team() {
	const [ada, grace, alan] = await Promise.all(
		['Ada', 'Grace', 'Alan'].map((name) =>
			Person.create({ data: { name } }, asMaster),
		),
	)
	if (ada === undefined || grace === undefined || alan === undefined) {
		throw new Error('The team was not created.')
	}
	const project = await Project.create(
		{
			data: {
				name: 'Compiler',
				owner: { connect: { id: ada.id } },
				members: { connect: [{ id: ada.id }, { id: grace.id }] },
			},
		},
		asMaster,
	)
	return {
		project,
		ada: { as: asUser({ id: ada.id }) },
		grace: { as: asUser({ id: grace.id }) },
		graceId: grace.id,
		alan: { as: asUser({ id: alan.id }) },
	}
}

it('shows a task to the members of its project only', async () => {
	const { project, ada, grace, graceId, alan } = await team()
	//#region relation-read
	await Task.create(
		{ data: { title: 'Parse', project: { connect: { id: project.id } } } },
		ada,
	)
	// Grace is a member: she reads the task; Alan is not.
	expect(await Task.count({}, grace)).toBe(1)
	expect(await Task.count({}, alan)).toBe(0)
	// Out of the project, Grace reads nothing from her next query on.
	await Project.update(
		{
			where: { id: project.id },
			data: { members: { disconnect: [{ id: graceId }] } },
		},
		{ as: master },
	)
	expect(await Task.count({}, grace)).toBe(0)
	//#endregion
})

it('lets only the project’s owner write its tasks', async () => {
	const { project, ada, grace } = await team()
	//#region group-write
	const task = await Task.create(
		{ data: { title: 'Parse', project: { connect: { id: project.id } } } },
		ada,
	)
	// Grace reads the task, but the rule refuses her writes.
	const refused = {
		code: 'NOT_PROJECT_OWNER',
		message: 'Only the project’s owner writes its tasks.',
	}
	await expect(
		Task.update({ where: { id: task.id }, data: { done: true } }, grace),
	).rejects.toMatchObject(refused)
	await expect(
		Task.delete({ where: { id: task.id } }, grace),
	).rejects.toMatchObject(refused)
	await expect(
		Task.create(
			{ data: { title: 'Lex', project: { connect: { id: project.id } } } },
			grace,
		),
	).rejects.toMatchObject(refused)
	// Ada, the owner, does both.
	const done = await Task.update(
		{ where: { id: task.id }, data: { done: true } },
		ada,
	)
	expect(done.done).toBe(true)
	await Task.delete({ where: { id: task.id } }, ada)
	//#endregion
})

it('lets the owner rename the project, and no other member', async () => {
	const { project, ada, grace } = await team()
	await expect(
		Project.update(
			{ where: { id: project.id }, data: { name: 'Mine' } },
			grace,
		),
	).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
	const renamed = await Project.update(
		{ where: { id: project.id }, data: { name: 'Linker' } },
		ada,
	)
	expect(renamed.name).toBe('Linker')
})
