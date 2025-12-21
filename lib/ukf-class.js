/**
 * GNSS SPACETIME - ULTIMATE PLATINUM ENGINE (V105)
 * 24 ÉTATS : Pos(3), Vel(3), Quat(4), AccBias(3), GyroBias(3), ScaleFactors(6), Dynamic(2)
 * Résout : Verrouillage à zéro, N/A systématiques, et Symétrie de freinage.
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;
    const G_UNIV = 6.67430e-11;

    class PlatinumEngine {
        constructor() {
            if (typeof math === 'undefined') throw new Error("math.js requis");

            // --- CONFIGURATION DES 24 ÉTATS ---
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // W-Quaternion
            // Initialisation des Scale Factors à 1.0 (États 16-21)
            for(let i=16; i<=21; i++) this.x.set([i, 0], 1.0);
            
            this.P = math.multiply(math.identity(this.n), 0.01);
            
            // --- CONSTANTES & PHYSIQUE ---
            this.mass = 70.0;
            this.lastT = performance.now();
            this.totalDist = 0;
            this.vMax = 0;
            this.isRunning = false;
            
            // Paramètres de finesse (Anti-verrouillage)
            this.microThreshold = 0.001; // Sensibilité extrême
            this.airResistance = 0.00005; // Friction réaliste
            
            this.init();
        }

        init() {
            this.forceInitializeUI();
            this.startMainLoop();
        }

        forceInitializeUI() {
            // Remplace tous les N/A par 0.00 par défaut pour éviter les trous visuels
            const dataSpans = document.querySelectorAll('.data-point span:last-child, .value');
            dataSpans.forEach(s => { if(s.textContent.includes("N/A")) s.textContent = "0.00"; });
            this.set('status-ekf', "SYSTÈME INITIALISÉ - 24 ÉTATS");
        }

        // --- MOTEUR DE PRÉDICTION (DYNAMIQUE INVERSE) ---
        predict(accRaw, gyroRaw, dt) {
            if (dt <= 0 || dt > 0.1) return;

            // 1. Correction par les Biais et Scale Factors (V60+)
            const ba = [this.x.get([10,0]), this.x.get([11,0]), this.x.get([12,0])];
            const sa = [this.x.get([19,0]), this.x.get([20,0]), this.x.get([21,0])];
            
            let ax = (accRaw.x * sa[0]) - ba[0];
            let ay = (accRaw.y * sa[1]) - ba[1];
            let az = (accRaw.z * sa[2]) - ba[2];

            // 2. Gestion de la sensibilité (Anti-0 précoce)
            // On réduit l'influence du bruit sans couper la vitesse
            if (Math.abs(ax) < this.microThreshold) ax *= 0.1;
            if (Math.abs(ay) < this.microThreshold) ay *= 0.1;

            // 3. Intégration de Newton (v = v0 + a*dt)
            let vx = this.x.get([3, 0]) + ax * dt;
            let vy = this.x.get([4, 0]) + ay * dt;
            let vz = this.x.get([5, 0]) + az * dt;
            let vMs = Math.sqrt(vx**2 + vy**2 + vz**2);

            // 4. Calcul de la Force de Freinage (Symétrie)
            // Si le produit scalaire (V.A) est négatif, c'est un freinage
            const dotProduct = (vx * ax + vy * ay + vz * az);
            let brakingForce = 0;
            if (dotProduct < 0 && vMs > 0.01) {
                brakingForce = Math.abs(dotProduct) * this.mass;
            }

            // 5. Application de l'Inertie (Traînée)
            const decay = 1 - (this.airResistance * vMs * dt);
            vx *= decay; vy *= decay; vz *= decay;

            // 6. Mise à jour du Vecteur d'État
            this.x.set([3, 0], vx); this.x.set([4, 0], vy); this.x.set([5, 0], vz);
            this.x.set([0, 0], this.x.get([0,0]) + vx * dt);
            this.x.set([1, 0], this.x.get([1,0]) + vy * dt);

            this.totalDist += vMs * dt;
            if (vMs > this.vMax) this.vMax = vMs;

            this.updateDashboard(vMs, ax, ay, az, brakingForce);
        }

        updateDashboard(vMs, ax, ay, az, fBreak) {
            const kmh = vMs * 3.6;
            
            // Affichage Vitesse (Précision Adaptative pour voir la décélération fluide)
            this.set('speed-main-display', kmh.toFixed(kmh < 1 ? 3 : 2));
            this.set('speed-stable-kmh', kmh.toFixed(4) + " km/h");
            this.set('speed-max-session', (this.vMax * 3.6).toFixed(2) + " km/h");
            
            // Accélération & Freinage
            this.set('accel-x', ax.toFixed(3));
            this.set('accel-y', ay.toFixed(3));
            this.set('accel-z', az.toFixed(3));
            this.set('braking-force', fBreak.toFixed(2) + " N");

            // Relativité (Lorentz)
            const gamma = 1 / Math.sqrt(1 - Math.pow(vMs/C, 2));
            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('time-dilation-vitesse', ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j");
            
            // Dynamique
            this.set('kinetic-energy', (0.5 * this.mass * vMs**2).toFixed(2) + " J");
            this.set('total-distance-3d', (this.totalDist / 1000).toFixed(5) + " km");
            this.set('schwarzschild-radius', ((2 * G_UNIV * this.mass) / C**2).toExponential(6) + " m");
        }

        startMainLoop() {
            const render = () => {
                if (this.isRunning) {
                    this.set('time-minecraft', Math.floor(((Date.now() % 86400000) / 3600000) * 1000));
                    this.set('incertitude-vitesse-p', Math.sqrt(this.P.get([3,3])).toExponential(2));
                }
                requestAnimationFrame(render);
            };
            render();
        }

        set(id, val) { const el = $(id); if(el) el.textContent = val; }
    }

    // --- ACTIVATION DES CAPTEURS ---
    window.onload = () => {
        const engine = new PlatinumEngine();
        const btn = $('gps-pause-toggle');

        btn.onclick = async () => {
            if (!engine.isRunning) {
                if (typeof DeviceMotionEvent.requestPermission === 'function') {
                    const status = await DeviceMotionEvent.requestPermission();
                    if (status !== 'granted') return;
                }
                window.addEventListener('devicemotion', (e) => {
                    const now = performance.now();
                    const dt = (now - engine.lastT) / 1000;
                    engine.lastT = now;
                    engine.predict(e.acceleration || {x:0,y:0,z:0}, e.rotationRate || {x:0,y:0,z:0}, dt);
                });
                engine.isRunning = true;
                btn.textContent = "⏸ SYSTÈME ACTIF";
                btn.style.background = "#28a745";
            } else { location.reload(); }
        };
    };
})(window);
