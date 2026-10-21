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
        const mapAreaList = document.querySelectorAll('map area');
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
    let isTokenDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialWinLeft = 0;
    let initialWinTop = 0;

    // Track custom token drag offsets for PJ override coordinates
    // Map of tokenKey -> { x: origX, y: origY }
    const customTokenPositions = window.customTokenPositions || new Map();
    window.customTokenPositions = customTokenPositions;

    function initBattlemapWindow() {
        // Clear any previous drag positions on initial load
        if (window.customTokenPositions) {
            window.customTokenPositions.clear();
        }

        const battlemapWin = document.getElementById('battlemapWindow');
        const header = battlemapWin ? battlemapWin.querySelector('.battlemap-window-header') : null;

        if (battlemapWin && header) {
            // Make window draggable via header
            header.addEventListener('mousedown', startWinDrag);
            header.addEventListener('touchstart', startWinDrag, { passive: false });
        }

        // Update token positions on window resize or battlemap image load
        window.addEventListener('resize', updateBattlemapTokens);

        document.querySelectorAll('.battlemap-image').forEach(img => {
            img.addEventListener('load', updateBattlemapTokens);
        });

        // ResizeObserver on all battlemap containers
        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(() => {
                updateBattlemapTokens();
            });
            document.querySelectorAll('.battlemap-container').forEach(container => {
                resizeObserver.observe(container);
            });
        }

        // MutationObserver to update tokens when player advantages/postures change or players DOM reordered
        const observer = new MutationObserver(() => {
            if (!isTokenDragging) {
                updateBattlemapTokens();
            }
        });

        const creatureTabs = document.getElementById('creatureTabs');
        if (creatureTabs) {
            observer.observe(creatureTabs, { childList: true, subtree: true, attributes: true });
        }
    }

    function startWinDrag(e) {
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

    /**
     * Updates tokens on all active/visible battlemap containers
     */
    function updateBattlemapTokens() {
        const containers = document.querySelectorAll('.battlemap-container');
        if (containers.length === 0) return;

        // Collect player wrappers and posture groups
        const playerWrappers = Array.from(document.querySelectorAll('.player-wrapper'));
        const postureGroups = { 0: [], 1: [], 2: [], 3: [] };
        const heroNamesMap = new Map();

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

        // Compute original 4096x3385 positions for all heroes
        const heroPositions = new Map();
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
            });
        });

        // Collect engaged adversaries per hero
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

                const engagedHeroIndices = [];
                playerWrappers.forEach(wrapper => {
                    const pIdx = parseInt(wrapper.dataset.playerIndex);
                    const playerName = wrapper.dataset.playerName;
                    if (associatedSet.has(playerName) && heroPositions.has(pIdx)) {
                        engagedHeroIndices.push(pIdx);
                    }
                });

                if (engagedHeroIndices.length > 0) {
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

        // Render on every visible battlemap container
        containers.forEach(container => {
            // Check visibility
            const parentWin = container.closest('#battlemapWindow');
            if (parentWin && (parentWin.style.display === 'none' || parentWin.style.display === '')) {
                return;
            }
            if (container.offsetWidth === 0 || container.offsetHeight === 0) {
                return;
            }

            const img = container.querySelector('.battlemap-image');
            const overlay = container.querySelector('.battlemap-tokens-overlay');
            if (!img || !overlay) return;

            overlay.innerHTML = '';

            const renderedWidth = img.clientWidth;
            const renderedHeight = img.clientHeight;
            if (renderedWidth === 0 || renderedHeight === 0) return;

            const scaleX = renderedWidth / ORIGINAL_WIDTH;
            const scaleY = renderedHeight / ORIGINAL_HEIGHT;

            // Render Hero Tokens
            Object.keys(postureGroups).forEach((postureKey) => {
                const posture = parseInt(postureKey);
                const heroes = postureGroups[posture];

                heroes.forEach((hero) => {
                    const heroPos = heroPositions.get(hero.playerIndex);
                    if (!heroPos) return;

                    const screenX = heroPos.x * scaleX;
                    const screenY = heroPos.y * scaleY;

                    const tokenEl = document.createElement('div');
                    tokenEl.className = `battlemap-token posture-${posture}`;
                    tokenEl.dataset.tokenType = 'pj';
                    tokenEl.dataset.tokenId = hero.playerIndex;
                    const postureStr = window.getPostureText ? window.getPostureText(posture).replace(': ', ' ') : '';
                    tokenEl.title = postureStr ? `${hero.name} - ${postureStr}` : hero.name;
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

                    makeTokenDraggable(tokenEl, 'pj', hero.playerIndex, screenX, screenY, container, img, overlay);

                    overlay.appendChild(tokenEl);
                });
            });

            // Render Adversary Tokens
            heroAdversariesMap.forEach((advList, pIdx) => {
                const heroPos = heroPositions.get(pIdx);
                if (!heroPos || advList.length === 0) return;

                const isInline = container.classList.contains('inline-battlemap');
                const heroScreenX = heroPos.x * scaleX;
                const heroScreenY = heroPos.y * scaleY;
                const advCenterY = heroScreenY + (isInline ? 37.6 : 47);

                const count = advList.length;
                const advWidth = isInline ? 32 : 40;
                const gap = isInline ? 4 : 5;
                const pitch = advWidth + gap;
                const totalGroupWidth = count * advWidth + (count - 1) * gap;
                const startCenterX = heroScreenX - (totalGroupWidth / 2) + (advWidth / 2);

                advList.forEach((adv, idx) => {
                    const advCenterX = startCenterX + idx * pitch;
                    renderAdversaryToken(adv, advCenterX, advCenterY, overlay, pIdx);
                });
            });
        });
    }

    /**
     * Switches/displays the corresponding tab for a hero or creature token
     * @param {string} type 'pj'|'hero' or 'adversary'|'creature'
     * @param {number|string} id playerIndex or instanceId
     */
    function showTabForToken(type, id) {
        const numericId = parseInt(id);
        if (isNaN(numericId)) return;

        const fighterView = document.getElementById('fighterView');
        const isFighterViewVisible = fighterView && fighterView.style.display !== 'none';

        if (type === 'pj' || type === 'hero') {
            if (isFighterViewVisible) {
                const fighterTab = document.querySelector(`.fighter-tab[data-type="hero"][data-player-index="${numericId}"]`);
                if (fighterTab) {
                    fighterTab.click();
                    return;
                }
            }

            // Stage 1 (Engagement View) or fallback
            const playerTab = document.querySelector(`.player-tab[data-player-index="${numericId}"]`);
            if (playerTab) {
                playerTab.click();
            }
        } else if (type === 'adversary' || type === 'creature') {
            if (isFighterViewVisible) {
                const fighterTab = document.querySelector(`.fighter-tab[data-type="creature"][data-instance-id="${numericId}"]`);
                if (fighterTab) {
                    fighterTab.click();
                    return;
                }
            }

            // Stage 1 (Engagement View) or fallback
            const creatureTab = document.querySelector(`.creature-tab[data-instance-id="${numericId}"]`);
            if (creatureTab) {
                creatureTab.click();
            }
        }
    }
    window.showTabForToken = showTabForToken;

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
        tokenEl.style.cursor = 'pointer';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'adversary-token-name';
        nameSpan.textContent = adv.name;
        tokenEl.appendChild(nameSpan);

        tokenEl.addEventListener('click', (e) => {
            e.stopPropagation();
            showTabForToken('adversary', adv.instanceId);
        });

        overlay.appendChild(tokenEl);
    }

    /**
     * Makes a battlemap token draggable across the image coordinate space
     */
    function makeTokenDraggable(tokenEl, type, id, initialScreenX, initialScreenY, container, img, overlay) {
        let isDragging = false;
        let activePointerId = null;
        let startX = 0, startY = 0;
        let tokenStartX = initialScreenX, tokenStartY = initialScreenY;
        let hasMoved = false;

        tokenEl.style.touchAction = 'none';
        tokenEl.addEventListener('dragstart', (e) => e.preventDefault());

        const onStart = (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            e.stopPropagation();

            isDragging = true;
            isTokenDragging = true;
            activePointerId = e.pointerId;
            hasMoved = false;

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

            if (Math.hypot(deltaX, deltaY) > 5) {
                hasMoved = true;
            }

            let currentX = tokenStartX + deltaX;
            let currentY = tokenStartY + deltaY;

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
                const postureStr = window.getPostureText ? window.getPostureText(newPosture).replace(': ', ' ') : '';
                tokenEl.title = postureStr ? `${heroName} - ${postureStr}` : heroName;

                // Update posture indicator in engagement cards immediately during drag
                if (heroWrapper) {
                    const indicator = heroWrapper.querySelector('.posture-advantage');
                    if (indicator && typeof window.updatePostureElementStyle === 'function') {
                        window.updatePostureElementStyle(indicator, newPosture);
                    }
                }

                // Update associated adversary tokens on this overlay during hero token drag
                if (overlay) {
                    const isInline = container.classList.contains('inline-battlemap');
                    const advTokens = overlay.querySelectorAll(`.adversary-token[data-hero-id="${id}"]`);
                    if (advTokens.length > 0) {
                        const count = advTokens.length;
                        const advWidth = isInline ? 32 : 40;
                        const gap = isInline ? 4 : 5;
                        const pitch = advWidth + gap;
                        const totalGroupWidth = count * advWidth + (count - 1) * gap;
                        const startCenterX = currentX - (totalGroupWidth / 2) + (advWidth / 2);
                        const advCenterY = currentY + (isInline ? 37.6 : 47);

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
            isTokenDragging = false;

            const pointerId = (e && e.pointerId !== undefined) ? e.pointerId : activePointerId;

            if (pointerId !== null) {
                try {
                    if (tokenEl.hasPointerCapture && tokenEl.hasPointerCapture(pointerId)) {
                        tokenEl.releasePointerCapture(pointerId);
                    }
                } catch (err) {
                    // Ignore
                }
            }

            tokenEl.removeEventListener('pointermove', onMove);
            tokenEl.removeEventListener('pointerup', onEnd);
            tokenEl.removeEventListener('pointercancel', onEnd);
            window.removeEventListener('blur', onBlur);

            activePointerId = null;
            tokenEl.style.transition = '';

            if (!hasMoved) {
                showTabForToken(type, id);
                return;
            }

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

                // Update hero card view if open
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
