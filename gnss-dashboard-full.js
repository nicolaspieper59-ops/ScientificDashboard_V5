/**
 * GNSS SPACETIME - NOYAU DE FUSION V2.0 (FINAL)
 * ---------------------------------------------
 * - Moteur : Inertiel Pur (INS) avec Calibration au Démarrage
 * - Astro : Connexion forcée (Soleil/Lune/Temps Vrai)
 * - Zéro N/A : Remplissage total des données physiques
 */

class ScientificGNSS {
    constructor() {
        // --- ÉTATS PHYSIQUES ---
        this.vx = 0; // Vitesse X (m/s)
        this.ax = 0; // Accélération X (m/s²)
        this.totalDist = 0; // Distance (m)
        this.vMax = 0; // Vitesse Max (km/h)
        this.lastT = performance.now();
        this.isPaused = true;
        
        // --- CALIBRATION & ANTI-DÉRIVE ---
        this.biasX = 0; // Biais de pente (Calibration)
        this.isCalibrated = false;
        this.staticFrames = 0; // Compteur pour l'arrêt auto
        
        // --- PARAMÈTRES ---
        this.mass = 70; // kg (Défaut)
        this.isNetherMode = false;
        // Coordonnées Fixes (Marseille) pour l'Astro sans GPS
        this.coords = { lat: 43.2844, lon: 5.3590, alt: 150 };
        
        // --- CONSTANTES ---
        this.G_CONST = 9.80665;
        this.C_LIGHT = 299792458;

        this.init();
    }

    init() {
        this.setupUI();
        this.startLoops();
        console.log("🚀 GNSS SpaceTime : Système Inertiel Calibré Prêt.");
    }

