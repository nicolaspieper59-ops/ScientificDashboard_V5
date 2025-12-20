/**
 * GNSS SPACETIME DASHBOARD - MOTEUR DE LIAISON COMPLET
 * Cible : UKF 21 États Fusion Professionnel
 */

class GNSSDashboard {
    constructor() {
        // --- 1. INITIALISATION DES RÉFÉRENCES DOM ---
        this.dom = {
            // Contrôles
            gpsPauseBtn: document.getElementById('gps-pause-toggle'),
            resetAllBtn: document.getElementById('reset-all-btn'),
            emergencyBtn: document.getElementById('emergency-stop-btn'),
            
            // Affichage Vitesse & Relativité
            speedMain: document.getElementById('speed-main-display'),
            speedStableKmh: document.getElementById('speed-stable-kmh'),
            speedStableMs: document.getElementById('speed-stable-ms'),
            lorentzFactor: document.getElementById('lorentz-factor'),
            timeDilationV: document.getElementById('time-dilation-vitesse'),
            
            // IMU & Niveau à Bulle
            accelX: document.getElementById('accel-x'),
            accelY: document.getElementById('accel-y'),
            accelZ: document.getElementById('accel-z'),
            bubble: document.getElementById('bubble'),
            pitch: document.getElementById('pitch'),
            roll: document.getElementById('roll'),
            
            // Astro & Minecraft
            sunEl: document.getElementById('sun-element'),
            moonEl: document.getElementById('moon-element'),
            mcTime: document.getElementById('time-minecraft'),
            astroPhase: document.getElementById('astro-phase'),
            
            // Environnement
            airTemp: document.getElementById('air-temp-c'),
            airPressure: document.getElementById('pressure-hpa'),
            no2: document.getElementById('no2-val'),
            
            // Dynamique
            kineticEnergy: document.getElementById('kinetic-energy'),
            dragForce: document.getElementById('drag-force')
        };

        // --- 2. ÉTAT DU SYSTÈME ---
        this.ukf = new UniversalUKF(); // Utilise la classe V550 précédemment créée
        this.sessionStartTime = Date.now();
        this.isEmergencyStop = false;

        this.bindEvents();
        this.startLoop();
    }

    // --- 3. GESTION DES ÉVÉNEMENTS ---
    bindEvents() {
        this.dom.gpsPauseBtn.addEventListener('click', () => {
            this.ukf.isCalibrated = false; // Force le recalibrage auto (V550)
            console.log("Système UKF Recalibré");
        });

        this.dom.emergencyBtn.addEventListener('click', () => {
            this.isEmergencyStop = !this.isEmergencyStop;
            this.dom.emergencyBtn.classList.toggle('active');
            this.dom.emergencyBtn.textContent = this.isEmergencyStop ? 
                "🛑 ARRÊT : ACTIF" : "🛑 Arrêt d'urgence: INACTIF 🟢";
        });

        document.getElementById('reset-all-btn').onclick = () => location.reload();
    }

    // --- 4. BOUCLE DE RENDU (60 FPS) ---
    startLoop() {
        const update = () => {
            if (this.isEmergencyStop) {
                this.ukf.vx = 0;
            }

            this.updatePhysicsUI();
            this.updateAstroUI();
            this.updateIMUUI();
            
            requestAnimationFrame(update);
        };
        requestAnimationFrame(update);
    }

    // --- 5. MISE À JOUR DES MODULES ---

    updatePhysicsUI() {
        const v = this.ukf.vx; // Vitesse en m/s issue de l'UKF
        const kmh = Math.abs(v * 3.6);
        
        // Vitesse & Lorentz
        this.dom.speedMain.textContent = kmh > 0.5 ? `${kmh.toFixed(2)} km/h` : `${(v*1000).toFixed(2)} mm/s`;
        this.dom.speedStableKmh.textContent = `${kmh.toFixed(3)} km/h`;
        
        const beta = v / 299792458;
        const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
        this.dom.lorentzFactor.textContent = gamma.toFixed(12);
        
        // Temps écoulé
        const elapsed = (Date.now() - this.sessionStartTime) / 1000;
        document.getElementById('elapsed-time').textContent = `${elapsed.toFixed(2)} s`;
    }

    updateIMUUI() {
        // Niveau à bulle dynamique
        // On limite le déplacement à 45px (moitié du conteneur de 100px - bulle)
        const bX = Math.max(-45, Math.min(45, this.ukf.roll));
        const bY = Math.max(-45, Math.min(45, this.ukf.pitch));
        
        this.dom.bubble.style.transform = `translate(${bX}px, ${bY}px)`;
        this.dom.pitch.textContent = `${this.ukf.pitch.toFixed(1)}°`;
        this.dom.roll.textContent = `${this.ukf.roll.toFixed(1)}°`;
        
        // Données brutes
        this.dom.accelX.textContent = this.ukf.lastRawX.toFixed(3);
    }

    updateAstroUI() {
        const now = new Date();
        const hours = now.getHours();
        const mins = now.getMinutes();
        
        // Heure Minecraft (Formatage 00:00)
        this.dom.mcTime.textContent = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        
        // Rotation du ciel (360° en 24h)
        const rotation = ((hours * 60 + mins) / 1440) * 360 + 90;
        this.dom.sunEl.style.transform = `rotate(${rotation}deg)`;
        this.dom.moonEl.style.transform = `rotate(${rotation + 180}deg)`;
    }
}

// Lancement au chargement du DOM
window.addEventListener('DOMContentLoaded', () => {
    window.Dashboard = new GNSSDashboard();
});
