// The other shapes of a relation, written and read from server code as
// Master, each test on a new in-memory database.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import {
	Article,
	Branch,
	Card,
	Choice,
	Category,
	Club,
	Member,
	Membership,
	Milestone,
	Note,
	Notice,
	Poll,
	Project,
	Reader,
	Remark,
	Series,
	Task,
	Video,
} from './shapes.ts'

testApplication(app)

it('creates, reads and deletes the card of a member', async () => {
	//#region one-to-one-write
	const ada = await Member.create(
		{ data: { name: 'Ada', card: { create: { number: 'C-1' } } } },
		{ as: master },
	)
	const card = await Card.findUniqueOrThrow(
		{ where: { number: 'C-1' }, include: { member: true } },
		{ as: master },
	)
	expect(card.member?.name).toBe('Ada')
	await Member.update(
		{ where: { id: ada.id }, data: { card: { update: { number: 'C-2' } } } },
		{ as: master },
	)
	// `delete: true` on the optional side deletes the linked card.
	await Member.update(
		{ where: { id: ada.id }, data: { card: { delete: true } } },
		{ as: master },
	)
	//#endregion
	const read = await Member.findUniqueOrThrow(
		{ where: { id: ada.id }, include: { card: true } },
		{ as: master },
	)
	expect(read.card).toBeNull()
	expect(await Card.count({}, { as: master })).toBe(0)
})

it('nests categories, and empties a parent that is deleted', async () => {
	//#region self-write
	const fiction = await Category.create(
		{
			data: {
				name: 'Fiction',
				children: {
					create: [{ name: 'Fantasy' }, { name: 'Science fiction' }],
				},
			},
		},
		{ as: master },
	)
	await Category.delete({ where: { id: fiction.id } }, { as: master })
	const left = await Category.findMany(
		{ orderBy: { name: 'asc' }, include: { parent: true } },
		{ as: master },
	)
	expect(left.map(({ name, parent }) => [name, parent])).toEqual([
		['Fantasy', null],
		['Science fiction', null],
	])
	//#endregion
})

it('unlinks an optional relation', async () => {
	const fiction = await Category.create(
		{ data: { name: 'Fiction', children: { create: [{ name: 'Fantasy' }] } } },
		{ as: master },
	)
	const fantasy = await Category.findFirstOrThrow(
		{ where: { name: 'Fantasy' } },
		{ as: master },
	)
	//#region disconnect-one
	await Category.update(
		{ where: { id: fantasy.id }, data: { parent: { disconnect: true } } },
		{ as: master },
	)
	//#endregion
	const read = await Category.findUniqueOrThrow(
		{ where: { id: fiction.id }, include: { children: true } },
		{ as: master },
	)
	expect(read.children).toEqual([])
})

it('reads the two relations between branches', async () => {
	//#region inverse-read
	const paris = await Branch.create({ data: { city: 'Paris' } }, { as: master })
	await Branch.create(
		{
			data: {
				city: 'Lyon',
				incoming: {
					create: [{ copies: 12, from: { connect: { id: paris.id } } }],
				},
			},
		},
		{ as: master },
	)
	const read = await Branch.findUniqueOrThrow(
		{
			where: { id: paris.id },
			include: { outgoing: { include: { to: true } }, incoming: true },
		},
		{ as: master },
	)
	expect(read.outgoing.map((transfer) => transfer.to?.city)).toEqual(['Lyon'])
	expect(read.incoming).toEqual([])
	//#endregion
})

it('links a notice to a branch that has no field for it', async () => {
	//#region one-sided-write
	const paris = await Branch.create({ data: { city: 'Paris' } }, { as: master })
	await Notice.create(
		{
			data: { text: 'Closed on Monday', branch: { connect: { id: paris.id } } },
		},
		{ as: master },
	)
	const found = await Notice.findMany(
		{ where: { branch: { is: { city: 'Paris' } } }, include: { branch: true } },
		{ as: master },
	)
	expect(found.map((notice) => notice.branch?.city)).toEqual(['Paris'])
	//#endregion
	// `onDelete: 'cascade'` deletes the notices with their branch.
	await Branch.delete({ where: { id: paris.id } }, { as: master })
	expect(await Notice.count({}, { as: master })).toBe(0)
})

