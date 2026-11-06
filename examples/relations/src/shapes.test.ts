// The other shapes of a relation, written and read from server code as
// Master, each test on a new in-memory database. Its short regions are shown
// on the page (D-282).
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Author, Book, Publisher } from './models.ts'
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
	ReadingList,
	Remark,
	Series,
	Task,
	Video,
} from './shapes.ts'

testApplication(app)

const as = { as: master }

it('creates, reads and deletes the card of a member', async () => {
	//#region one-to-one-write
	const ada = await Member.create(
		{ data: { name: 'Ada', card: { create: { number: 'C-1' } } } },
		as,
	)
	const card = await Card.findUniqueOrThrow(
		{ where: { number: 'C-1' }, include: { member: true } },
		as,
	)
	expect(card.member?.name).toBe('Ada')
	//#endregion
	//#region one-to-one-update
	await Member.update(
		{ where: { id: ada.id }, data: { card: { update: { number: 'C-2' } } } },
		as,
	)
	// `delete: true` on the optional side deletes the linked card.
	await Member.update(
		{ where: { id: ada.id }, data: { card: { delete: true } } },
		as,
	)
	//#endregion
	const read = await Member.findUniqueOrThrow(
		{ where: { id: ada.id }, include: { card: true } },
		as,
	)
	expect(read.card).toBeNull()
	expect(await Card.count({}, as)).toBe(0)
})

it('nests categories, and empties a parent that is deleted', async () => {
	//#region self-write
	const fiction = await Category.create(
		{
			data: {
				name: 'Fiction',
				children: { create: [{ name: 'Fantasy' }, { name: 'Horror' }] },
			},
		},
		as,
	)
	//#endregion
	//#region self-delete
	await Category.delete({ where: { id: fiction.id } }, as)
	const left = await Category.findMany(
		{ orderBy: { name: 'asc' }, include: { parent: true } },
		as,
	)
	expect(left.map(({ name, parent }) => [name, parent])).toEqual([
		['Fantasy', null],
		['Horror', null],
	])
	//#endregion
})

it('unlinks an optional relation', async () => {
	const fiction = await Category.create(
		{ data: { name: 'Fiction', children: { create: [{ name: 'Fantasy' }] } } },
		as,
	)
	const fantasy = await Category.findFirstOrThrow(
		{ where: { name: 'Fantasy' } },
		as,
	)
	//#region disconnect-one
	await Category.update(
		{ where: { id: fantasy.id }, data: { parent: { disconnect: true } } },
		as,
	)
	//#endregion
	const read = await Category.findUniqueOrThrow(
		{ where: { id: fiction.id }, include: { children: true } },
		as,
	)
	expect(read.children).toEqual([])
})

it('reads the two relations between branches', async () => {
	//#region inverse-write
	const paris = await Branch.create({ data: { city: 'Paris' } }, as)
	const transfer = { copies: 12, from: { connect: { id: paris.id } } }
	await Branch.create(
		{ data: { city: 'Lyon', incoming: { create: [transfer] } } },
		as,
	)
	//#endregion
	//#region inverse-read
	const read = await Branch.findUniqueOrThrow(
		{
			where: { id: paris.id },
			include: { outgoing: { include: { to: true } }, incoming: true },
		},
		as,
	)
	expect(read.outgoing.map((sent) => sent.to?.city)).toEqual(['Lyon'])
	expect(read.incoming).toEqual([])
	//#endregion
})

it('links a notice to a branch that has no field for it', async () => {
	const paris = await Branch.create({ data: { city: 'Paris' } }, as)
	//#region one-sided-write
	await Notice.create(
		{
			data: { text: 'Closed on Monday', branch: { connect: { id: paris.id } } },
		},
		as,
	)
	//#endregion
	//#region one-sided-read
	const found = await Notice.findMany(
		{ where: { branch: { is: { city: 'Paris' } } }, include: { branch: true } },
		as,
	)
	expect(found.map((notice) => notice.branch?.city)).toEqual(['Paris'])
	//#endregion
	// `onDelete: 'cascade'` deletes the notices with their branch.
	await Branch.delete({ where: { id: paris.id } }, as)
	expect(await Notice.count({}, as)).toBe(0)
})

