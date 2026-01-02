const SeismicReporter = {
    events: [],
    
    logEvent(mag, jerk) {
        const event = {
            time: new Date().toISOString(),
            magnitude_g: mag.toString(),
            jerk: jerk.toString(),
            v_at_time: document.getElementById('speed-stable-ms').innerText
        };
        this.events.push(event);
        localStorage.setItem('seismic_logs', JSON.stringify(this.events));
    },

    exportJSON() {
        const data = {
            session: Date.now(),
            ukf_21_states_data: this.events,
            voice_snapshots: JSON.parse(localStorage.getItem('voice_snapshots') || "[]"),
            final_v_max: document.getElementById('v-max-session')?.innerText
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Omniscience_Record_${Date.now()}.json`;
        a.click();
    }
};
