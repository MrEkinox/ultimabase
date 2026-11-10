// Cards kept in the order of their board: a card created without a position
// goes after the last one, those the caller cannot read included.
import { allow, defineModel, master } from 'ultimabase'

//#region card
export const Card = defineModel({
	name: 'Card',
	fields: (f) => ({
		board: f.one(() => Board),
		title: f.string(),
		// Returns no default: optional to create, the hooks fill it.
		position: f.number({ integer: true, default: () => undefined }),
	}),
}).with({
	access: allow.public,
	hooks: {
		// A card created alone; Board numbers the cards it creates.
		beforeCreate: async ({ data }) => {
			if (data.position !== undefined || !('connect' in data.board)) return
			data.position = await after(data.board.connect.id)
		},
	},
})
//#endregion

//#region board
export const Board = defineModel({
	name: 'Board',
	fields: (f) => ({
		name: f.string(),
		cards: f.many(() => Card, { inverse: 'board' }),
	}),
}).with({
	access: allow.public,
	hooks: {
		// The cards of one write are written together, after all their
		// hooks: each would read the same last position.
		beforeUpdate: async ({ record, data }) => {
			const create = data.cards?.create
			if (create === undefined) return
			let next = await after(record.id)
			data.cards = {
				...data.cards,
				create: create.map((card) => ({
					...card,
					position: card.position ?? next++,
				})),
			}
		},
	},
})
//#endregion

/** The position after the last card of a board, read past the rules. */
async function after(board: string): Promise<number> {
	const { _max } = await Card.aggregate(
		{ where: { board: { is: { id: board } } }, _max: { position: true } },
		{ as: master },
	)
	return (_max.position ?? -1) + 1
}
