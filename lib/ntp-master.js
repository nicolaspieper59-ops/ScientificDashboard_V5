/**
 * OMNISCIENCE V100 - NTP MASTER & THERMAL CLOCK
 */
const NTPMaster = {
    offset: 0,
    driftRate: 1.000000000000, 

    sync() {
        this.startTime = performance.now();
        this.refTime = BigInt(Date.now()) * 1000000n; // Temps en nanosecondes
    },

    getNow() {
        const elapsed = (performance.now() - this.startTime);
        // Correction thermique basée sur la charge CPU (simulation de dérive)
        const tempAdjustment = 1.0 + (elapsed * 1e-15); 
        return BigInt(Math.floor(Number(this.refTime) + (elapsed * 1000000 * tempAdjustment)));
    }
};