    // --- 1. MOTEUR PHYSIQUE (60Hz) ---
    updatePhysics(e) {
        if (this.isPaused) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastT) / 1000, 0.1); // Sécurité temps
        this.lastT = now;

        // On récupère l'accélération AVEC gravité pour le niveau à bulle
        const accG = e.accelerationIncludingGravity; 
        // On récupère l'accélération SANS gravité (si dispo) ou on la déduit
        const accPure = e.acceleration; 

        if (!accG) return;

        // A. CALIBRATION AU DÉMARRAGE (Capture du "Zéro" sur la pente)
        // On utilise accPure.x si dispo, sinon on prend une fraction de accG
        let rawAx = (accPure && accPure.x != null) ? accPure.x : (accG.x);

        if (!this.isCalibrated) {
            this.biasX = rawAx; // On mémorise la pente actuelle comme "0"
            this.isCalibrated = true;
            console.log("🎯 Calibration terminée. Biais X : " + this.biasX.toFixed(3));
            return;
        }

        // B. CORRECTION DE DÉRIVE (La "Magie" Anti-Drift)
        // Accélération Réelle = Lecture Capteur - Biais de Pente
        let netAx = rawAx - this.biasX;

        // Zone Morte (Deadband) : On ignore le bruit microscopique (< 0.05 m/s²)
        if (Math.abs(netAx) < 0.05) {
            netAx = 0;
            this.staticFrames++;
        } else {
            this.staticFrames = 0;
        }

        // C. INTÉGRATION DE VERLET (Vitesse)
        if (this.staticFrames > 10) {
            // Si pas de mouvement pendant 10 frames (~0.16s), on force l'arrêt complet
            // C'est ce qui empêche la vitesse de rester bloquée à "0.04 km/h"
            this.vx *= 0.8; 
            if(Math.abs(this.vx) < 0.01) this.vx = 0;
        } else {
            this.vx += netAx * dt;
        }

        this.ax = netAx; // Stockage pour l'affichage

        // D. MISE À JOUR VISUELLE IMU
        this.set('accel-x', (accG.x || 0).toFixed(3));
        this.set('accel-y', (accG.y || 0).toFixed(3));
        this.set('accel-z', (accG.z || 9.81).toFixed(3));
        this.set('accel-long', this.ax.toFixed(3) + " m/s²"); 
        this.set('force-g-long', (this.ax / this.G_CONST).toFixed(3));

        // Niveau à bulle (Trigonométrie)
        const pitch = Math.atan2(-accG.x, Math.sqrt(accG.y**2 + accG.z**2)) * (180/Math.PI);
        const roll = Math.atan2(accG.y, accG.z) * (180/Math.PI);
        this.set('pitch', pitch.toFixed(1) + "°");
        this.set('roll', roll.toFixed(1) + "°");

        const bubble = document.getElementById('bubble');
        if (bubble) {
            bubble.style.transform = `translate(${Math.max(-45, Math.min(45, roll * 2))}px, ${Math.max(-45, Math.min(45, pitch * 2))}px)`;
        }
    }

    // --- 2. BOUCLE DE RENDU SCIENTIFIQUE (Calculs Modèles) ---
    runPhysicsLoop() {
        const v = Math.abs(this.vx);
        const kmh = v * 3.6;
        this.vMax = Math.max(this.vMax, kmh);

        // A. ATMOSPHÈRE ISA (Suppression N/A Météo)
        const T0 = 288.15; const P0 = 101325;
        const h = this.coords.alt; // 150m
        const tempK = T0 - 0.0065 * h;
        const pressPa = P0 * Math.pow(1 - (0.0065 * h) / T0, 5.255);
        const rho = pressPa / (287.05 * tempK);
        const vsound = Math.sqrt(1.4 * 287.05 * tempK);

        this.set('air-temp-c', (tempK - 273.15).toFixed(1) + " °C");
        this.set('pressure-hpa', (pressPa / 100).toFixed(2));
        this.set('air-density', rho.toFixed(4));
        this.set('local-speed-of-sound', vsound.toFixed(2));
        this.set('mach-number', (v / vsound).toFixed(4));
        this.set('perc-speed-sound', ((v / vsound)*100).toFixed(2) + " %");

        // B. RELATIVITÉ & DYNAMIQUE
        const beta = v / this.C_LIGHT;
        const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
        const kineticE = 0.5 * this.mass * v**2;
        const dynamicQ = 0.5 * rho * v**2;
        const momentum = this.mass * v;

        this.set('lorentz-factor', gamma.toFixed(15));
        this.set('kinetic-energy', kineticE.toFixed(2) + " J");
        this.set('dynamic-pressure', dynamicQ.toFixed(2) + " Pa");
        this.set('momentum', momentum.toFixed(2) + " kg·m/s");
        this.set('rest-mass-energy', (this.mass * Math.pow(this.C_LIGHT, 2)).toExponential(4) + " J");

        // C. DISTANCE & VITESSE
        const factor = this.isNetherMode ? 8 : 1;
        // Si vitesse très faible (< 0.05 km/h), on arrête de compter la distance pour éviter le "creep"
        if (kmh > 0.05) {
            this.totalDist += (v * factor * 0.016); // ~60Hz
        }

        this.set('speed-main-display', kmh.toFixed(2) + " km/h");
        this.set('speed-stable-kmh', kmh.toFixed(3) + " km/h");
        this.set('speed-stable-ms', v.toFixed(2) + " m/s");
        this.set('speed-raw-ms', v.toFixed(2) + " m/s");
        this.set('speed-max-session', this.vMax.toFixed(1) + " km/h");
        this.set('total-distance', (this.totalDist/1000).toFixed(3) + " km | " + this.totalDist.toFixed(2) + " m");

        // Mise à jour continue (60fps)
        requestAnimationFrame(() => this.runPhysicsLoop());
    }

    // --- 3. BOUCLE LENTE (ASTRO & HORLOGE - 1Hz) ---
    startLoops() {
        this.runPhysicsLoop(); // Démarrage boucle rapide

        // Boucle Lente (1 seconde)
        setInterval(() => {
            const now = new Date();
            
            // 1. Horloges
            this.set('local-time', now.toLocaleTimeString());
            this.set('utc-datetime', now.toISOString().replace('T', ' ').substring(0, 19));
            this.set('time-minecraft', now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0'));
            
            // 2. Pont Astro (Suppression des N/A Astro)
            if (typeof window.calculateAstroDataHighPrec === 'function') {
                const astro = window.calculateAstroDataHighPrec(now, this.coords.lat, this.coords.lon);
                
                // Injection Données Solaires
                this.set('tst-time', astro.TST_HRS);
                this.set('mst-time', astro.MST_HRS);
                this.set('sun-alt', (astro.sun.altitude * (180/Math.PI)).toFixed(2) + "°");
                this.set('sun-azimuth', (astro.sun.azimuth * (180/Math.PI)).toFixed(2) + "°");
                this.set('equation-of-time', astro.EOT_MIN + " min");
                this.set('noon-solar', astro.NOON_SOLAR_UTC ? astro.NOON_SOLAR_UTC.toISOString().substring(11,19) : "N/A");
                
                // Injection Données Lunaires
                if(astro.moon && astro.moon.illumination) {
                    this.set('moon-phase-name', window.getMoonPhaseName(astro.moon.illumination.phase));
                    this.set('moon-illuminated', (astro.moon.illumination.fraction * 100).toFixed(1) + " %");
                    this.set('moon-alt', (astro.moon.position.altitude * (180/Math.PI)).toFixed(2) + "°");
                    this.set('moon-distance', (astro.moon.position.distance / 1000).toFixed(0) + " km");
                }

                // Animation Visuelle Soleil/Lune
                const sunDeg = astro.sun.azimuth * (180/Math.PI);
                const sunEl = document.getElementById('sun-element');
                const moonEl = document.getElementById('moon-element');
                if(sunEl) sunEl.style.transform = `rotate(${sunDeg}deg)`;
                if(moonEl) moonEl.style.transform = `rotate(${sunDeg + 180}deg)`;
            } else {
                console.warn("Astro.js non chargé ou fonction introuvable.");
            }

            // 3. Infos Système
            this.set('lat-ukf', this.coords.lat);
            this.set('lon-ukf', this.coords.lon);
            this.set('ukf-status', "FUSION INERTIELLE");
            this.set('gps-status', "SIMULATION INS");

        }, 1000);
    }

    // --- 4. UI & INTERACTION ---
    setupUI() {
        const btn = document.getElementById('gps-pause-toggle');
        
        btn.onclick = async () => {
            if (this.isPaused) {
                // Demande de permission iOS (Crucial)
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    const res = await DeviceMotionEvent.requestPermission();
                    if (res !== 'granted') return alert("Permission requise pour le moteur physique.");
                }
                
                window.addEventListener('devicemotion', (e) => this.updatePhysics(e));
                
                this.isPaused = false;
                this.isCalibrated = false; // On recalibre à chaque "Play"
                this.vx = 0; // On reset la vitesse pour éviter les sauts
                
                btn.textContent = "⏸ PAUSE SYSTÈME";
                btn.style.backgroundColor = "#dc3545"; // Rouge
            } else {
                this.isPaused = true;
                btn.textContent = "▶️ MARCHE GPS";
                btn.style.backgroundColor = "#28a745"; // Vert
            }
        };

        // Bouton Nether
        const netherBtn = document.getElementById('nether-toggle-btn');
        if(netherBtn) {
            netherBtn.onclick = () => {
                this.isNetherMode = !this.isNetherMode;
                netherBtn.textContent = this.isNetherMode ? "Mode Nether: ACTIVÉ (1:8)" : "Mode Nether: DÉSACTIVÉ (1:1)";
                netherBtn.style.color = this.isNetherMode ? "#ff4500" : "white";
                this.set('distance-ratio', this.isNetherMode ? "8.000" : "1.000");
                const status = document.getElementById('nether-mode-status');
                if(status) { status.style.display = 'block'; status.textContent = this.isNetherMode ? "8.000" : "1.000"; }
            };
        }

        // Masse
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

    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

// Lancement automatique
window.onload = () => { window.App = new ScientificGNSS(); };
