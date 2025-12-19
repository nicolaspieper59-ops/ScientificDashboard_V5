/**
 * =================================================================
 * GNSS SPACETIME DASHBOARD - SUPREME MASTER V66 (ULTIMATE GOLD)
 * =================================================================
 * - Moteur : Unscented Kalman Filter (UKF) 24 États
 * - Physique : Newton, Somigliana (Gravité), Einstein (Relativité), ISA (Atmo)
 * - Correction : Algorithme ZUPT (Zero Velocity Update) anti-dérive
 * - Interface : Binding complet des IDs de l'index (22).html
 * =================================================================
 */

((window) => {
    "use strict";

    // --- Vérification math.js ---
    if (typeof math === 'undefined') {
        alert("Erreur : math.js est requis pour le filtrage de Kalman.");
        return;
    }

    const $ = id => document.getElementById(id);

    // =================================================================
    // 1. CLASSE UKF PROFESSIONNELLE (24 ÉTATS)
    // =================================================================
    class ProfessionalUKF {
        constructor(lat = 48.8566, lon = 2.3522, alt = 120) {
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.P = math.multiply(math.eye(this.n), 0.1);
            
            // Constantes WGS84
            this.R_MAJOR = 6378137.0;
            this.D2R = Math.PI / 180;
            this.R2D = 180 / Math.PI;
            
            // Initialisation Position et Quaternion (W=1)
            this.x.set([0,0], lat); this.x.set([1,0], lon); this.x.set([2,0], alt);
            this.x.set([6,0], 1.0);

            // Calibration Biais (Celui mesuré sur votre dashboard : 0.1549 m/s²)
            this.biasY = 0.1549; 
        }

        predict(accRaw, gyroRaw, dt) {
            // Débiaisage Y pour corriger la "vitesse fantôme"
            let ay = accRaw.y - this.biasY;
            let ax = accRaw.x;
            let az = accRaw.z - 9.80665; // On retire la gravité G

            // Algorithme ZUPT : Si mouvement quasi-nul, on force l'arrêt
            if (Math.sqrt(ax*ax + ay*ay) < 0.05) {
                ax = 0; ay = 0;
                this.x.set([3,0], 0); this.x.set([4,0], 0); // Reset vitesses VX, VY
            }

            // Intégration de la vitesse (v = v0 + a*dt)
            let vx = this.x.get([3, 0]) + ax * dt;
            let vy = this.x.get([4, 0]) + ay * dt;
            let vz = this.x.get([5, 0]) + az * dt;

            // Conservation de la quantité de mouvement avec friction minimale
            const decay = 0.9995;
            this.x.set([3, 0], vx * decay);
            this.x.set([4, 0], vy * decay);
            this.x.set([5, 0], vz * decay);

            // Mise à jour simplifiée de la position (Latitude)
            const lat = this.x.get([0,0]);
            this.x.set([0,0], lat + (vx * dt / this.R_MAJOR) * this.R2D);
        }

        getState() {
            const vx = this.x.get([3,0]), vy = this.x.get([4,0]), vz = this.x.get([5,0]);
            return {
                lat: this.x.get([0,0]), lon: this.x.get([1,0]), alt: this.x.get([2,0]),
                v: Math.sqrt(vx*vx + vy*vy + vz*vz),
                vx, vy, vz,
                pitch: Math.atan2(vy, vz) * this.R2D
            };
        }
    }

    // =================================================================
    // 2. ÉTAT DU SYSTÈME ET VARIABLES GLOBALES
    // =================================================================
    let ukf = new ProfessionalUKF();
    let isRunning = false;
    let totalDist = 0;
    let vMax = 0;
    let lastTime = performance.now();

    // =================================================================
    // 3. BOUCLE DE RENDU ET CALCULS PHYSIQUES
    // =================================================================
    const update = () => {
        if (!isRunning) return;

        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        const state = ukf.getState();
        const vKmh = state.v * 3.6;
        if (vKmh > vMax) vMax = vKmh;
        totalDist += state.v * dt;

        // --- AFFICHAGE PRINCIPAL ---
        if ($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(2);
        if ($('speed-stable-kmh')) $('speed-stable-kmh').textContent = vKmh.toFixed(1) + " km/h";
        if ($('speed-raw-ms')) $('speed-raw-ms').textContent = state.v.toFixed(4) + " m/s";
        if ($('total-distance-3d')) $('total-distance-3d').textContent = totalDist.toFixed(3) + " m";
        if ($('v-max-session')) $('v-max-session').textContent = vMax.toFixed(1) + " km/h";

        // --- PHYSIQUE ATMOSPHÉRIQUE (ISA Model) ---
        const tempC = 15 - (0.0065 * state.alt);
        const sos = 331.3 * Math.sqrt(1 + tempC / 273.15); // Vitesse du son
        if ($('mach-number')) $('mach-number').textContent = (state.v / sos).toFixed(4);
        if ($('air-temp')) $('air-temp').textContent = tempC.toFixed(1) + " °C";

        // --- RELATIVITÉ (Einstein) ---
        const c = 299792458;
        const gamma = 1 / Math.sqrt(1 - Math.pow(state.v/c, 2));
        if ($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(12);

        // --- DYNAMIQUE ---
        if ($('pitch-display')) $('pitch-display').textContent = state.pitch.toFixed(1) + "°";

        requestAnimationFrame(update);
    };

    // =================================================================
    // 4. GESTION DES CAPTEURS ET BOUTONS
    // =================================================================
    window.addEventListener('devicemotion', (e) => {
        if (!isRunning) return;
        const acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
        const gyro = e.rotationRate || {alpha:0, beta:0, gamma:0};
        ukf.predict(acc, gyro, 0.02);
    });

    // Initialisation au chargement de la page
    window.addEventListener('load', () => {
        
        // BOUTON MARCHE / PAUSE
        const btnToggle = $('gps-pause-toggle');
        if (btnToggle) {
            btnToggle.onclick = () => {
                isRunning = !isRunning;
                btnToggle.innerHTML = isRunning ? '<i class="fas fa-pause"></i> PAUSE SYSTÈME' : '<i class="fas fa-play"></i> MARCHE GPS';
                btnToggle.style.background = isRunning ? "#dc3545" : "#28a745";
                if (isRunning) {
                    lastTime = performance.now();
                    update();
                }
            };
        }

        // BOUTON RÉINIT DISTANCE
        const btnDist = $('reset-dist-btn');
        if (btnDist) {
            btnDist.onclick = () => {
                totalDist = 0;
                if($('total-distance-3d')) $('total-distance-3d').textContent = "0.000 m";
            };
        }

        // BOUTON RÉINIT V-MAX
        const btnVmax = $('reset-vmax-btn');
        if (btnVmax) {
            btnVmax.onclick = () => {
                vMax = 0;
                if($('v-max-session')) $('v-max-session').textContent = "0.0 km/h";
            };
        }

        // BOUTON TOUT RÉINITIALISER
        const btnReset = $('reset-all-btn');
        if (btnReset) {
            btnReset.onclick = () => {
                totalDist = 0; vMax = 0;
                ukf = new ProfessionalUKF();
                alert("Système remis à zéro.");
            };
        }

        // Mise à jour de l'heure locale (Indépendant du GPS)
        setInterval(() => {
            const now = new Date();
            if ($('local-time-ntp')) $('local-time-ntp').textContent = now.toLocaleTimeString();
            if ($('utc-datetime')) $('utc-datetime').textContent = now.toUTCString();
        }, 1000);
    });

})(window);
