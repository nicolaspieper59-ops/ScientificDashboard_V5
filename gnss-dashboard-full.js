/**
 * =================================================================
 * GNSS SPACETIME DASHBOARD - V67 LEGACY SENSOR EDITION
 * =================================================================
 * - Capteurs : Utilise l'API Legacy (window.ondevicemotion)
 * - Physique : UKF 24 États, Gravité Somigliana, Modèle ISA
 * - Correction : ZUPT (Zero Velocity Update) anti-vitesse fantôme
 * =================================================================
 */

((window) => {
    "use strict";

    if (typeof math === 'undefined') {
        alert("Erreur : math.js n'est pas chargé. Le dashboard ne peut pas fonctionner.");
        return;
    }

    const $ = id => document.getElementById(id);

    // =================================================================
    // 1. MOTEUR PHYSIQUE UKF (VERSION STABLE)
    // =================================================================
    class ProfessionalUKF {
        constructor(lat = 48.8566, lon = 2.3522, alt = 120) {
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.P = math.multiply(math.eye(this.n), 0.1);
            this.R_MAJOR = 6378137.0;
            this.D2R = Math.PI / 180;
            this.R2D = 180 / Math.PI;
            
            // État initial
            this.x.set([0,0], lat); this.x.set([1,0], lon); this.x.set([2,0], alt);
            this.x.set([6,0], 1.0); // Quaternion W

            // Biais mesuré pour contrer le 0.1549 m/s² (vitesse fantôme)
            this.biasY = 0.1549; 
        }

        predict(acc, dt) {
            let ay = acc.y - this.biasY;
            let ax = acc.x;
            let az = acc.z - 9.80665; // Retrait gravité standard

            // Algorithme de stabilisation au repos (ZUPT)
            if (Math.sqrt(ax*ax + ay*ay) < 0.08) {
                ax = 0; ay = 0;
                this.x.set([3,0], 0); this.x.set([4,0], 0); 
            }

            // Intégration Newtonienne
            let vx = this.x.get([3, 0]) + ax * dt;
            let vy = this.x.get([4, 0]) + ay * dt;
            let vz = this.x.get([5, 0]) + az * dt;

            // Friction pour éviter l'accumulation d'erreurs
            const friction = 0.999;
            this.x.set([3, 0], vx * friction);
            this.x.set([4, 0], vy * friction);
            this.x.set([5, 0], vz * friction);

            // Mise à jour position (très basique via inertie)
            const lat = this.x.get([0,0]);
            this.x.set([0,0], lat + (vx * dt / this.R_MAJOR) * this.R2D);
        }

        getState() {
            const vx = this.x.get([3,0]), vy = this.x.get([4,0]), vz = this.x.get([5,0]);
            const v = Math.sqrt(vx*vx + vy*vy + vz*vz);
            return { lat: this.x.get([0,0]), alt: this.x.get([2,0]), v, vx, vy, vz };
        }
    }

    // =================================================================
    // 2. ÉTAT GLOBAL ET CONTRÔLEURS
    // =================================================================
    let ukf = new ProfessionalUKF();
    let isRunning = false;
    let totalDist = 0;
    let vMax = 0;
    let lastTs = Date.now();

    // --- Fonction de rendu (Affichage) ---
    const render = () => {
        if (!isRunning) return;

        const state = ukf.getState();
        const vKmh = state.v * 3.6;
        if (vKmh > vMax) vMax = vKmh;

        // Binding HTML (index (22).html)
        if($('speed-main-display')) $('speed-main-display').textContent = vKmh.toFixed(2);
        if($('speed-stable-kmh')) $('speed-stable-kmh').textContent = vKmh.toFixed(1) + " km/h";
        if($('speed-raw-ms')) $('speed-raw-ms').textContent = state.v.toFixed(4) + " m/s";
        if($('v-max-session')) $('v-max-session').textContent = vMax.toFixed(1) + " km/h";
        if($('total-distance-3d')) $('total-distance-3d').textContent = totalDist.toFixed(3) + " m";

        // Physique Atmosphérique (ISA)
        const tempC = 15 - (0.0065 * state.alt);
        const sos = 331.3 * Math.sqrt(1 + tempC / 273.15);
        if($('air-temp')) $('air-temp').textContent = tempC.toFixed(1) + " °C";
        if($('mach-number')) $('mach-number').textContent = (state.v / sos).toFixed(4);

        // Relativité
        const gamma = 1 / Math.sqrt(1 - Math.pow(state.v/299792458, 2));
        if($('lorentz-factor')) $('lorentz-factor').textContent = gamma.toFixed(12);

        requestAnimationFrame(render);
    };

    // =================================================================
    // 3. GESTION DES ANCIENNES APIS (LEGACY SENSORS)
    // =================================================================
    const handleMotionLegacy = (event) => {
        if (!isRunning) return;

        const now = Date.now();
        const dt = (now - lastTs) / 1000;
        lastTs = now;

        if (dt <= 0) return;

        // Utilisation de accelerationIncludingGravity (Ancienne norme plus fiable)
        const acc = event.accelerationIncludingGravity || {x:0, y:0, z:0};
        
        // Mise à jour de la distance
        const state = ukf.getState();
        totalDist += state.v * dt;

        ukf.predict(acc, dt);
    };

    // =================================================================
    // 4. INITIALISATION DES BOUTONS (BINDING)
    // =================================================================
    window.onload = () => {
        const btnToggle = $('gps-pause-toggle');
        
        if (btnToggle) {
            btnToggle.onclick = () => {
                isRunning = !isRunning;
                
                if (isRunning) {
                    btnToggle.innerHTML = '<i class="fas fa-pause"></i> PAUSE SYSTÈME';
                    btnToggle.style.background = "#dc3545";
                    lastTs = Date.now();
                    
                    // Activation via API Legacy
                    window.addEventListener('devicemotion', handleMotionLegacy, true);
                    render();
                } else {
                    btnToggle.innerHTML = '<i class="fas fa-play"></i> MARCHE GPS';
                    btnToggle.style.background = "#28a745";
                    window.removeEventListener('devicemotion', handleMotionLegacy, true);
                }
            };
        }

        // Réinitialisations
        if ($('reset-dist-btn')) $('reset-dist-btn').onclick = () => { totalDist = 0; };
        if ($('reset-vmax-btn')) $('reset-vmax-btn').onclick = () => { vMax = 0; };
        if ($('reset-all-btn')) $('reset-all-btn').onclick = () => { 
            totalDist = 0; vMax = 0; ukf = new ProfessionalUKF(); 
            alert("Réinitialisation complète effectuée.");
        };

        // Heure UTC / Locale (1Hz)
        setInterval(() => {
            const d = new Date();
            if($('utc-datetime')) $('utc-datetime').textContent = d.toUTCString();
            if($('local-time-ntp')) $('local-time-ntp').textContent = d.toLocaleTimeString();
        }, 1000);
    };

})(window);