it('lists books on a reading list that they have no field for', async () => {
	const author = await Author.create({ data: { name: 'Le Guin' } }, as)
	const publisher = await Publisher.create({ data: { name: 'Ace' } }, as)
	const book = (title: string) =>
		Book.create(
			{
				data: {
					title,
					author: { connect: { id: author.id } },
					publisher: { connect: { id: publisher.id } },
				},
			},
			as,
		)
	const earthsea = await book('A Wizard of Earthsea')
	//#region one-sided-many-write
	const list = await ReadingList.create(
		{
			data: { title: 'Winter', books: { connect: [{ id: earthsea.id }] } },
		},
		as,
	)
	//#endregion
	//#region one-sided-many-read
	const found = await ReadingList.findMany(
		{
			where: { books: { some: { title: { contains: 'Earthsea' } } } },
			select: { title: true, books: { select: { title: true } } },
		},
		as,
	)
	expect(found).toEqual([
		{ title: 'Winter', books: [{ title: 'A Wizard of Earthsea' }] },
	])
	//#endregion
	// Deleting a book removes it from the lists.
	await Book.delete({ where: { id: earthsea.id } }, as)
	const read = await ReadingList.findUniqueOrThrow(
		{ where: { id: list.id }, include: { books: true } },
		as,
	)
	expect(read.books).toEqual([])
})

it('reads the members of a club through their memberships', async () => {
	const club = await Club.create({ data: { name: 'Thursday readers' } }, as)
	//#region join-model-write
	const membership = {
		role: 'host' as const,
		club: { connect: { id: club.id } },
	}
	await Reader.create(
		{ data: { name: 'Grace', memberships: { create: [membership] } } },
		as,
	)
	//#endregion
	//#region join-model-read
	const read = await Club.findUniqueOrThrow(
		{
			where: { id: club.id },
			include: { memberships: { include: { reader: true } } },
		},
		as,
	)
	expect(
		read.memberships.map(({ role, reader }) => [reader?.name, role]),
	).toEqual([['Grace', 'host']])
	//#endregion
	expect(await Membership.count({}, as)).toBe(1)
})

it('reads only the released volumes of a series through its view', async () => {
	//#region view-write
	const series = await Series.create(
		{
			data: {
				title: 'Earthsea',
				volumes: {
					create: [{ title: 'Wizard', released: true }, { title: 'Wind' }],
				},
			},
		},
		as,
	)
	//#endregion
	//#region view-read
	const read = await Series.findUniqueOrThrow(
		{
			where: { id: series.id },
			include: {
				released: true,
				_count: { select: { volumes: true, released: true } },
			},
		},
		as,
	)
	expect(read.released.map((volume) => volume.title)).toEqual(['Wizard'])
	expect(read._count).toEqual({ volumes: 2, released: 1 })
	//#endregion

	//#region one-view-read
	const next = await Series.findUniqueOrThrow(
		{
			where: { id: series.id },
			select: { upcoming: { select: { title: true } } },
		},
		as,
	)
	expect(next.upcoming).toEqual({ title: 'Wind' })
	//#endregion
	//#region one-view-filter
	// Filtered like a `one`.
	const writing = await Series.findMany(
		{ where: { upcoming: { isNot: null } } },
		as,
	)
	expect(writing.map((each) => each.title)).toEqual(['Earthsea'])
	//#endregion
})

