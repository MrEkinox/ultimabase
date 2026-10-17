import { Member, Post, StaffRole } from './schema.ts'

// Trusted server code: Master authority comes from the application's
// configured key, never from a client-selected `useMasterKey` flag.

//#region add-moderator
/** Adds a member to the `moderator` role, which grants `readDeleted` on Post. */
export const addModerator = (memberId: string) =>
	StaffRole.updateOne(
		{
			data: { members: { connect: [Member.pointer(memberId)] } },
			where: { name: { eq: 'moderator' } },
		},
		{ useMasterKey: true },
	)
//#endregion add-moderator

//#region master-reads
/** Master reads keep the trash filter: live posts only. */
export const listLivePosts = () =>
	Post.findMany({ select: { title: true } }, { useMasterKey: true })

/** A Master read whose own `where` names `isDeleted` sees tombstones. */
export const listTrash = () =>
	Post.findMany(
		{
			orderBy: { deletedAt: 'desc' },
			select: { title: true, deletedAt: true },
			where: { isDeleted: true },
		},
		{ useMasterKey: true },
	)

/** Every row, live or deleted. */
export const countAllPosts = () =>
	Post.count(
		{ where: { isDeleted: { in: [true, false] } } },
		{ useMasterKey: true },
	)
//#endregion master-reads

//#region empty-trash
/** Permanently removes the posts deleted before `cutoff`. */
export const emptyTrash = (cutoff: Date) =>
	Post.purgeMany(
		{
			where: { deletedAt: { lt: cutoff.toISOString() } },
			select: { title: true },
		},
		{ useMasterKey: true },
	)
//#endregion empty-trash
