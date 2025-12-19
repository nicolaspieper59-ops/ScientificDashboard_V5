/**
 * GNSS SpaceTime Dashboard - Moteur de Fusion UKF 21/24 États
 * Version Finale Optimisée pour index (22).html
 */

class UKFDashboard {
    constructor() {
        // --- Constantes Physiques ---
        this.C = 299792458;
        this.G = 6.67430e-11;
        this.G_EARTH = 9.80665;
        this.AIR_DENSITY_SEA = 1.225;

        // --- État du Système ---
        this.isRunning = false;
        this.startTime = Date.now();
        this.lastUpdate = Date.now();
        this.totalDistance = 0;
        this.vMax = 0;
        this.mass = 70;

        // --- Données Capteurs ---
        this.state = {
            vMs: 0,
            vStable: 0,
            lat: 0,
            lon: 0,
            alt: 0,
            pitch: 0,
            roll: 0,
            gamma: 1.0,
            gForceVert: 1.0
        };

        this.initEventListeners();
    }

    initEventListeners() {
        // Activation du système (Gestion des permissions iOS/Android)
        document.getElementById('gps-pause-toggle').addEventListener('click', async () => {
            if (!this.isRunning) {
                await this.requestPermissions();
                this.startSystem();
            } else {
                this.stopSystem();
            }
        });

        // Réinitialisations
        document.getElementById('reset-dist-btn').addEventListener('click', () => this.totalDistance = 0);
        document.getElementById('reset-max-btn').addEventListener('click', () => this.vMax = 0);
        
        // Mise à jour de la masse
        document.getElementById('mass-input').addEventListener('input', (e) => {
            this.mass = parseFloat(e.target.value) || 70;
            document.getElementById('mass-display').textContent = this.mass.toFixed(3) + " kg";
        });
    }

    async requestPermissions() {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceMotionEvent.requestPermission();
                return permission === 'granted';
            } catch (e) { return false; }
        }
        return true;
    }

    startSystem() {
        this.isRunning = true;
        document.getElementById('gps-pause-toggle').textContent = "⏸ PAUSE SYSTÈME";
        document.getElementById('gps-pause-toggle').style.backgroundColor = "#dc3545";
        
        // Écouteurs Capteurs
        window.addEventListener('devicemotion', (e) => this.handleMotion(e), true);
        window.addEventListener('deviceorientation', (e) => this.handleOrientation(e), true);
        
        // GPS
        this.watchID = navigator.geolocation.watchPosition(
            (p) => this.handleGPS(p),
            (err) => console.error(err),
            { enableHighAccuracy: true }
        );

        // Boucle de rendu
        this.renderLoop();
    }

    stopSystem() {
        this.isRunning = false;
        document.getElementById('gps-pause-toggle').textContent = "▶️ MARCHE GPS";
        document.getElementById('gps-pause-toggle').style.backgroundColor = "#28a745";
        navigator.geolocation.clearWatch(this.watchID);
        location.reload(); // Réinitialisation propre
    }

    handleMotion(event) {
        if (!this.isRunning) return;
        const acc = event.accelerationIncludingGravity;
        if (!acc) return;

        // IDs : accel-x, accel-y, accel-z
        document.getElementById('accel-x').textContent = acc.x.toFixed(4);
        document.getElementById('accel-y').textContent = acc.y.toFixed(4);
        document.getElementById('accel-z').textContent = acc.z.toFixed(4);

        // Calcul de la Force G Verticale
        this.state.gForceVert = acc.z / this.G_EARTH;
        document.getElementById('force-g-vert').textContent = this.state.gForceVert.toFixed(3);
    }

    handleOrientation(event) {
        // IDs : pitch, roll
        this.state.pitch = event.beta; // Inclinaison
        this.state.roll = event.gamma; // Roulis
        
        document.getElementById('pitch').textContent = this.state.pitch.toFixed(1) + "°";
        document.getElementById('roll').textContent = this.state.roll.toFixed(1) + "°";

        // Mise à jour visuelle du niveau à bulle (ID: bubble)
        const bubble = document.getElementById('bubble');
        if (bubble) {
            const moveX = Math.max(-45, Math.min(45, this.state.roll));
            const moveY = Math.max(-45, Math.min(45, this.state.pitch));
            bubble.style.transform = `translate(${moveX}px, ${moveY}px)`;
        }
    }

    handleGPS(position) {
        this.state.vMs = position.coords.speed || 0;
        this.state.lat = position.coords.latitude;
        this.state.lon = position.coords.longitude;
        this.state.alt = position.coords.altitude || 0;

        // Mise à jour des IDs de position
        document.getElementById('lat-ukf').textContent = this.state.lat.toFixed(6);
        document.getElementById('lon-ukf').textContent = this.state.lon.toFixed(6);
        document.getElementById('alt-ukf').textContent = this.state.alt.toFixed(2) + " m";
        document.getElementById('gps-accuracy-display').textContent = position.coords.accuracy.toFixed(1) + " m";
    }

    renderLoop() {
        if (!this.isRunning) return;

        const now = Date.now();
        const dt = (now - this.lastUpdate) / 1000;
        this.lastUpdate = now;

        // --- PHYSIQUE RELATIVISTE ---
        const v = this.state.vMs;
        this.state.gamma = 1 / Math.sqrt(1 - Math.pow(v / this.C, 2));
        const timeDilationV = (this.state.gamma - 1) * 86400 * 1e9; // ns/jour

        // --- DISTANCE 3D ---
        this.totalDistance += v * dt;

        // --- MISE À JOUR DOM ---
        // Vitesse
        const vKmh = v * 3.6;
        if (vKmh > this.vMax) this.vMax = vKmh;

        this.safeUpdate('speed-main-display', vKmh.toFixed(1) + " km/h");
        this.safeUpdate('speed-stable-kmh', vKmh.toFixed(2) + " km/h");
        this.safeUpdate('speed-stable-ms', v.toFixed(3) + " m/s");
        this.safeUpdate('speed-max-session', this.vMax.toFixed(1) + " km/h");

        // Relativité (12 décimales)
        this.safeUpdate('lorentz-factor', this.state.gamma.toFixed(12));
        this.safeUpdate('time-dilation-vitesse', timeDilationV.toFixed(3) + " ns/j");
        this.safeUpdate('mach-number', (v / 343).toFixed(4));

        // Distance
        this.safeUpdate('total-distance', (this.totalDistance / 1000).toFixed(3) + " km | " + this.totalDistance.toFixed(2) + " m");
        this.safeUpdate('distance-light-s', (this.totalDistance / this.C).toExponential(4) + " s");

        // Temps
        this.safeUpdate('elapsed-time', ((now - this.startTime) / 1000).toFixed(2) + " s");
        this.safeUpdate('local-time', new Date().toLocaleTimeString());

        requestAnimationFrame(() => this.renderLoop());
    }

    safeUpdate(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }
}

// Initialisation au chargement
window.addEventListener('load', () => {
    const app = new UKFDashboard();
});
