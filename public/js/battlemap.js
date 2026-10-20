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
        1: { x: 2048, y: 1600 },
        // Posture 0: EXPOSE / EXPOSEE
        0: { x: 2048, y: 2000 },
        // Posture 3: DEFENSIF / DEFENSIVE
        3: { x: 2048, y: 2500 },
        // Posture 2: ARRIERE
        2: { x: 2048, y: 2750 }
    };

    // Arc radius and span angle settings per posture to keep tokens well distributed & inside polygons
    const ARC_SETTINGS = {
        1: { radiusX: 450, radiusY: 130, startAngle: -150, endAngle: -30 }, // AVANCE
        0: { radiusX: 600, radiusY: 150, startAngle: -150, endAngle: -30 }, // EXPOSE
        3: { radiusX: 900, radiusY: 200, startAngle: -150, endAngle: -30 }, // DEFENSIF
        2: { radiusX: 1000, radiusY: 150, startAngle: 30, endAngle: 150 }   // ARRIERE
    };

    /**
     * Ray-casting point-in-polygon algorithm
     * @param {Array<number>} point [x, y]
     * @param {Array<Array<number>>} vs Array of [x, y] vertices
     * @returns {boolean}
     */
    function pointInPolygon(point, vs) {
        const x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i][0], yi = vs[i][1];
            const xj = vs[j][0], yj = vs[j][1];
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /**
     * Parses area polygons from the image map
     * @returns {Array<{posture: number, vertices: Array<Array<number>>}>}
     */
    function getPolygonZones() {
        const mapAreaList = document.querySelectorAll('map[name="image-map"] area');
        const postureMap = {
            'AVANCE': 1,
            'EXPOSEE': 0,
            'DEFENSIVE': 3,
            'ARRIERE': 2
        };
        const zones = [];
        mapAreaList.forEach(area => {
            const alt = area.getAttribute('alt');
            const coordsStr = area.getAttribute('coords');
            if (alt && coordsStr && postureMap[alt] !== undefined) {
                const rawCoords = coordsStr.split(',').map(Number);
                const vertices = [];
                for (let i = 0; i < rawCoords.length; i += 2) {
                    if (!isNaN(rawCoords[i]) && !isNaN(rawCoords[i + 1])) {
                        vertices.push([rawCoords[i], rawCoords[i + 1]]);
                    }
                }
                zones.push({
                    posture: postureMap[alt],
                    vertices: vertices
                });
            }
        });
        return zones;
    }

    /**
     * Determines combat posture for given original coordinates (0-4096, 0-3385)
     * @param {number} origX
     * @param {number} origY
     * @returns {number} posture index (1: AVANCE, 0: EXPOSEE, 3: DEFENSIVE, 2: ARRIERE)
     */
    function getPostureFromCoords(origX, origY) {
        const zones = getPolygonZones();
        for (const zone of zones) {
            if (pointInPolygon([origX, origY], zone.vertices)) {
                return zone.posture;
            }
        }
        return 2; // Default to ARRIERE if outside all defined zones
    }

    window.getPostureFromCoords = getPostureFromCoords;

    let isWindowDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialWinLeft = 0;
    let initialWinTop = 0;

    // Track custom token drag offsets for PJ override coordinates
    // Map of tokenKey -> { x: origX, y: origY }
    const customTokenPositions = window.customTokenPositions || new Map();
    window.customTokenPositions = customTokenPositions;

    function initBattlemapWindow() {
        // On battlemap load, clear any previous drag positions so tokens start in their posture zone
        if (window.customTokenPositions) {
            window.customTokenPositions.clear();
        }

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

        // Map to store calculated original position (4096x3385) for each playerIndex
        const heroPositions = new Map();
        const heroNamesMap = new Map();

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

            heroNamesMap.set(playerName, playerIndex);

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

                if (customTokenPositions.has(`pj_${hero.playerIndex}`)) {
                    const customPos = customTokenPositions.get(`pj_${hero.playerIndex}`);
                    origX = customPos.x;
                    origY = customPos.y;
                } else if (count === 1) {
                    origX = center.x;
                    origY = center.y;
                } else {
                    const angleDeg = arc.startAngle + (index / (count - 1)) * (arc.endAngle - arc.startAngle);
                    const angleRad = (angleDeg * Math.PI) / 180;
                    origX = center.x + arc.radiusX * Math.cos(angleRad);
                    origY = center.y + arc.radiusY * Math.sin(angleRad);
                }

                heroPositions.set(hero.playerIndex, { x: origX, y: origY });

                const screenX = origX * scaleX;
                const screenY = origY * scaleY;

                const tokenEl = document.createElement('div');
                tokenEl.className = `battlemap-token posture-${posture}`;
                tokenEl.dataset.tokenType = 'pj';
                tokenEl.dataset.tokenId = hero.playerIndex;
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

                // Enable token drag for PJ
                makeTokenDraggable(tokenEl, 'pj', hero.playerIndex, screenX, screenY);

                overlay.appendChild(tokenEl);
            });
        });

        // Group adversaries by engaged hero in player DOM order
        // heroAdversariesMap: Map of heroPlayerIndex -> Array of { instanceId, name, isSecondary }
        const heroAdversariesMap = new Map();
        playerWrappers.forEach(wrapper => {
            const pIdx = parseInt(wrapper.dataset.playerIndex);
            heroAdversariesMap.set(pIdx, []);
        });

        if (window.creatureInstances) {
            window.creatureInstances.forEach((creatureInst, instanceId) => {
                const name = creatureInst.getElementsByTagName('nom')[0]?.textContent || `Créature ${instanceId}`;
                const associatedSet = window.creaturePlayerAssociations ? window.creaturePlayerAssociations.get(instanceId) : null;
                if (!associatedSet || associatedSet.size === 0) return;

                // Find engaged heroes present on board in playerWrappers order
                const engagedHeroIndices = [];
                playerWrappers.forEach(wrapper => {
                    const pIdx = parseInt(wrapper.dataset.playerIndex);
                    const playerName = wrapper.dataset.playerName;
                    if (associatedSet.has(playerName) && heroPositions.has(pIdx)) {
                        engagedHeroIndices.push(pIdx);
                    }
                });

                if (engagedHeroIndices.length > 0) {
                    // First engaged hero gets primary token, subsequent engaged heroes get duplicated secondary (grayed out) tokens
                    engagedHeroIndices.forEach((pIdx, idx) => {
                        const isSecondary = idx > 0;
                        const advList = heroAdversariesMap.get(pIdx);
                        if (advList) {
                            advList.push({
                                instanceId,
                                name,
                                isSecondary
                            });
                        }
                    });
                }
            });
        }

        // Render adversary tokens under each hero according to positioning rules:
        // Top of adversary token is 5px below bottom of hero token.
        // Hero token size: 44x44px. Since translate(-50%, -50%) centers the token at (heroScreenX, heroScreenY),
        // bottom of hero token is heroScreenY + 22.
        // Adversary token size: 40x40px (or 44x44px box). With translate(-50%, -50%), centering it vertically at heroScreenY + 47px
        // places its top (heroScreenY + 47 - 20 = heroScreenY + 27px) exactly 5px below the hero token bottom (heroScreenY + 22px).
        heroAdversariesMap.forEach((advList, pIdx) => {
            const heroPos = heroPositions.get(pIdx);
            if (!heroPos || advList.length === 0) return;

            const heroScreenX = heroPos.x * scaleX;
            const heroScreenY = heroPos.y * scaleY;
            const advCenterY = heroScreenY + 47; // top at heroScreenY + 27 (5px below hero bottom)

            const count = advList.length;
            const advWidth = 40; // width of adversary token in px
            const gap = 5; // distance between tokens in px
            const pitch = advWidth + gap; // 45px center-to-center spacing
            const totalGroupWidth = count * advWidth + (count - 1) * gap;
            // Left edge of the first token relative to hero center:
            const startCenterX = heroScreenX - (totalGroupWidth / 2) + (advWidth / 2);

            advList.forEach((adv, idx) => {
                const advCenterX = startCenterX + idx * pitch;
                renderAdversaryToken(adv, advCenterX, advCenterY, overlay, pIdx);
            });
        });
    }

    /**
     * Renders a single adversary token on the battlemap overlay
     */
    function renderAdversaryToken(adv, screenX, screenY, overlay, heroId) {
        const tokenEl = document.createElement('div');
        tokenEl.className = 'battlemap-token adversary-token';
        if (adv.isSecondary) {
            tokenEl.classList.add('secondary-token');
        }
        tokenEl.dataset.tokenType = 'adversary';
        tokenEl.dataset.tokenId = adv.instanceId;
        tokenEl.dataset.heroId = heroId;
        tokenEl.title = adv.name + (adv.isSecondary ? ' (Dupliqué)' : '');
        tokenEl.style.left = `${screenX}px`;
        tokenEl.style.top = `${screenY}px`;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'adversary-token-name';
        nameSpan.textContent = adv.name;
        tokenEl.appendChild(nameSpan);

        overlay.appendChild(tokenEl);
    }

    /**
     * Makes a battlemap token draggable across the image coordinate space
     */
    function makeTokenDraggable(tokenEl, type, id, initialScreenX, initialScreenY) {
        let isDragging = false;
        let activePointerId = null;
        let startX = 0, startY = 0;
        let tokenStartX = initialScreenX, tokenStartY = initialScreenY;

        tokenEl.style.touchAction = 'none';
        tokenEl.addEventListener('dragstart', (e) => e.preventDefault());

        const onStart = (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            e.stopPropagation(); // prevent window dragging

            isDragging = true;
            activePointerId = e.pointerId;

            try {
                tokenEl.setPointerCapture(e.pointerId);
            } catch (err) {
                // Ignore if pointer capture fails
            }

            startX = e.clientX;
            startY = e.clientY;

            tokenStartX = parseFloat(tokenEl.style.left) || initialScreenX;
            tokenStartY = parseFloat(tokenEl.style.top) || initialScreenY;

            tokenEl.style.transition = 'none';

            tokenEl.addEventListener('pointermove', onMove);
            tokenEl.addEventListener('pointerup', onEnd);
            tokenEl.addEventListener('pointercancel', onEnd);
            window.addEventListener('blur', onBlur);
        };

        const onMove = (e) => {
            if (!isDragging) return;
            if (e.cancelable) e.preventDefault();

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            let currentX = tokenStartX + deltaX;
            let currentY = tokenStartY + deltaY;

            const img = document.getElementById('battlemapImg');
            if (img) {
                currentX = Math.max(0, Math.min(currentX, img.clientWidth));
                currentY = Math.max(0, Math.min(currentY, img.clientHeight));
            }

            tokenEl.style.left = `${currentX}px`;
            tokenEl.style.top = `${currentY}px`;

            if (type === 'pj') {
                const scaleX = img && img.clientWidth ? img.clientWidth / ORIGINAL_WIDTH : 1;
                const scaleY = img && img.clientHeight ? img.clientHeight / ORIGINAL_HEIGHT : 1;

                const origX = currentX / scaleX;
                const origY = currentY / scaleY;

                customTokenPositions.set(`pj_${id}`, { x: origX, y: origY });

                const newPosture = getPostureFromCoords(origX, origY);
                if (window.playerAdvantages) {
                    window.playerAdvantages.set(Number(id), newPosture);
                }

                tokenEl.className = `battlemap-token posture-${newPosture}`;
                const heroWrapper = document.querySelector(`.player-wrapper[data-player-index="${id}"]`);
                const heroName = heroWrapper ? heroWrapper.dataset.playerName : '';
                tokenEl.title = `${heroName} (${window.getPostureText ? window.getPostureText(newPosture) : ''})`;

                // Update associated adversary tokens in real-time during hero token drag
                const overlay = document.getElementById('battlemapTokensOverlay');
                if (overlay) {
                    const advTokens = overlay.querySelectorAll(`.adversary-token[data-hero-id="${id}"]`);
                    if (advTokens.length > 0) {
                        const count = advTokens.length;
                        const advWidth = 40;
                        const gap = 5;
                        const pitch = advWidth + gap;
                        const totalGroupWidth = count * advWidth + (count - 1) * gap;
                        const startCenterX = currentX - (totalGroupWidth / 2) + (advWidth / 2);
                        const advCenterY = currentY + 47;

                        advTokens.forEach((advToken, idx) => {
                            advToken.style.left = `${startCenterX + idx * pitch}px`;
                            advToken.style.top = `${advCenterY}px`;
                        });
                    }
                }
            }
        };

        const onEnd = (e) => {
            if (!isDragging) return;
            isDragging = false;

            const pointerId = (e && e.pointerId !== undefined) ? e.pointerId : activePointerId;

            if (pointerId !== null) {
                try {
                    if (tokenEl.hasPointerCapture && tokenEl.hasPointerCapture(pointerId)) {
                        tokenEl.releasePointerCapture(pointerId);
                    } else {
                        tokenEl.releasePointerCapture(pointerId);
                    }
                } catch (err) {
                    // Ignore error if capture was already released
                }
            }

            tokenEl.removeEventListener('pointermove', onMove);
            tokenEl.removeEventListener('pointerup', onEnd);
            tokenEl.removeEventListener('pointercancel', onEnd);
            window.removeEventListener('blur', onBlur);

            activePointerId = null;
            tokenEl.style.transition = '';

            const img = document.getElementById('battlemapImg');
            if (!img || img.clientWidth === 0 || img.clientHeight === 0) return;

            const currentScreenX = parseFloat(tokenEl.style.left);
            const currentScreenY = parseFloat(tokenEl.style.top);

            const scaleX = img.clientWidth / ORIGINAL_WIDTH;
            const scaleY = img.clientHeight / ORIGINAL_HEIGHT;

            const origX = currentScreenX / scaleX;
            const origY = currentScreenY / scaleY;

            if (type === 'pj') {
                customTokenPositions.set(`pj_${id}`, { x: origX, y: origY });
                const newPosture = getPostureFromCoords(origX, origY);
                if (window.playerAdvantages) {
                    window.playerAdvantages.set(Number(id), newPosture);
                }
                // Update indicator elements and card views across the app
                const wrapper = document.querySelector(`.player-wrapper[data-player-index="${id}"]`);
                if (wrapper) {
                    const indicator = wrapper.querySelector('.posture-advantage');
                    if (indicator && typeof window.updatePostureElementStyle === 'function') {
                        window.updatePostureElementStyle(indicator, newPosture);
                    }
                }
                // Update card view if open
                const numericId = Number(id);
                if (window.playerInstances && (window.playerInstances.has(numericId) || window.playerInstances.has(id))) {
                    const playerInst = window.playerInstances.get(numericId) || window.playerInstances.get(id);
                    const activePlayerTab = document.querySelector('.player-tab.active');
                    if (activePlayerTab) {
                        const activeWrapper = activePlayerTab.closest('.player-wrapper');
                        if (activeWrapper && parseInt(activeWrapper.dataset.playerIndex) === numericId) {
                            if (typeof window.displayPlayerProfile === 'function') {
                                window.displayPlayerProfile(playerInst);
                            }
                        }
                    }
                }
                // Update creature card if open
                const creatureCard = document.getElementById('creatureCard');
                if (creatureCard && creatureCard.style.display !== 'none' && creatureCard.dataset.instanceId) {
                    const displayedInstanceId = parseInt(creatureCard.dataset.instanceId);
                    if (typeof window.updateAssociatedPlayersList === 'function' && !isNaN(displayedInstanceId)) {
                        window.updateAssociatedPlayersList(displayedInstanceId);
                    }
                }
                updateBattlemapTokens();
            }
        };

        const onBlur = () => {
            if (isDragging) {
                onEnd();
            }
        };

        tokenEl.addEventListener('pointerdown', onStart);
    }
    window.updateBattlemapTokens = updateBattlemapTokens;

    window.addEventListener('DOMContentLoaded', initBattlemapWindow);
})();
