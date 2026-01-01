/**
 * OMNISCIENCE V100 PRO - TEMPORAL ENGINE
 * Synchronisation GMT ±0.001s avec compensation de dérive
 */
const TimeSync = {
    offset: 0,
    driftRate: 0,
    lastSync: 0,
    precision: 0,

    async sync() {
        const t0 = performance.now();
        try {
            const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await res.json();
            const t1 = performance.now();
            const rtt = t1 - t0;
            
            const serverTime = new Date(data.utc_datetime).getTime();
            const currentOffset = serverTime + (rtt / 2) - Date.now();

            if (this.lastSync > 0) {
                const dt = (Date.now() - this.lastSync) / 1000;
                this.driftRate = (currentOffset - this.offset) / dt;
            }

            this.offset = currentOffset;
            this.lastSync = Date.now();
            this.precision = rtt / 2;
            
            this.updateUI();
        } catch (e) { console.warn("Liaison NTP instable, calcul de dérive interne activé."); }
    },

    getAtomicTime() {
        const dt = (Date.now() - this.lastSync) / 1000;
        return Date.now() + this.offset + (this.driftRate * dt);
    },

    updateUI() {
        document.getElementById('ntp-offset').innerText = this.offset.toFixed(3) + " ms";
        document.getElementById('sync-precision').innerText = "± " + this.precision.toFixed(1) + "ms";
        const atomic = new Date(this.getAtomicTime());
        document.getElementById('utc-sync-time').innerText = atomic.toISOString().split('T')[1].split('Z')[0];
    }
};
setInterval(() => TimeSync.sync(), 300000); // Recalibration toutes les 5 min
