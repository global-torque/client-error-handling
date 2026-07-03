export function createMemoryErrorReporter() {
    const reports = [];
    return {
        reports,
        report(error) {
            reports.push(error);
        },
        clear() {
            reports.splice(0, reports.length);
        },
    };
}
export function createNoopErrorReporter() {
    return {
        report() { },
    };
}
//# sourceMappingURL=reporter.js.map