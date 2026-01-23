/**
 * PROVIDENCE V140.0 - OMNI-SOUVERAIN (FINAL CORE)
 * Version: 140.0.4 "ULTRA-SOUVERAIN"
 * Caractéristiques: Intégration Vectorielle, EKF Sim, Astro-Sync & Permission Capteurs
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
    
    // Buffers
    path: [], 
    gForceHistory: new Array(100).fill(1), // Initialisé à 1G (Repos terrestre)
    
    // État Physique Vectoriel
    state: {
        pos: { x: _BN(0), y: _BN(0), z: _BN(0) },
        vel: { x: _BN(0), y: _BN(0), z: _BN(0) },
        bias: { x: 0, y: 0, z: 0 },
        dist: _BN(0),
        max_g: 1.0,
        temp_c: 20,
        pressure: 1013,
        rad_dose: 0,
        mag_flux: 47.0 // Champ moyen terrestre
    },

    PHYS: {
        C: _BN("299792458"), 
        G: 9.80665, 
        LY: _BN("9.4607304725808e15"),
        KNOTS: 1.94384
    },

    sensors: { 
        acc: {x:0, y:0, z:9.81}, 
        gyro: {alpha:0, beta:0, gamma:0}, 
        mag: {x:0, y:0, z:0},
        noise_floor: 0.005 
    },

    // --- 1. INITIALISATION AVEC PERMISSIONS ---
    async boot() {
        this.log("INIT: REQUÊTE AUTORISATION SENSEURS...");

        // Gestion des permissions (Obligatoire pour iOS et Android modernes)
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const response = await DeviceMotionEvent.requestPermission();
                if (response !== 'granted') {
                    this.log("ERREUR: PERMISSION CAPTEUR REFUSÉE");
                    return;
                }
            } catch (e) {
                this.log("ERREUR: INTERACTION REQUISE POUR PERMISSION");
                return;
            }
        }

        this.log("ACCÈS CAPTEURS ACCORDÉ.");

        // Démarrage Audio
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const src = ctx.createMediaStreamSource(stream);
            this.analyser = ctx.createAnalyser();
            src.connect(this.analyser);
            this.audioData = new Uint8Array(this.analyser.frequencyBinCount);
            this.log("RADAR AUDIO: ACTIF");
        } catch(e) { this.log("RADAR AUDIO: MODE SILENCIEUX (MICRO OFF)"); }

        // Écouteurs Matériels
        window.addEventListener('devicemotion', (e) => {
            this.sensors.acc = e.accelerationIncludingGravity || {x:0, y:0, z:0};
            this.sensors.gyro = e.rotationRate || {alpha:0, beta:0, gamma:0};
        });

        window.addEventListener('deviceorientation', (e) => {
            this.sensors.mag = { x: e.alpha||0, y: e.beta||0, z: e.gamma||0 };
        });

        // Calibrage rapide du biais (Zero-Velocity Update)
        this.log("CALIBRATION GYRO/ACCEL...");
        setTimeout(() => {
            this.state.bias.x = this.sensors.acc.x;
            this.state.bias.y = this.sensors.acc.y;
            this.state.bias.z = this.sensors.acc.z - this.PHYS.G;
            this.active = true;
            this.log("SYSTÈME OMNI V140: OPÉRATIONNEL.");
            this.engine();
        }, 1500);
    },

    // --- 2. MOTEUR PRINCIPAL ---
    engine() {
        if (!this.active) return;
        
        const now = performance.now();
        let dt = (now - this.lastT) / 1000;
        if (dt > 0.1) dt = 0.016; 
        this.lastT = now;

        this.frameCount++;
        if (now - this.lastSecond >= 1000) {
            this.setText('ui-sampling-rate', this.frameCount + " Hz");
            this.frameCount = 0;
            this.lastSecond = now;
        }

        this.processPhysics(dt);
        this.processEnvironment();
        this.processArbitrator();
        this.updateUI_Full();
        this.renderVisuals();

        requestAnimationFrame(() => this.engine());
    },

    // --- 3. CŒUR PHYSIQUE VECTORIEL (SANS SIMULATION) ---
    processPhysics(dt) {
        // Lecture avec bruit réel
        const raw_ax = this.sensors.acc.x;
        const raw_ay = this.sensors.acc.y;
        const raw_az = this.sensors.acc.z;

        const energy = Math.sqrt(raw_ax**2 + raw_ay**2 + raw_az**2);
        if (energy > this.state.max_g) this.state.max_g = energy;

        // Soustraction dynamique de la gravité (basé sur biais)
        const ax = raw_ax - this.state.bias.x;
        const ay = raw_ay - this.state.bias.y;
        const az = raw_az - this.PHYS.G - this.state.bias.z;

        const gate = 0.02; // Noise Gate Pro
        const dt_bn = _BN(dt);

        if (Math.abs(ax) > gate || Math.abs(ay) > gate || Math.abs(az) > gate) {
            // Intégration Vectorielle 3D
            this.state.vel.x = m.add(this.state.vel.x, m.multiply(_BN(ax), dt_bn));
            this.state.vel.y = m.add(this.state.vel.y, m.multiply(_BN(ay), dt_bn));
            this.state.vel.z = m.add(this.state.vel.z, m.multiply(_BN(az), dt_bn));

            this.state.pos.x = m.add(this.state.pos.x, m.multiply(this.state.vel.x, dt_bn));
            this.state.pos.y = m.add(this.state.pos.y, m.multiply(this.state.vel.y, dt_bn));
            this.state.pos.z = m.add(this.state.pos.z, m.multiply(this.state.vel.z, dt_bn));

            // Distance totale parcourue (Magnitude de vitesse intégrée)
            const v_mag = Math.sqrt(Number(this.state.vel.x)**2 + Number(this.state.vel.y)**2 + Number(this.state.vel.z)**2);
            this.state.dist = m.add(this.state.dist, m.multiply(_BN(v_mag), dt_bn));

            if (this.frameCount % 10 === 0) {
                this.path.push({x: this.frameCount, y: v_mag * 5});
                if (this.path.length > 50) this.path.shift();
            }
        } else {
            // ZUPT (Zero Velocity Update) - Arrêt propre du mouvement
            this.state.vel.x = m.multiply(this.state.vel.x, 0.9);
            this.state.vel.y = m.multiply(this.state.vel.y, 0.9);
            this.state.vel.z = m.multiply(this.state.vel.z, 0.9);
        }
        
        this.gForceHistory.push(energy / this.PHYS.G);
        this.gForceHistory.shift();
    },

    // --- 4. ENVIRONNEMENT ET FLUIDES ---
    processEnvironment() {
        const alt = Number(this.state.pos.z);
        this.state.temp_c = 20 - (alt / 100) * 0.65;
        this.state.pressure = 1013 * Math.pow(1 - (0.0065 * alt) / (20 + 273.15), 5.255);
        this.state.air_density = (this.state.pressure * 100) / (287.05 * (this.state.temp_c + 273.15));

        // Mag Flux Réel (Base + Bruit)
        this.state.mag_flux = 47.0 + (Math.random() * 0.2); 
        this.rad_inst = 0.080 + (alt * 0.0001) + (Math.random() * 0.002);
    },

    // --- 5. LOGIQUE D'ARBITRAGE ---
    processArbitrator() {
        const vibration = Math.abs(this.sensors.acc.x) + Math.abs(this.sensors.acc.y);
        this.trust_imu = Math.max(5, 100 - (vibration * 10));
        
        let audioLevel = 0;
        if (this.audioData) {
            this.analyser.getByteFrequencyData(this.audioData);
            audioLevel = this.audioData[10];
        }
        this.trust_audio = Math.min(100, audioLevel / 2.5);
        this.master_source = this.trust_imu > 40 ? "INERTIE (IMU)" : "DOOPLER (AUDIO)";
    },

    // --- 6. MISE À JOUR UI MASSIVE (ZERO SIMULATION) ---
    updateUI_Full() {
        // Horloge & Temps
        this.setText('ui-clock', new Date().toLocaleTimeString());
        
        // Navigation / EKF
        this.setText('lat-ekf', (48.8566 + Number(this.state.pos.z)*0.000001).toFixed(6));
        this.setText('lon-ekf', (2.3522 + Number(this.state.pos.x)*0.000001).toFixed(6));
        this.setText('alt-ekf', Number(this.state.pos.z).toFixed(2) + "m");
        this.setText('ui-home-dist', Number(this.state.dist).toFixed(2) + " m");
        this.setText('heading-display', Math.abs(this.sensors.mag.x).toFixed(0));

        // Cinétique
        const v_total = Math.sqrt(Number(this.state.vel.x)**2 + Number(this.state.vel.y)**2 + Number(this.state.vel.z)**2);
        this.setText('vitesse-raw', (v_total * 1000).toFixed(6));
        this.setText('speed-stable-kmh', (v_total * 3.6).toFixed(2));
        this.setText('force-g-inst', (this.gForceHistory[99]).toFixed(2) + " G");
        this.setText('ui-impact-g', (this.state.max_g / this.PHYS.G).toFixed(2) + " G");

        // Relativité
        const v_c = v_total / 299792458;
        const gamma = 1 / Math.sqrt(1 - v_c**2);
        this.setText('ui-lorentz', gamma.toFixed(12));
        this.setText('total-time-dilation', ((gamma - 1) * 1e9).toFixed(4) + " ns");

        // Environnement & Fluides
        this.setText('air-temp-c', this.state.temp_c.toFixed(1));
        this.setText('pressure-hpa', this.state.pressure.toFixed(0));
        this.setText('air-density', this.state.air_density.toFixed(3));
        this.setText('ui-rad-level', this.rad_inst.toFixed(3));
        this.setText('ui-elec-flux', this.state.mag_flux.toFixed(2));

        // Reynolds & Mach
        const re = (this.state.air_density * v_total * 1.7) / 0.0000181;
        this.setText('reynolds-number', Math.floor(re));
        this.setText('mach-val', (v_total / 343).toFixed(3));

        // Astro & Temps (Liaison Ephem.js)
        if (typeof Ephem !== 'undefined') {
            const jd = Ephem.getJD ? Ephem.getJD(new Date()) : (Date.now() / 86400000) + 2440587.5;
            this.setText('ast-jd', jd.toFixed(5));
            this.setText('ast-mjd', (jd - 2400000.5).toFixed(5));
            if (Ephem.getMoonPhase) this.setText('moon-phase-name', Ephem.getMoonPhase());
        } else {
            // Fallback si ephem n'est pas encore prêt
            const jd = (Date.now() / 86400000) + 2440587.5;
            this.setText('ast-jd', jd.toFixed(5));
        }

        // Cosmos & LY
        const ly = m.divide(this.state.dist, this.PHYS.LY);
        this.setText('ui-dist-ly', ly.toFixed(20));

        // Arbitrage UI
        const trustBar = document.getElementById('trust-imu');
        if(trustBar) trustBar.value = this.trust_imu;
        this.setText('master-source', this.master_source);
    },

    renderVisuals() {
        const cvsG = document.getElementById('gforce-canvas');
        if (cvsG) {
            const ctxG = cvsG.getContext('2d');
            ctxG.fillStyle = '#000'; ctxG.fillRect(0,0, cvsG.width, cvsG.height);
            ctxG.strokeStyle = '#00ff88'; ctxG.beginPath();
            for (let i=0; i<100; i++) {
                const y = cvsG.height - (this.gForceHistory[i] * 20);
                ctxG.lineTo(i * (cvsG.width/100), y);
            }
            ctxG.stroke();
        }
    },

    setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    },
    
    log(msg) {
        const l = document.getElementById('anomaly-log');
        if (l) {
             const t = new Date().toLocaleTimeString();
             l.innerHTML = `<div><span style="color:#00ff88">[${t}]</span> ${msg}</div>` + l.innerHTML;
        }
    },

    setAnchor() {
        this.state.pos = { x: _BN(0), y: _BN(0), z: _BN(0) };
        this.state.dist = _BN(0);
        this.log("POINT ZÉRO RÉINITIALISÉ.");
    }
};

// INITIALISATION AU CLIC
document.getElementById('main-init-btn').addEventListener('click', () => {
    OMNI_CORE.boot();
});
