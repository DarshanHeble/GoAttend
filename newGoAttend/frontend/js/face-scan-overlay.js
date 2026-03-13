// face-scan-overlay.js
document.addEventListener('DOMContentLoaded', () => {
    const cameraContainers = document.querySelectorAll('.camera-container');

    cameraContainers.forEach(container => {
        // Create scanning overlay container
        const overlay = document.createElement('div');
        overlay.className = 'face-scan-overlay';
        
        // Structure inside the overlay
        overlay.innerHTML = `
            <div class="hud-corner top-left"></div>
            <div class="hud-corner top-right"></div>
            <div class="hud-corner bottom-left"></div>
            <div class="hud-corner bottom-right"></div>
            <div class="scan-grid"></div>
            <div class="scan-line-horizontal"></div>
            <div class="face-box"></div>
        `;

        container.appendChild(overlay);

        // Styling for the overlay - injecting dynamically to keep it modular
        const style = document.createElement('style');
        style.innerHTML = `
            .face-scan-overlay {
                position: absolute;
                top: 0; left: 0; width: 100%; height: 100%;
                pointer-events: none;
                z-index: 20;
                display: none;
                box-shadow: inset 0 0 50px rgba(34, 211, 238, 0.2);
            }
            .camera-container.scanning .face-scan-overlay {
                display: block;
                animation: pulseOver 2s infinite alternate;
            }
            @keyframes pulseOver {
                0% { box-shadow: inset 0 0 30px rgba(34, 211, 238, 0.1); }
                100% { box-shadow: inset 0 0 80px rgba(34, 211, 238, 0.4); }
            }
            .hud-corner {
                position: absolute; width: 40px; height: 40px;
                border: 3px solid rgba(34, 211, 238, 0.8);
            }
            .top-left { top: 10px; left: 10px; border-right: none; border-bottom: none; }
            .top-right { top: 10px; right: 10px; border-left: none; border-bottom: none; }
            .bottom-left { bottom: 10px; left: 10px; border-right: none; border-top: none; }
            .bottom-right { bottom: 10px; right: 10px; border-left: none; border-top: none; }
            
            .scan-grid {
                position: absolute; top:0; left:0; width:100%; height:100%;
                background-image: 
                    linear-gradient(rgba(34, 211, 238, 0.1) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(34, 211, 238, 0.1) 1px, transparent 1px);
                background-size: 20px 20px;
                opacity: 0.3;
            }
            .scan-line-horizontal {
                position: absolute; top: 0; left: 0; width: 100%; height: 2px;
                background: #22D3EE;
                box-shadow: 0 0 15px #22D3EE, 0 0 30px #22D3EE;
                animation: scanVertical 2.5s infinite linear;
            }
            @keyframes scanVertical {
                0% { top: 0%; opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { top: 100%; opacity: 0; }
            }
            .face-box {
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: 150px; height: 180px;
                border: 2px dashed rgba(34, 211, 238, 0.5);
                border-radius: 20px;
                animation: pulseBox 2s infinite alternate;
            }
            @keyframes pulseBox {
                0% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
                100% { transform: translate(-50%, -50%) scale(1.05); opacity: 0.8; }
            }
        `;
        document.head.appendChild(style);
    });
});
