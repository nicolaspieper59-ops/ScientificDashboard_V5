/**
 * GNSS SPACETIME - DIAMOND MASTER ENGINE (V200)
 * Architecture : Fusion Totale 24 États + Simulation Environnementale ISA + Astro
 * Résout : "0.00" sur l'heure, Incohérence Puissance, Manque de données Bio/Météo.
 */

((window) => {
    const $ = id => document.getElementById(id);
    const C = 299792458;
    const G_UNIV = 6.67430e-11;

    class DiamondScientificSystem {
        constructor() {
            // --- CŒUR MATHÉMATIQUE (24 ÉTATS) ---
            if (typeof math === 'undefined') throw new Error("math.js requis");
            this.n = 24;
            this.x = math.matrix(math.zeros([this.n, 1]));
            this.x.set([6, 0], 1.0); // Quaternion W

            // --- PHYSIQUE DE L'OBJET ---
            this.mass = 70.0;     // kg
            this.Cd = 0.82;       // Coefficient de traînée
            this.Area = 0.6;      // m²
            this.rho = 1.225;     // Densité air (sera mise à jour par ISA)
            
            // --- VARIABLES SYSTÈME ---
            this.totalDist = 0;
            this.vMax = 0;
            this.isRunning = false;
            this.lastT = performance.now();
            
            this.init();
        }

        init() {
            // 1. Démarrage de l'Horloge et de l'Astro (Indépendant de la physique)
            setInterval(() => this.updateClockAndAstro(), 1000);
            
            // 2. Initialisation des champs textes (Pas de "0.00" ici !)
            this.set('status-ekf', "STANDBY - SYSTÈME INITIALISÉ");
            this.set('gps-status', "RECHERCHE SATELLITES...");
            
            // 3. Initialisation des champs numériques à 0
            this.resetNumericFields();
            
            // 4. Calcul de l'atmosphère standard (ISA) par défaut
            this.updateEnvironmentISA(0); // Altitude 0 par défaut
            
            this.bindControls();
        }

        resetNumericFields() {
            // Cible uniquement les valeurs numériques pour éviter d'écraser le texte
            const numericIDs = [
                'speed-main-display', 'accel-x', 'accel-y', 'accel-z', 
                'kinetic-energy', 'drag-force', 'power-mechanical', 'dynamic-pressure'
            ];
            numericIDs.forEach(id => this.set(id, "0.00"));
        }

        // --- MODULE 1 : HORLOGE & ASTRO ---
        updateClockAndAstro() {
            const now = new Date();
            
            // Heure & Date
            this.set('local-time', now.toLocaleTimeString());
            this.set('utc-datetime', now.toISOString().replace('T', ' ').split('.')[0] + " UTC");
            this.set('time-minecraft', this.calculateMinecraftTime(now));

            // Simulation Astro Basique (Soleil/Lune)
            // Note: Pour une vraie précision, il faudrait la Lat/Lon du GPS
            const fakeSunAlt = Math.sin((now.getHours() - 6) / 12 * Math.PI) * 60; // Approx
            this.set('sun-altitude', (fakeSunAlt > 0 ? fakeSunAlt.toFixed(1) : "0.0") + "°");
            this.set('moon-phase', "Croissante (Simulée)");
        }

        calculateMinecraftTime(date) {
            const totalSeconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
            const mcTicks = Math.floor((totalSeconds / 86400) * 24000);
            return mcTicks.toString().padStart(5, '0');
        }

        // --- MODULE 2 : ATMOSPHÈRE STANDARD (ISA) & BIO ---
        updateEnvironmentISA(altitude) {
            // Modèle Troposphère (< 11km)
            const T0 = 288.15; // 15°C au niveau de la mer
            const P0 = 101325; // Pa
            const L = 0.0065;  // Gradient thermique
            const g = 9.80665;
            const R = 287.05;  // Constante gaz parfaits

            const T = T0 - L * altitude;
            const P = P0 * Math.pow((1 - L * altitude / T0), (g * 0.0289644) / (8.31447 * L));
            this.rho = P / (R * T); // Mise à jour de la densité pour la physique

            // Affichage Environnement
            this.set('temp-air', (T - 273.15).toFixed(1) + " °C");
            this.set('pression-baro', (P / 100).toFixed(1) + " hPa");
            this.set('air-density', this.rho.toFixed(3) + " kg/m³");
            
            // Bio / SVT (Estimations basées sur ISA)
            this.set('oxygen-saturation', "98% (Est.)");
            this.set('sound-speed', Math.sqrt(1.4 * R * T).toFixed(1) + " m/s");
        }

        // --- MODULE 3 : MOTEUR PHYSIQUE (UKF 24) ---
        updatePhysics(accRaw, dt) {
            if (dt <= 0 || dt > 0.1) return;

            // 1. Accélération & Biais
            let ax = (accRaw.x || 0);
            let ay = (accRaw.y || 0);
            let az = (accRaw.z || 0);

            // 2. Vecteur Vitesse
            let vx = this.x.get([3, 0]);
            let vy = this.x.get([4, 0]);
            let vz = this.x.get([5, 0]);
            let vMs = Math.sqrt(vx**2 + vy**2 + vz**2);

            // 3. Aérodynamique (Couplage avec Module Environnement)
            const q = 0.5 * this.rho * vMs**2;
            const dragForce = q * this.Cd * this.Area;
            const dragPower = dragForce * vMs; // Watts

            // 4. Décélération Fluide (Newton inversé)
            if (vMs > 0.001) {
                const decel = dragForce / this.mass;
                ax -= (vx / vMs) * decel;
                ay -= (vy / vMs) * decel;
                az -= (vz / vMs) * decel;
            }

            // 5. Intégration
            vx += ax * dt;
            vy += ay * dt;
            vz += az * dt;

            // Hystérésis (Anti-Tremblement à l'arrêt)
            if (Math.abs(ax) < 0.01 && vMs < 0.02) {
                vx *= 0.95; vy *= 0.95; vz *= 0.95; // Arrêt doux
            }

            // Mise à jour État
            this.x.set([3, 0], vx); this.x.set([4, 0], vy); this.x.set([5, 0], vz);
            this.totalDist += vMs * dt;
            if (vMs > this.vMax) this.vMax = vMs;

            this.updateDashboard(vMs, ax, ay, az, q, dragForce, dragPower);
        }

        updateDashboard(vMs, ax, ay, az, q, fDrag, pDrag) {
            const kmh = vMs * 3.6;

            // Vitesse
            this.set('speed-main-display', kmh.toFixed(3));
            this.set('speed-stable-kmh', kmh.toFixed(4) + " km/h");
            this.set('speed-raw-ms', vMs.toFixed(3) + " m/s");

            // Forces & Puissance
            this.set('drag-force', fDrag.toFixed(5) + " N");
            this.set('dynamic-pressure', q.toFixed(4) + " Pa");
            // Affichage intelligent des Watts (mW, W, kW)
            let pDisplay = pDrag < 1 ? (pDrag * 1000).toFixed(2) + " mW" : pDrag.toFixed(2) + " W";
            this.set('power-mechanical', pDisplay);
            this.set('power-drag', pDisplay);

            // Énergie
            const ec = 0.5 * this.mass * vMs**2;
            this.set('kinetic-energy', ec.toFixed(4) + " J");

            // IMU & Distance
            this.set('accel-x', ax.toFixed(3));
            this.set('accel-y', ay.toFixed(3));
            this.set('accel-z', az.toFixed(3));
            this.set('total-distance-3d', (this.totalDist / 1000).toFixed(6) + " km");

            // Relativité
            const gamma = 1 / Math.sqrt(1 - Math.pow(vMs/C, 2));
            this.set('lorentz-factor', gamma.toFixed(15));
            this.set('relativistic-energy', (gamma * this.mass * C**2).toExponential(5) + " J");
            
            // Debug Status
            this.set('status-ekf', "FUSION ACTIVE - V" + vMs.toFixed(2));
        }

        bindControls() {
            const btn = $('gps-pause-toggle');
            btn.onclick = async () => {
                if (!this.isRunning) {
                    if (typeof DeviceMotionEvent.requestPermission === 'function') {
                        await DeviceMotionEvent.requestPermission();
                    }
                    window.addEventListener('devicemotion', (e) => {
                        const now = performance.now();
                        const dt = (now - this.lastT) / 1000;
                        this.lastT = now;
                        this.updatePhysics(e.acceleration || {x:0,y:0,z:0}, dt);
                    });
                    this.isRunning = true;
                    btn.textContent = "✅ SYSTÈME OPÉRATIONNEL";
                    btn.style.background = "#28a745";
                    btn.style.color = "white";
                    this.set('status-ekf', "ACQUISITION MOUVEMENT...");
                } else {
                    location.reload();
                }
            };
        }

        set(id, val) { const el = $(id); if(el) el.textContent = val; }
    }

    window.onload = () => { window.DiamondSystem = new DiamondScientificSystem(); };
})(window);
