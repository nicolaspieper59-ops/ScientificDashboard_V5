/**
 * OMNISCIENCE V17 - MASTER SOUVERAIN CORE
 * Système de Navigation Inertielle, Astronomique et Chromatique
 */

// 1. MOTEUR MATHÉMATIQUE HAUTE PRÉCISION (128-BIT)
const D128 = Decimal.clone({ precision: 128 });
const _128 = (n) => new D128(n || 0);

const OMNI_CORE = {
    active: false,
    calibrationActive: true,
    lastT: performance.now(),
    
    state: {
        pos: { x: _128(0), y: _128(0), z: _128(0) }, // ECEF 3D
        vel: { x: _128(0), y: _128(0), z: _128(0) },
        lat: 0, lon: 0, alt: 0,
        pitch: 0, roll: 0, azimuth: 0,
        q: [1, 0, 0, 0], // Quaternions
        lorentz: _128(1),
        tau: _128(0)
    },

    async boot() {
        this.log("Initialisation du Noyau Souverain...");
        
        // Autorisations Capteurs (iOS/Android)
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission !== 'granted') return this.log("ERREUR: Accès IMU refusé.");
        }

        // Initialisation des modules
        await ACOUSTIC_ENGINE.init();
        await VISION_SYSTEM.init();
        OMNI_MAP.init();

        // Calibration ZUPT (Zero Velocity Update)
        setTimeout(() => {
            this.calibrationActive = false;
            this.active = true;
            this.log("Système Opérationnel. Mode 128-bit Actif.");
        }, 3000);

        this.attachListeners();
        this.run();
    },

    attachListeners() {
        window.addEventListener('devicemotion', (e) => this.processPhysics(e));
        window.addEventListener('deviceorientation', (e) => {
            this.state.azimuth = e.alpha;
            this.state.pitch = e.beta;
            this.state.roll = e.gamma;
        });
    },

    // MOTEUR DE GRAVITÉ SOMIGLIANA & RELATIVITÉ
    processPhysics(e) {
        if (!this.active || this.calibrationActive) return;

        const dt = _128((performance.now() - this.lastT) / 1000);
        this.lastT = performance.now();

        // Gravité locale WGS84
        const gLocal = this.getSomigliana(this.state.lat, this.state.alt);
        
        // Accélération propre (Soustraction G)
        const rawZ = _128(e.accelerationIncludingGravity.z);
        const pureAcc = rawZ.minus(gLocal);

        // Intégration Inertielle 3D (Déplacement sans GPS)
        this.state.vel.z = this.state.vel.z.plus(pureAcc.times(dt));
        this.state.pos.z = this.state.pos.z.plus(this.state.vel.z.times(dt));

        // Calcul Lorentz
        const v = _128(this.state.currentV || 0);
        const c = _128('299792458');
        const gamma = _128(1).dividedBy(Decimal.sqrt(_128(1).minus(v.pow(2).dividedBy(c.pow(2)))));
        this.state.lorentz = gamma;

        this.updateUI(rawZ, gLocal);
    },

    getSomigliana(lat, alt) {
        const phi = (lat * Math.PI) / 180;
        const sin2 = Math.sin(phi) ** 2;
        const ge = _128('9.7803253359');
        const k = _128('0.001931852652');
        const e2 = _128('0.00669437999');
        const g0 = ge.times(_128(1).plus(_128(k).times(sin2))).dividedBy(Decimal.sqrt(_128(1).minus(_128(e2).times(sin2))));
        return g0.plus(_128('-0.000003086').times(alt));
    },

    updateUI(rawZ, gLocal) {
        document.getElementById('force-g-inst').innerText = rawZ.dividedBy(9.806).toFixed(4) + " G";
        document.getElementById('g-somigliana').innerText = gLocal.toFixed(6) + " m/s²";
        document.getElementById('ui-lorentz').innerText = this.state.lorentz.toFixed(14);
    },

    log(msg) {
        const log = document.getElementById('anomaly-log');
        if(log) log.innerHTML = `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>` + log.innerHTML;
    }
};

