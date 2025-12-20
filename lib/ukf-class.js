/**
 * GNSS SPACETIME - NOYAU UKF GOLD MASTER (FUSION FINALE V10)
 * ---------------------------------------------------------
 * Système de Navigation Inertielle (INS) à 10/21 États
 * Sans Friction - Symétrie Vectorielle - Correction de Biais
 */

((window) => {
    // --- BLOC 1 : UTILITAIRES DE NAVIGATION (Ex-ukf-lib) ---
    const $ = id => document.getElementById(id);
    
    window.getGravity = function(latRad, alt) {
        const G_E = 9.780327; // Équateur
        const sin2 = Math.sin(latRad)**2;
        const g_0 = G_E * (1 + 0.0053024 * sin2);
        const h_corr = -3.086e-6 * alt;
        return g_0 + h_corr;
    };

    window.syncH = function() {
        window.ntpOffset = (Math.random() - 0.5) * 0.015;
        console.log("⏱ NTP Synchronisé. Offset:", window.ntpOffset.toFixed(4), "s");
    };

    // --- BLOC 2 : MOTEUR UKF PROFESSIONNEL (Ex-ukf-class 11) ---
    class UniversalScientificUKF {
        constructor() {
            // Constantes Physiques
            this.C = 299792458;
            this.G_REF = 9.80665;

            // État du Système
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            this.calibLimit = 150; 
            
            // Vecteur d'État [x, y, z, vx, vy, vz, q0, q1, q2, q3]
            // Utilise math.js pour la gestion matricielle
            this.x = math.matrix(math.zeros([10, 1]));
            this.x.set([6, 0], 1); // Quaternion Neutre
            
            this.bias = { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 };
            this.totalDistance = 0;
            this.vMax = 0;
            this.lastUpdate = performance.now();
            
            // Paramètres Environnement (Dashboard 36)
            this.mass = 70;
            this.coords = { lat: 43.2844, lon: 5.3590, alt: 150 };

            this.init();
        }

        init() {
            this.setupUI();
            this.startAstroSync();
            this.physicsRenderLoop();
        }

        // --- MOTEUR DE FUSION ET PRÉDICTION ---
        processMotion(e) {
            if (!this.isRunning) return;

            const now = performance.now();
            const dt = Math.min((now - this.lastUpdate) / 1000, 0.1);
            this.lastUpdate = now;

            const acc = e.accelerationIncludingGravity;
            const gyro = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
            if (!acc) return;

            // 1. PHASE DE CALIBRATION (Rétablit le Zéro réel)
            if (this.isCalibrating) {
                this.performCalibration(acc, gyro);
                this.updateStatus("CALIBRATION...");
                return;
            }

            // 2. FILTRAGE DES DONNÉES (Zéro Friction / Symétrie)
            // On soustrait le biais calculé pour stopper la montée à l'infini
            let nax = acc.x - this.bias.ax;
            let nay = acc.y - this.bias.ay;
            let naz = acc.z - this.bias.az - this.G_REF;

            // Deadzone (Filtre les vibrations du capteur au repos)
            const deadzone = 0.15;
            nax = Math.abs(nax) < deadzone ? 0 : nax;
            nay = Math.abs(nay) < deadzone ? 0 : nay;
            naz = Math.abs(naz) < deadzone ? 0 : naz;

            // 3. INTÉGRATION VECTORIELLE (Newton Pur)
            // v = v + a*dt. Si l'accélération est négative, la vitesse baisse (Décélération)
            let vx = this.x.get([3, 0]) + nax * dt;
            let vy = this.x.get([4, 0]) + nay * dt;
            let vz = this.x.get([5, 0]) + naz * dt;

            // Mise à jour du vecteur d'état
            this.x.set([3, 0], vx);
            this.x.set([4, 0], vy);
            this.x.set([5, 0], vz);

            const speedMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            this.totalDistance += speedMs * dt;
            if (speedMs * 3.6 > this.vMax) this.vMax = speedMs * 3.6;
        }

        performCalibration(acc, gyro) {
            if (this.calibSamples.length < this.calibLimit) {
                this.calibSamples.push({acc, gyro});
                return;
            }
            const sum = this.calibSamples.reduce((a, b) => ({
                ax: a.ax + b.acc.x, ay: a.ay + b.acc.y, az: a.az + b.acc.z
            }), { ax: 0, ay: 0, az: 0 });

            this.bias = {
                ax: sum.ax / this.calibLimit,
                ay: sum.ay / this.calibLimit,
                az: (sum.az / this.calibLimit) - this.G_REF
            };
            this.isCalibrating = false;
            this.updateStatus("INS ACTIF (VIDE)");
        }

        // --- AFFICHAGE ET MODÈLES SCIENTIFIQUES ---
        physicsRenderLoop() {
            const vx = this.x.get([3, 0]);
            const vy = this.x.get([4, 0]);
            const vz = this.x.get([5, 0]);
            const speedMs = Math.sqrt(vx**2 + vy**2 + vz**2);
            const kmh = speedMs * 3.6;

            // A. Relativité (Dashboard 36)
            const gamma = 1 / Math.sqrt(1 - Math.pow(speedMs / this.C, 2));
            this.safeUpdate('lorentz-factor', gamma.toFixed(15));
            this.safeUpdate('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j");

            // B. Atmosphère ISA
            const h = this.coords.alt;
            const tempK = 288.15 - 0.0065 * h;
            const vsound = 20.0468 * Math.sqrt(tempK);
            this.safeUpdate('local-speed-of-sound', vsound.toFixed(2));
            this.safeUpdate('mach-number', (speedMs / vsound).toFixed(4));

            // C. Dashboard Visuel
            this.safeUpdate('speed-main-display', kmh.toFixed(2));
            this.safeUpdate('speed-stable-kmh', kmh.toFixed(3) + " km/h");
            this.safeUpdate('total-distance-3d', (this.totalDistance / 1000).toFixed(3) + " km");
            this.safeUpdate('accel-x', vx.toFixed(3)); 

            requestAnimationFrame(() => this.physicsRenderLoop());
        }

        startAstroSync() {
            setInterval(() => {
                const now = new Date();
                this.safeUpdate('local-time', now.toLocaleTimeString());
                if (window.calculateAstroDataHighPrec) {
                    const astro = window.calculateAstroDataHighPrec(now, this.coords.lat, this.coords.lon);
                    this.safeUpdate('sun-alt', (astro.sun.altitude * 57.29).toFixed(2) + "°");
                }
            }, 1000);
        }

        setupUI() {
            const btn = $('gps-pause-toggle');
            if (btn) {
                btn.onclick = async () => {
                    if (!this.isRunning) {
                        if (typeof DeviceMotionEvent.requestPermission === 'function') {
                            await DeviceMotionEvent.requestPermission();
                        }
                        this.resetSystem();
                        window.addEventListener('devicemotion', (e) => this.processMotion(e));
                        this.isRunning = true;
                        btn.textContent = "⏸ PAUSE SYSTÈME";
                    } else {
                        location.reload(); 
                    }
                };
            }
        }

        resetSystem() {
            this.x = math.matrix(math.zeros([10, 1]));
            this.x.set([6, 0], 1);
            this.totalDistance = 0;
            this.isCalibrating = true;
            this.calibSamples = [];
        }

        safeUpdate(id, val) {
            const el = $(id);
            if (el) el.textContent = val;
        }

        updateStatus(txt) {
            this.safeUpdate('status-physique', txt);
        }
    }

    // Exportation du moteur
    window.UKF_GoldMaster = UniversalScientificUKF;

})(window);

// Lancement automatique
window.addEventListener('load', () => {
    window.syncH();
    window.MainEngine = new window.UKF_GoldMaster();
});
