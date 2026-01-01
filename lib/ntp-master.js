/**
 * OMNISCIENCE V100 - NTP & PRECISION CLOCK
 */
const NTPMaster = {
    startTime: Date.now(),
    perfStart: performance.now(),

    sync() {
        this.perfStart = performance.now();
        this.startTime = Date.now();
    },

    getElapsed() {
        return (performance.now() - this.perfStart) / 1000;
    },

    getUTCTime() {
        const now = new Date(this.startTime + (performance.now() - this.perfStart));
        return now.toISOString().split('T')[1].split('Z')[0];
    }
};
