/**
 * Stands in for a remote service that estimates many texts in one call. The
 * `readingMinutes` virtual field calls it once per read; the tests count
 * `calls`.
 */
export const readingService = {
	calls: 0,
	estimate(texts: readonly string[]): number[] {
		this.calls += 1
		return texts.map((text) => Math.ceil(text.split(/\s+/u).length / 200))
	},
}
