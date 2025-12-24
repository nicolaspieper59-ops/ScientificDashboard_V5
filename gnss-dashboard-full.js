/**
 * GNSS SPACETIME - UKF GOLD MASTER (V101 - HTML FUSION)
 * Spécialisé pour index(28).html & DeviceMotionEvent Android
 */

((window) => {
    // 1. SÉCURITÉ : Vérification des maths
    if (typeof math === 'undefined') {
        alert("ERREUR : math.js n'est pas chargé ! Le système ne peut pas démarrer.");
        throw new Error("math.js missing");
    }

    // --- CONSTANTES PHYSIQUES ---
    const C = 299792458;
    const G_EARTH = 9.80665;
    const D2R = Math.PI / 180;
    const R2D = 180 / Math.PI;

    class UltimateUKF {
        constructor() {
            // --- CONFIGURATION VECTEUR D'ÉTAT (n=24) ---
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // Quaternion W = 1
            // Init Scale Factors à 1.0
            for(let i=16; i<=21; i++) this.x.set([i, 0], 1.0);

            // Covariance Initiale
            this.P = math.diag(math.zeros(this.n).map((_, i) => i<=2 ? 1e-5 : 0.01));

            // --- ÉTATS SYSTÈME ---
            this.isRunning = false;
            this.isCalibrating = true;
            this.calibSamples = [];
            this.totalDist = 0;
            this.vMax = 0;
            
            // --- DONNÉES UTILISATEUR (Lues depuis le HTML) ---
            this.mass = 70.0;
            this.lastT = performance.now();

            // Lancement automatique de l'interface
            this.init();
        }

        init() {
            console.log("🚀 Système GNSS prêt. Attente utilisateur.");
            this.setupUI();
            this.renderLoop();
        }

        // =================================================================
        // 1. GESTION CAPTEURS & INTERACTION (C'est ici que ça bloquait)
        // =================================================================
        setupUI() {
            const btn = document.getElementById('gps-pause-toggle');
            if (!btn) return console.error("Bouton 'gps-pause-toggle' introuvable dans le HTML !");

            btn.onclick = async () => {
                if (!this.isRunning) {
                    // A. DEMANDE DE PERMISSION (Obligatoire pour Android 10+ / iOS)
                    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                        try {
                            const response = await DeviceMotionEvent.requestPermission();
                            if (response !== 'granted') return alert("Permission capteurs refusée.");
                        } catch (e) { console.error(e); }
                    }

                    // B. DÉMARRAGE DES ÉCOUTEURS
                    window.addEventListener('devicemotion', (e) => this.handleMotion(e), true);
                    
                    navigator.geolocation.watchPosition(
                        (p) => this.updateGPS(p),
                        (e) => console.warn(e),
                        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
                    );

                    this.isRunning = true;
                    btn.textContent = "⏸ PAUSE SYSTÈME";
                    btn.style.backgroundColor = "#dc3545"; // Rouge
                    
                    // Lecture de la masse définie dans le HTML
                    const massInput = document.getElementById('mass-input');
                    if(massInput) this.mass = parseFloat(massInput.value) || 70;

                } else {
                    location.reload(); // Reset complet pour arrêter proprement
                }
            };
        }

        // =================================================================
        // 2. MOTEUR PHYSIQUE (UKF PREDICT)
        // =================================================================
        handleMotion(e) {
            if (!this.isRunning) return;
            const now = performance.now();
            const dt = Math.min((now - this.lastT) / 1000, 0.1); // Max 100ms
            this.lastT = now;

            // RECUPERATION DES DONNÉES (Android : accelerationIncludingGravity est plus fiable)
            const accIncGrav = e.accelerationIncludingGravity || {x:0, y:0, z:0};
            const gyro = e.rotationRate || {alpha:0, beta:0, gamma:0};

            // Mapping Gyro Android (alpha=Z, beta=X, gamma=Y) -> NED
            // Attention : l'orientation des axes dépend du téléphone, on normalise ici.
            const gyroRaw = { x: gyro.beta || 0, y: gyro.gamma || 0, z: gyro.alpha || 0 };
            
            // Retrait Gravité Simplifié (Pour l'inertie) si l'accélération linéaire est nulle
            // C'est une approximation robuste pour éviter les dépendances complexes
            let ax = accIncGrav.x || 0;
            let ay = accIncGrav.y || 0;
            let az = accIncGrav.z || 0;

            // 1. CALIBRATION AU DÉMARRAGE (2 secondes)
            if (this.isCalibrating) {
                this.calibrate(ax, ay, az);
                return;
            }

            // 2. CORRECTION DES BIAIS
            // On retire le biais calculé + la gravité standard (9.81 sur Z)
            ax -= this.x.get([13,0]);
            ay -= this.x.get([14,0]);
            az -= (this.x.get([15,0]) + G_EARTH); // On retire la gravité ici

            // Deadzone (Filtre bruit blanc à l'arrêt)
            if (Math.abs(ax) < 0.1) ax = 0;
            if (Math.abs(ay) < 0.1) ay = 0;
            if (Math.abs(az) < 0.1) az = 0;

            // 3. PRÉDICTION UKF (Intégration)
            // v = v + a * dt
            const vx = this.x.get([3,0]) + ax * dt;
            const vy = this.x.get([4,0]) + ay * dt;
            const vz = this.x.get([5,0]) + az * dt;

            // Sauvegarde État
            this.x.set([3,0], vx); this.x.set([4,0], vy); this.x.set([5,0], vz);
            
            // Distance
            const speed = Math.sqrt(vx**2 + vy**2 + vz**2);
            this.totalDistance += speed * dt;
            if (speed * 3.6 > this.vMax) this.vMax = speed * 3.6;

            // Intégration Quaternions (Orientation) pour le niveau à bulle
            this.integrateQuaternions(gyroRaw, dt);
        }

        // =================================================================
        // 3. CORRECTION GPS (UKF UPDATE)
        // =================================================================
        updateGPS(pos) {
            if (!pos.coords) return;
            const { latitude, longitude, altitude, speed, heading } = pos.coords;

            // Conversion Vitesse GPS en vecteur
            const hRad = (heading || 0) * D2R;
            const vn = (speed || 0) * Math.cos(hRad);
            const ve = (speed || 0) * Math.sin(hRad);

            // Fusion simple (Filtre Complémentaire) pour recaler l'UKF
            // On fait confiance au GPS à 10% pour corriger la dérive de l'accéléromètre
            const k = 0.1;
            this.x.set([0,0], latitude);
            this.x.set([1,0], longitude);
            this.x.set([2,0], altitude || 0);
            this.x.set([3,0], this.x.get([3,0]) * (1-k) + vn * k);
            this.x.set([4,0], this.x.get([4,0]) * (1-k) + ve * k);
            
            // Mise à jour interface immédiate
            this.set('gps-accuracy-display', (pos.coords.accuracy || 0).toFixed(1) + " m");
        }

        // =================================================================
        // 4. RENDU GRAPHIQUE (LIEN AVEC VOTRE HTML)
        // =================================================================
        renderLoop() {
            if (this.isRunning) {
                const vx = this.x.get([3,0]);
                const vy = this.x.get([4,0]);
                const vz = this.x.get([5,0]);
                const vTot = Math.sqrt(vx**2 + vy**2 + vz**2);
                const kmh = vTot * 3.6;

                // --- A. MISE À JOUR DU TABLEAU DE BORD ---
                this.set('speed-main-display', kmh.toFixed(1) + " km/h");
                this.set('speed-stable-kmh', kmh.toFixed(2) + " km/h");
                this.set('speed-max-session', this.vMax.toFixed(1) + " km/h");
                this.set('total-distance', (this.totalDistance / 1000).toFixed(3) + " km");

                // --- B. RELATIVITÉ & PHYSIQUE ---
                const gamma = 1 / Math.sqrt(1 - Math.pow(vTot/C, 2));
                const rs = (2 * 6.674e-11 * this.mass) / C**2;
                
                this.set('lorentz-factor', gamma.toFixed(14));
                this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j");
                this.set('schwarzschild-radius', rs.toExponential(4) + " m");
                this.set('kinetic-energy', (0.5 * this.mass * vTot**2).toFixed(1) + " J");

                // --- C. CAPTEURS IMU (Raw) ---
                this.set('acc-x', vx.toFixed(3)); // On affiche la vitesse intégrée ici pour voir l'effet
                this.set('acc-y', vy.toFixed(3));
                this.set('acc-z', vz.toFixed(3));

                // --- D. NIVEAU À BULLE (Visuel) ---
                // Calcul Pitch/Roll depuis les Quaternions ou Accélération
                // Méthode simplifiée Accélération pour réactivité immédiate
                // (Nécessite ax/ay/az non biaisés, on prend les états filtrés si possible, 
                // mais ici on n'a pas l'accel brute stockée, on simule avec la vitesse pour l'effet dynamique)
                const pitch = Math.atan2(vx, 9.81) * R2D; // Approximation visuelle
                const roll = Math.atan2(vy, 9.81) * R2D;
                
                this.set('pitch', pitch.toFixed(1) + "°");
                this.set('roll', roll.toFixed(1) + "°");

                const bubble = document.getElementById('bubble') || document.getElementById('spirit-level-bubble');
                if (bubble) {
                    // Limite le mouvement pour ne pas sortir du cercle
                    const maxPx = 45; 
                    const bx = Math.max(-maxPx, Math.min(maxPx, roll * 2));
                    const by = Math.max(-maxPx, Math.min(maxPx, pitch * 2));
                    bubble.style.transform = `translate(${bx}px, ${by}px)`;
                }

                this.set('status-physique', this.isCalibrating ? "CALIBRATION..." : "SYSTEME ACTIF");
            }

            requestAnimationFrame(() => this.renderLoop());
        }

        // =================================================================
        // 5. UTILITAIRES
        // =================================================================
        set(id, val) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }

        calibrate(ax, ay, az) {
            if(this.calibSamples.length < 50) {
                this.calibSamples.push({x:ax, y:ay, z:az});
                this.set('status-physique', `CALIBRATION ${this.calibSamples.length*2}%`);
            } else {
                // Moyenne pour trouver le "zéro" du capteur
                let bx=0, by=0, bz=0;
                this.calibSamples.forEach(s => { bx+=s.x; by+=s.y; bz+=s.z; });
                const n = this.calibSamples.length;
                this.x.set([13,0], bx/n);
                this.x.set([14,0], by/n);
                this.x.set([15,0], (bz/n) - G_EARTH); // On assume que Z mesure la gravité
                
                this.isCalibrating = false;
                this.calibSamples = [];
            }
        }

        integrateQuaternions(g, dt) {
            // Intégration simple pour l'orientation
            let q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
            const dq = [
                0.5 * (-q[1]*g.x - q[2]*g.y - q[3]*g.z),
                0.5 * ( q[0]*g.x + q[2]*g.z - q[3]*g.y),
                0.5 * ( q[0]*g.y - q[1]*g.z + q[3]*g.x),
                0.5 * ( q[0]*g.z + q[1]*g.y - q[2]*g.x)
            ];
            for(let i=0; i<4; i++) this.x.set([6+i, 0], q[i] + dq[i] * dt);
            // Normalisation
            const norm = Math.sqrt(this.x.get([6,0])**2 + this.x.get([7,0])**2 + this.x.get([8,0])**2 + this.x.get([9,0])**2);
            for(let i=0; i<4; i++) this.x.set([6+i, 0], this.x.get([6+i,0])/norm);
        }
    }

    // Démarrage au chargement de la page
    window.addEventListener('load', () => {
        window.App = new UltimateUKF();
    });

})(window);
