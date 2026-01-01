/**
 * OMNISCIENCE V100 - NAVIGATION 3D & ECEF
 */
const Navigation3D = {
    currentPos: { x: 0, y: 0, z: 0 },
    
    // Compensation de la courbure terrestre pour Marseille
    applyGeodeticCorrection(velX, velY, dt) {
        const R = 6371000; // Rayon Terre
        const d_theta = (velY * dt) / R;
        const d_phi = (velX * dt) / (R * Math.cos(0.755)); // Latitude Marseille ~43.29°
        return { d_theta, d_phi };
    },

    updateDeadReckoning(vx, vy, vz, dt) {
        this.currentPos.x += vx * dt;
        this.currentPos.y += vy * dt;
        this.currentPos.z += vz * dt;
        return this.currentPos;
    }
};
