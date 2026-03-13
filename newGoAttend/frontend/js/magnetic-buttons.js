// magnetic-buttons.js
document.addEventListener('DOMContentLoaded', () => {
    // Select all buttons
    const buttons = document.querySelectorAll('.btn');

    buttons.forEach((btn) => {
        // Create an inner wrapper for the text/icon if needed for neat scaling, 
        // but for magnetic effect we can just move the button itself.
        
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            // Calculate center of button
            const h = rect.width / 2;
            const w = rect.height / 2;
            // Calculate cursor distance from center
            const x = e.clientX - rect.left - h;
            const y = e.clientY - rect.top - w;

            // Move button towards cursor (max ~20-30px)
            gsap.to(btn, {
                x: x * 0.4,
                y: y * 0.4,
                duration: 0.3,
                ease: "power2.out",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)"
            });
        });

        btn.addEventListener('mouseleave', () => {
            // Revert back to original position
            gsap.to(btn, {
                x: 0,
                y: 0,
                scale: 1,
                duration: 0.8,
                ease: "elastic.out(1, 0.3)",
                boxShadow: "none" // Or revert to original box-shadow defined in CSS
            });
        });

        btn.addEventListener('mousedown', () => {
            gsap.to(btn, {
                scale: 0.95,
                duration: 0.1,
                ease: "power2.in"
            });
        });

        btn.addEventListener('mouseup', () => {
            gsap.to(btn, {
                scale: 1,
                duration: 0.3,
                ease: "elastic.out(1, 0.3)"
            });
        });

        // Ripple Effect
        btn.addEventListener('click', (e) => {
            const rect = btn.getBoundingClientRect();
            const ripple = document.createElement('span');
            ripple.className = 'ripple-effect';
            
            // Calculate click position relative to button
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
            btn.appendChild(ripple);
            
            gsap.fromTo(ripple, 
                { scale: 0, opacity: 0.6 }, 
                { scale: 15, opacity: 0, duration: 0.6, ease: "power2.out", onComplete: () => ripple.remove() }
            );
        });
    });
});
