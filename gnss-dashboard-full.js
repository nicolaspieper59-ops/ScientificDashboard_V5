document.getElementById('start-btn-final').addEventListener('click', async () => {
    // 1. Reset UI (Supprime les NaN)
    document.querySelectorAll('span').forEach(s => { if(s.innerText === "--") s.innerText = "0"; });

    // 2. Initialise les moteurs
    await WeatherEngine.init();
    await Navigation3D.init();

    // 3. Update Status
    document.getElementById('ekf-status').innerText = "V100 PRO • 64-BIT ACTIVE";
    document.getElementById('ekf-status').style.color = "var(--accent-green)";
    
    // 4. Export (Bouton d'exportation de logs)
    document.getElementById('btn-export-all').onclick = () => {
        const data = {
            v_max: document.getElementById('speed-main-display').innerText,
            lorentz: document.getElementById('lorentz-factor').innerText,
            timestamp: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = "Omniscience_Log.json";
        a.click();
    };
});
