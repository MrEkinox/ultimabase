// What a live read asks for (D-154): each level's `id` selected, the rest
// passed on as given for the kernel to validate.
import { expect, it } from 'vitest'
import { liveArgs, shapeOf } from './shape.ts'

it('selects the id of each level, never under _count', () => {
	const { shape } = shapeOf(
		{
			first: 2,
			select: { title: true, _count: { select: { comments: true } } },
			include: {
				_count: true,
				comments: { select: { text: true } },
				team: true,
			},
			omit: { id: true, title: true },
		},
		false,
	)
	expect(shape).toEqual({
		select: { title: true, _count: { select: { comments: true } }, id: true },
		include: {
			_count: true,
			comments: { select: { text: true, id: true } },
			team: true,
		},
		omit: { title: true },
	})
})

it('passes on a selection that is not an object', () => {
	expect(shapeOf({ select: 'a', include: 'b', omit: 'c' }, true).shape).toEqual(
		{ select: 'a', include: 'b', omit: 'c' },
	)
	expect(liveArgs('rows', false)).toBe('rows')
})
