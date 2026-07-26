import semver from 'semver';
export function isNewer(a, b) { return semver(a, b) > 0; }
