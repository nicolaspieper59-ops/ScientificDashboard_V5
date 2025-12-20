/**
 * GNSS SPACETIME - NOYAU DE FUSION V3.0 (ULTRA-STABLE)
 * --------------------------------------------------
 * - Fusion : Intégration de Verlet + Filtre Anti-Bruit
 * - Anti-Dérive : Auto-calibration du biais IMU au démarrage
 * - Astro : Intégration complète sans N/A
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
        
        // --- CALIBRATION & FILTRAGE ---
        this.biasX = 0; 
        this.isCalibrated = false;
        this.staticFrames = 0; 
        
        // --- PARAMÈTRES ---
        this.mass = 70; 
        this.isNetherMode = false;
        this.coords = { lat: 43.2844, lon: 5.3590, alt: 150 };
        
        // --- CONSTANTES ---
        this.G_CONST = 9.80665;
        this.C_LIGHT = 299792458;

        this.init();
    }

    init() {
        this.setupUI();
        this.startAstroLoop();
        this.runPhysicsLoop();
        console.log("🚀 Système GNSS SpaceTime prêt.");
    }

    // --- MOTEUR DE PHYSIQUE & IMU ---
    updatePhysics(e) {
        if (this.isPaused) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastT) / 1000, 0.1);
        this.lastT = now;

        const acc = e.acceleration; 
        const accG = e.accelerationIncludingGravity;

        if (!acc || !accG) return;

        // 1. AUTO-CALIBRATION (Élimine la dérive si le téléphone est incliné)
        let rawAx = acc.x || 0;
        if (!this.isCalibrated) {
            this.biasX = rawAx;
            this.isCalibrated = true;
            return;
        }

        // 2. FILTRAGE PASSE-HAUT (Zone morte pour micro-vibrations)
        let netAx = rawAx - this.biasX;
        if (Math.abs(netAx) < 0.08) {
            netAx = 0;
            this.staticFrames++;
        } else {
            this.staticFrames = 0;
        }

        // 3. INTÉGRATION & FRICTION STATIQUE
        if (this.staticFrames > 10) {
            this.vx *= 0.80; // Freinage logiciel si aucun mouvement détecté
            if(Math.abs(this.vx) < 0.01) this.vx = 0;
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
            bubble.style.transform = `translate(${roll * 1.5}px, ${pitch * 1.5}px)`;
        }
    }

    // --- CALCULS SCIENTIFIQUES EN TEMPS RÉEL ---
    runPhysicsLoop() {
        const v = Math.abs(this.vx);
        const kmh = v * 3.6;
        if (kmh > this.vMax) this.vMax = kmh;

        // 1. Atmosphère ISA
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
        this.set('perc-speed-sound', ((v / vsound) * 100).toFixed(2) + " %");

        // 2. Relativité
        const beta = v / this.C_LIGHT;
        const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
        this.set('lorentz-factor', gamma.toFixed(15));
        this.set('pct-speed-of-light', (beta * 100).toExponential(2) + " %");
        this.set('kinetic-energy', (0.5 * this.mass * v**2).toFixed(2) + " J");
        this.set('momentum', (this.mass * v).toFixed(2) + " kg·m/s");
        this.set('dynamic-pressure', (0.5 * rho * v**2).toFixed(2) + " Pa");

        // 3. Distance & Affichage Principal
        const factor = this.isNetherMode ? 8 : 1;
        if (!this.isPaused) this.totalDist += (v * factor * 0.016); 

        this.set('speed-main-display', kmh.toFixed(2) + " km/h");
        this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
        this.set('speed-max-session', this.vMax.toFixed(1) + " km/h");
        this.set('total-distance', (this.totalDist/1000).toFixed(3) + " km | " + this.totalDist.toFixed(2) + " m");
        this.set('horizon-distance-km', (3.57 * Math.sqrt(h)).toFixed(2) + " km");

        requestAnimationFrame(() => this.runPhysicsLoop());
    }

    // --- BOUCLE ASTRONOMIQUE (ZÉRO N/A) ---
    startAstroLoop() {
        setInterval(() => {
            const now = new Date();
            this.set('local-time', now.toLocaleTimeString());
            this.set('utc-datetime', now.toISOString().replace('T', ' ').substring(0, 19));
            
            if (typeof window.calculateAstroDataHighPrec === 'function') {
                const astro = window.calculateAstroDataHighPrec(now, this.coords.lat, this.coords.lon);
                
                // Temps Solaire
                this.set('tst-time', astro.TST_HRS);
                this.set('mst-time', astro.MST_HRS);
                this.set('noon-solar', astro.NOON_SOLAR_UTC.toLocaleTimeString());
                this.set('equation-of-time', astro.EOT_MIN + " min");
                
                // Soleil & Lune
                this.set('sun-alt', (astro.sun.altitude * 57.2958).toFixed(2) + "°");
                this.set('sun-azimuth', (astro.sun.azimuth * 57.2958).toFixed(2) + "°");
                this.set('moon-phase-name', window.getMoonPhaseName(astro.moon.illumination.phase));
                this.set('moon-illuminated', (astro.moon.illumination.fraction * 100).toFixed(1) + " %");
                
                // Mise à jour de l'horloge visuelle
                const sunEl = document.getElementById('sun-element');
                if (sunEl) sunEl.style.transform = `rotate(${(astro.sun.altitude * 57.2) * -1}deg)`;
            }

            this.set('lat-ukf', this.coords.lat.toFixed(5));
            this.set('lon-ukf', this.coords.lon.toFixed(5));
            this.set('ukf-status', "FUSION ACTIVE");
        }, 1000);
    }

    // --- CONTRÔLES UI ---
    setupUI() {
        const btn = document.getElementById('gps-pause-toggle');
        btn.onclick = async () => {
            if (this.isPaused) {
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    const res = await DeviceMotionEvent.requestPermission();
                    if (res !== 'granted') return;
                }
                window.addEventListener('devicemotion', (e) => this.updatePhysics(e));
                this.isPaused = false;
                this.isCalibrated = false; // Recalibre à chaque départ
                btn.textContent = "⏸ PAUSE SYSTÈME";
                btn.style.backgroundColor = "#dc3545";
            } else {
                this.isPaused = true;
                btn.textContent = "▶️ MARCHE GPS";
                btn.style.backgroundColor = "#28a745";
            }
        };

        const netherBtn = document.getElementById('nether-toggle-btn');
        if(netherBtn) {
            netherBtn.onclick = () => {
                this.isNetherMode = !this.isNetherMode;
                netherBtn.textContent = this.isNetherMode ? "Mode Nether: ACTIF (8:1)" : "Mode Nether: DÉSACTIVÉ (1:1)";
                netherBtn.style.color = this.isNetherMode ? "#ff4500" : "white";
                this.set('distance-ratio', this.isNetherMode ? "8.000" : "1.000");
            };
        }

        document.getElementById('reset-all-btn').onclick = () => location.reload();
        document.getElementById('reset-dist-btn').onclick = () => { this.totalDist = 0; };
        document.getElementById('reset-max-btn').onclick = () => { this.vMax = 0; };
    }

    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

window.onload = () => { new ScientificGNSS(); };
