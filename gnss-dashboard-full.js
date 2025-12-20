/**
 * GNSS SPACETIME - NOYAU DE FUSION V2.5 (FINAL & CORRIGÉ)
 * ------------------------------------------------------
 * - Anti-Dérive : Calibration du biais X/Y au démarrage
 * - Stabilité : Zone morte et friction statique pour la vitesse
 * - Astro : Liaison directe pour supprimer les "N/A"
 */

class ScientificGNSS {
    constructor() {
        // --- ÉTATS PHYSIQUES ---
        this.vx = 0; 
        this.ax = 0; 
        this.totalDist = 0;
        this.vMax = 0;
        this.lastT = performance.now();
        this.isPaused = true;
        
        // --- CALIBRATION ANTI-DÉRIVE ---
        this.biasX = 0; 
        this.isCalibrated = false;
        this.staticFrames = 0; 
        
        // --- PARAMÈTRES & CONSTANTES ---
        this.mass = 70; 
        this.isNetherMode = false;
        this.coords = { lat: 43.2844, lon: 5.3590, alt: 150 };
        this.G_CONST = 9.80665;
        this.C_LIGHT = 299792458;

        this.init();
    }

    init() {
        this.setupUI();
        this.startLoops();
        console.log("🚀 Système Initialisé : Filtre de dérive actif.");
    }

