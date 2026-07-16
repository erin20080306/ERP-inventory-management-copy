import assert from "node:assert/strict";
import {
  calculateRenewalExpiry,
  clampOfflineLeaseExpiry,
  computeLicenseAccess,
  defaultExpiry,
  OFFLINE_LEASE_HOURS,
  TRIAL_DAYS,
} from "../src/lib/license";

const januaryEnd = new Date("2026-01-31T08:30:00.000Z");
assert.equal(defaultExpiry("MONTHLY", januaryEnd)?.toISOString(), "2026-02-28T08:30:00.000Z");
assert.equal(defaultExpiry("ANNUAL", new Date("2024-02-29T08:30:00.000Z"))?.toISOString(), "2025-02-28T08:30:00.000Z");
assert.equal(defaultExpiry("ONCE", januaryEnd), null);

const renewalNow = new Date("2026-07-16T10:00:00.000Z");
assert.equal(calculateRenewalExpiry({
  billing: "MONTHLY",
  now: renewalNow,
  currentExpiresAt: new Date("2026-08-20T10:00:00.000Z"),
})?.toISOString(), "2026-09-20T10:00:00.000Z");
assert.equal(calculateRenewalExpiry({
  billing: "ANNUAL",
  now: renewalNow,
  currentExpiresAt: new Date("2026-07-01T10:00:00.000Z"),
})?.toISOString(), "2027-07-16T10:00:00.000Z");
assert.throws(() => calculateRenewalExpiry({ billing: "MONTHLY", now: renewalNow, requestedExpiresAt: renewalNow }), /晚於/);

const oneHourLater = new Date(renewalNow.getTime() + 60 * 60_000);
assert.equal(clampOfflineLeaseExpiry(renewalNow, oneHourLater).toISOString(), oneHourLater.toISOString());
assert.equal(
  clampOfflineLeaseExpiry(renewalNow, new Date(renewalNow.getTime() + 48 * 60 * 60_000)).toISOString(),
  new Date(renewalNow.getTime() + OFFLINE_LEASE_HOURS * 60 * 60_000).toISOString(),
);

const trialCreatedAt = new Date(renewalNow.getTime() - (TRIAL_DAYS - 1) * 24 * 60 * 60_000);
assert.equal(computeLicenseAccess({ now: renewalNow, tenantCreatedAt: trialCreatedAt }).status, "trial");
assert.equal(computeLicenseAccess({
  now: renewalNow,
  tenantCreatedAt: new Date(renewalNow.getTime() - TRIAL_DAYS * 24 * 60 * 60_000),
}).status, "expired");
assert.equal(computeLicenseAccess({
  now: renewalNow,
  tenantCreatedAt: trialCreatedAt,
  licenseStatus: "ACTIVE",
  licenseActivatedAt: new Date("2026-06-01T00:00:00.000Z"),
  licenseBilling: "MONTHLY",
  licenseExpiresAt: renewalNow,
}).status, "locked");
assert.equal(computeLicenseAccess({ now: renewalNow, isSuperAdmin: true }).status, "paid");

console.log("Commercial trial, renewal and offline expiry controls: PASS");
