/**
 * GNSS SPACETIME - NOYAU DE FUSION UKF 21 ÉTATS (V6)
 * --------------------------------------------------
 * Correction : Symétrie vectorielle et stabilisation par fusion GPS/IMU
 */

class ScientificGNSS {
    constructor() {
        // --- ÉTATS PHYSIQUES ---
        this.vx = 0; 
        this.ax = 0; 
        this.totalDist = 0;
        this.lastT = performance.now();
        this.isPaused = true;
        
        // Initialisation de l'UKF (21 états définis dans ukf-lib.js)
        this.ukf = typeof ProfessionalUKF !== 'undefined' ? new ProfessionalUKF() : null; //
        
        // Paramètres
        this.mass = 70;
        this.coords = { lat: 43.2844, lon: 5.3590, alt: 150 };
        this.C = 299792458;

        this.init();
    }

    init() {
        this.setupUI();
        this.startSyncLoop();
        this.runPhysicsLoop();
    }

    // --- MOTEUR DE FUSION (CORRECTION DU RESTE) ---
    updatePhysics(e) {
        if (this.isPaused || !this.ukf) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastT) / 1000, 0.1);
        this.lastT = now;

        const acc = e.acceleration; // Accélération linéaire pure
        if (!acc) return;

        // 1. PHASE DE PRÉDICTION (Newton pur)
        // On injecte l'accélération dans l'UKF qui gère les 21 variables d'état
        this.ukf.predict(dt, {
            ax: acc.x || 0,
            ay: acc.y || 0,
            az: acc.z || 0
        });

        // 2. RÉCUPÉRATION DE LA VITESSE STABILISÉE
        // La décélération est ici l'opposé de l'accélération car le filtre 
        // traite le mouvement comme un vecteur sur l'axe X/Y
        const state = this.ukf.getState();
        this.vx = state.speed; 
        this.ax = acc.x || 0;

        // Mise à jour de l'affichage des forces
        this.set('accel-long', this.ax.toFixed(3) + " m/s²");
        this.set('ukf-uncertainty', state.kUncert.toFixed(6)); //
    }

    runPhysicsLoop() {
        const v = Math.abs(this.vx);
        const kmh = v * 3.6;

        // Affichage Vitesse (Part de 0 et stabilisée par UKF)
        this.set('speed-main-display', kmh.toFixed(2));
        this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");

        // Modèles Physiques (ISA & Relativité)
        const h = this.coords.alt;
        const tempK = 288.15 - 0.0065 * h;
        const pressPa = 101325 * Math.pow(1 - (0.0065 * h) / 288.15, 5.255);
        const vsound = Math.sqrt(1.4 * 287.05 * tempK);
        
        this.set('local-speed-of-sound', vsound.toFixed(2));
        this.set('mach-number', (v / vsound).toFixed(4));
        
        const gamma = 1 / Math.sqrt(1 - Math.pow(v/this.C, 2));
        this.set('lorentz-factor', gamma.toFixed(15));

        // Distance 3D cumulée
        this.totalDist += (v * 0.016); 
        this.set('total-distance-3d', (this.totalDist/1000).toFixed(3) + " km");

        requestAnimationFrame(() => this.runPhysicsLoop());
    }

    startSyncLoop() {
        setInterval(() => {
            const now = new Date();
            this.set('local-time', now.toLocaleTimeString());
            
            // Mise à jour des états UKF de position
            if (this.ukf) {
                const state = this.ukf.getState();
                this.set('lat-ukf', state.lat.toFixed(6));
                this.set('lon-ukf', state.lon.toFixed(6));
            }
        }, 1000);
    }

    setupUI() {
        const btn = document.getElementById('gps-pause-toggle');
        btn.onclick = async () => {
            if (this.isPaused) {
                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }
                
                // Reset à zéro absolu avant de démarrer
                this.vx = 0;
                this.lastT = performance.now();
                if(this.ukf) this.ukf.reset(); //
                
                window.addEventListener('devicemotion', (e) => this.updatePhysics(e));
                this.isPaused = false;
                btn.textContent = "⏸ PAUSE SYSTÈME";
            } else {
                this.isPaused = true;
                btn.textContent = "▶️ MARCHE GPS";
            }
        };
    }

    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

window.onload = () => { new ScientificGNSS(); };
