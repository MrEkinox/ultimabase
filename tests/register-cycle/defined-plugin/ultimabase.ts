import { App, Draft, Note, Post } from './schema.ts'

export const ultimabase = new App({ schemas: [Post, Note, Draft] })

// The plugins' fields and commands reach the registered schema.
export const archiveAll = () => Post.archiveMany({ where: {} })
export const archivedAt = async (id: string): Promise<string | null> =>
	(await Post.archiveOne({ id, select: { archivedAt: true } })).archivedAt
// @ts-expect-error no command without the feature
export const noCommand: unknown = Note.archiveOne

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
