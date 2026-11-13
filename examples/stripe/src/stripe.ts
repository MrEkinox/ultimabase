// What the application sells with: the currency, the catalog and the
// customer portal, shared by the plugin and the deploy script.
//#region selling
import type { StripeCatalogOptions } from '@ultimabase/stripe'
import { applyStripeCatalog } from '@ultimabase/stripe'
import { gems500, pro } from './catalog.ts'

export const selling = {
	currency: 'eur',
	// The amounts include the taxes.
	taxBehavior: 'inclusive',
	products: [pro, gems500],
	portal: {
		returnUrl: 'https://app.example.com/account',
		termsUrl: 'https://app.example.com/terms',
		privacyUrl: 'https://app.example.com/privacy',
		// The defaults: a dearer plan is charged at once, a cheaper one
		// starts at the period's end.
		upgrades: 'invoiceNow',
		downgrades: 'atPeriodEnd',
		trialChange: 'endTrial',
		cancel: 'atPeriodEnd',
	},
} satisfies Omit<StripeCatalogOptions, 'secret'>
//#endregion

//#region deploy
/** Brings the Stripe account of `secret` to the catalog. */
export const deployCatalog = (secret: string | undefined, dryRun: boolean) =>
	applyStripeCatalog({ secret, ...selling, dryRun })
//#endregion
