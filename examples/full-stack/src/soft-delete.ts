import { authPlugin } from '@ultimabase/auth-plugin'

import type { createUltimabase } from './ultimabase.ts'
import { ExampleArticle, ExampleAuthor } from './schema.ts'

/** One application built by `createUltimabase`. */
type FullStackApplication = ReturnType<typeof createUltimabase>

const runWithSession = <TResult>(
	ultimabase: FullStackApplication,
	sessionToken: string,
	handler: () => Promise<TResult>,
): Promise<TResult> =>
	ultimabase.plugin(authPlugin).runWithSession(sessionToken, handler)

/** Runs the plugin command on the class through this exact application. */
export const softDeleteArticle = (
	ultimabase: FullStackApplication,
	id: string,
	sessionToken: string,
) =>
	runWithSession(ultimabase, sessionToken, () =>
		ExampleArticle.softDeleteOne({
			id,
			select: { id: true, isDeleted: true, title: true },
		}),
	)

/** Restores one hidden article through trusted server authority. */
export const restoreArticle = (id: string) =>
	ExampleArticle.restoreOne(
		{ id, select: { id: true, isDeleted: true, title: true } },
		{ useMasterKey: true },
	)

/** Permanently removes one already hidden article. */
export const purgeArticle = (id: string) =>
	ExampleArticle.purgeOne(
		{ id, select: { id: true, isDeleted: true, title: true } },
		{ useMasterKey: true },
	)

/** Keeps native delete syntax while replace mode writes an author tombstone. */
export const softDeleteAuthor = (id: string) =>
	ExampleAuthor.deleteOne({
		where: { id: { eq: id } },
		select: { id: true, name: true },
	})