it('reads the members of a club through their memberships', async () => {
	//#region join-model-write
	const club = await Club.create(
		{ data: { name: 'Thursday readers' } },
		{ as: master },
	)
	await Reader.create(
		{
			data: {
				name: 'Grace',
				memberships: {
					create: [{ role: 'host', club: { connect: { id: club.id } } }],
				},
			},
		},
		{ as: master },
	)
	const read = await Club.findUniqueOrThrow(
		{
			where: { id: club.id },
			include: { memberships: { include: { reader: true } } },
		},
		{ as: master },
	)
	expect(
		read.memberships.map(({ role, reader }) => [reader?.name, role]),
	).toEqual([['Grace', 'host']])
	//#endregion
	expect(await Membership.count({}, { as: master })).toBe(1)
})

it('reads only the released volumes of a series through its view', async () => {
	//#region view-read
	const series = await Series.create(
		{
			data: {
				title: 'Earthsea',
				volumes: {
					create: [
						{ title: 'A Wizard of Earthsea', released: true },
						{ title: 'The Other Wind' },
					],
				},
			},
		},
		{ as: master },
	)
	const read = await Series.findUniqueOrThrow(
		{
			where: { id: series.id },
			include: {
				released: true,
				_count: { select: { volumes: true, released: true } },
			},
		},
		{ as: master },
	)
	expect(read.released.map((volume) => volume.title)).toEqual([
		'A Wizard of Earthsea',
	])
	expect(read._count).toEqual({ volumes: 2, released: 1 })
	//#endregion

	//#region one-view-read
	const next = await Series.findUniqueOrThrow(
		{
			where: { id: series.id },
			select: { upcoming: { select: { title: true } } },
		},
		{ as: master },
	)
	expect(next.upcoming).toEqual({ title: 'The Other Wind' })
	// Filtered like a `one`.
	const writing = await Series.findMany(
		{ where: { upcoming: { isNot: null } } },
		{ as: master },
	)
	expect(writing.map((each) => each.title)).toEqual(['Earthsea'])
	//#endregion
})

it('keeps a task within the project of its milestone', async () => {
	//#region within-write
	const site = await Project.create({ data: { name: 'Site' } }, { as: master })
	const shop = await Project.create({ data: { name: 'Shop' } }, { as: master })
	const beta = await Milestone.create(
		{ data: { name: 'Beta', project: { connect: { id: site.id } } } },
		{ as: master },
	)
	await Task.create(
		{
			data: {
				title: 'Write the docs',
				project: { connect: { id: site.id } },
				milestone: { connect: { id: beta.id } },
			},
		},
		{ as: master },
	)
	const refused = {
		code: 'VALIDATION_FAILED',
		details: {
			issues: [
				{
					path: ['milestone'],
					message: 'Task.milestone needs a Milestone of the same project.',
				},
			],
		},
	}
	// A task of another project cannot link the milestone.
	await expect(
		Task.create(
			{
				data: {
					title: 'Ship',
					project: { connect: { id: shop.id } },
					milestone: { connect: { id: beta.id } },
				},
			},
			{ as: master },
		),
	).rejects.toMatchObject(refused)
	// Nor can the milestone leave its project while a task links it.
	await expect(
		Milestone.update(
			{
				where: { id: beta.id },
				data: { project: { connect: { id: shop.id } } },
			},
			{ as: master },
		),
	).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	//#endregion
})

it('keeps the tasks a note links within its project', async () => {
	//#region within-many-write
	const site = await Project.create({ data: { name: 'Site' } }, { as: master })
	const shop = await Project.create({ data: { name: 'Shop' } }, { as: master })
	const task = await Task.create(
		{ data: { title: 'Ship', project: { connect: { id: shop.id } } } },
		{ as: master },
	)
	const note = await Note.create(
		{
			data: {
				text: 'Release plan',
				project: { connect: { id: site.id } },
				tasks: {
					create: [
						{ title: 'Write the docs', project: { connect: { id: site.id } } },
					],
				},
			},
		},
		{ as: master },
	)
	const refused = {
		code: 'VALIDATION_FAILED',
		details: {
			issues: [
				{
					path: ['tasks'],
					message: 'Note.tasks needs a Task of the same project.',
				},
			],
		},
	}
	// A task of another project cannot be linked, from either side.
	await expect(
		Note.update(
			{
				where: { id: note.id },
				data: { tasks: { connect: [{ id: task.id }] } },
			},
			{ as: master },
		),
	).rejects.toMatchObject(refused)
	await expect(
		Task.update(
			{
				where: { id: task.id },
				data: { notes: { connect: [{ id: note.id }] } },
			},
			{ as: master },
		),
	).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	//#endregion
})

