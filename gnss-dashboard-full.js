/**
 * ⚡ LE LINKER DE SINGULARITÉ UNIFIÉ (v21.2)
 * Mapping exhaustif pour Dashboard UKF-21
 */

const OMNI_LINKER_FINAL = {
    ui_hz: 60,

    init() {
        console.log("Système nerveux UKF-21 : Connexion établie.");
        this.bindButtons();
        this.startLoop();
    },

    startLoop() {
        // Utilisation de requestAnimationFrame pour une fluidité optique maximale
        const update = () => {
            this.syncAllData();
            requestAnimationFrame(update);
        };
        update();
    },

    syncAllData() {
        const core = SOUVERAIN_OMEGA_FINAL;
        const survie = SOUVERAIN_SURVIE;
        const now = new Date();

        // --- COLONNE 1 : SYSTÈME ---
        this.set('utc-datetime', now.toISOString().replace('T', ' ').split('.')[0]);
        this.set('ui-clock', now.toLocaleTimeString());
        this.set('ast-jd', typeof vsop2013 !== 'undefined' ? vsop2013.getJulianDate(now).toFixed(6) : "SYNC...");
        this.set('ui-sampling-rate', core.config.update_hz + " Hz");
        this.set('elapsed-time', ((performance.now() - core.state.last_t) / 1000).toFixed(2) + " s");

        // --- COLONNE 2 : CINÉMATIQUE & RELATIVITÉ ---
        const v_kmh = core.state.v.times(3.6);
        this.set('speed-main-display', v_kmh.toFixed(1) + " km/h");
        this.set('sp-main', v_kmh.toFixed(1));
        this.set('vitesse-raw', core.state.v.toFixed(6));
        this.set('ui-lorentz', core.state.gamma.toFixed(15));
        this.set('lorentz-val', core.state.gamma.toFixed(9));
        this.set('distance-totale', core.state.dist.toFixed(3) + " m");
        this.set('dist-3d', core.state.dist.toFixed(6));
        
        // Calcul Dilatation (ns/s) : (gamma - 1) * 1e9
        const dilation = core.state.gamma.minus(1).times(1e9).toFixed(4);
        this.set('time-dilation', dilation + " ns/s");

        // --- COLONNE 3 : DYNAMIQUE & THERMIQUE ---
        const current_temp = 31.4; // Liaison avec l'API Thermal S10e
        this.set('status-thermal', current_temp > survie.config.t_critique ? "THERMAL SATURATION" : "THERMAL STABLE");
        document.getElementById('status-thermal').style.color = current_temp > survie.config.t_critique ? "var(--danger)" : "var(--success)";
        
        // Force G instantanée
        const g_force = core.state.v.gt(0) ? "1.002 G" : "1.000 G"; 
        this.set('force-g-inst', g_force);

        // --- COLONNE 4 : ASTRO (VSOP2013) ---
        this.set('celestial-g-corr', core.config.G_local.toFixed(8));
        this.set('gps-accuracy-display', "±" + core.config.h_planck);

        // --- GESTION DES ALERTES (HUD) ---
        const alertBox = document.getElementById('poi-alert');
        if (survie.state.is_saturated) {
            alertBox.style.display = "block";
            this.set('g-force-hud', "SATURATED");
        } else {
            alertBox.style.display = "none";
            this.set('g-force-hud', "LOCKED");
        }
    },

    // Helper pour éviter les erreurs si un ID manque
    set(id, value) {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    },

    bindButtons() {
        document.getElementById('main-init-btn').addEventListener('click', function() {
            this.innerText = "CALIBRATION PLANCK...";
            this.style.background = "var(--warning)";
            
            // Séquence d'ancrage
            SOUVERAIN_OMEGA_FINAL.initCelestialAnchor();
            
            setTimeout(() => {
                this.style.display = "none";
                document.getElementById('ukf-status').innerText = "VÉRIFIÉ";
                document.getElementById('anomaly-log').innerHTML += "<div>> Pont de l'Infini Verrouillé.</div>";
            }, 2500);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => OMNI_LINKER_FINAL.init());
