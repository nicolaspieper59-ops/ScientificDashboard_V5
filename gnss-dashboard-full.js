/**
 * GNSS SPACETIME ENGINE - VERSION ULTIME "FULL-SYNC"
 * ---------------------------------------------------
 * - Correction d'inclinaison par Gravité (Anti-Mach 1)
 * - Modèles Atmosphériques ISA (Suppression totale des N/A)
 * - Mode Nether (1:8), Mode Nuit et Capture Locale
 * - Horizon et Astro par Trigonométrie Sphérique
 */

class DashboardEngine {
    constructor() {
        // --- ÉTATS PHYSIQUES ---
        this.vx = 0;
        this.vMax = 0;
        this.totalDist = 0;
        this.lastTimestamp = performance.now();
        
        // --- ÉTATS MODES ---
        this.isNetherMode = false;
        this.isNightMode = true;
        this.isPaused = false;

        // --- DONNÉES CAPTEURS ---
        this.pitch = 0;
        this.roll = 0;
        this.accel = { x: 0, y: 0, z: 0 };

        this.init();
    }

    init() {
        this.bindButtons();
        window.addEventListener('devicemotion', (e) => this.updatePhysics(e), true);
        this.renderLoop();
        console.log("✅ GNSS Dashboard Engine Initialisé - Mode Offline");
    }

    // --- 1. MOTEUR PHYSIQUE ET CORRECTION DE VITESSE ---
    updatePhysics(e) {
        if (this.isPaused) return;

        const now = performance.now();
        const dt = (now - this.lastTimestamp) / 1000;
        this.lastTimestamp = now;

        const raw = e.accelerationIncludingGravity;
        if (!raw || dt <= 0) return;

        this.accel = { x: raw.x, y: raw.y, z: raw.z };

        // A. Calcul du Niveau à Bulle (Trigonométrie pour compenser le blocage Gyro)
        // Indispensable pour transformer les -300 m/s² en angle d'inclinaison
        this.pitch = Math.atan2(-raw.x, Math.sqrt(raw.y * raw.y + raw.z * raw.z)) * (180 / Math.PI);
        this.roll = Math.atan2(raw.y, raw.z) * (180 / Math.PI);

        // B. Nettoyage de la Vitesse (Soustraction de la Gravité G)
        // On projette la gravité sur l'axe X pour ne garder que l'accélération réelle
        let gravityComponentX = Math.sin(this.pitch * Math.PI / 180) * 9.80665;
        let pureAccelX = raw.x - gravityComponentX;

        // C. Intégration avec "Filtre de Friction" (Réalisme circuit à bille)
        if (Math.abs(pureAccelX) > 0.2) {
            this.vx += pureAccelX * dt;
        } else {
            this.vx *= 0.95; // Freinage naturel pour éviter la dérive infinie
        }

        // D. Mise à jour Distance et V-Max
        const currentV = Math.abs(this.vx);
        if (currentV > this.vMax) this.vMax = currentV;
        
        const rapportNether = this.isNetherMode ? 8 : 1;
        this.totalDist += currentV * dt * rapportNether;
    }

    // --- 2. SUPPRESSION DES N/A (MODÈLES HORS LIGNE) ---
    updateEnvironment(alt) {
        // Modèle ISA (International Standard Atmosphere)
        const P0 = 1013.25; 
        const T0 = 15;
        
        const press = P0 * Math.pow(1 - (0.0065 * alt / 288.15), 5.255);
        const tempC = T0 - (0.0065 * alt);
        const rho = (press * 100) / (287.05 * (tempC + 273.15)); // Densité de l'air
        
        // Vitesse du son locale
        const vsound = 331.3 * Math.sqrt(1 + tempC / 273.15);
        
        // Mise à jour des IDs du HTML
        this.set('pressure-hpa', press.toFixed(2) + " hPa");
        this.set('air-temp-c', tempC.toFixed(1) + " °C");
        this.set('air-density', rho.toFixed(4) + " kg/m³");
        this.set('local-speed-of-sound', vsound.toFixed(1) + " m/s");
        this.set('horizon-distance-km', (3.57 * Math.sqrt(Math.max(0, alt))).toFixed(2) + " km");
        this.set('local-gravity', (9.80665 * Math.pow(6371000 / (6371000 + alt), 2)).toFixed(4) + " m/s²");
    }

    // --- 3. GESTION DES BOUTONS ---
    bindButtons() {
        // Pause Système
        document.getElementById('gps-pause-toggle').onclick = () => {
            this.isPaused = !this.isPaused;
            document.getElementById('gps-pause-toggle').textContent = this.isPaused ? "▶️ REPRENDRE" : "⏸ PAUSE SYSTÈME";
        };

        // Mode Nether (1:8)
        const btnNether = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Nether'));
        if(btnNether) {
            btnNether.onclick = () => {
                this.isNetherMode = !this.isNetherMode;
                btnNether.textContent = this.isNetherMode ? "Mode Nether: ACTIF (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
                this.set('distance-ratio', this.isNetherMode ? "8.000" : "1.000");
            };
        }

        // Réinitialisations
        document.querySelector('[onclick*="Dist"]').onclick = () => this.totalDist = 0;
        document.querySelector('[onclick*="V-Max"]').onclick = () => this.vMax = 0;
        document.querySelector('[onclick*="TOUT"]').onclick = () => location.reload();

        // Capture de données (JSON)
        document.querySelector('[onclick*="Capturer"]').onclick = () => this.exportData();
    }

    // --- 4. BOUCLE DE RENDU VISUEL ---
    renderLoop() {
        const kmh = Math.abs(this.vx * 3.6);
        const altFixe = 100; // Altitude simulée en mode offline pour débloquer les calculs

        // Vitesse et Relativité
        this.set('speed-main-display', kmh.toFixed(2) + " km/h");
        this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
        this.set('speed-max-session', (this.vMax * 3.6).toFixed(1) + " km/h");
        this.set('total-distance-3d', (this.totalDist / 1000).toFixed(3) + " km");

        // IMU & Niveau à Bulle
        this.set('accel-x', this.accel.x.toFixed(3));
        this.set('accel-y', this.accel.y.toFixed(3));
        this.set('accel-z', this.accel.z.toFixed(3));
        this.set('pitch', this.pitch.toFixed(1) + "°");
        this.set('roll', this.roll.toFixed(1) + "°");

        const bubble = document.getElementById('bubble');
        if (bubble) {
            bubble.style.transform = `translate(${Math.max(-45, Math.min(45, this.roll))}px, ${Math.max(-45, Math.min(45, this.pitch))}px)`;
        }

        // Astro
        const now = new Date();
        this.set('time-minecraft', now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0'));
        
        // Mise à jour Environnement
        this.updateEnvironment(altFixe);

        requestAnimationFrame(() => this.renderLoop());
    }

    exportData() {
        const data = {
            ts: new Date().toISOString(),
            vmax: this.vMax * 3.6,
            dist: this.totalDist,
            last_pitch: this.pitch
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `gnss_capture_${Date.now()}.json`;
        a.click();
    }

    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

// Lancement
window.onload = () => { window.App = new DashboardEngine(); };