it('keeps a poll between 2 and 4 choices', async () => {
	//#region size-write
	const poll = await Poll.create(
		{
			data: {
				question: 'Lunch?',
				choices: { create: [{ label: 'Pizza' }, { label: 'Salad' }] },
			},
			include: { choices: true },
		},
		{ as: master },
	)
	// A poll with one choice cannot be created.
	await expect(
		Poll.create(
			{ data: { question: 'Yes?', choices: { create: [{ label: 'Yes' }] } } },
			{ as: master },
		),
	).rejects.toMatchObject({
		code: 'RELATION_SIZE',
		message: 'Poll.choices holds 2 to 4 rows: this write leaves 1.',
		details: { model: 'Poll', field: 'choices', min: 2, max: 4, size: 1 },
	})
	// Nor can a write from the other side leave it with one.
	const [pizza] = poll.choices
	await expect(
		Choice.delete({ where: { id: pizza?.id ?? '' } }, { as: master }),
	).rejects.toMatchObject({ code: 'RELATION_SIZE' })
	// Deleting the poll deletes its choices with it.
	await Poll.delete({ where: { id: poll.id } }, { as: master })
	expect(await Choice.count({}, { as: master })).toBe(0)
	//#endregion
})

it('relates a remark to an article or a video', async () => {
	//#region one-of-write
	const article = await Article.create(
		{ data: { title: 'Looms' } },
		{ as: master },
	)
	// A write names the kind it links or creates.
	const clear = await Remark.create(
		{
			data: {
				text: 'Clear',
				subject: { connect: { article: { id: article.id } } },
			},
		},
		{ as: master },
	)
	const short = await Remark.create(
		{
			include: { subject: true },
			data: {
				text: 'Short',
				subject: { create: { video: { title: 'Intro', url: 'intro.mp4' } } },
			},
		},
		{ as: master },
	)
	// A read gives the kind, and the row of each kind it asks for.
	const remarks = await Remark.findMany(
		{
			orderBy: { text: 'asc' },
			select: { text: true, subject: { video: { select: { url: true } } } },
		},
		{ as: master },
	)
	expect(remarks).toEqual([
		{ text: 'Clear', subject: { kind: 'article' } },
		{ text: 'Short', subject: { kind: 'video', video: { url: 'intro.mp4' } } },
	])
	// TypeScript narrows the value on its kind.
	const { subject } = short
	const video = subject?.kind === 'video' ? subject.video.id : ''
	expect(subject).toMatchObject({ kind: 'video', video: { title: 'Intro' } })
	// Linking another kind empties the former.
	await Remark.update(
		{
			where: { id: clear.id },
			data: { subject: { connect: { video: { id: video } } } },
		},
		{ as: master },
	)
	expect(
		await Article.findUnique(
			{ where: { id: article.id }, include: { remarks: true } },
			{ as: master },
		),
	).toMatchObject({ remarks: [] })
	//#endregion
	//#region one-of-filter
	// Through one kind, through the fields every kind shares, or by kind.
	const onIntro = await Remark.count(
		{ where: { subject: { video: { is: { url: { equals: 'intro.mp4' } } } } } },
		{ as: master },
	)
	const startingWithI = await Remark.count(
		{ where: { subject: { is: { title: { startsWith: 'I' } } } } },
		{ as: master },
	)
	const onArticles = await Remark.count(
		{ where: { subject: { kind: 'article' } } },
		{ as: master },
	)
	expect([onIntro, startingWithI, onArticles]).toEqual([2, 2, 0])
	//#endregion
	// Deleting the video deletes its remarks with it.
	await Video.deleteMany({ where: {} }, { as: master })
	expect(await Remark.count({}, { as: master })).toBe(0)
})
