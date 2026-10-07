/** Compares deterministic schema declarations without requiring shared identity. */
export const areSchemaDeclarationValuesCompatible = (
	left: unknown,
	right: unknown,
	seen: WeakMap<object, WeakSet<object>> = new WeakMap(),
): boolean => {
	if (Object.is(left, right)) return true

	if (typeof left === 'function' || typeof right === 'function') {
		return typeof left === 'function' && typeof right === 'function'
	}

	if (
		typeof left !== 'object' ||
		left === null ||
		typeof right !== 'object' ||
		right === null
	) {
		return false
	}

	const seenRights = seen.get(left)

	if (seenRights?.has(right) === true) return true
	if (seenRights === undefined) {
		seen.set(left, new WeakSet([right]))
	} else {
		seenRights.add(right)
	}

	if (left instanceof Date || right instanceof Date) {
		return (
			left instanceof Date &&
			right instanceof Date &&
			left.getTime() === right.getTime()
		)
	}

	if (left instanceof RegExp || right instanceof RegExp) {
		return (
			left instanceof RegExp &&
			right instanceof RegExp &&
			left.source === right.source &&
			left.flags === right.flags
		)
	}

	if (ArrayBuffer.isView(left) || ArrayBuffer.isView(right)) {
		if (!ArrayBuffer.isView(left) || !ArrayBuffer.isView(right)) return false

		const leftBytes = new Uint8Array(
			left.buffer,
			left.byteOffset,
			left.byteLength,
		)
		const rightBytes = new Uint8Array(
			right.buffer,
			right.byteOffset,
			right.byteLength,
		)

		return (
			leftBytes.length === rightBytes.length &&
			leftBytes.every((value, index) => value === rightBytes[index])
		)
	}

	if (Array.isArray(left) || Array.isArray(right)) {
		return (
			Array.isArray(left) &&
			Array.isArray(right) &&
			left.length === right.length &&
			left.every((value: unknown, index: number) =>
				areSchemaDeclarationValuesCompatible(value, right[index], seen),
			)
		)
	}

	if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false

	const leftKeys = Reflect.ownKeys(left)
	const rightKeys = Reflect.ownKeys(right)

	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every(
			(key) =>
				Object.hasOwn(right, key) &&
				areSchemaDeclarationValuesCompatible(
					Reflect.get(left, key),
					Reflect.get(right, key),
					seen,
				),
		)
	)
}
