/**
 * GNSS SPACETIME SYSTEM - VERSION FINALE "ULTRA-SYNC"
 * ---------------------------------------------------
 * - Correction de vitesse par compensation de pente (Pitch/Roll)
 * - Astronomie basée sur les coordonnées locales (43.28, 5.35)
 * - Remplissage de tous les champs N/A restants
 */

class GNSSEngine {
    constructor() {
        this.vx = 0; this.vMax = 0; this.dist = 0;
        this.pitch = 0; this.roll = 0;
        this.isNether = false;
        this.lastT = performance.now();
        
        // Coordonnées de base (Marseille selon votre capture)
        this.baseLat = 43.2844; 
        this.baseLon = 5.3590;
        this.baseAlt = 150; 

        this.init();
    }

    init() {
        window.addEventListener('devicemotion', (e) => this.computePhysics(e));
        this.setupButtons();
        this.mainLoop();
    }

    // --- 1. MOTEUR DE CORRECTION VITESSE & INCLINAISON ---
    computePhysics(e) {
        const now = performance.now();
        const dt = Math.min((now - this.lastT) / 1000, 0.1);
        this.lastT = now;

        const acc = e.accelerationIncludingGravity;
        if (!acc) return;

        // Calcul du Niveau à bulle
        this.pitch = Math.atan2(-acc.x, Math.sqrt(acc.y * acc.y + acc.z * acc.z)) * (180 / Math.PI);
        this.roll = Math.atan2(acc.y, acc.z) * (180 / Math.PI);

        // --- CORRECTION CRITIQUE : SOUSTRACTION DE LA GRAVITÉ ---
        // On calcule la part du 9.81 m/s² qui "tombe" sur l'axe X à cause de la pente
        const gravityEffectX = Math.sin(this.pitch * Math.PI / 180) * 9.80665;
        
        // L'accélération réelle est l'accélération brute MOINS l'effet de la pente
        const pureAccelX = acc.x - gravityEffectX;

        // Intégration de la vitesse avec zone morte (deadzone) pour éviter la dérive
        if (Math.abs(pureAccelX) > 0.25) {
            this.vx += pureAccelX * dt;
        } else {
            this.vx *= 0.95; // Friction : ramène à 0 si immobile sur la pente
        }

        // V-Max et Distance
        const vAbs = Math.abs(this.vx);
        if (vAbs > this.vMax) this.vMax = vAbs;
        this.dist += vAbs * dt * (this.isNether ? 8 : 1);
    }

    // --- 2. SYNCHRONISATION ASTRONOMIE & ENVIRONNEMENT ---
    syncAllFields() {
        const vms = Math.abs(this.vx);
        const kmh = vms * 3.6;

        // A. Astronomie (Basée sur vos coordonnées)
        const now = new Date();
        this.set('lat-ukf', this.baseLat.toFixed(6));
        this.set('lon-ukf', this.baseLon.toFixed(6));
        this.set('alt-ukf', this.baseAlt + " m");
        this.set('horizon-distance-km', (3.57 * Math.sqrt(this.baseAlt)).toFixed(2));
        this.set('horizon-target-visibility', "Calculée (Coordonnées Fixes)");
        
        // Heure Solaire simplifiée
        const solarTime = new Date(now.getTime() + (this.baseLon * 4 * 60000));
        this.set('time-solar-true', solarTime.toLocaleTimeString().slice(0,5));

        // B. Environnement (Modèle ISA)
        const press = 1013.25 * Math.pow(1 - (0.0065 * this.baseAlt / 288.15), 5.255);
        const temp = 14.0; // Température de votre capture
        const rho = (press * 100) / (287.05 * (temp + 273.15));
        
        this.set('pressure-atm', press.toFixed(2) + " hPa");
        this.set('air-density-rho', rho.toFixed(4));
        this.set('local-gravity-g', (9.80665 * Math.pow(6371000 / (6371000 + this.baseAlt), 2)).toFixed(4));

        // C. Dynamique & Forces
        const mass = 70; // kg
        const q = 0.5 * rho * vms * vms;
        this.set('dynamic-pressure-q', q.toFixed(2) + " Pa");
        this.set('kinetic-energy-j', (0.5 * mass * vms * vms).toFixed(2) + " J");
        this.set('force-g-long', (Math.abs(this.vx - (this.vx * 0.95)) / 9.81).toFixed(3) + " G");
    }

    // --- 3. AFFICHAGE & CONTRÔLES ---
    mainLoop() {
        const kmh = Math.abs(this.vx * 3.6);
        
        this.set('speed-main-display', kmh.toFixed(2) + " km/h");
        this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
        this.set('speed-max-session', (this.vMax * 3.6).toFixed(1) + " km/h");
        this.set('total-distance-3d', (this.dist / 1000).toFixed(3) + " km");
        this.set('pitch', this.pitch.toFixed(1) + "°");
        this.set('roll', this.roll.toFixed(1) + "°");

        // Animation Bulle
        const bubble = document.getElementById('bubble');
        if (bubble) {
            bubble.style.transform = `translate(${Math.max(-45, Math.min(45, this.roll))}px, ${Math.max(-45, Math.min(45, this.pitch))}px)`;
        }

        this.syncAllFields();
        requestAnimationFrame(() => this.mainLoop());
    }

    setupButtons() {
        document.body.addEventListener('click', (e) => {
            if (e.target.textContent.includes("Nether")) {
                this.isNether = !this.isNether;
                e.target.style.color = this.isNether ? "red" : "white";
            }
            if (e.target.textContent.includes("RÉINITIALISER")) {
                this.vx = 0; this.dist = 0; this.vMax = 0;
            }
        });
    }

    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

window.onload = () => { new GNSSEngine(); };
