// A many-to-many declared on one side, with `inverse: false` (D-248): its
// target gets a hidden `many` back, which storage adapters and realtime read
// as the other side, and no caller sees.
import { Refused } from './errors.ts'
import { hiddenKey } from './one-of-schema.ts'
import type { Linked } from './pairing.ts'
import type { FieldInfo } from './schema.ts'

/** The hidden other side of a `many` declared with `inverse: false`. */
export const hiddenSide = (field: FieldInfo | undefined): boolean =>
	field?.kind === 'many' && field.hidden === true

/** A field the kernel stores that no caller names (D-247, D-248). */
export const concealed = (field: FieldInfo | undefined): boolean =>
	hiddenKey(field) || hiddenSide(field)

/**
 * Each `many` with `inverse: false` made to name a hidden `many` of its
 * target, `Task.assignees` naming `Membership.taskAssignees`, and those
 * hidden sides; stops startup when the target has a field of that name.
 */
export function oneSidedOf(
	links: readonly Linked[],
	declared: (model: string, field: string) => boolean,
	valueOf: (model: string) => unknown,
): { readonly links: readonly Linked[]; readonly hidden: readonly Linked[] } {
	const hidden: Linked[] = []
	const named = links.map((link) => {
		const { field } = link
		if (field.kind !== 'many' || field.options['inverse'] !== false) {
			return link
		}
		const back = `${link.model.charAt(0).toLowerCase()}${link.model.slice(1)}${link.name.charAt(0).toUpperCase()}${link.name.slice(1)}`
		if (declared(link.target, back)) {
			throw new Refused(
				`${link.model}.${link.name}: ${link.target} has a field ${back}, the name its hidden side takes.`,
			)
		}
		hidden.push({
			model: link.target,
			name: back,
			field: {
				kind: 'many',
				target: () => valueOf(link.model),
				options: { inverse: link.name },
			},
			target: link.model,
		})
		return {
			...link,
			field: { ...field, options: { ...field.options, inverse: back } },
		}
	})
	return { links: [...named, ...hidden], hidden }
}