it('keeps a task within the project of its milestone', async () => {
	const site = await Project.create({ data: { name: 'Site' } }, as)
	const shop = await Project.create({ data: { name: 'Shop' } }, as)
	const beta = await Milestone.create(
		{ data: { name: 'Beta', project: { connect: { id: site.id } } } },
		as,
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
	//#region within-write
	await Task.create(
		{
			data: {
				title: 'Write the docs',
				project: { connect: { id: site.id } },
				milestone: { connect: { id: beta.id } },
			},
		},
		as,
	)
	//#endregion
	//#region within-task
	// A task of another project cannot link the milestone.
	const data = {
		title: 'Ship',
		project: { connect: { id: shop.id } },
		milestone: { connect: { id: beta.id } },
	}
	await expect(Task.create({ data }, as)).rejects.toMatchObject(refused)
	//#endregion
	//#region within-milestone
	// Nor can the milestone leave its project while a task links it.
	const move = { project: { connect: { id: shop.id } } }
	await expect(
		Milestone.update({ where: { id: beta.id }, data: move }, as),
	).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	//#endregion
})

it('keeps the tasks a note links within its project', async () => {
	const site = await Project.create({ data: { name: 'Site' } }, as)
	const shop = await Project.create({ data: { name: 'Shop' } }, as)
	const task = await Task.create(
		{ data: { title: 'Ship', project: { connect: { id: shop.id } } } },
		as,
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
	//#region within-many-write
	const here = { connect: { id: site.id } }
	const note = await Note.create(
		{
			data: {
				text: 'Release plan',
				project: here,
				tasks: { create: [{ title: 'Write the docs', project: here }] },
			},
		},
		as,
	)
	//#endregion
	//#region within-many-note
	// A task of another project cannot be linked, from the note...
	const link = { tasks: { connect: [{ id: task.id }] } }
	await expect(
		Note.update({ where: { id: note.id }, data: link }, as),
	).rejects.toMatchObject(refused)
	//#endregion
	//#region within-many-task
	// ...nor from the task.
	const back = { notes: { connect: [{ id: note.id }] } }
	await expect(
		Task.update({ where: { id: task.id }, data: back }, as),
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
		as,
	)
	//#endregion
	//#region size-refused
	// A poll with one choice cannot be created.
	const one = { question: 'Yes?', choices: { create: [{ label: 'Yes' }] } }
	await expect(Poll.create({ data: one }, as)).rejects.toMatchObject({
		code: 'RELATION_SIZE',
		message: 'Poll.choices holds 2 to 4 rows: this write leaves 1.',
		details: { model: 'Poll', field: 'choices', min: 2, max: 4, size: 1 },
	})
	//#endregion
	//#region size-other-side
	// Nor can a write from the other side leave it with one.
	const [pizza] = poll.choices
	await expect(
		Choice.delete({ where: { id: pizza?.id ?? '' } }, as),
	).rejects.toMatchObject({ code: 'RELATION_SIZE' })
	//#endregion
	//#region size-delete
	// Deleting the poll deletes its choices with it.
	await Poll.delete({ where: { id: poll.id } }, as)
	expect(await Choice.count({}, as)).toBe(0)
	//#endregion
})

it('relates a remark to an article or a video', async () => {
	const article = await Article.create({ data: { title: 'Looms' } }, as)
	//#region one-of-connect
	// A write names the kind it links or creates.
	const clear = await Remark.create(
		{
			data: {
				text: 'Clear',
				subject: { connect: { article: { id: article.id } } },
			},
		},
		as,
	)
	//#endregion
	//#region one-of-create
	const video = { title: 'Intro', url: 'intro.mp4' }
	const short = await Remark.create(
		{
			include: { subject: true },
			data: { text: 'Short', subject: { create: { video } } },
		},
		as,
	)
	//#endregion
	//#region one-of-read
	// A read gives the kind, and the row of each kind it asks for.
	const remarks = await Remark.findMany(
		{
			orderBy: { text: 'asc' },
			select: { text: true, subject: { video: { select: { url: true } } } },
		},
		as,
	)
	expect(remarks).toEqual([
		{ text: 'Clear', subject: { kind: 'article' } },
		{ text: 'Short', subject: { kind: 'video', video: { url: 'intro.mp4' } } },
	])
	//#endregion
	//#region one-of-narrow
	// TypeScript narrows the value on its kind.
	const { subject } = short
	const id = subject?.kind === 'video' ? subject.video.id : ''
	expect(subject).toMatchObject({ kind: 'video', video: { title: 'Intro' } })
	//#endregion
	//#region one-of-relink
	// Linking another kind empties the former.
	await Remark.update(
		{
			where: { id: clear.id },
			data: { subject: { connect: { video: { id } } } },
		},
		as,
	)
	//#endregion
	//#region one-of-relinked
	const articles = await Article.findUnique(
		{ where: { id: article.id }, include: { remarks: true } },
		as,
	)
	expect(articles).toMatchObject({ remarks: [] })
	//#endregion
	//#region one-of-filter
	// Through one kind, or through the fields every kind shares.
	const onIntro = await Remark.count(
		{ where: { subject: { video: { is: { url: { equals: 'intro.mp4' } } } } } },
		as,
	)
	const startingWithI = await Remark.count(
		{ where: { subject: { is: { title: { startsWith: 'I' } } } } },
		as,
	)
	expect([onIntro, startingWithI]).toEqual([2, 2])
	//#endregion
	//#region one-of-kind
	// By kind.
	const onArticles = await Remark.count(
		{ where: { subject: { kind: 'article' } } },
		as,
	)
	expect(onArticles).toBe(0)
	//#endregion
	// Deleting the video deletes its remarks with it.
	await Video.deleteMany({ where: {} }, as)
	expect(await Remark.count({}, as)).toBe(0)
})