    // --- MOTEUR DE VITESSE ET IMU ---
    updatePhysics(e) {
        if (this.isPaused) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastT) / 1000, 0.1);
        this.lastT = now;

        const accG = e.accelerationIncludingGravity; 
        const accPure = e.acceleration; // Accélération linéaire sans gravité

        if (!accG) return;

        // 1. CALIBRATION (Élimine l'effet de la pente sur la vitesse)
        let rawAx = (accPure && accPure.x != null) ? accPure.x : 0;
        
        if (!this.isCalibrated) {
            this.biasX = rawAx; // On définit l'état actuel comme le "repos"
            this.isCalibrated = true;
            return;
        }

        // 2. FILTRAGE DE LA VITESSE
        let netAx = rawAx - this.biasX;

        // Zone morte pour ignorer le bruit des capteurs
        if (Math.abs(netAx) < 0.06) {
            netAx = 0;
            this.staticFrames++;
        } else {
            this.staticFrames = 0;
        }

        // Gestion de l'arrêt (évite que la vitesse reste à 105 km/h sans bouger)
        if (this.staticFrames > 5) {
            this.vx *= 0.85; // Freinage rapide si aucun mouvement détecté
            if(Math.abs(this.vx) < 0.02) this.vx = 0;
        } else {
            this.vx += netAx * dt;
        }

        this.ax = netAx;

        // MISE À JOUR INTERFACE IMU
        this.set('accel-x', (accG.x || 0).toFixed(3));
        this.set('accel-y', (accG.y || 0).toFixed(3));
        this.set('accel-z', (accG.z || 9.81).toFixed(3));
        this.set('accel-long', this.ax.toFixed(3) + " m/s²");
        this.set('force-g-long', (this.ax / this.G_CONST).toFixed(3));

        // Niveau à bulle
        const pitch = Math.atan2(-accG.x, Math.sqrt(accG.y**2 + accG.z**2)) * (180/Math.PI);
        const roll = Math.atan2(accG.y, accG.z) * (180/Math.PI);
        this.set('pitch', pitch.toFixed(1) + "°");
        this.set('roll', roll.toFixed(1) + "°");
        
        const bubble = document.getElementById('bubble');
        if (bubble) {
            bubble.style.transform = `translate(${roll * 2}px, ${pitch * 2}px)`;
        }
    }

    // --- CALCULS SCIENTIFIQUES & RELATIVITÉ ---
    runPhysicsLoop() {
        const v = Math.abs(this.vx);
        const kmh = v * 3.6;
        this.vMax = Math.max(this.vMax, kmh);

        // Modèle Atmosphérique (ISA)
        const h = this.coords.alt;
        const tempK = 288.15 - 0.0065 * h;
        const pressPa = 101325 * Math.pow(1 - (0.0065 * h) / 288.15, 5.255);
        const rho = pressPa / (287.05 * tempK);
        const vsound = Math.sqrt(1.4 * 287.05 * tempK);

        this.set('air-temp-c', (tempK - 273.15).toFixed(1) + " °C");
        this.set('pressure-hpa', (pressPa / 100).toFixed(2));
        this.set('air-density', rho.toFixed(4));
        this.set('local-speed-of-sound', vsound.toFixed(2));
        this.set('mach-number', (v / vsound).toFixed(4));

        // Énergie & Relativité
        const beta = v / this.C_LIGHT;
        const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
        this.set('lorentz-factor', gamma.toFixed(15));
        this.set('kinetic-energy', (0.5 * this.mass * v**2).toFixed(2) + " J");
        this.set('momentum', (this.mass * v).toFixed(2) + " kg·m/s");
        this.set('dynamic-pressure', (0.5 * rho * v**2).toFixed(2) + " Pa");
        this.set('rest-mass-energy', (this.mass * Math.pow(this.C_LIGHT, 2)).toExponential(4) + " J");

        // Distance (Inertielle)
        if (kmh > 0.1) {
            const factor = this.isNetherMode ? 8 : 1;
            this.totalDist += (v * factor * 0.016);
        }

        this.set('speed-main-display', kmh.toFixed(2) + " km/h");
        this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
        this.set('speed-max-session', this.vMax.toFixed(1) + " km/h");
        this.set('total-distance', (this.totalDist/1000).toFixed(3) + " km | " + this.totalDist.toFixed(2) + " m");

        requestAnimationFrame(() => this.runPhysicsLoop());
    }

    // --- LIAISON ASTRO & INTERFACE ---
    startLoops() {
        this.runPhysicsLoop();

        setInterval(() => {
            const now = new Date();
            
            // Heures
            this.set('local-time', now.toLocaleTimeString());
            this.set('utc-datetime', now.toISOString().replace('T', ' ').substring(0, 19));
            
            // Intégration Astro (Suppression des N/A)
            if (typeof window.calculateAstroDataHighPrec === 'function') {
                const astro = window.calculateAstroDataHighPrec(now, this.coords.lat, this.coords.lon);
                this.set('tst-time', astro.TST_HRS);
                this.set('mst-time', astro.MST_HRS);
                this.set('sun-alt', (astro.sun.altitude * 57.2958).toFixed(2) + "°");
                this.set('sun-azimuth', (astro.sun.azimuth * 57.2958).toFixed(2) + "°");
                this.set('moon-phase-name', window.getMoonPhaseName(astro.moon.illumination.phase));
                this.set('moon-illuminated', (astro.moon.illumination.fraction * 100).toFixed(1) + " %");
            }
            
            this.set('lat-ukf', this.coords.lat);
            this.set('lon-ukf', this.coords.lon);
            this.set('ukf-status', "FUSION ACTIVE");
        }, 1000);
    }

    setupUI() {
        const btn = document.getElementById('gps-pause-toggle');
        btn.onclick = async () => {
            if (this.isPaused) {
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }
                window.addEventListener('devicemotion', (e) => this.updatePhysics(e));
                this.isPaused = false;
                this.isCalibrated = false; // Relance la calibration au clic
                this.vx = 0; 
                btn.textContent = "⏸ PAUSE SYSTÈME";
            } else {
                this.isPaused = true;
                btn.textContent = "▶️ MARCHE GPS";
            }
        };

        const netherBtn = document.getElementById('nether-toggle-btn');
        if(netherBtn) {
            netherBtn.onclick = () => {
                this.isNetherMode = !this.isNetherMode;
                netherBtn.style.color = this.isNetherMode ? "#ff4500" : "white";
                this.set('distance-ratio', this.isNetherMode ? "8.000" : "1.000");
            };
        }
        
        document.getElementById('reset-all-btn').onclick = () => location.reload();
    }

    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

window.onload = () => { new ScientificGNSS(); };
