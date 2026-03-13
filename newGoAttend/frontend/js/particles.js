// particles.js
document.addEventListener('DOMContentLoaded', async () => {
    // Determine initial color based on theme
    const getCurrentThemeColor = () => {
        const theme = document.documentElement.getAttribute('data-theme');
        if(theme === 'dark') {
            return {
                particles: "#22D3EE", // Cyan Glow
                links: "#3B82F6"      // Electric Blue
            }
        } else {
            return {
                particles: "#94A3B8", // Soft Gray/Blue
                links: "#CBD5E1"
            }
        }
    };

    let colors = getCurrentThemeColor();

    const particlesOptions = {
        background: { color: { value: "transparent" } },
        fullScreen: { enable: false }, // Use the absolute container
        fpsLimit: 60,
        interactivity: {
            detectsOn: "window", 
            events: {
                onHover: { enable: true, mode: "grab" },
                resize: true,
            },
            modes: {
                grab: { distance: 150, links: { opacity: 0.6 } },
            },
        },
        particles: {
            color: { value: colors.particles },
            links: { color: colors.links, distance: 150, enable: true, opacity: 0.3, width: 1 },
            move: { direction: "none", enable: true, outModes: { default: "bounce" }, random: false, speed: 1.5, straight: false },
            number: { density: { enable: true, area: 800 }, value: 50 },
            opacity: { value: 0.6 },
            shape: { type: "circle" },
            size: { value: { min: 1, max: 2.5 } },
        },
        detectRetina: true,
    };

    // Load tsParticles
    if(window.tsParticles) {
        await window.tsParticles.load("tsparticles", particlesOptions);
    }
    
    // Listen for theme toggle to update particle colors interactively
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            // Need a tiny delay for the data-theme attribute update from app.js
            setTimeout(() => {
                const newColors = getCurrentThemeColor();
                const container = tsParticles.domItem(0);
                if(container) {
                    container.options.particles.color.value = newColors.particles;
                    container.options.particles.links.color = newColors.links;
                    container.refresh();
                }
            }, 50);
        });
    }
});
