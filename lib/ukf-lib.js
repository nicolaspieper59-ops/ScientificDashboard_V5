// --- UKF ENGINE (ukf-lib.js) ---
class UKFPro {
    constructor() {
        this.velocity = 0;
        this.distance = 0;
        this.lastT = performance.now();
        this.noiseFloor = 0.05; 
    }

    compute(acc, pitch) {
        const now = performance.now();
        const dt = (now - this.lastT) / 1000;
        this.lastT = now;

        const pRad = (pitch * Math.PI) / 180;
        const slopePct = Math.tan(pRad) * 100;
        
        // Suppression gravité
        const linAccZ = acc.z - (9.806 * Math.cos(pRad));
        const cleanAcc = Math.abs(linAccZ) < this.noiseFloor ? 0 : linAccZ;

        this.velocity += cleanAcc * dt;
        if (this.velocity < 0.05 && cleanAcc === 0) this.velocity = 0;
        this.distance += Math.abs(this.velocity * dt);

        return { vMs: Math.abs(this.velocity), slope: slopePct.toFixed(1), dist: this.distance };
    }
}

// --- SCIENCE & SOCIAL MODULE (science-social.js) ---
const ScienceSocial = {
    lastAcc: {x:0, y:0, z:0},
    lastTime: performance.now(),
    isDark: true,

    toggleTheme() {
        this.isDark = !this.isDark;
        document.body.className = this.isDark ? 'dark-mode' : 'light-mode';
        document.getElementById('toggle-mode-btn').textContent = this.isDark ? '☀️ MODE JOUR' : '🌙 MODE NUIT';
    },

    update(acc, speedMs, mass = 70) {
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        if (dt <= 0) return;

        // Jerk (Vibration)
        const jerk = Math.sqrt((acc.x-this.lastAcc.x)**2 + (acc.y-this.lastAcc.y)**2 + (acc.z-this.lastAcc.z)**2) / dt;
        const flow = Math.max(0, 100 - (jerk * 1.2));
        
        // Watts & Calories
        const gTotal = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.81;
        const watts = mass * gTotal * 9.81 * speedMs;

        document.getElementById('jerk-vector').textContent = jerk.toFixed(1) + " m/s³";
        document.getElementById('smoothness-score').textContent = flow.toFixed(0) + "/100";
        document.getElementById('human-power-w').textContent = watts.toFixed(0) + " W";
        document.getElementById('air-time-s').textContent = gTotal < 0.4 ? "AIR ✈️" : "SOL";
        document.getElementById('g-force').textContent = gTotal.toFixed(2);

        this.lastAcc = { ...acc };
        this.lastTime = now;
    }
};
