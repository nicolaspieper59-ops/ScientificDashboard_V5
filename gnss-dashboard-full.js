/**
 * OMNISCIENCE V100 PRO - MAIN CONTROLER
 */
const Dashboard = {
    ukf: new UKFPro(),
    active: false,
    startTime: null,

    init() {
        document.getElementById('start-btn').addEventListener('click', () => this.toggleSystem());
        this.startSensorLoop();
    },

    toggleSystem() {
        this.active = !this.active;
        const btn = document.getElementById('start-btn');
        if (this.active) {
            this.startTime = Date.now();
            btn.textContent = "SYSTÈME ACTIF";
            btn.style.background = "#ffcc00";
            document.getElementById('status-physique').textContent = "SYSTÈME ACTIF";
        } else {
            btn.textContent = "INITIALISER LE SYSTÈME FINAL";
            btn.style.background = "#0f0";
        }
    },

    startSensorLoop() {
        window.addEventListener('devicemotion', (e) => {
            if (!this.active) return;

            // 1. Récupération des données du niveau à bulle (Pitch/Roll)
            const acc = e.accelerationIncludingGravity;
            const pitch = (Math.atan2(-acc.x, Math.sqrt(acc.y**2 + acc.z**2)) * 180) / Math.PI;
            const roll = (Math.atan2(acc.y, acc.z) * 180) / Math.PI;

            // Mise à jour visuelle niveau à bulle
            document.getElementById('pitch').textContent = pitch.toFixed(1) + "°";
            document.getElementById('roll').textContent = roll.toFixed(1) + "°";

            // 2. Calcul UKF (Vitesse et Distance)
            const result = this.ukf.compute(acc, pitch, roll);

            // 3. Mise à jour NAVIGATION (Vitesse, Max, etc.)
            document.getElementById('sp-main').textContent = result.vKmh.toFixed(4);
            document.getElementById('speed-main-display').textContent = result.vKmh.toFixed(1) + " km/h";
            document.getElementById('speed-stable-kmh').textContent = result.vKmh.toFixed(1) + " km/h";
            document.getElementById('speed-raw-ms').textContent = result.vMs.toFixed(2) + " m/s";
            document.getElementById('dist-3d').textContent = result.dist.toFixed(6);
            document.getElementById('total-distance-3d-2').textContent = (result.dist / 1000).toFixed(6) + " km";

            // 4. Mise à jour RELATIVITÉ
            const c = 299792458; // m/s
            const beta = result.vMs / c;
            const lorentz = 1 / Math.sqrt(1 - Math.pow(beta, 2));
            document.getElementById('lorentz-val').textContent = lorentz.toFixed(10);
            document.getElementById('lorentz-factor').textContent = lorentz.toFixed(8);

            // 5. Mise à jour DYNAMIQUE (G-Force)
            const gTotal = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.80665;
            document.getElementById('g-force').textContent = gTotal.toFixed(2);
            document.getElementById('force-g-vert').textContent = gTotal.toFixed(2);

            // 6. Mise à jour DEBUG & SYSTÈME
            document.getElementById('ukf-velocity-uncertainty').textContent = result.uncertainty.toFixed(4);
            document.getElementById('elapsed-time').textContent = ((Date.now() - this.startTime) / 1000).toFixed(2) + " s";
            
            // 7. Mise à jour IMU RAW
            document.getElementById('acc-x').textContent = acc.x.toFixed(3);
            document.getElementById('acc-y').textContent = acc.y.toFixed(3);
            document.getElementById('acc-z').textContent = acc.z.toFixed(3);
        });

        // Boucle lente pour l'Astro (1Hz)
        setInterval(() => {
            if (!this.active) return;
            const lat = parseFloat(document.getElementById('lat-ukf').textContent);
            const lon = parseFloat(document.getElementById('lon-ukf').textContent);
            AstroEngine.updateAll(lat, lon);
        }, 1000);
    }
};

document.addEventListener('DOMContentLoaded', () => Dashboard.init());
