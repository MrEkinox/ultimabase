---
'@ultimabase/stripe': minor
---

A recurring price takes `trialDays`, from 1 to 730: `stripe.checkout` gives it when the payer has
never subscribed, and none after (D-391). The call's `trialDays` still wins, and `trialDays: 0` now
gives no trial.
