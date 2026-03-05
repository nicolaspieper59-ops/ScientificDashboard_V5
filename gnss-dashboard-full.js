/**
 * ⚡ LE LINKER DE SINGULARITÉ (v21.1)
 * Connexion Moteur-Interface pour Samsung S10e
 */

const OMNI_LINKER = {
    // Fréquence de rafraîchissement de l'UI (60Hz pour fluidité)
    ui_hz: 60,

    init() {
        console.log("Connexion du Pont de l'Infini à l'interface graphique...");
        this.startLoop();
        this.bindButtons();
    },

    startLoop() {
        setInterval(() => {
            this.syncData();
        }, 1000 / this.ui_hz);
    },

    syncData() {
        // Accès aux états du moteur SOUVERAIN_OMEGA_FINAL ou SOUVERAIN_SURVIE
        const core = SOUVERAIN_OMEGA_FINAL;
        const survie = SOUVERAIN_SURVIE;

        // 1. VITESSE & RELATIVITÉ (COLONNE 2)
        document.getElementById('speed-main-display').innerText = `${core.state.v.times(3.6).toFixed(1)} km/h`;
        document.getElementById('sp-main').innerText = core.state.v.times(3.6).toFixed(1);
        document.getElementById('ui-lorentz').innerText = core.state.gamma.toFixed(18);
        document.getElementById('lorentz-val').innerText = core.state.gamma.toFixed(9);
        
        // 2. DISTANCE & ENTROPIE
        document.getElementById('distance-totale').innerText = `${core.state.dist.toFixed(3)} m`;
        document.getElementById('dist-3d').innerText = core.state.dist.toFixed(6);

        // 3. SYSTÈME & TEMPS (COLONNE 1)
        const now = new Date();
        document.getElementById('utc-datetime').innerText = now.toISOString().replace('T', ' ').substring(0, 19);
        document.getElementById('ui-clock').innerText = now.toLocaleTimeString();
        document.getElementById('elapsed-time').innerText = `${((performance.now() - core.state.last_t) / 1000).toFixed(2)} s`;

        // 4. ENVIRONNEMENT & THERMIQUE (COLONNE 3)
        const temp = 31.4; // Valeur simulée ici, à lier à l'API thermique réelle
        document.getElementById('status-thermal').innerText = temp > 42 ? "CRITICAL HEAT" : "THERMAL STABLE";
        document.getElementById('status-thermal').style.color = temp > 42 ? "var(--danger)" : "var(--success)";

        // 5. BLINDAGE & ALERTES (HUD)
        const poiAlert = document.getElementById('poi-alert');
        if (survie.state.is_saturated) {
            poiAlert.style.display = "block";
            document.getElementById('g-force-hud').innerText = "SATURATION DETECTED";
            document.getElementById('g-force-hud').style.color = "var(--danger)";
        } else {
            poiAlert.style.display = "none";
            document.getElementById('g-force-hud').innerText = "VERROUILLÉ";
            document.getElementById('g-force-hud').style.color = "var(--col-nav)";
        }

        // 6. ASTRO-POSITION (COLONNE 4)
        // Lien avec vsop2013.js
        if (typeof vsop2013 !== 'undefined') {
            document.getElementById('ast-jd').innerText = vsop2013.getJulianDate(now).toFixed(5);
            document.getElementById('celestial-g-corr').innerText = core.config.G_local.toFixed(8);
        }
    },

    bindButtons() {
        // Bouton d'initialisation majeure
        document.getElementById('main-init-btn').addEventListener('click', function() {
            this.style.background = "var(--col-phy)";
            this.innerText = "FUSION EN COURS...";
            
            // Lancement de la Calibration de Planck
            SOUVERAIN_OMEGA_FINAL.initCelestialAnchor();
            
            setTimeout(() => {
                this.style.display = "none";
                console.log("OMNISCIENCE ACTIVÉE.");
            }, 2000);
        });

        // Toggle Mode Carte / Globe
        document.getElementById('toggle-globe-btn').addEventListener('click', () => {
            const map = document.getElementById('map');
            const globe = document.getElementById('globe-container');
            if (map.style.display === "none") {
                map.style.display = "block";
                globe.style.display = "none";
            } else {
                map.style.display = "none";
                globe.style.display = "block";
            }
        });
    }
};

// Allumage du Linker au chargement du DOM
document.addEventListener('DOMContentLoaded', () => OMNI_LINKER.init());
