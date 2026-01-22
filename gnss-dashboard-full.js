/**
 * PROVIDENCE V140.0 - OMNI-SOUVERAIN (FINAL CORE)
 * Architecture: Mapping 1:1 avec le HTML Master-Class
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (n) => m.bignumber(String(n || 0));

const OMNI_CORE = {
    active: false,
    startTime: Date.now(),
    lastT: performance.now(),
    frameCount: 0,
    lastSecond: performance.now(),
    
    // Buffers de données
    path: [], 
    gForceHistory: new Array(100).fill(0),
    
    // État Physique
    state: {
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) },
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) },
        bias: { x: 0, y: 0, z: 0 },
        dist: _BN(0),
        max_g: 0,
        temp_c: 20,
        pressure: 1013,
        rad_dose: 0
    },

    // Constantes Universelles
    PHYS: {
        C: _BN("299792458"), 
        G: _BN("9.80665"), 
        LY: _BN("9.4607304725808e15"),
        KNOTS: 1.94384
    },

    // Capteurs Bruts
    sensors: { 
        acc: {x:0, y:0, z:0}, 
        gyro: {x:0, y:0, z:0}, 
        mag: {x:0, y:0, z:0},
        noise_floor: 0.02 
    },

    // --- 1. INITIALISATION ---
    async boot() {
        this.log("INIT: ACCÈS CAPTEURS...");
        
        // Démarrage Audio (Passive Radar)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const src = ctx.createMediaStreamSource(stream);
            this.analyser = ctx.createAnalyser();
            src.connect(this.analyser);
            this.audioData = new Uint8Array(this.analyser.frequencyBinCount);
            this.log("RADAR AUDIO: ACTIF");
        } catch(e) { this.log("RADAR AUDIO: ÉCHEC (Mode Silencieux)"); }

        // Écouteurs Matériels
        if (window.DeviceMotionEvent) {
            window.addEventListener('devicemotion', (e) => {
                this.sensors.acc = e.accelerationIncludingGravity || {x:0,y:0,z:0};
                this.sensors.gyro = e.rotationRate || {alpha:0,beta:0,gamma:0};
            });
        }
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (e) => {
                this.sensors.mag = { x: e.alpha||0, y: e.beta||0, z: e.gamma||0 };
            });
        }

        // Calibrage rapide du biais (Zero-Velocity Update)
        this.log("CALIBRATION GYRO...");
        setTimeout(() => {
            this.state.bias.x = this.sensors.acc.x;
            this.state.bias.y = this.sensors.acc.y;
            this.state.bias.z = this.sensors.acc.z - 9.81;
            this.active = true;
            this.log("SYSTÈME SOUVERAIN: EN LIGNE.");
            this.engine();
        }, 1000);
    },

    // --- 2. MOTEUR PRINCIPAL (BOUCLE) ---
    engine() {
        if (!this.active) return;
        
        const now = performance.now();
        let dt = (now - this.lastT) / 1000;
        if (dt > 0.1) dt = 0.016; // Sécurité lag
        this.lastT = now;

        // Calcul FPS / Hz
        this.frameCount++;
        if (now - this.lastSecond >= 1000) {
            this.setText('ui-sampling-rate', this.frameCount + " Hz");
            this.frameCount = 0;
            this.lastSecond = now;
        }

        this.processPhysics(dt);
        this.processEnvironment();
        this.processArbitrator();
        this.updateUI_Full(); // La mise à jour massive du HTML
        this.renderVisuals();

        requestAnimationFrame(() => this.engine());
    },

    // --- 3. CŒUR PHYSIQUE (KINEMATICS) ---
    processPhysics(dt) {
        // Lecture capteurs
        const raw_ax = this.sensors.acc.x || 0;
        const raw_ay = this.sensors.acc.y || 0;
        const raw_az = this.sensors.acc.z || 0;

        // Énergie totale (Magnitude)
        const energy = Math.sqrt(raw_ax*raw_ax + raw_ay*raw_ay + raw_az*raw_az);
        
        // Détection de Choc
        if (energy > this.state.max_g) this.state.max_g = energy;
        if (energy > 15) this.log("ALERTE: IMPACT HAUTE ÉNERGIE");

        // Modes Dynamiques (Scale)
        let mode = "STANDARD";
        let noise_gate = 0.05;
        let drift_val = 0.001;

        if (energy < 9.85 && energy > 9.75) {
            mode = "GASTÉROPODE (MICRO)";
            noise_gate = 0.002; // Ultra sensible
            drift_val = 0.00005;
        } else if (energy > 20) {
            mode = "AÉROSPATIAL / MANÈGE";
            noise_gate = 0.5;
        } else if (Math.abs(raw_az) < 1.0) {
             mode = "CHUTE LIBRE (0G)";
        }

        this.currentMode = mode;
        this.currentDrift = drift_val;

        // Intégration (Retrait gravité & Biais)
        // Note: Simplifié pour l'exemple JS pur sans MathJS lourd pour la boucle rapide
        const ax = raw_ax - this.state.bias.x;
        const ay = raw_ay - this.state.bias.y;
        const az = raw_az - 9.81 - this.state.bias.z;

        if (Math.abs(az) > noise_gate || Math.abs(ax) > noise_gate) {
            // BigNumber pour la position précise
            const acc_z_bn = _BN(az);
            const dt_bn = _BN(dt);
            
            // v = v + a*t
            this.state.vel.z = m.add(this.state.vel.z, m.multiply(acc_z_bn, dt_bn));
            
            // x = x + v*t
            this.state.pos.z = m.add(this.state.pos.z, m.multiply(this.state.vel.z, dt_bn));
            
            // Distance totale
            const v_mag = Number(this.state.vel.z); // Approx pour affichage rapide
            this.state.dist = m.add(this.state.dist, m.multiply(m.abs(this.state.vel.z), dt_bn));

            // Ajout au buffer AR
            if (this.frameCount % 5 === 0) { // Pas à chaque frame pour économiser
                this.path.push({x: this.frameCount, y: v_mag * 10});
                if (this.path.length > 100) this.path.shift();
            }
        } else {
            // ZUPT (Zero Velocity Update) si immobile
            this.state.vel.z = m.multiply(this.state.vel.z, 0.95); // Friction
        }
        
        // Buffer G-Force pour le graphique
        this.gForceHistory.push(energy / 9.81);
        this.gForceHistory.shift();
    },

    // --- 4. CŒUR ENVIRONNEMENTAL (BIO/ELEC) ---
    processEnvironment() {
        // Simulation Atmosphérique basée sur l'altitude Z (Lapse Rate)
        const alt = Number(this.state.pos.z);
        
        // Température baisse de 0.65°C par 100m
        this.state.temp_c = 20 - (alt / 100) * 0.65;
        
        // Pression baisse exponentiellement
        this.state.pressure = 1013 * Math.pow(1 - (0.0065 * alt) / (20 + 273.15), 5.255);
        
        // Densité de l'air (rho)
        // rho = p / (Rspecific * T)
        this.state.air_density = (this.state.pressure * 100) / (287.05 * (this.state.temp_c + 273.15));

        // Simulation Rayonnement & Élec (basé sur bruit capteur)
        // Plus on bouge (mag), plus on induit de courant
        const magNoise = Math.abs(this.sensors.mag.x - this.lastMagX || 0);
        this.lastMagX = this.sensors.mag.x;
        this.elec_flux = 30 + magNoise * 50; // µT fictif réaliste
        
        // Radiation augmente avec l'altitude
        this.rad_inst = 0.08 + (alt * 0.001) + (Math.random() * 0.01);
        this.state.rad_dose += (this.rad_inst / 3600) * 0.016; // Intégration dose
    },

    // --- 5. LOGIQUE D'ARBITRAGE ---
    processArbitrator() {
        // Confiance IMU inversement proportionnelle aux vibrations extrêmes
        const shake = Math.abs(this.sensors.acc.x) + Math.abs(this.sensors.acc.y);
        this.trust_imu = Math.max(0, 100 - (shake * 2));
        
        // Confiance Audio augmente s'il y a du son constant (vent/moteur)
        let audioLevel = 0;
        if (this.audioData) {
            audioLevel = this.audioData[10] || 0; // Basse fréquence
        }
        this.trust_audio = Math.min(100, audioLevel / 2);

        // Sélection Source
        if (this.trust_imu > 50) this.master_source = "INERTIE (IMU)";
        else if (this.trust_audio > 80) this.master_source = "DOPPLER (AUDIO)";
        else this.master_source = "ESTIMATION (DEAD RECKONING)";
    },

    // --- 6. VISUALISATION (CANVAS) ---
    renderVisuals() {
        // 6.1 G-Force Graph
        const cvsG = document.getElementById('gforce-canvas');
        if (cvsG) {
            const ctxG = cvsG.getContext('2d');
            ctxG.fillStyle = '#000'; ctxG.fillRect(0,0, cvsG.width, cvsG.height);
            ctxG.strokeStyle = '#ff3300'; ctxG.beginPath();
            for (let i=0; i<this.gForceHistory.length; i++) {
                const y = cvsG.height - (this.gForceHistory[i] * (cvsG.height/4)); 
                ctxG.lineTo(i * (cvsG.width/100), y);
            }
            ctxG.stroke();
        }

        // 6.2 AR Path (Aurea Trace)
        const cvsAR = document.getElementById('ar-canvas');
        if (cvsAR) {
            const ctxAR = cvsAR.getContext('2d');
            ctxAR.fillStyle = '#000'; ctxAR.fillRect(0,0, cvsAR.width, cvsAR.height);
            ctxAR.strokeStyle = '#bc13fe'; ctxAR.lineWidth = 2; ctxAR.beginPath();
            const centerY = cvsAR.height / 2;
            for (let i=0; i<this.path.length; i++) {
                // Visualisation abstraite de la vitesse/mouvement
                ctxAR.lineTo(i * 3, centerY - this.path[i].y);
            }
            ctxAR.stroke();
        }
    },

    // --- 7. MISE À JOUR UI MASSIVE (LIAISON HTML) ---
    updateUI_Full() {
        // --- HEADER ---
        this.setText('ui-clock', new Date().toLocaleTimeString());
        this.setText('tslv', Math.round(performance.now() - this.lastT) + 'ms');

        // --- NAV PANEL ---
        this.setText('ui-env-mode', this.currentMode);
        // Simulation GPS EKF (Position relative + bruit GPS sim)
        this.setText('lat-ekf', (48.8566 + Number(this.state.pos.z)*0.00001).toFixed(6));
        this.setText('lon-ekf', (2.3522 + Number(this.state.pos.x)*0.00001).toFixed(6));
        this.setText('alt-ekf', this.state.pos.z.toFixed(2));
        this.setText('acc-gps', (this.sensors.noise_floor * 100).toFixed(1));
        
        this.setText('heading-display', Math.abs(this.sensors.mag.x).toFixed(0));
        this.setText('ui-true-north', (360 - this.sensors.mag.x).toFixed(0));
        
        // Distances
        const distTotal = this.state.dist; // BigNumber
        this.setText('ui-home-dist', distTotal.toFixed(2) + " m");
        
        // Astro (LY)
        const ly = m.divide(distTotal, this.PHYS.LY);
        this.setText('ui-dist-ly', ly.toFixed(20) + " LY");
        
        // Univers Observable (Pourcentage arbitraire basé sur distance)
        const obsPct = m.divide(distTotal, _BN("8.8e26")).multiply(100);
        this.setText('ui-observable-pct', obsPct.toFixed(25) + "%");
        this.setText('ui-dist-comobile', distTotal.multiply(1.5).toFixed(0) + " m"); // Expansion

        // --- PHYS PANEL ---
        const v_inst = Number(this.state.vel.z);
        this.setText('vitesse-raw', (v_inst * 1000).toFixed(4)); // mm/s
        this.setText('ui-scale-active', "1:1");
        this.setText('ui-micro-drift', this.currentDrift.toFixed(5));
        
        this.setText('speed-stable-kmh', (Math.abs(v_inst) * 3.6).toFixed(2) + " km/h");
        this.setText('ui-speed-knots', (Math.abs(v_inst) * this.PHYS.KNOTS).toFixed(2) + " kts");
        
        // Mach (v / vitesse son ~340 m/s)
        this.setText('mach-val', "M " + (Math.abs(v_inst)/343).toFixed(3));
        
        this.setText('force-g-inst', (this.gForceHistory[this.gForceHistory.length-1]*9.81/9.81).toFixed(2) + " G");
        this.setText('ui-impact-g', (this.state.max_g/9.81).toFixed(1) + " G");
        
        // Lorentz (Relativité)
        // gamma = 1 / sqrt(1 - v^2/c^2)
        // Utilisation simplifiée car v << c pour JS natif, mais affichage requis
        const v_c = v_inst / 299792458;
        const gamma = 1 / Math.sqrt(1 - v_c*v_c);
        this.setText('ui-lorentz', gamma.toFixed(12));

        // Sport Analysis
        this.setText('ui-sport-type', v_inst > 2 ? "RUNNING" : "WALKING/STATIC");
        this.setText('ui-sport-cadence', v_inst > 1 ? "160" : "0"); // Simulé pour l'exemple
        this.setText('ui-jump-height', (Math.max(0, Number(this.state.pos.z))*100).toFixed(1));

        // --- ENV PANEL ---
        this.setText('ui-elec-flux', this.elec_flux.toFixed(2));
        this.setText('ui-elec-watt', (this.elec_flux * 0.5).toFixed(0)); // P = B * k
        this.setText('ui-rad-level', this.rad_inst.toFixed(3));
        this.setText('ui-rad-total', this.state.rad_dose.toFixed(6));
        
        this.setText('air-temp-c', this.state.temp_c.toFixed(1));
        this.setText('pressure-hpa', this.state.pressure.toFixed(0));
        this.setText('air-density', this.state.air_density.toFixed(3));
        this.setText('humidity-pct', "52"); // Fixe faute de capteur
        this.setText('ambient-light', "250"); // Idem
        
        // Reynolds: Re = (rho * v * L) / mu.  L=1.7m (Humain), mu=1.8e-5
        const re = (this.state.air_density * Math.abs(v_inst) * 1.7) / 0.0000181;
        this.setText('reynolds-number', re.toFixed(0));
        
        // Pression Dynamique: q = 0.5 * rho * v^2
        const q = 0.5 * this.state.air_density * v_inst * v_inst;
        this.setText('dynamic-pressure', q.toFixed(2) + " Pa");

        // --- FOOTER (TEMPUS & ARBITRATOR) ---
        // Julian Date
        const jd = (Date.now() / 86400000) + 2440587.5;
        this.setText('ast-jd', jd.toFixed(5));
        
        // Minecraft Time (Vitesse x72)
        const mc_h = (new Date().getHours() * 72) % 24;
        const mc_m = (new Date().getMinutes() * 72) % 60;
        this.setText('time-minecraft', Math.floor(mc_h) + ":" + Math.floor(mc_m));
        
        // Dilatation temporelle cumulée (vrai calcul relativiste trop petit pour JS, simulation visuelle)
        this.setText('total-time-dilation', (gamma - 1).toExponential(2) + " ns");

        // Barres de progression
        document.getElementById('trust-imu').value = this.trust_imu;
        document.getElementById('trust-opt').value = 100 - this.trust_imu; // Complémentaire
        document.getElementById('trust-audio').value = this.trust_audio;
        this.setText('master-source', this.master_source);
        
        // Compteur AR
        this.setText('ui-path-points', this.path.length);
    },

    // Helper DOM sécurisé
    setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
        // else console.warn("ID MANQUANT HTML: " + id); // Décommentez pour debug
    },
    
    log(msg) {
        const l = document.getElementById('anomaly-log');
        if (l) {
             const t = new Date().toLocaleTimeString();
             l.innerHTML = `<div><span style="color:#444">[${t}]</span> ${msg}</div>` + l.innerHTML;
        }
    },
    
    setAnchor() {
        this.state.pos.x = _BN(0);
        this.state.pos.y = _BN(0);
        this.state.pos.z = _BN(0);
        this.state.dist = _BN(0);
        this.log("POINT ZÉRO (0,0,0) DÉFINI.");
    },

    clearPath() {
        this.path = [];
        this.log("TRACE AR EFFACÉE.");
    }
};

// Initialisation globale
document.getElementById('main-init-btn').onclick = () => OMNI_CORE.boot();
// Auto-start si rechargement
// setTimeout(() => OMNI_CORE.boot(), 2000);
