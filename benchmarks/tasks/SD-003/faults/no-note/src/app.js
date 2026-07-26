import semver from 'semver';
export function isNewer(a, b) { return semver.compare(a, b) > 0; }
