/**
 * Common ancestor for every error the pure-logic layer throws. Lets a single
 * `catch` (e.g. a day aggregator collecting skipped entries) distinguish a
 * deliberate domain error — corrupt data, a bad reference — from a genuine
 * bug (TypeError, ReferenceError, ...) without losing which specific domain
 * error it was; tests and callers still assert on the subclasses.
 */
export class FiShakalError extends Error {}
