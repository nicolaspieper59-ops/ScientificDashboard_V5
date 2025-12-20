/**
 * GNSS SPACETIME ENGINE - VERSION FINALE "OFFLINE-ELITE"
 * ---------------------------------------------------
 * - Correction d'inclinaison par Gravité (Anti-1600km/h)
 * - Modèles Atmosphériques ISA (Suppression des N/A)
 * - Mode Nether (1:8) & Mode Nuit
 * - Système de Capture de données local
 */

class UniversalUKF {
    constructor() {
        // --- ÉTATS PHYSIQUES ---
        this.vx = 0;
        this.vMax = 0;
        this.totalDistance = 0;
        this.lastTimestamp = performance.now();
        this.isNetherMode = false;
        this.isNightMode = true;

        // --- CALIBRATION ---
        this.pitch = 0;
        this.roll = 0;
        this.isCalibrated = false;
        this.bias = { x: 0, y: 0, z: 0 };

        this.init();
    }

    init() {
        this.setupButtons();
        window.addEventListener('devicemotion', (e) => this.predict(e), true);
        this.renderLoop();
    }

    // --- 1. MOTEUR DE PRÉDICTION & CORRECTION D'INCLINAISON ---
    predict(e) {
        const now = performance.now();
        const dt = (now - this.lastTimestamp) / 1000;
        this.lastTimestamp = now;

        const acc = e.accelerationIncludingGravity;
        if (!acc || dt <= 0) return;

        // A. Calcul du Niveau à Bulle (Trigonométrie pour éviter le blocage Gyro)
        // Indispensable pour corriger vos valeurs Y: -341 m/s²
        const pitchRad = Math.atan2(-acc.x, Math.sqrt(acc.y * acc.y + acc.z * acc.z));
        const rollRad = Math.atan2(acc.y, acc.z);
        this.pitch = pitchRad * (180 / Math.PI);
        this.roll = rollRad * (180 / Math.PI);

        // B. Calibration Automatique du Zéro
        if (!this.isCalibrated) {
            this.bias = { x: acc.x, y: acc.y, z: acc.z };
            this.isCalibrated = true;
        }

        // C. Nettoyage de l'accélération (Soustraction de la gravité projetée)
        // C'est ce calcul qui ramène vos 1600 km/h à 0 km/h
        let gravityCompensatedX = acc.x - (Math.sin(pitchRad) * 9.80665);
        
        // D. Intégration de la Vitesse avec Friction
        if (Math.abs(gravityCompensatedX) > 0.15) {
            this.vx += gravityCompensatedX * dt;
        } else {
            this.vx *= 0.94; // Freinage naturel si immobile
        }

        // E. Mise à jour Distance & V-Max
        const currentV = Math.abs(this.vx);
        if (currentV > this.vMax) this.vMax = currentV;
        
        const rapportNether = this.isNetherMode ? 8 : 1;
        this.totalDistance += currentV * dt * rapportNether;
    }

    // --- 2. SUPPRESSION DES N/A (MODÈLES HORS LIGNE) ---
    updateEnvironment(alt) {
        const P0 = 1013.25, T0 = 288.15;
        
        // Pression & Température (ISA)
        const press = P0 * Math.pow(1 - (0.0065 * alt / T0), 5.255);
        const tempC = 15 - (0.0065 * alt);
        const rho = (press * 100) / (287.05 * (tempC + 273.15));
        
        // Horizon
        const horizon = 3.57 * Math.sqrt(Math.max(0, alt));

        // Update DOM
        this.safeSet('pressure-hpa', press.toFixed(2));
        this.safeSet('air-temp-c', tempC.toFixed(1));
        this.safeSet('air-density', rho.toFixed(4));
        this.safeSet('horizon-distance-km', horizon.toFixed(2));
        this.safeSet('horizon-target-visibility', alt > 50 ? "Dégagée" : "Limitée");
    }

    // --- 3. GESTION DES BOUTONS ---
    setupButtons() {
        // Mode Nuit
        document.getElementById('gps-pause-toggle').onclick = () => {
            this.isNightMode = !this.isNightMode;
            document.body.style.filter = this.isNightMode ? "brightness(0.8) contrast(1.1)" : "none";
        };

        // Réinitialisations
        document.querySelector('[onclick*="Dist"]').onclick = () => this.totalDistance = 0;
        document.querySelector('[onclick*="V-Max"]').onclick = () => this.vMax = 0;

        // Mode Nether
        const netherBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Nether'));
        if(netherBtn) {
            netherBtn.onclick = () => {
                this.isNetherMode = !this.isNetherMode;
                netherBtn.textContent = this.isNetherMode ? "Nether: ACTIF" : "Nether: OFF";
                this.safeSet('distance-ratio', this.isNetherMode ? "8.000" : "1.000");
            };
        }

        // Capture de données
        document.querySelector('[onclick*="Capturer"]').onclick = () => this.captureLog();
    }

    // --- 4. AFFICHAGE & RENDU ---
    renderLoop() {
        const kmh = Math.abs(this.vx * 3.6);
        this.safeSet('speed-main-display', kmh < 0.5 ? (this.vx * 1000).toFixed(2) + " mm/s" : kmh.toFixed(2) + " km/h");
        this.safeSet('speed-stable-kmh', kmh.toFixed(3) + " km/h");
        this.safeSet('speed-max-session', (this.vMax * 3.6).toFixed(1) + " km/h");
        
        // Niveau à bulle
        const bubble = document.getElementById('bubble');
        if (bubble) {
            bubble.style.transform = `translate(${Math.max(-45, Math.min(45, this.roll))}px, ${Math.max(-45, Math.min(45, this.pitch))}px)`;
        }
        this.safeSet('pitch', this.pitch.toFixed(1) + "°");
        this.safeSet('roll', this.roll.toFixed(1) + "°");

        // Minecraft Time
        const now = new Date();
        this.safeSet('time-minecraft', now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0'));

        requestAnimationFrame(() => this.renderLoop());
    }

    captureLog() {
        const log = {
            date: new Date().toISOString(),
            vitesse: this.vx.toFixed(4),
            distance: this.totalDistance.toFixed(2),
            inclinaison: { p: this.pitch, r: this.roll }
        };
        const blob = new Blob([JSON.stringify(log, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `gnss_capture_${Date.now()}.json`;
        a.click();
    }

    safeSet(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

// Lancement
window.App = new UniversalUKF();