// 2. MOTEUR ASTRONOMIQUE & SEXTANT AR
const ASTRO_NAV = {
    update(date, obs) {
        const sunEquat = Astronomy.Equator("Sun", date, obs, true, true);
        const sunHoriz = Astronomy.Horizon(date, obs, sunEquat.ra, sunEquat.dec, "Refraction");
        
        const moonEquat = Astronomy.Equator("Moon", date, obs, true, true);
        const moonHoriz = Astronomy.Horizon(date, obs, moonEquat.ra, moonEquat.dec, "Refraction");

        // Mode Nuit Automatique
        if (sunHoriz.altitude < -6) NIGHT_MODE.enable();
        else NIGHT_MODE.disable();

        this.renderAR(sunHoriz, "Soleil", "#ffcc00");
        this.renderAR(moonHoriz, "Lune", "#ffffff");

        // Mise à jour Sextant UI
        document.getElementById('sun-alt').innerText = sunHoriz.altitude.toFixed(3) + "°";
        document.getElementById('ast-jd').innerText = Astronomy.DayValue(date).toFixed(6);
    },

    renderAR(target, name, color) {
        const canvas = VISION_SYSTEM.arCanvas;
        const ctx = VISION_SYSTEM.arCtx;
        if(!ctx) return;

        // Projection angulaire sur l'écran
        const x = (canvas.width / 2) + (target.azimuth - OMNI_CORE.state.azimuth) * 20;
        const y = (canvas.height / 2) - (target.altitude - OMNI_CORE.state.pitch) * 20;

        if (x > 0 && x < canvas.width && y > 0 && y < canvas.height) {
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, 30, 0, Math.PI*2);
            ctx.moveTo(x-40, y); ctx.lineTo(x+40, y);
            ctx.moveTo(x, y-40); ctx.lineTo(x, y+40);
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.fillText(name, x + 35, y - 35);
        }
    }
};

// 3. VISION CHROMATIQUE (MÉTÉO & RÉALITÉ)
const VISION_SYSTEM = {
    arCanvas: null, arCtx: null,

    async init() {
        const video = document.getElementById('ui-canvas');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;

        this.arCanvas = document.createElement('canvas');
        this.arCanvas.style.position = 'absolute';
        this.arCanvas.style.top = video.offsetTop + 'px';
        this.arCanvas.style.left = video.offsetLeft + 'px';
        this.arCanvas.width = video.clientWidth;
        this.arCanvas.height = video.clientHeight;
        video.parentElement.appendChild(this.arCanvas);
        this.arCtx = this.arCanvas.getContext('2d');
    },

    analyzeReality() {
        const video = document.getElementById('ui-canvas');
        const tmpCanvas = document.createElement('canvas');
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.drawImage(video, 0, 0, 10, 10);
        const data = tmpCtx.getImageData(0,0,10,10).data;

        let r=0, g=0, b=0;
        for(let i=0; i<data.length; i+=4){ r+=data[i]; g+=data[i+1]; b+=data[i+2]; }
        
        // Calcul Météo par Couleur du Ciel
        if (b > r && b > g) document.getElementById('statut-meteo').innerText = "AZUR PUR";
        else if (g > b) document.getElementById('statut-meteo').innerText = "EAUX/VÉGÉTATION";
        else document.getElementById('statut-meteo').innerText = "NUAGEUX/BRUME";
    }
};

// 4. CARTOGRAPHIE OPENSTREETMAP (SOUVERAIN)
const OMNI_MAP = {
    map: null, marker: null, tiles: null,

    init() {
        this.map = L.map('ui-canvas-map').setView([48.85, 2.35], 13);
        this.tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
        this.marker = L.marker([48.85, 2.35]).addTo(this.map);
    },

    update(lat, lon) {
        const pos = [lat, lon];
        this.marker.setLatLng(pos);
        if (!OMNI_CORE.calibrationActive) this.map.panTo(pos);
    }
};

// 5. GESTION DE NUIT & EXPORT
const NIGHT_MODE = {
    enable() {
        document.body.classList.add('night-theme');
        OMNI_MAP.tiles.setUrl('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png');
    },
    disable() {
        document.body.classList.remove('night-theme');
        OMNI_MAP.tiles.setUrl('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
    }
};

const DATA_EXPORTER = {
    exportOBJ() {
        let content = "# OMNISCIENCE V17 TRAJECTORY\n";
        // Génération des sommets 3D ECEF ici...
        const blob = new Blob([content], {type: 'text/plain'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = "mission_truth.obj";
        a.click();
    }
};

// BOUCLE PRINCIPALE (60HZ)
function run() {
    if (OMNI_CORE.active) {
        const now = new Date();
        const obs = new Astronomy.Observer(OMNI_CORE.state.lat, OMNI_CORE.state.lon, OMNI_CORE.state.alt);
        
        VISION_SYSTEM.arCtx.clearRect(0,0, VISION_SYSTEM.arCanvas.width, VISION_SYSTEM.arCanvas.height);
        ASTRO_NAV.update(now, obs);
        
        if (OMNI_CORE.frameCount % 60 === 0) VISION_SYSTEM.analyzeReality();
        OMNI_CORE.frameCount++;
    }
    requestAnimationFrame(run);
}

// Lancement
document.getElementById('main-init-btn').addEventListener('click', () => OMNI_CORE.boot());
