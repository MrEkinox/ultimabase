import type { createMinimalApplication } from './create-application.ts'
import { ExampleArticle, ExampleAuthor } from './schema.ts'

type MinimalApplication = ReturnType<typeof createMinimalApplication>

const runWithSession = <TResult>(
	app: MinimalApplication,
	sessionToken: string,
	handler: () => Promise<TResult>,
): Promise<TResult> =>
	app.application
		.getPlugin('@ultimabase/password-auth-plugin')
		.runWithSession(sessionToken, handler)

/** Runs the explicit command from the exact application schema handle. */
export const softDeleteArticle = (
	app: MinimalApplication,
	id: string,
	sessionToken: string,
) =>
	runWithSession(app, sessionToken, () =>
		app.schema(ExampleArticle).softDelete({
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
		const article = await ExampleArticle.findOne(
			{ select: { id: true, title: true }, where: { id: { eq: id } } },
			{ ultimabase: app },
		)
		if (article === null) return null
		return article.softDelete({
			select: { id: true, isDeleted: true, title: true },
		})
	})
}

/** Restores one hidden article through trusted server authority. */
export const restoreArticle = (app: MinimalApplication, id: string) =>
	app
		.schema(ExampleArticle)
		.restore(
			{ id, select: { id: true, isDeleted: true, title: true } },
			{ useMasterKey: true },
		)

/** Permanently removes one already hidden article. */
export const purgeArticle = (app: MinimalApplication, id: string) =>
	app
		.schema(ExampleArticle)
		.purge(
			{ id, select: { id: true, isDeleted: true, title: true } },
			{ useMasterKey: true },
		)

/** Keeps native delete syntax while replace mode writes an author tombstone. */
export const softDeleteAuthor = (app: MinimalApplication, id: string) =>
	ExampleAuthor.deleteOne(
		{ id, select: { id: true, name: true } },
		{ ultimabase: app },
	)
