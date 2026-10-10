import type { createMinimalApplication } from './create-application.ts'
import { ExampleArticle, ExampleAuthor } from './schema.ts'

type MinimalApplication = ReturnType<typeof createMinimalApplication>

const runWithSession = <TResult>(
	app: MinimalApplication,
	sessionToken: string,
	handler: () => Promise<TResult>,
): Promise<TResult> =>
	app
		.plugin('@ultimabase/password-auth-plugin')
		.runWithSession(sessionToken, handler)

/** Runs the plugin command on the class through this exact application. */
export const softDeleteArticle = (
	app: MinimalApplication,
	id: string,
	sessionToken: string,
) =>
	runWithSession(app, sessionToken, () =>
		ExampleArticle.softDelete({
			id,
			select: { id: true, isDeleted: true, title: true },
		}),
	)

/** Demonstrates the same explicit command from a bound persisted model. */
export const softDeleteArticleFromModel = async (
	app: MinimalApplication,
	id: string,
	sessionToken: string,
) => {
	return runWithSession(app, sessionToken, async () => {
		const article = await ExampleArticle.findOne({
			select: { id: true, title: true },
			where: { id: { eq: id } },
		})
		if (article === null) return null
		return article.softDelete({
			select: { id: true, isDeleted: true, title: true },
		})
	})
}

/** Restores one hidden article through trusted server authority. */
export const restoreArticle = (id: string) =>
	ExampleArticle.restore(
		{ id, select: { id: true, isDeleted: true, title: true } },
		{ useMasterKey: true },
	)

/** Permanently removes one already hidden article. */
export const purgeArticle = (id: string) =>
	ExampleArticle.purge(
		{ id, select: { id: true, isDeleted: true, title: true } },
		{ useMasterKey: true },
	)

/** Keeps native delete syntax while replace mode writes an author tombstone. */
export const softDeleteAuthor = (id: string) =>
	ExampleAuthor.deleteOne({
		where: { id: { eq: id } },
		select: { id: true, name: true },
	})
