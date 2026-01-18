/**
 * OMNISCIENCE V25.9.6 - AUTONOMOUS_CORE
 * Auto-Detection: BIO / AUTO / RAIL / AERO / CAVE / MICRO
 */

const m = math;
m.config({ number: 'BigNumber', precision: 64 });
const _BN = (val) => m.bignumber(val);

const PROFILES = {
    STASE: { m: 1,    cx: 1.0,  mu: 1.0,   gate: 10.0, mode: "STOP" },
    MICRO: { m: 0.01, cx: 0.9,  mu: 0.8,   gate: 0.02, mode: "MICRO" }, // Insecte/Escargot
    BIO:   { m: 80,   cx: 0.45, mu: 0.5,   gate: 0.15, mode: "STEP" },  // Humain
    AUTO:  { m: 1500, cx: 0.33, mu: 0.02,  gate: 0.10, mode: "RK4" },   // Voiture
    RAIL:  { m: 40000,cx: 0.25, mu: 0.002, gate: 0.05, mode: "GLIDE" }, // Train/Métro
    AERO:  { m: 5000, cx: 0.04, mu: 0.0,   gate: 0.10, mode: "RK4" },   // Avion
    CAVE:  { m: 80,   cx: 0.45, mu: 0.5,   gate: 0.15, mode: "STEP_DR" }// Spéléo (Sans GPS)
};

