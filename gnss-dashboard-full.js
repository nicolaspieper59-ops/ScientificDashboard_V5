/**
 * GNSS SPACETIME - NOYAU DE FUSION V4.5 (ZÉRO INITIAL)
 * --------------------------------------------------
 * - Physique : Newton pur sans friction.
 * - Initialisation : Vitesse forcée à 0.00 au démarrage.
 * - Calibration : Capture du biais au clic "MARCHE".
 */

class ScientificGNSS {
    constructor() {
        // --- ÉTATS PHYSIQUES ---
        this.vx = 0; // Toujours 0 au départ
        this.ax = 0; 
        this.totalDist = 0;
        this.vMax = 0;
        this.lastT = performance.now();
        this.isPaused = true;
        
        // --- CALIBRATION ---
        this.biasX = 0;
        this.isCalibrated = false;
        this.thresholdInertie = 0.10; // Filtre les micro-vibrations au repos

        // --- PARAMÈTRES ---
        this.mass = 70;
        this.coords = { lat: 43.2844, lon: 5.3590, alt: 150 };
        this.C = 299792458;

        this.init();
    }

    init() {
        this.setupUI();
        this.resetDisplay(); // Force l'affichage à 0
        this.startSyncLoop();
        this.runPhysicsLoop();
    }

    // Mise à zéro visuelle immédiate
    resetDisplay() {
        this.set('speed-main-display', "0.00 km/h");
        this.set('speed-stable-kmh', "0.000 km/h");
        this.set('total-distance', "0.000 km");
    }

    updatePhysics(e) {
        if (this.isPaused) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastT) / 1000, 0.1);
        this.lastT = now;

        const acc = e.acceleration; 
        if (!acc) return;

        // 1. CALIBRATION AU DÉMARRAGE
        // On mémorise la valeur de l'accéléromètre au repos pour l'annuler
        if (!this.isCalibrated) {
            this.biasX = acc.x || 0;
            this.isCalibrated = true;
            return;
        }

        // 2. ACCÉLÉRATION NETTE (Newton)
        let rawAx = (acc.x || 0) - this.biasX;

        // 3. SEUIL D'INERTIE
        // Si le mouvement est trop faible, on considère qu'on est au repos
        if (Math.abs(rawAx) > this.thresholdInertie) {
            this.ax = rawAx;
            // v = v + a*dt (Zéro friction)
            this.vx += this.ax * dt;
        } else {
            this.ax = 0;
        }
    }

    runPhysicsLoop() {
        const v = Math.abs(this.vx);
        const kmh = v * 3.6;
        if (kmh > this.vMax) this.vMax = kmh;

        // Mise à jour de l'affichage
        this.set('speed-main-display', kmh.toFixed(2) + " km/h");
        this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
        this.set('speed-max-session', this.vMax.toFixed(1) + " km/h");

        // Distance (Uniquement si on a commencé à bouger)
        if (v > 0.05) {
            this.totalDist += (v * 0.016);
            this.set('total-distance', (this.totalDist/1000).toFixed(3) + " km");
        }

        requestAnimationFrame(() => this.runPhysicsLoop());
    }

    startSyncLoop() {
        setInterval(() => {
            const now = new Date();
            this.set('local-time', now.toLocaleTimeString());
            
            // Astro & Environnement (Pas de N/A)
            if (typeof window.calculateAstroDataHighPrec === 'function') {
                const astro = window.calculateAstroDataHighPrec(now, this.coords.lat, this.coords.lon);
                this.set('sun-alt', (astro.sun.altitude * 57.3).toFixed(2) + "°");
                this.set('moon-phase-name', window.getMoonPhaseName(astro.moon.illumination.phase));
            }
        }, 1000);
    }

    setupUI() {
        const btn = document.getElementById('gps-pause-toggle');
        btn.onclick = async () => {
            if (this.isPaused) {
                // Demande de permission si nécessaire
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }
                
                // RÉINITIALISATION TOTALE AVANT DE PARTIR
                this.vx = 0;
                this.isCalibrated = false; // Forcer une nouvelle calibration
                this.lastT = performance.now();
                
                window.addEventListener('devicemotion', (e) => this.updatePhysics(e));
                this.isPaused = false;
                btn.textContent = "⏸ PAUSE SYSTÈME";
            } else {
                this.isPaused = true;
                btn.textContent = "▶️ MARCHE GPS";
            }
        };

        document.getElementById('reset-all-btn').onclick = () => {
            this.vx = 0;
            this.vMax = 0;
            this.totalDist = 0;
            this.resetDisplay();
        };
    }

    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

window.onload = () => { new ScientificGNSS(); };
