/* --- GOATTEND FUTURISTIC JS SYSTEM --- */

const API = '/api';

// Theme Context Initialization
const currentTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', currentTheme);

// GSAP Setup
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Cursor Follower Initialization ---
    const cursor = document.createElement('div');
    cursor.id = 'cursor';
    const cursorFollower = document.createElement('div');
    cursorFollower.id = 'cursor-follower';
    document.body.appendChild(cursor);
    document.body.appendChild(cursorFollower);

    let mouseX = 0, mouseY = 0;
    let xp = 0, yp = 0;
    
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX; mouseY = e.clientY;
        gsap.to(cursor, { x: mouseX, y: mouseY, duration: 0.1, ease: "power2.out" });
    });
    
    gsap.ticker.add(() => {
        xp += ((mouseX - xp) / 6);
        yp += ((mouseY - yp) / 6);
        gsap.set(cursorFollower, { x: xp, y: yp });
    });

    // Cursor Interactivity
    document.querySelectorAll('a, button, input, select, .card').forEach(el => {
        el.addEventListener('mouseenter', () => cursorFollower.classList.add('active'));
        el.addEventListener('mouseleave', () => cursorFollower.classList.remove('active'));
    });

    // --- 2. Preloader Animation ---
    const preloader = document.getElementById('preloader');
    if (preloader) {
        gsap.to(preloader, {
            opacity: 0,
            duration: 1,
            delay: 0.5,
            ease: "power3.inOut",
            onComplete: () => preloader.style.display = 'none'
        });
    }

    // --- 3. Theme Toggler ---
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
        themeToggle.addEventListener('click', () => {
            let theme = document.documentElement.getAttribute('data-theme');
            let newTheme = theme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            gsap.to(themeToggle, {
                rotation: '+=360', 
                duration: 0.6, 
                ease: 'back.out(1.7)'
            });
            themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
        });
    }

    // --- 4. Active Nav Linking ---
    const path = window.location.pathname;
    document.querySelectorAll('.navbar nav a').forEach(a => {
        if (a.getAttribute('href') === path) a.classList.add('active');
    });

    // --- 5. Page Element GSAP Entry Animations ---
    gsap.from(".navbar", { y: -80, opacity: 0, duration: 1, ease: "power4.out" });
    gsap.from(".hero h1, .page-title", { y: 50, opacity: 0, duration: 1, delay: 0.3, stagger: 0.2, ease: "power3.out" });
    gsap.from(".hero p", { y: 20, opacity: 0, duration: 1, delay: 0.5, ease: "power3.out" });
    gsap.from(".btn", { scale: 0.9, opacity: 0, duration: 0.6, delay: 0.6, stagger: 0.1, ease: "back.out(1.5)" });
    gsap.from(".card", { y: 40, opacity: 0, duration: 0.8, delay: 0.5, stagger: 0.2, ease: "power2.out" });

    // --- 6. Toast Container Setup ---
    const tCont = document.createElement('div');
    tCont.className = 'toast-container';
    tCont.id = 'toastArea';
    document.body.appendChild(tCont);
});

// API Helpers
async function apiGet(path) {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
}

async function apiPostForm(path, formData) {
    const res = await fetch(`${API}${path}`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
}

// Cinematic Toast Notification (GSAP)
function showToast(message, type = 'success') {
    const area = document.getElementById('toastArea');
    if (!area) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '🚀' : '⚠️';
    toast.innerHTML = `<span style="font-size:1.5rem">${icon}</span> <span>${message}</span>`;
    
    area.appendChild(toast);

    // Enter
    gsap.to(toast, { x: 0, opacity: 1, duration: 0.6, ease: "back.out(1.2)" });

    // Exit
    setTimeout(() => {
        gsap.to(toast, { 
            x: 120, opacity: 0, duration: 0.5, ease: "power2.inOut",
            onComplete: () => toast.remove() 
        });
    }, 4000);
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}
function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
