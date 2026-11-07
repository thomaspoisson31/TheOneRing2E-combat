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

    // Store saved window styles before fullscreen
    let savedWindowStyles = null;

    function startWinDrag(e) {
        if (e.target.closest('.close-button') || e.target.closest('.fullscreen-button')) return;

        const battlemapWin = document.getElementById('battlemapWindow');
        if (!battlemapWin || battlemapWin.classList.contains('fullscreen')) return;

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
     * Toggles fullscreen mode for the battlemap window
     */
    function toggleBattlemapFullscreen() {
        const battlemapWin = document.getElementById('battlemapWindow');
        const fsBtn = document.getElementById('battlemapFullscreenBtn');
        if (!battlemapWin) return;

        const isFullscreen = battlemapWin.classList.contains('fullscreen');

        if (!isFullscreen) {
            // Save non-fullscreen position and transform
            savedWindowStyles = {
                left: battlemapWin.style.left,
                top: battlemapWin.style.top,
                transform: battlemapWin.style.transform
            };

            battlemapWin.classList.add('fullscreen');
            if (fsBtn) {
                fsBtn.textContent = '🗗';
                fsBtn.title = 'Réduire la fenêtre';
            }
        } else {
            battlemapWin.classList.remove('fullscreen');

            // Restore non-fullscreen position and transform
            if (savedWindowStyles) {
                battlemapWin.style.left = savedWindowStyles.left;
                battlemapWin.style.top = savedWindowStyles.top;
                battlemapWin.style.transform = savedWindowStyles.transform;
            }

            if (fsBtn) {
                fsBtn.textContent = '⛶';
                fsBtn.title = 'Plein écran';
            }
        }

        updateBattlemapTokens();
    }
    window.toggleBattlemapFullscreen = toggleBattlemapFullscreen;

    /**
     * Updates tokens on all active/visible battlemap containers
     */
    // Random border colors shared by an adversary and its associated hero(es)
    const GROUP_COLORS = ['#ff69b4', '#7dd3fc', '#86efac', '#fb923c', '#ef4444', '#a855f7', '#facc15'];
    // Max edge-to-edge distance (screen px) between an adversary and a hero to be associated
    const ASSOCIATION_DISTANCE = 5;
    // tokenKey (pj_<index> / adv_<instanceId>) -> border color of its association group
    const tokenGroupColors = window.tokenGroupColors || new Map();
    window.tokenGroupColors = tokenGroupColors;

    /**
     * Assigns a border color to each group of associated tokens (connected hero/adversary sets).
     * Colors stay stable while a group exists and are drawn randomly for new groups.
     */
    function updateGroupColors(playerWrappers) {
        const parent = new Map();
        const find = (k) => {
            if (!parent.has(k)) parent.set(k, k);
            let root = k;
            while (parent.get(root) !== root) root = parent.get(root);
            while (parent.get(k) !== root) {
                const next = parent.get(k);
                parent.set(k, root);
                k = next;
            }
            return root;
        };
        const union = (a, b) => {
            const ra = find(a), rb = find(b);
            if (ra !== rb) parent.set(ra, rb);
        };

        const nameToIndex = new Map();
        playerWrappers.forEach(w => nameToIndex.set(w.dataset.playerName, parseInt(w.dataset.playerIndex)));

        if (window.creaturePlayerAssociations && window.creatureInstances) {
            window.creaturePlayerAssociations.forEach((set, instanceId) => {
                if (!window.creatureInstances.has(instanceId) || !set) return;
                set.forEach(name => {
                    if (nameToIndex.has(name)) {
                        union(`adv_${instanceId}`, `pj_${nameToIndex.get(name)}`);
                    }
                });
            });
        }

        const components = new Map();
        Array.from(parent.keys()).forEach(k => {
            const root = find(k);
            if (!components.has(root)) components.set(root, []);
            components.get(root).push(k);
        });

        const previous = new Map(tokenGroupColors);
        tokenGroupColors.clear();
        const used = new Set();

        components.forEach(members => {
            let color = null;
            for (const m of members) {
                const c = previous.get(m);
                if (c && !used.has(c)) { color = c; break; }
            }
            if (!color) {
                const free = GROUP_COLORS.filter(c => !used.has(c));
                const pool = free.length > 0 ? free : GROUP_COLORS;
                color = pool[Math.floor(Math.random() * pool.length)];
            }
            used.add(color);
            members.forEach(m => tokenGroupColors.set(m, color));
        });
    }

    /**
     * Computes the initial hero layout (by posture arcs) once: heroes that already have a
     * position keep it, tokens are never automatically reorganized afterwards.
     */
    function ensureHeroPositions(postureGroups) {
        Object.keys(postureGroups).forEach((postureKey) => {
            const posture = parseInt(postureKey);
            const heroes = postureGroups[posture].filter(h => !customTokenPositions.has(`pj_${h.playerIndex}`));
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
                customTokenPositions.set(`pj_${hero.playerIndex}`, { x: origX, y: origY });
            });
        });
    }

    /**
     * Updates tokens on all active/visible battlemap containers
     */
    function updateBattlemapTokens() {
        const containers = document.querySelectorAll('.battlemap-container');
        if (containers.length === 0) return;

        // Collect player wrappers and posture groups
        const playerWrappers = Array.from(document.querySelectorAll('.player-wrapper'));
        const postureGroups = { 0: [], 1: [], 2: [], 3: [] };

        playerWrappers.forEach((wrapper) => {
            const playerIndex = parseInt(wrapper.dataset.playerIndex);
            const playerName = wrapper.dataset.playerName;
            const tokenName = wrapper.dataset.token;
            const posture = (window.playerAdvantages && window.playerAdvantages.has(playerIndex))
                ? window.playerAdvantages.get(playerIndex)
                : 0;

            const target = postureGroups[posture] !== undefined ? postureGroups[posture] : postureGroups[0];
            target.push({ playerIndex, name: playerName, token: tokenName, posture: postureGroups[posture] !== undefined ? posture : 0 });
        });

        // Initial layout of the heroes (only for heroes without a position yet)
        ensureHeroPositions(postureGroups);

        // Collect adversaries and their associated heroes
        const advInfos = [];
        if (window.creatureInstances) {
            window.creatureInstances.forEach((creatureInst, instanceId) => {
                const name = creatureInst.getElementsByTagName('nom')[0]?.textContent || `Créature ${instanceId}`;
                const associatedSet = window.creaturePlayerAssociations ? window.creaturePlayerAssociations.get(instanceId) : null;
                const heroIndices = [];
                playerWrappers.forEach(wrapper => {
                    if (associatedSet && associatedSet.has(wrapper.dataset.playerName)) {
                        heroIndices.push(parseInt(wrapper.dataset.playerIndex));
                    }
                });
                advInfos.push({ instanceId, name, heroIndices });
            });
        }

        // Associated adversaries without any position yet: placed once above their first hero
        const fallbackCount = new Map();
        advInfos.forEach(adv => {
            const key = `adv_${adv.instanceId}`;
            if (adv.heroIndices.length > 0 && !customTokenPositions.has(key)) {
                const heroPos = customTokenPositions.get(`pj_${adv.heroIndices[0]}`);
                if (!heroPos) return;
                const n = fallbackCount.get(adv.heroIndices[0]) || 0;
                fallbackCount.set(adv.heroIndices[0], n + 1);
                customTokenPositions.set(key, {
                    x: Math.max(0, Math.min(ORIGINAL_WIDTH, heroPos.x + n * 250)),
                    y: Math.max(0, heroPos.y - 280)
                });
            }
        });

        // Adversaries never placed and not associated: displayed in a single row at the top
        const topRowAdversaries = advInfos.filter(adv =>
            adv.heroIndices.length === 0 && !customTokenPositions.has(`adv_${adv.instanceId}`));

        updateGroupColors(playerWrappers);

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
            const isInline = container.classList.contains('inline-battlemap');

            // Render Hero Tokens
            Object.keys(postureGroups).forEach((postureKey) => {
                const posture = parseInt(postureKey);

                postureGroups[posture].forEach((hero) => {
                    const heroPos = customTokenPositions.get(`pj_${hero.playerIndex}`);
                    if (!heroPos) return;

                    const screenX = heroPos.x * scaleX;
                    const screenY = heroPos.y * scaleY;

                    const tokenEl = document.createElement('div');
                    tokenEl.className = 'battlemap-token';
                    tokenEl.dataset.tokenType = 'pj';
                    tokenEl.dataset.tokenId = hero.playerIndex;
                    const postureStr = window.getPostureText ? window.getPostureText(posture).replace(': ', ' ') : '';
                    tokenEl.title = postureStr ? `${hero.name} - ${postureStr}` : hero.name;
                    tokenEl.style.left = `${screenX}px`;
                    tokenEl.style.top = `${screenY}px`;

                    const groupColor = tokenGroupColors.get(`pj_${hero.playerIndex}`);
                    if (groupColor) {
                        tokenEl.style.border = `3px solid ${groupColor}`;
                    }

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
            const advWidth = isInline ? 25.6 : 40;
            const gap = isInline ? 3.2 : 5;
            const topCount = topRowAdversaries.length;
            let topPitch = advWidth + gap;
            if (topCount > 1) {
                topPitch = Math.min(topPitch, (renderedWidth - advWidth) / (topCount - 1));
            }
            const topStartX = renderedWidth / 2 - ((topCount - 1) * topPitch) / 2;
            const topY = advWidth / 2 + 6;

            advInfos.forEach(adv => {
                const stored = customTokenPositions.get(`adv_${adv.instanceId}`);
                let screenX, screenY;
                if (stored) {
                    screenX = stored.x * scaleX;
                    screenY = stored.y * scaleY;
                } else {
                    const topIndex = topRowAdversaries.indexOf(adv);
                    if (topIndex < 0) return;
                    screenX = topStartX + topIndex * topPitch;
                    screenY = topY;
                }
                renderAdversaryToken(adv, screenX, screenY, container, img, overlay);
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

        if (typeof window.saveCurrentCardInputs === 'function') {
            window.saveCurrentCardInputs();
        }

        const fighterView = document.getElementById('fighterView');
        const isFighterViewVisible = fighterView && fighterView.style.display !== 'none';

        if (isFighterViewVisible) {
            if (type === 'pj' || type === 'hero') {
                const fighterTab = document.querySelector(`.fighter-tab[data-type="hero"][data-player-index="${numericId}"]`);
                if (fighterTab) {
                    fighterTab.click();
                    return;
                }
            } else if (type === 'adversary' || type === 'creature') {
                const fighterTab = document.querySelector(`.fighter-tab[data-type="creature"][data-instance-id="${numericId}"]`);
                if (fighterTab) {
                    fighterTab.click();
                    return;
                }
            }
        }

        // Stage 1 (Engagement View)
        if (type === 'pj' || type === 'hero') {
            document.querySelectorAll('.player-tab, .creature-tab').forEach(tab => tab.classList.remove('active'));
            const playerTab = document.querySelector(`.player-tab[data-player-index="${numericId}"]`);
            if (playerTab) {
                playerTab.classList.add('active');
            }

            let playerInst = window.playerInstances ? window.playerInstances.get(numericId) : null;
            if (!playerInst && window.pjDocumentDoc) {
                const players = window.pjDocumentDoc.getElementsByTagName('Player_Character');
                if (players[numericId]) {
                    playerInst = players[numericId].cloneNode(true);
                    window.playerInstances.set(numericId, playerInst);
                }
            }

            if (playerInst && typeof window.displayPlayerProfile === 'function') {
                window.displayPlayerProfile(playerInst);
            }
        } else if (type === 'adversary' || type === 'creature') {
            document.querySelectorAll('.player-tab, .creature-tab').forEach(tab => tab.classList.remove('active'));
            const creatureTab = document.querySelector(`.creature-tab[data-instance-id="${numericId}"]`);
            let familyName = creatureTab ? creatureTab.dataset.familyName : '';

            if (creatureTab) {
                creatureTab.classList.add('active');
            }

            let creatureInst = window.creatureInstances ? window.creatureInstances.get(numericId) : null;
            if (creatureInst && typeof window.displayCreatureDetails === 'function') {
                window.displayCreatureDetails(creatureInst, familyName, numericId);
            }
        }
    }
    window.showTabForToken = showTabForToken;

    /**
     * Renders a single adversary token on the battlemap overlay
     * (one token per adversary, whatever the number of associated heroes)
     */
    function renderAdversaryToken(adv, screenX, screenY, container, img, overlay) {
        const tokenEl = document.createElement('div');
        tokenEl.className = 'battlemap-token adversary-token';
        tokenEl.dataset.tokenType = 'adversary';
        tokenEl.dataset.tokenId = adv.instanceId;
        tokenEl.dataset.heroIds = adv.heroIndices.join(',');
        tokenEl.title = adv.name;
        tokenEl.style.left = `${screenX}px`;
        tokenEl.style.top = `${screenY}px`;
        tokenEl.style.cursor = 'pointer';

        const color = tokenGroupColors.get(`adv_${adv.instanceId}`);
        if (color) {
            tokenEl.style.border = `3px solid ${color}`;
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'adversary-token-name';
        nameSpan.textContent = adv.name;
        tokenEl.appendChild(nameSpan);

        makeTokenDraggable(tokenEl, 'adversary', adv.instanceId, screenX, screenY, container, img, overlay);

        overlay.appendChild(tokenEl);
    }

    /**
     * Distance test between a dragged token and a hero token (edge to edge, in screen pixels
     * of the overlay being manipulated).
     */
    function isNearHero(tokenEl, heroEl) {
        const dx = parseFloat(tokenEl.style.left) - parseFloat(heroEl.style.left);
        const dy = parseFloat(tokenEl.style.top) - parseFloat(heroEl.style.top);
        const radii = (tokenEl.offsetWidth + heroEl.offsetWidth) / 2;
        return Math.hypot(dx, dy) <= radii + ASSOCIATION_DISTANCE;
    }

    /**
     * Updates the hero associations of an adversary token according to its proximity to heroes.
     * @param {HTMLElement} advEl adversary token element
     * @param {HTMLElement} overlay overlay containing the hero tokens
     * @param {number|null} onlyHeroIndex when set, only checks this hero and only removes the association if far
     * @returns {boolean} true if associations changed
     */
    function updateAdversaryAssociations(advEl, overlay, onlyHeroIndex = null) {
        const instanceId = parseInt(advEl.dataset.tokenId);
        if (isNaN(instanceId)) return false;
        if (!window.creaturePlayerAssociations) window.creaturePlayerAssociations = new Map();
        let set = window.creaturePlayerAssociations.get(instanceId);
        if (!set) {
            set = new Set();
            window.creaturePlayerAssociations.set(instanceId, set);
        }
        const before = Array.from(set).sort().join('|');

        overlay.querySelectorAll('.battlemap-token[data-token-type="pj"]').forEach(heroEl => {
            const heroIdx = parseInt(heroEl.dataset.tokenId);
            if (onlyHeroIndex !== null && heroIdx !== onlyHeroIndex) return;
            const wrapper = document.querySelector(`.player-wrapper[data-player-index="${heroIdx}"]`);
            const heroName = wrapper ? wrapper.dataset.playerName : null;
            if (!heroName) return;

            if (isNearHero(advEl, heroEl)) {
                if (onlyHeroIndex === null) set.add(heroName);
            } else {
                set.delete(heroName);
            }
        });

        return before !== Array.from(set).sort().join('|');
    }

    /**
     * Propagates association changes made in the battlemap to the rest of the UI
     */
    function applyAssociationChanges() {
        if (typeof window.syncCreatureTabsWithAssociations === 'function') {
            window.syncCreatureTabsWithAssociations();
        }
        const creatureCard = document.getElementById('creatureCard');
        if (creatureCard && creatureCard.style.display !== 'none' && creatureCard.dataset.instanceId) {
            const displayedInstanceId = parseInt(creatureCard.dataset.instanceId);
            if (typeof window.updateAssociatedPlayersList === 'function' && !isNaN(displayedInstanceId)) {
                window.updateAssociatedPlayersList(displayedInstanceId);
            }
        }
    }

    /**
     * Makes a battlemap token (hero or adversary) draggable across the image coordinate space
     */
    function makeTokenDraggable(tokenEl, type, id, initialScreenX, initialScreenY, container, img, overlay) {
        let isDragging = false;
        let activePointerId = null;
        let startX = 0, startY = 0;
        let tokenStartX = initialScreenX, tokenStartY = initialScreenY;
        let hasMoved = false;
        let followers = []; // adversaries only associated to the dragged hero, moved together with it

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

            followers = [];
            if (type === 'pj' && overlay) {
                overlay.querySelectorAll('.adversary-token').forEach(advEl => {
                    if (advEl.dataset.heroIds === String(id)) {
                        advEl.style.transition = 'none';
                        followers.push({
                            el: advEl,
                            x: parseFloat(advEl.style.left) || 0,
                            y: parseFloat(advEl.style.top) || 0
                        });
                    }
                });
            }

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

                // Adversaries associated only to this hero follow it
                const appliedDX = currentX - tokenStartX;
                const appliedDY = currentY - tokenStartY;
                followers.forEach(f => {
                    f.el.style.left = `${f.x + appliedDX}px`;
                    f.el.style.top = `${f.y + appliedDY}px`;
                });
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
            followers.forEach(f => { f.el.style.transition = ''; });

            if (!hasMoved) {
                showTabForToken(type, id);
                return;
            }

            if (!img || img.clientWidth === 0 || img.clientHeight === 0) return;

            const scaleX = img.clientWidth / ORIGINAL_WIDTH;
            const scaleY = img.clientHeight / ORIGINAL_HEIGHT;

            const toOrig = (el) => ({
                x: parseFloat(el.style.left) / scaleX,
                y: parseFloat(el.style.top) / scaleY
            });

            if (type === 'pj') {
                const origPos = toOrig(tokenEl);
                customTokenPositions.set(`pj_${id}`, origPos);
                const newPosture = getPostureFromCoords(origPos.x, origPos.y);
                if (window.playerAdvantages) {
                    window.playerAdvantages.set(Number(id), newPosture);
                }

                // Persist the new positions of the adversaries that followed the hero
                followers.forEach(f => {
                    customTokenPositions.set(`adv_${f.el.dataset.tokenId}`, toOrig(f.el));
                });

                // Update indicator elements and card views across the app
                const wrapper = document.querySelector(`.player-wrapper[data-player-index="${id}"]`);
                if (wrapper) {
                    const indicator = wrapper.querySelector('.posture-advantage');
                    if (indicator && typeof window.updatePostureElementStyle === 'function') {
                        window.updatePostureElementStyle(indicator, newPosture);
                    }
                }

                // Adversaries shared with other heroes stay in place: dissociate them from this hero if now too far
                let changed = false;
                if (overlay) {
                    overlay.querySelectorAll('.adversary-token').forEach(advEl => {
                        const heroIds = (advEl.dataset.heroIds || '').split(',').filter(Boolean);
                        if (heroIds.length > 1 && heroIds.includes(String(id))) {
                            if (updateAdversaryAssociations(advEl, overlay, Number(id))) changed = true;
                        }
                    });
                }
                if (changed) applyAssociationChanges();

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
            } else if (type === 'adversary') {
                customTokenPositions.set(`adv_${id}`, toOrig(tokenEl));
                if (overlay) {
                    updateAdversaryAssociations(tokenEl, overlay);
                }
                applyAssociationChanges();
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
    // Battlemap image switching (images "LAU-Stance-Mat*" in images/, alphabetical order)
    let battlemapImages = null;
    let battlemapImageIndex = 0;

    async function loadBattlemapImages() {
        if (battlemapImages) return battlemapImages;
        let list = [];
        try {
            const res = await fetch('images/battlemaps.json', { cache: 'no-cache' });
            if (res.ok) list = await res.json();
        } catch (err) {
            // Fallback below
        }
        list = (Array.isArray(list) ? list : [])
            .filter(f => typeof f === 'string' && f.startsWith('LAU-Stance-Mat'))
            .sort((a, b) => a.localeCompare(b));
        if (list.length === 0) list = ['LAU-Stance-Mat-Grass.jpg'];
        battlemapImages = list;

        const currentName = decodeURIComponent((document.querySelector('.battlemap-image')?.getAttribute('src') || '').split('/').pop());
        const idx = list.indexOf(currentName);
        battlemapImageIndex = idx >= 0 ? idx : 0;
        return list;
    }

    async function switchBattlemapImage() {
        const list = await loadBattlemapImages();
        battlemapImageIndex = (battlemapImageIndex + 1) % list.length;
        const src = `images/${encodeURIComponent(list[battlemapImageIndex])}`;
        document.querySelectorAll('.battlemap-image').forEach(img => {
            img.src = src;
        });
    }
    window.switchBattlemapImage = switchBattlemapImage;

    window.addEventListener('DOMContentLoaded', initBattlemapWindow);
})();
