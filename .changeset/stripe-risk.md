---
'@ultimabase/stripe': minor
---

`stripePlugin`'s `risk` acts on a payment at risk, off unless set (D-388): `earlyFraudWarning:
'refundAndCancel'` refunds the payment Radar warns of, once, and `dispute: 'cancel'` leaves a
disputed payment to its dispute; both end the payer's live subscriptions at once, without
proration, and log a warning. The fake's `warnFraud` and `openDispute` put a test's payment at risk.
