/**
 * OMNISCIENCE V100 - MAIN CONTROL DASHBOARD
 */
const Dashboard = {
    ukf: new UKF_Master(),
    
    async startMission() {
        NTPMaster.sync();
        console.log("DÉCOLLAGE : RÉFÉRENTIEL MARSEILLE ACTIVÉ");
        
        window.addEventListener('devicemotion', (event) => {
            const dt = 0.01; // 100Hz
            const acc = event.accelerationIncludingGravity;
            
            // 1. Correction de Gravité Marseille
            const az_corr = acc.z - 9.80512;
            
            // 2. Fusion UKF
            this.ukf.predict(dt);
            this.ukf.update(math.matrix([[acc.x], [acc.y], [az_corr]]));
            
            // 3. Mise à jour UI
            this.refreshUI();
        });
    },

    refreshUI() {
        const v = this.ukf.state.get([3, 0]); // Vitesse Y
        const v_kmh = v * 3.6;
        
        document.getElementById('main-v').innerText = v_kmh.toFixed(9) + " km/h";
        
        // Calcul Galactique (Bille -> Terre -> Galaxie)
        const v_gal = v_kmh + 828000; // Vitesse approx galactique
        document.getElementById('v-absolute').innerText = v_gal.toFixed(3) + " km/h";
    },

    exportBlackBox() {
        const record = {
            session: "OMNI-RECORD-24H",
            timestamp: NTPMaster.getNow().toString(),
            data: this.ukf.state.toArray(),
            hash: "SHA256_LOCKED"
        };
        const blob = new Blob([JSON.stringify(record)], {type: "application/json"});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `RECORD_MM_${Date.now()}.json`;
        a.click();
    }
};
