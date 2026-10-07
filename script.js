// 3D Mouse Tilt Effect for Glass Cards
const tiltCards = document.querySelectorAll('.tilt-card');

tiltCards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left; // Mouse X inside card
        const y = e.clientY - rect.top;  // Mouse Y inside card

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Calculate rotation angle (max 15 degrees)
        const rotateX = -((y - centerY) / centerY) * 12;
        const rotateY = ((x - centerX) / centerX) * 12;

        // Apply 3D transform
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });

    // Reset card position when mouse leaves
    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        card.style.transition = 'transform 0.5s ease';
    });

    // Remove transition during movement for instant responsiveness
    card.addEventListener('mouseenter', () => {
        card.style.transition = 'none';
    });
});