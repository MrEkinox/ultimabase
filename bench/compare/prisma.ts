// Prisma 7 through its PostgreSQL driver adapter, as its documentation shows
// (D-100).
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.ts'
import type { Contender } from './contender.ts'

let client: PrismaClient | undefined

function prisma(): PrismaClient {
	if (client === undefined) throw new Error('Prisma has not started.')
	return client
}

export const prismaContender: Contender = {
	name: 'Prisma',
	createsTables: false,
	start: async (url, schema) => {
		client = new PrismaClient({
			adapter: new PrismaPg({ connectionString: url }, { schema }),
		})
		await client.$connect()
	},
	stop: async () => prisma().$disconnect(),
	createGenre: async (label) => prisma().genre.create({ data: { label } }),
	createWriter: async (name) => prisma().writer.create({ data: { name } }),
	createNovel: async (title, writer, genres) =>
		prisma().novel.create({
			data: {
				title,
				writer: { connect: { id: writer } },
				genres: { connect: genres.map((id) => ({ id })) },
			},
		}),
	renameWriter: async (id, name) =>
		prisma().writer.update({ where: { id }, data: { name } }),
	regenre: async (id, from, to) =>
		prisma().novel.update({
			where: { id },
			data: { genres: { disconnect: [{ id: from }], connect: [{ id: to }] } },
		}),
	deleteWriter: async (id) => prisma().writer.delete({ where: { id } }),
	createGenres: async (a, b) =>
		prisma().$transaction(async (tx) => [
			await tx.genre.create({ data: { label: a } }),
			await tx.genre.create({ data: { label: b } }),
		]),
	findWriter: async (id) => prisma().writer.findUnique({ where: { id } }),
	findWriters: async (take) =>
		prisma().writer.findMany({
			take,
			orderBy: { id: 'asc' },
			include: {
				novels: { orderBy: { id: 'asc' }, include: { genres: true } },
			},
		}),
}
