// Decimal values (D-145): exact numbers as strings, normalized to their
// field's scale, compared and summed through `BigInt`.

/** A decimal string's shape, as transports describe it. */
export const decimalPattern = '^-?\\d+(\\.\\d+)?$'
const shape = new RegExp(decimalPattern)

/** A decimal's digits as a whole number, and how many follow its point. */
type Exact = { readonly units: bigint; readonly scale: number }

function exact(value: string): Exact {
	const [whole = '', fraction = ''] = value.split('.')
	return { units: BigInt(`${whole}${fraction}`), scale: fraction.length }
}

/** `value`'s units at `to` digits after the point; a cut digit is a 0. */
const scaled = ({ units, scale }: Exact, to: number): bigint =>
	to >= scale
		? units * 10n ** BigInt(to - scale)
		: units / 10n ** BigInt(scale - to)

function text(units: bigint, scale: number): string {
	const digits = (units < 0n ? -units : units)
		.toString()
		.padStart(scale + 1, '0')
	const whole = digits.slice(0, digits.length - scale)
	const sign = units < 0n ? '-' : ''
	return scale === 0
		? `${sign}${whole}`
		: `${sign}${whole}.${digits.slice(-scale)}`
}

/** A decimal field's precision and scale. */
export type Digits = { readonly precision: number; readonly scale: number }

/** A field, which has digits if it is a decimal. */
type Digited = { readonly type: string } & Partial<Digits>

/** The message of a value a decimal `field` cannot hold, if it cannot. */
export function decimalIssue(
	value: unknown,
	field: Digited,
): string | undefined {
	const digits = { precision: field.precision ?? 0, scale: field.scale ?? 0 }
	const expected = `Expected a decimal string of at most ${digits.precision} digits, ${digits.scale} after the point, such as '12.50'.`
	if (typeof value !== 'string' || !shape.test(value)) return expected
	const [whole = '', fraction = ''] = value.replace('-', '').split('.')
	const significant = whole.replace(/^0+/, '').length
	const decimals = fraction.replace(/0+$/, '').length
	return significant > digits.precision - digits.scale ||
		decimals > digits.scale
		? expected
		: undefined
}

/** `value`, which fits, at `scale`: `'012.5'` is `'12.50'`. */
export const normalized = (value: string, scale: number): string =>
	text(scaled(exact(value), scale), scale)

/** A value that fits `field`, as stored: a decimal at its scale. */
export const storedValue = (value: unknown, field: Digited): unknown =>
	field.type === 'decimal' && typeof value === 'string'
		? normalized(value, field.scale ?? 0)
		: value

/** A decimal string's units at `scale`, which order decimals by value. */
export const unitsOf = (value: string, scale: number): bigint =>
	scaled(exact(value), scale)

/** The exact sum of decimal strings, at `scale`. */
export function sumDecimals(values: readonly string[], scale: number): string {
	const total = values.reduce((sum, value) => sum + unitsOf(value, scale), 0n)
	return text(total, scale)
}
