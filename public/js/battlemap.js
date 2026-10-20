/**
 * Battlemap Module
 * Handles floating draggable window toggle, posture token placement, and dynamic updating
 */

(function () {
    // Original image coordinate space for the map areas
    const ORIGINAL_WIDTH = 4096;
    const ORIGINAL_HEIGHT = 3385;

    // Center coordinates for posture zones in original 4096x3385 space
    const POSTURE_CENTERS = {
        // Posture 1: AVANCE
        1: { x: 2048, y: 1475 },
        // Posture 0: EXPOSE / EXPOSEE
        0: { x: 2048, y: 1600 },
        // Posture 3: DEFENSIF / DEFENSIVE
        3: { x: 2048, y: 1950 },
        // Posture 2: ARRIERE
        2: { x: 2048, y: 2800 }
    };

    // Arc radius and span angle settings per posture to keep tokens well distributed & inside polygons
    const ARC_SETTINGS = {
        1: { radiusX: 520, radiusY: 170, startAngle: -150, endAngle: -30 }, // AVANCE
        0: { radiusX: 680, radiusY: 220, startAngle: -150, endAngle: -30 }, // EXPOSE
        3: { radiusX: 1050, radiusY: 340, startAngle: -150, endAngle: -30 }, // DEFENSIF
        2: { radiusX: 1100, radiusY: 200, startAngle: 30, endAngle: 150 }   // ARRIERE
    };

    let isWindowDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialWinLeft = 0;
    let initialWinTop = 0;

    function initBattlemapWindow() {
        const battlemapWin = document.getElementById('battlemapWindow');
        const header = battlemapWin ? battlemapWin.querySelector('.battlemap-window-header') : null;
        const img = document.getElementById('battlemapImg');

        if (!battlemapWin || !header) return;

        // Make window draggable via header
        header.addEventListener('mousedown', startWinDrag);
        header.addEventListener('touchstart', startWinDrag, { passive: false });

        // Update token positions on window resize or image load
        window.addEventListener('resize', updateBattlemapTokens);
        if (img) {
            img.addEventListener('load', updateBattlemapTokens);
        }

        // MutationObserver to update tokens when player advantages/postures change or players DOM reordered
        const observer = new MutationObserver(() => {
            if (battlemapWin.style.display !== 'none') {
                updateBattlemapTokens();
            }
        });

        const playerTabsContainer = document.querySelector('.player-tabs');
        if (playerTabsContainer) {
            observer.observe(playerTabsContainer, { childList: true, subtree: true, attributes: true });
        }
    }

    function startWinDrag(e) {
        // Prevent drag when clicking close button
        if (e.target.classList.contains('close-button')) return;

        const battlemapWin = document.getElementById('battlemapWindow');
        if (!battlemapWin) return;

        isWindowDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        dragStartX = clientX;
        dragStartY = clientY;

        const rect = battlemapWin.getBoundingClientRect();
        initialWinLeft = rect.left;
        initialWinTop = rect.top;

        // Switch to fixed position using left/top values for exact dragging
        battlemapWin.style.left = `${initialWinLeft}px`;
        battlemapWin.style.top = `${initialWinTop}px`;
        battlemapWin.style.transform = 'none';

        document.addEventListener('mousemove', onWinMove);
        document.addEventListener('touchmove', onWinMove, { passive: false });
        document.addEventListener('mouseup', stopWinDrag);
        document.addEventListener('touchend', stopWinDrag);
    }

    function onWinMove(e) {
        if (!isWindowDragging) return;
        if (e.cancelable) e.preventDefault();

        const battlemapWin = document.getElementById('battlemapWindow');
        if (!battlemapWin) return;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const deltaX = clientX - dragStartX;
        const deltaY = clientY - dragStartY;

        let newLeft = initialWinLeft + deltaX;
        let newTop = initialWinTop + deltaY;

        // Keep inside viewport bounds
        const maxLeft = window.innerWidth - battlemapWin.offsetWidth;
        const maxTop = window.innerHeight - battlemapWin.offsetHeight;

        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        battlemapWin.style.left = `${newLeft}px`;
        battlemapWin.style.top = `${newTop}px`;
    }

    function stopWinDrag() {
        isWindowDragging = false;
        document.removeEventListener('mousemove', onWinMove);
        document.removeEventListener('touchmove', onWinMove);
        document.removeEventListener('mouseup', stopWinDrag);
        document.removeEventListener('touchend', stopWinDrag);
    }

    function toggleBattlemapWindow() {
        const battlemapWin = document.getElementById('battlemapWindow');
        const battlemapTab = document.getElementById('battlemapTab');
        if (!battlemapWin) return;

        if (battlemapWin.style.display === 'none' || battlemapWin.style.display === '') {
            battlemapWin.style.display = 'flex';
            if (battlemapTab) battlemapTab.classList.add('active');
            // Reset position centered if not moved yet
            if (!battlemapWin.style.left) {
                battlemapWin.style.left = '50%';
                battlemapWin.style.top = '50%';
                battlemapWin.style.transform = 'translate(-50%, -50%)';
            }
            updateBattlemapTokens();
        } else {
            closeBattlemapWindow();
        }
    }
    window.toggleBattlemapWindow = toggleBattlemapWindow;

    function closeBattlemapWindow() {
        const battlemapWin = document.getElementById('battlemapWindow');
        const battlemapTab = document.getElementById('battlemapTab');
        if (battlemapWin) {
            battlemapWin.style.display = 'none';
        }
        if (battlemapTab) {
            battlemapTab.classList.remove('active');
        }
    }
    window.closeBattlemapWindow = closeBattlemapWindow;

    function updateBattlemapTokens() {
        const overlay = document.getElementById('battlemapTokensOverlay');
        const img = document.getElementById('battlemapImg');
        if (!overlay || !img) return;

        overlay.innerHTML = '';

        const renderedWidth = img.clientWidth;
        const renderedHeight = img.clientHeight;

        if (renderedWidth === 0 || renderedHeight === 0) return;

        const scaleX = renderedWidth / ORIGINAL_WIDTH;
        const scaleY = renderedHeight / ORIGINAL_HEIGHT;

        // Group heroes by their posture
        const playerWrappers = Array.from(document.querySelectorAll('.player-wrapper'));
        const postureGroups = { 0: [], 1: [], 2: [], 3: [] };

        playerWrappers.forEach((wrapper) => {
            const playerIndex = parseInt(wrapper.dataset.playerIndex);
            const playerName = wrapper.dataset.playerName;
            const tokenName = wrapper.dataset.token;
            const posture = (window.playerAdvantages && window.playerAdvantages.has(playerIndex))
                ? window.playerAdvantages.get(playerIndex)
                : 0;

            if (postureGroups[posture] !== undefined) {
                postureGroups[posture].push({
                    playerIndex,
                    name: playerName,
                    token: tokenName
                });
            } else {
                postureGroups[0].push({
                    playerIndex,
                    name: playerName,
                    token: tokenName
                });
            }
        });

        // Place tokens for each posture group
        Object.keys(postureGroups).forEach((postureKey) => {
            const posture = parseInt(postureKey);
            const heroes = postureGroups[posture];
            const count = heroes.length;
            if (count === 0) return;

            const center = POSTURE_CENTERS[posture] || { x: 2048, y: 1600 };
            const arc = ARC_SETTINGS[posture] || { radiusX: 500, radiusY: 200, startAngle: -150, endAngle: -30 };

            heroes.forEach((hero, index) => {
                let origX, origY;

                if (count === 1) {
                    origX = center.x;
                    origY = center.y;
                } else {
                    const angleDeg = arc.startAngle + (index / (count - 1)) * (arc.endAngle - arc.startAngle);
                    const angleRad = (angleDeg * Math.PI) / 180;
                    origX = center.x + arc.radiusX * Math.cos(angleRad);
                    origY = center.y + arc.radiusY * Math.sin(angleRad);
                }

                const screenX = origX * scaleX;
                const screenY = origY * scaleY;

                const tokenEl = document.createElement('div');
                tokenEl.className = 'battlemap-token';
                tokenEl.title = `${hero.name} (${window.getPostureText ? window.getPostureText(posture) : ''})`;
                tokenEl.style.left = `${screenX}px`;
                tokenEl.style.top = `${screenY}px`;

                if (hero.token) {
                    const imgEl = document.createElement('img');
                    imgEl.src = `images/PJ/${hero.token}.png`;
                    imgEl.alt = hero.name;
                    tokenEl.appendChild(imgEl);
                } else {
                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = hero.name ? hero.name.substring(0, 2).toUpperCase() : '?';
                    tokenEl.appendChild(nameSpan);
                }

                overlay.appendChild(tokenEl);
            });
        });
    }
    window.updateBattlemapTokens = updateBattlemapTokens;

    window.addEventListener('DOMContentLoaded', initBattlemapWindow);
})();
