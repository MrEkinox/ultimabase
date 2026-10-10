import { serve, type ServerType } from '@hono/node-server'
import type { Hono } from 'hono'
import { expect } from 'vitest'

import {
	readObject,
	readString,
	type MinimalClient,
} from './rest-public-vertical-support.js'

export const relationQuery = `query RelationView($id: ID!, $after: String) {
	getExampleArticle(id: $id) {
		contributors(
			after: $after
			first: 1
			orderBy: [{ field: name, direction: ASC }]
			where: { name: { contains: " " } }
		) {
			nodes { name }
			pageInfo { endCursor hasNextPage }
		}
		reviewers(first: 10, orderBy: [{ field: name, direction: ASC }]) {
			nodes { name }
			pageInfo { endCursor hasNextPage }
		}
	}
}`

export const relationChecksQuery = `query Checks($id: ID!) {
	countExampleArticle(where: {
		id: { eq: $id }, contributors: { count: { eq: 2 } }
	})
	existsExampleArticle(where: {
		id: { eq: $id }, reviewers: { some: { name: { eq: "C Unlisted" } } }
	})
}`

export const readRecord = (
	value: unknown,
	label: string,
): Readonly<Record<string, unknown>> =>
	readObject(value, label) as Readonly<Record<string, unknown>>

export const readArray = (
	value: unknown,
	label: string,
): readonly unknown[] => {
	if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
	return value
}

export const readGraphqlData = (
	value: unknown,
): Readonly<Record<string, unknown>> => {
	const envelope = readRecord(value, 'GraphQL response')
	expect(envelope.errors).toBeUndefined()
	return readRecord(envelope.data, 'GraphQL data')
}

export const readGraphqlField = (value: unknown, field: string): unknown =>
	readGraphqlData(value)[field]

export const relationNames = (value: unknown): readonly string[] =>
	readArray(value, 'relation result').map((item) =>
		readString(readObject(item, 'relation item'), 'name'),
	)

export const readConnection = (
	value: unknown,
	field: string,
): Readonly<{
	readonly endCursor: string | null
	readonly hasNextPage: boolean
	readonly names: readonly string[]
}> => {
	const result = readRecord(readRecord(value, 'GraphQL source')[field], field)
	const pageInfo = readRecord(result.pageInfo, `${field} page info`)
	const endCursor = pageInfo.endCursor
	const hasNextPage = pageInfo.hasNextPage
	if (endCursor !== null && typeof endCursor !== 'string') {
		throw new TypeError(`${field} end cursor must be a string or null`)
	}
	if (typeof hasNextPage !== 'boolean') {
		throw new TypeError(`${field} hasNextPage must be a boolean`)
	}
	return {
		endCursor,
		hasNextPage,
		names: relationNames(result.nodes),
	}
}

export const closeServer = (server: ServerType): Promise<void> =>
	new Promise((resolve, reject) => {
		server.close((error?: Error) => {
			if (error === undefined) resolve()
			else reject(error)
		})
	})

export const startServer = (app: Hono): Promise<ServerType> =>
	new Promise((resolve, reject) => {
		const server = serve(
			{
				fetch: app.fetch,
				hostname: '127.0.0.1',
				overrideGlobalObjects: true,
				port: 0,
			},
			() => {
				server.removeListener('error', reject)
				resolve(server)
			},
		)
		server.once('error', reject)
	})

export const readRestArticle = async (
	client: MinimalClient,
	articlePath: string,
	articleId: string,
): Promise<Readonly<Record<string, unknown>>> => {
	const response = await client.fetch(`${articlePath}/query`, {
		body: JSON.stringify({
			include: {
				contributors: {
					take: 1,
					skip: 1,
					orderBy: { name: 'asc' },
					select: { name: true },
					where: { name: { contains: ' ' } },
				},
				reviewers: {
					orderBy: { name: 'asc' },
					select: { name: true },
				},
			},
			select: { id: true },
			where: { id: { eq: articleId } },
		}),
		headers: { 'Content-Type': 'application/json' },
		method: 'POST',
	})
	expect(response.status).toBe(200)
	const rows = readArray(
		readRecord(await response.json(), 'REST envelope').results,
		'REST results',
	)
	return readRecord(rows[0], 'REST article')
}
