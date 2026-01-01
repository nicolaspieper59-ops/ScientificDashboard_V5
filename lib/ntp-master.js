/**
 * OMNISCIENCE V100 PRO - TEMPORAL MASTER
 * Synchronisation 0.001s & Éphémérides
 */
const TimeSync = {
    offset: 0,
    drift: 0,
    lastSync: 0,

    async sync() {
        const t0 = performance.now();
        try {
            const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await res.json();
            const rtt = performance.now() - t0;
            const serverMs = new Date(data.utc_datetime).getTime();
            this.offset = serverMs + (rtt / 2) - Date.now();
            this.lastSync = Date.now();
            
            document.getElementById('ntp-offset').innerText = this.offset.toFixed(3) + " ms";
            document.getElementById('clock-accuracy-2').innerText = "± " + (rtt / 2).toFixed(1) + "ms";
        } catch (e) { console.warn("NTP Link Lost - Internal Clock Active"); }
    },

    getAtomic() {
        return Date.now() + this.offset;
    },

    loop() {
        const now = this.getAtomic();
        const d = new Date(now);
        
        // Mise à jour des IDs temporels
        document.getElementById('gmt-time-display-2').innerText = d.toISOString().split('T')[1].replace('Z','');
        
        // Date Julienne
        const jd = (now / 86400000) + 2440587.5;
        document.getElementById('julian-date').innerText = jd.toFixed(6);

        requestAnimationFrame(() => this.loop());
    }
};
