math.config({ number: 'BigNumber', precision: 64 });

const OMNI_SYSTEM = {
    state: {
        pos: { x: math.bignumber("4617623.784"), y: math.bignumber("433134.124"), z: math.bignumber("4368164.987") },
        vel: { x: math.bignumber(0), y: math.bignumber(0), z: math.bignumber(0) },
        lastT: performance.now(),
        g_marseille: math.bignumber("9.805124578")
    },

    async init() {
        await AudioEngine.init();
        this.run();
    },

    run() {
        setInterval(() => {
            const now = performance.now();
            const dt = math.divide(math.bignumber(now - this.state.lastT), 1000);
            this.state.lastT = now;

            // 1. CAPTURE & FILTRAGE (Newton + Coriolis)
            let acc = { x: math.bignumber(window.ax || 0), y: math.bignumber(window.ay || 0), z: math.subtract(math.bignumber(window.az || 9.80512), this.state.g_marseille) };
            
            // Correction de Coriolis pour Marseille (Rotation Terre)
            const fc = math.multiply(2, math.bignumber("0.000072921"), math.sin(0.755)); // 43.29° en rad
            acc.x = math.add(acc.x, math.multiply(fc, this.state.vel.y));

            // 2. VERROUILLAGE INERTIE (1 mm/s)
            ['x','y','z'].forEach(a => {
                if(math.smaller(math.abs(acc[a]), 0.005)) acc[a] = math.bignumber(0);
                this.state.vel[a] = math.add(this.state.vel[a], math.multiply(acc[a], dt));
            });

            // 3. NAVIGATION GÉODÉSIQUE (Courbure Terre)
            const R = math.bignumber(6371000);
            const angle = math.divide(math.multiply(this.state.vel.y, dt), R);
            const oldX = this.state.pos.x;
            this.state.pos.x = math.subtract(math.multiply(oldX, math.cos(angle)), math.multiply(this.state.pos.z, math.sin(angle)));
            this.state.pos.z = math.add(math.multiply(oldX, math.sin(angle)), math.multiply(this.state.pos.z, math.cos(angle)));

            this.render();
        }, 10);
    },

    render() {
        const vH = math.multiply(this.state.vel.y, 3.6);
        document.getElementById('speed-main').innerText = math.format(vH, {notation:'fixed', precision:6});
        document.getElementById('coord-x').innerText = math.format(this.state.pos.x, {precision:12});
        document.getElementById('vz-val').innerText = math.format(this.state.vel.z, {precision:8});
        
        // Relativité (Lorentz)
        const beta = math.divide(this.state.vel.y, 299792458);
        const dilation = math.multiply(math.subtract(math.divide(1, math.sqrt(math.subtract(1, math.square(beta)))), 1), 86400e9);
        document.getElementById('t-dilation').innerText = dilation.toFixed(3);
    }
};

const AudioEngine = {
    analyser: null,
    async init() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = ctx.createMediaStreamSource(stream);
            this.analyser = ctx.createAnalyser();
            source.connect(this.analyser);
        } catch(e) { console.log("Audio Bloqué"); }
    }
};

const DataTeleport = {
    exportJSON() {
        const data = { state: OMNI_SYSTEM.state, date: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = "omni_24h_99kmh.json";
        a.click();
    }
};

OMNI_SYSTEM.init();
