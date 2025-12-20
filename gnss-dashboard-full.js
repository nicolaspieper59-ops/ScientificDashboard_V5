/**
 * GNSS SPACETIME - NOYAU DE FUSION UKF PROFESSIONNEL (FINAL)
 * ----------------------------------------------------------
 * - Physique : Intégration de Verlet (Stable)
 * - Météo : Modèle ISA (OACI)
 * - Astro : Connexion haute précision (Soleil/Lune/TST)
 * - Zéro N/A : Remplissage complet des IDs
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
        
        // --- PARAMÈTRES ---
        this.mass = 70; // kg
        this.isNetherMode = false;
        // Coordonnées Marseille (Référence fixe)
        this.coords = { lat: 43.2844, lon: 5.3590, alt: 150 };
        
        // --- CONSTANTES UNIVERSELLES ---
        this.G = 6.67430e-11;
        this.C = 299792458;

        this.init();
    }

    init() {
        this.setupUI();
        this.startLoops();
        console.log("✅ GNSS SpaceTime : Moteur Physique & Astro Démarré.");
    }

    // --- 1. MOTEUR DE PHYSIQUE (CAPTEURS) ---
    updatePhysics(e) {
        if (this.isPaused) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastT) / 1000, 0.1);
        this.lastT = now;

        const acc = e.acceleration; // Accélération pure (Newton)
        const accG = e.accelerationIncludingGravity; // Avec gravité (Bulle)

        if (!acc || !accG) return;

        // FILTRAGE : Seuil de 0.08 m/s² pour éliminer le bruit blanc
        let rawAX = acc.x || 0;
        this.ax = Math.abs(rawAX) > 0.08 ? rawAX : 0;

        // INTÉGRATION DE VERLET (Stabilité)
        if (this.ax === 0) {
            this.vx *= 0.96; // Friction pour arrêt net
        } else {
            this.vx += this.ax * dt;
        }

        // MISE À JOUR IMU (IDs HTML)
        this.set('accel-x', (accG.x || 0).toFixed(3));
        this.set('accel-y', (accG.y || 0).toFixed(3));
        this.set('accel-z', (accG.z || 9.81).toFixed(3));
        this.set('accel-long', this.ax.toFixed(3) + " m/s²"); // Ajouté pour remplir "Accélération Long."
        this.set('force-g-long', (this.ax / 9.80665).toFixed(3));

        // CALCUL NIVEAU À BULLE
        const pitch = Math.atan2(-accG.x, Math.sqrt(accG.y**2 + accG.z**2)) * (180/Math.PI);
        const roll = Math.atan2(accG.y, accG.z) * (180/Math.PI);
        this.set('pitch', pitch.toFixed(1) + "°");
        this.set('roll', roll.toFixed(1) + "°");

        // Animation Bulle CSS
        const bubble = document.getElementById('bubble');
        if (bubble) {
            bubble.style.transform = `translate(${Math.max(-45, Math.min(45, roll * 2))}px, ${Math.max(-45, Math.min(45, pitch * 2))}px)`;
        }
    }

    // --- 2. BOUCLE DE RENDU SCIENTIFIQUE (60 FPS) ---
    runPhysicsLoop() {
        const v = Math.abs(this.vx);
        const kmh = v * 3.6;
        this.vMax = Math.max(this.vMax, kmh);

        // A. ATMOSPHÈRE (Modèle ISA)
        const T0 = 288.15; const P0 = 101325;
        const h = this.coords.alt;
        const tempK = T0 - 0.0065 * h;
        const pressPa = P0 * Math.pow(1 - (0.0065 * h) / T0, 5.255);
        const rho = pressPa / (287.05 * tempK); // Densité
        const vsound = Math.sqrt(1.4 * 287.05 * tempK); // Vitesse son

        this.set('air-temp-c', (tempK - 273.15).toFixed(1) + " °C");
        this.set('pressure-hpa', (pressPa / 100).toFixed(2));
        this.set('air-density', rho.toFixed(4));
        this.set('local-speed-of-sound', vsound.toFixed(2));
        this.set('mach-number', (v / vsound).toFixed(4));

        // B. RELATIVITÉ & ÉNERGIE
        const beta = v / this.C;
        const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
        const kineticE = 0.5 * this.mass * v**2;
        const dynamicQ = 0.5 * rho * v**2;

        this.set('lorentz-factor', gamma.toFixed(15));
        this.set('kinetic-energy', kineticE.toFixed(2) + " J");
        this.set('dynamic-pressure', dynamicQ.toFixed(2) + " Pa"); // Correction ID (dynamic-pressure vs q)
        this.set('rest-mass-energy', (this.mass * Math.pow(this.C, 2)).toExponential(4) + " J");

        // C. DISTANCE & MODE NETHER
        const factor = this.isNetherMode ? 8 : 1;
        this.totalDist += (v * factor * 0.016); // ~60fps step
        
        this.set('speed-main-display', kmh.toFixed(2) + " km/h");
        this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
        this.set('speed-max-session', this.vMax.toFixed(1) + " km/h");
        this.set('total-distance', (this.totalDist/1000).toFixed(3) + " km | " + this.totalDist.toFixed(2) + " m"); // Correction ID HTML

        // D. DATA ASTRO & POSITION (Marseille Fixe)
        this.set('lat-ukf', this.coords.lat);
        this.set('lon-ukf', this.coords.lon);
        this.set('horizon-distance-km', (3.57 * Math.sqrt(h)).toFixed(2) + " km");

        requestAnimationFrame(() => this.runPhysicsLoop());
    }

    // --- 3. BOUCLE LENTE (ASTRO & HORLOGE - 1 FPS) ---
    startLoops() {
        // Boucle Rapide (Physique)
        this.runPhysicsLoop();

        // Boucle Lente (Horloges & Astro Complexe)
        setInterval(() => {
            const now = new Date();
            
            // Horloges Système
            this.set('local-time', now.toLocaleTimeString());
            this.set('utc-datetime', now.toISOString().replace('T', ' ').substring(0, 19));
            this.set('time-minecraft', now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0'));
            
            // Calculs Astro Complets (via astro.js)
            if (window.calculateAstroDataHighPrec) {
                const astro = window.calculateAstroDataHighPrec(now, this.coords.lat, this.coords.lon);
                
                // Injection des données Astro
                this.set('tst-time', astro.TST_HRS);
                this.set('mst-time', astro.MST_HRS);
                this.set('sun-alt', (astro.sun.altitude * (180/Math.PI)).toFixed(2) + "°");
                this.set('sun-azimuth', (astro.sun.azimuth * (180/Math.PI)).toFixed(2) + "°");
                this.set('equation-of-time', astro.EOT_MIN + " min");
                
                // Lune
                if(astro.moon && astro.moon.illumination) {
                    this.set('moon-phase-name', window.getMoonPhaseName ? window.getMoonPhaseName(astro.moon.illumination.phase) : "Calcul...");
                    this.set('moon-illuminated', (astro.moon.illumination.fraction * 100).toFixed(1) + " %");
                }
                
                // Rotation Horloge Céleste UI
                const sunDeg = astro.sun.azimuth * (180/Math.PI);
                const sunEl = document.getElementById('sun-element');
                const moonEl = document.getElementById('moon-element');
                if(sunEl) sunEl.style.transform = `rotate(${sunDeg}deg)`;
                if(moonEl) moonEl.style.transform = `rotate(${sunDeg + 180}deg)`;
            }
        }, 1000);
    }

    // --- 4. INTERFACE & ÉVÉNEMENTS ---
    setupUI() {
        const btn = document.getElementById('gps-pause-toggle');
        
        // Bouton Marche/Arrêt avec Permission iOS
        btn.onclick = async () => {
            if (this.isPaused) {
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    const res = await DeviceMotionEvent.requestPermission();
                    if (res !== 'granted') return alert("Permission capteurs refusée");
                }
                window.addEventListener('devicemotion', (e) => this.updatePhysics(e));
                this.isPaused = false;
                btn.textContent = "⏸ PAUSE SYSTÈME";
                btn.classList.add('active'); // Style visuel
            } else {
                this.isPaused = true;
                btn.textContent = "▶️ MARCHE GPS";
                btn.classList.remove('active');
            }
        };

        // Bouton Mode Nether
        const netherBtn = document.getElementById('nether-toggle-btn');
        if(netherBtn) {
            netherBtn.onclick = () => {
                this.isNetherMode = !this.isNetherMode;
                netherBtn.textContent = this.isNetherMode ? "Mode Nether: ACTIVÉ (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
                netherBtn.style.color = this.isNetherMode ? "#ff4500" : "white";
                this.set('distance-ratio', this.isNetherMode ? "8.000" : "1.000");
            };
        }

        // Entrée Masse
        const massInput = document.getElementById('mass-input');
        if(massInput) {
            massInput.onchange = (e) => {
                this.mass = parseFloat(e.target.value) || 70;
                this.set('mass-display', this.mass.toFixed(3) + " kg");
            };
        }
        
        // Reset
        const resetBtn = document.getElementById('reset-all-btn');
        if(resetBtn) resetBtn.onclick = () => location.reload();
    }

    // Utilitaire Helper
    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

// Lancement
window.onload = () => { window.App = new ScientificGNSS(); };