const OMNI = {
    active: false,
    labMode: false,
    lastT: performance.now(),
    v: _BN(0),
    dist: _BN(0),
    pos: { lat: 0, lon: 0, alt: 0, acc: 0, speed: 0 },
    orientation: { a: 0, b: 0, g: 0 },
    
    // Analyseur de Signature
    accBuffer: [],      // Historique pour calcul de variance
    current_profile: "STASE",
    stepCount: 0,
    isStepping: false,

    // Constantes
    C: 299792458,
    G_STD: 9.80665,

    async start() {
        this.log("INITIALISATION IA AUTO-DÉTECTION...");
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            const p = await DeviceMotionEvent.requestPermission();
            if (p === 'granted') this.activate();
        } else {
            this.activate();
        }
    },

    activate() {
        this.active = true;
        this.log("CAPTEURS ACTIVÉS - ANALYSE EN COURS...");

        window.addEventListener('devicemotion', (e) => this.coreLoop(e), true);
        window.addEventListener('deviceorientation', (e) => {
            this.orientation = { a: e.alpha || 0, b: e.beta || 0, g: e.gamma || 0 };
        }, true);

        navigator.geolocation.watchPosition(p => {
            this.pos.lat = p.coords.latitude;
            this.pos.lon = p.coords.longitude;
            this.pos.alt = p.coords.altitude || 0;
            this.pos.acc = p.coords.accuracy;
            this.pos.speed = p.coords.speed || 0; // Vitesse GPS brute
        }, null, { enableHighAccuracy: true });

        // Boucle IA (1Hz) pour décider du profil
        setInterval(() => this.runAI(), 1000);
        // Boucle HUD (10Hz)
        setInterval(() => this.refreshHUD(), 100);
    },

    // --- CERVEAU DE L'IA (1 FOIS PAR SECONDE) ---
    runAI() {
        // 1. Calcul de la variance (agitation)
        const variance = math.var(this.accBuffer.length > 0 ? this.accBuffer : [0]);
        const avgMag = math.mean(this.accBuffer.length > 0 ? this.accBuffer : [0]);
        const speedKmh = Number(this.v) * 3.6;
        const gpsSignal = this.pos.acc < 50 && this.pos.acc > 0; // GPS Bon ?

        let detected = "STASE";

        // ARBRE DE DÉCISION
        if (!gpsSignal) {
            // Pas de GPS : Soit on ne bouge pas, soit on est en grotte/tunnel
            if (variance > 0.5) detected = "CAVE"; // Ça secoue sans GPS -> Marche Souterraine
            else if (speedKmh > 20 && variance < 0.2) detected = "RAIL"; // Fluide sans GPS -> Métro
            else detected = "STASE";
        } else {
            // GPS Actif
            if (this.pos.alt > 2000 || speedKmh > 300) {
                detected = "AERO"; // Altitude ou vitesse extrême
            } else if (variance > 0.8 && speedKmh < 20) {
                detected = "BIO"; // Ça secoue et c'est lent -> Humain/Animal
            } else if (variance < 0.3 && speedKmh > 10) {
                // Mouvement fluide rapide
                detected = (speedKmh > 100) ? "RAIL" : "AUTO"; // Train souvent plus rapide/stable
            } else if (speedKmh < 1 && avgMag > 0.02 && avgMag < 0.15) {
                detected = "MICRO"; // Mouvement infime mais constant -> Insecte/Lent
            }
        }

        // Changement de profil si différent
        if (detected !== this.current_profile) {
            this.current_profile = detected;
            this.log(`MODE DÉTECTÉ : ${detected} (Var: ${variance.toFixed(2)})`);
            // Petit feedback visuel
            this.setUI('filter-status', detected + "_MODE");
        }
        
        // Reset buffer pour la prochaine seconde
        this.accBuffer = [];
    },

    coreLoop(e) {
        if (!this.active) return;
        const now = performance.now();
        const dt = (now - this.lastT) / 1000;
        this.lastT = now;
        if (dt <= 0 || dt > 0.1) return;

        let acc = e.acceleration || { x: 0, y: 0, z: 0 };
        let mag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
        
        // Remplissage du buffer pour l'IA
        this.accBuffer.push(mag);
        if(this.accBuffer.length > 60) this.accBuffer.shift();

        const PHYS = PROFILES[this.current_profile];

        // LOGIQUE PHYSIQUE SELON LE PROFIL DÉTECTÉ
        if (this.current_profile === "BIO" || this.current_profile === "CAVE") {
            this.handleStepDetection(mag); // Podomètre
        } 
        else if (this.current_profile === "MICRO") {
            // Intégration hyper-sensible sans seuil
            if (mag > PHYS.gate) {
                let vMicro = Number(this.v) + (mag * dt);
                if (vMicro > 0.2) vMicro = 0.2; // Plafond vitesse insecte
                this.v = _BN(vMicro);
                this.dist = m.add(this.dist, m.multiply(this.v, dt));
            }
        }
        else if (this.current_profile === "STASE") {
             this.v = m.multiply(this.v, 0.9); // Arrêt rapide
        }
        else {
            // Véhicules (AUTO, RAIL, AERO)
            // Fusion GPS (20%) + Inertiel (80%) pour lissage
            if (this.pos.speed > 0) {
                 const fusion = (Number(this.v) * 0.95) + (this.pos.speed * 0.05);
                 this.v = _BN(fusion);
                 // On met à jour la distance
                 this.dist = m.add(this.dist, m.multiply(this.v, dt));
            } else {
                // Tunnel ou perte GPS momentanée -> On continue sur l'inertie
                this.integrateRK4(mag, dt, PHYS);
            }
        }
        
        this.current_mag = mag;
    },

    handleStepDetection(mag) {
        // Algorithme de détection de pas humain
        if (mag > 1.2 && !this.isStepping) {
            this.isStepping = true;
            this.stepCount++;
            // Un pas propulse : 
            this.v = _BN(1.4); // ~5 km/h
            this.dist = m.add(this.dist, 0.75);
        } else if (mag < 1.2) {
            this.isStepping = false;
            // Décélération naturelle entre deux pas
            this.v = m.multiply(this.v, 0.90);
        }
    },

    integrateRK4(mag, dt, PHYS) {
        // Physique des fluides standard
        const rho = (this.current_profile === "AERO") ? 
                    1.225 * Math.exp(-this.pos.alt / 8500) : 1.225;
        
        const f = (v_in) => {
            const drag = 0.5 * rho * v_in * v_in * PHYS.cx;
            // Seuls les moteurs poussent, ou la gravité sur pente
            // Ici on simplifie : mag est la force résultante perçue
            return (mag - drag / PHYS.m);
        };
        // Résolution numérique
        let v0 = Number(this.v);
        let k1 = f(v0), k2 = f(v0 + (dt/2)*k1), k3 = f(v0 + (dt/2)*k2), k4 = f(v0 + dt*k3);
        let newV = v0 + (dt/6)*(k1 + 2*k2 + 2*k3 + k4);
        
        if (mag < PHYS.gate) newV *= 0.99; // Friction roue libre
        
        this.v = _BN(newV < 0 ? 0 : newV);
        this.dist = m.add(this.dist, m.multiply(this.v, dt));
    },

    refreshHUD() {
        // MAPPING TOTAL (identique à V25.9.4 mais avec les bonnes données)
        const v = Number(this.v);
        const dist = Number(this.dist);
        const gamma = 1 / Math.sqrt(1 - Math.pow(v/this.C, 2));
        const PHYS = PROFILES[this.current_profile];

        this.setUI('v-cosmic', (v * 3.6).toFixed(2));
        this.setUI('speed-stable-kmh', (v * 3.6).toFixed(4));
        this.setUI('dist-3d', dist.toFixed(2) + " m");
        
        // Affichage intelligent du type de véhicule
        this.setUI('filter-status', this.current_profile);
        this.setUI('station-params', this.current_profile + "_PHYSICS");
        
        // Relativité
        this.setUI('ui-gamma', gamma.toFixed(14));
        this.setUI('relativistic-energy', (gamma * PHYS.m * this.C**2).toExponential(3));
        
        // Environnement
        this.setUI('lat-ukf', this.pos.lat.toFixed(6));
        this.setUI('lon-ukf', this.pos.lon.toFixed(6));
        this.setUI('alt-display', this.pos.alt.toFixed(1));
        this.setUI('ui-gps-accuracy', this.pos.acc.toFixed(1));
        
        // Si MICRO mode, on affiche des unités minuscules
        if(this.current_profile === "MICRO") {
             this.setUI('speed-stable-ms', (v * 1000).toFixed(2) + " mm/s");
        } else {
             this.setUI('speed-stable-ms', v.toFixed(6));
        }
    },

    // Fonctions utilitaires (Astro, Log, SetUI) restent inchangées...
    setUI(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    log(msg) { const l = document.getElementById('anomaly-log'); if(l) l.innerHTML = `<div>> ${msg}</div>` + l.innerHTML; }
};

document.getElementById('main-init-btn').addEventListener('click', () => OMNI.start());
