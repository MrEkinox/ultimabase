import { authPlugin } from '@ultimabase/auth-plugin'

import type { createMinimalApplication } from './create-application.ts'
import { ExampleArticle, ExampleAuthor } from './schema.ts'

type MinimalApplication = ReturnType<typeof createMinimalApplication>

//#region soft-delete-article
const runWithSession = <TResult>(
	app: MinimalApplication,
	sessionToken: string,
	handler: () => Promise<TResult>,
): Promise<TResult> =>
	app.plugin(authPlugin).runWithSession(sessionToken, handler)

/** Runs the plugin command on the class through this exact application. */
export const softDeleteArticle = (
	app: MinimalApplication,
	id: string,
	sessionToken: string,
) =>
	runWithSession(app, sessionToken, () =>
		ExampleArticle.softDeleteOne({
			id,
			select: { id: true, isDeleted: true, title: true },
		}),
	)
//#endregion soft-delete-article

//#region restore-and-purge
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
//#endregion restore-and-purge

/** Keeps native delete syntax while replace mode writes an author tombstone. */
export const softDeleteAuthor = (id: string) =>
	ExampleAuthor.deleteOne({
		where: { id: { eq: id } },
		select: { id: true, name: true },
	})
