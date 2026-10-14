//#region loyalty
/**
 * Stands for a remote loyalty service that answers for many customers in one
 * request; a virtual field calls it once per read with `resolveMany`.
 */
export const loyaltyService = {
	tiers: async (emails: readonly string[]): Promise<readonly string[]> => {
		await Promise.resolve()
		return emails.map((email) =>
			email.endsWith('@example.org') ? 'gold' : 'standard',
		)
	},
}
//#endregion loyalty
