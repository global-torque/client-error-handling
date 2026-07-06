const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 250;
export function createDedupeFilter({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES, now = () => Date.now(), } = {}) {
    const seen = new Map();
    function prune(currentTime) {
        for (const [fingerprint, timestamp] of seen.entries()) {
            if (currentTime - timestamp > ttlMs || seen.size > maxEntries) {
                seen.delete(fingerprint);
            }
        }
    }
    return {
        accept(error) {
            const currentTime = now();
            prune(currentTime);
            if (seen.has(error.fingerprint)) {
                return false;
            }
            seen.set(error.fingerprint, currentTime);
            return true;
        },
        clear() {
            seen.clear();
        },
        size() {
            return seen.size;
        },
    };
}
//# sourceMappingURL=dedupe.js.map