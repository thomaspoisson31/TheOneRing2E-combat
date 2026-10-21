let creatureCounter = 0;
let creatureInstances = window.creatureInstances || new Map();
window.creatureInstances = creatureInstances; // Stockage des instances d'adversaires
let creaturePlayerAssociations = window.creaturePlayerAssociations || new Map();
window.creaturePlayerAssociations = creaturePlayerAssociations; // Stockage des associations adversaire-PJ (Set)
let creatureInstanceAdvantages = window.creatureInstanceAdvantages || new Map();
window.creatureInstanceAdvantages = creatureInstanceAdvantages;
window.dragPlaceholder = document.createElement('div');
window.dragPlaceholder.className = 'drop-placeholder';

function cycleInstanceAdvantage(instanceId) {
    const currentValue = creatureInstanceAdvantages.get(instanceId) || 0;
    // Cycle: 1 -> 0 -> -1 -> 2 -> 1 (+1D -> 0 -> -1D -> Distance -> +1D)
    let newValue;
    if (currentValue === 1) newValue = 0;
    else if (currentValue === 0) newValue = -1;
    else if (currentValue === -1) newValue = 2;
    else newValue = 1;

    creatureInstanceAdvantages.set(instanceId, newValue);

    const tabElement = document.querySelector(`.creature-tab[data-instance-id="${instanceId}"]`);
    if (tabElement) {
        const indicator = tabElement.querySelector('.advantage-indicator');
        if (indicator && typeof getAdvantageText === 'function') {
            indicator.textContent = getAdvantageText(newValue);
            // Classes pour le style
            indicator.className = 'advantage-indicator';
            if (newValue === 1) indicator.classList.add('positive');
            if (newValue === -1) indicator.classList.add('negative');
            if (newValue === 2) indicator.classList.add('distance');
        }
    }
}

function displayCreature(creature, familyName, resetSelect = true) {
    creatureCounter++;
    const instanceId = creatureCounter;
    
    const creatureInstance = creature.cloneNode(true);
    creatureInstances.set(instanceId, creatureInstance);

    const tabElement = document.createElement('div');
    tabElement.className = 'creature-tab';
    tabElement.dataset.instanceId = instanceId;
    tabElement.dataset.familyName = familyName;



    // --- ACTIVATION DRAG & DROP SUR L'ONGLET CRÉATURE ---
    tabElement.setAttribute('draggable', true);

    tabElement.addEventListener('dragstart', (e) => {
        tabElement.classList.add('dragging-creature');
        e.stopPropagation(); 
        e.dataTransfer.setData('text/plain', instanceId);
        e.dataTransfer.effectAllowed = 'move';
    });

    tabElement.addEventListener('dragend', (e) => {
        tabElement.classList.remove('dragging-creature');
        if (window.dragPlaceholder && window.dragPlaceholder.parentNode) {
            window.dragPlaceholder.parentNode.removeChild(window.dragPlaceholder);
        }
        e.stopPropagation();
    });

    // Support du drop de PJs sur la créature pour association
    tabElement.addEventListener('dragover', (e) => {
        const draggingPlayer = document.querySelector('.player-wrapper.dragging');
        if (draggingPlayer) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy'; // Indique une association
        }
    });

    tabElement.addEventListener('drop', (e) => {
        const draggingPlayer = document.querySelector('.player-wrapper.dragging');
        if (draggingPlayer) {
            e.preventDefault();
            e.stopPropagation();
            const playerName = draggingPlayer.dataset.playerName;
            if (playerName) {
                // If dropping a PJ on a creature tab, we need to create a visual clone
                // in the dropped PJ's opponents list, unless it's already there
                // Since draggingPlayer is .player-wrapper.dragging, .pj-opponents is inside it.
                const pjOpponents = draggingPlayer.querySelector('.pj-opponents');

                if (!pjOpponents) return; // safety check

                // check if it's already associated visually
                const existingAssoc = pjOpponents.querySelector(`.creature-tab[data-instance-id="${instanceId}"]`);
                if (!existingAssoc) {
                    const clonedTab = tabElement.cloneNode(true);
                    clonedTab.classList.add('secondary');

                    // We need to reattach dragging logic to the clone
                    clonedTab.addEventListener('dragstart', (ev) => {
                        clonedTab.classList.add('dragging-creature');
                        ev.stopPropagation();
                        ev.dataTransfer.setData('text/plain', instanceId);
                        ev.dataTransfer.effectAllowed = 'move';
                    });
                    clonedTab.addEventListener('dragend', (ev) => {
                        clonedTab.classList.remove('dragging-creature');
                        if (window.dragPlaceholder && window.dragPlaceholder.parentNode) {
                            window.dragPlaceholder.parentNode.removeChild(window.dragPlaceholder);
                        }
                        ev.stopPropagation();
                    });

                    clonedTab.addEventListener('click', function(ev) {
                        ev.stopPropagation();
                        document.querySelectorAll('.player-tab, .creature-tab').forEach(tab =>
                            tab.classList.remove('active')
                        );
                        clonedTab.classList.add('active');
                        const creatureInstance = creatureInstances.get(instanceId);
                        if (creatureInstance) {
                            displayCreatureDetails(creatureInstance, familyName, instanceId);
                        }
                    });

                    pjOpponents.appendChild(clonedTab);
                    associatePlayer(instanceId, playerName);
                }
            }
        }
    });
    // ----------------------------------------------------

    // Créer le conteneur pour le contenu de l'onglet
    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';
    
    // Afficher le nom en petits caractères
    const name = creature.getElementsByTagName('nom')[0]?.textContent || `${instanceId}`;
    tabContent.innerHTML = `<span class="creature-tab-name">${name}</span>`;

    tabElement.appendChild(tabContent);
    
    tabElement.addEventListener('click', function() {
        // Désélectionner tous les onglets
        document.querySelectorAll('.player-tab, .creature-tab').forEach(tab => 
            tab.classList.remove('active')
        );
        
        this.classList.add('active');
        
        const instId = parseInt(this.dataset.instanceId);
        const instance = creatureInstances.get(instId);
        if (instance) {
            displayCreatureDetails(instance, this.dataset.familyName, instId);
            updateSoundIconVisibility(this.dataset.familyName);
        }

    });
    
    const targetContainer = document.getElementById('creatureTabs');
    if (targetContainer) {
        targetContainer.appendChild(tabElement);
    }
    tabElement.click();

    if (typeof performRandomAssociation === 'function') {
        performRandomAssociation();
    } else if (typeof updateRandomAssociationButtonVisibility === 'function') {
        updateRandomAssociationButtonVisibility();
    }
    if (typeof window.updateBattlemapTokens === 'function') {
        window.updateBattlemapTokens();
    }
}

function loadPlayerCharacters() {
    fetch('data/PJ.xml')
        .then(response => response.text())
        .then(str => {
            const parser = new DOMParser();
            const pjDoc = parser.parseFromString(str, "text/xml");
            window.playerCharacters = Array.from(pjDoc.getElementsByTagName('Player_Character'))
                .map((pc, index) => {
                    const nameElement = pc.getElementsByTagName('Name')[0];
                    const parryElement = pc.getElementsByTagName('Parry')[0];
                    const tokenElement = pc.getElementsByTagName('token')[0];
                    if (nameElement && parryElement) {
                        return {
                            name: nameElement.textContent,
                            parry: parryElement.textContent,
                            token: tokenElement ? tokenElement.textContent : null,
                            index: index
                        };
                    }
                    return null;
                })
                .filter(pc => pc !== null);
        })
        .catch(error => console.error('Erreur lors du chargement des PJ:', error));
}

function updateAssociatedPlayersList(instanceId) {
    const listContainer = document.getElementById('opponent-cartouche-container');
    if (!listContainer) return;
    const cardInstanceId = parseInt(creatureCard.dataset.instanceId);
    if (creatureCard.style.display === 'none' || (cardInstanceId !== instanceId && !isNaN(cardInstanceId) && !isNaN(instanceId))) return;

    const playersSet = creaturePlayerAssociations.get(instanceId);
    
    if (!playersSet || playersSet.size === 0) {
        listContainer.innerHTML = '';
        return;
    }

    let html = '';
    playersSet.forEach(playerName => {
        const staticPC = window.playerCharacters ? window.playerCharacters.find(pc => pc.name === playerName) : null;
        const parry = staticPC ? staticPC.parry : '?';
        const token = staticPC ? staticPC.token : null;
        const playerIndex = staticPC ? staticPC.index : null;

        let advantageText = 'EXPOSE';
        let advantageClass = 'posture-expose';

        if (playerIndex !== null && window.playerAdvantages) {
            const advValue = window.playerAdvantages.get(playerIndex) || 0;
            advantageText = typeof getPostureText === 'function' ? getPostureText(advValue) : 'EXPOSE';
            switch (advValue) {
                case 0: advantageClass = 'posture-expose'; break;
                case 1: advantageClass = 'posture-avance'; break;
                case 2: advantageClass = 'posture-arriere'; break;
                case 3: advantageClass = 'posture-defensif'; break;
                default: advantageClass = 'posture-expose'; break;
            }
        }

        html += `
            <div class="opponent-cartouche">
                ${token ? `<img src="images/PJ/${token}.png" alt="${playerName}" class="opponent-token">` : ''}
                <div class="opponent-content">
                    <div class="opponent-info">
                        <span class="opponent-name">${playerName}</span>
                        <span class="opponent-stats">Parade: ${parry}</span>
                    </div>
                    <div class="opponent-badge-row">
                        <span class="advantage-badge ${advantageClass}">${advantageText}</span>
                    </div>
                </div>
                <button class="icon-button delete-icon-small" onclick="dissociatePlayer(${instanceId}, '${playerName.replace(/'/g, "\\'")}')" title="Dissocier">×</button>
            </div>
        `;
    });
    listContainer.innerHTML = html;
}

function updateInstanceValue(instanceId, field, value) {
    const instance = creatureInstances.get(instanceId);
    if (instance) {
        const attributs = instance.getElementsByTagName('attributs')[0];
        const element = attributs.getElementsByTagName(field)[0];
        if (element) {
            element.textContent = value;
        }
    }
}

function adjustCreatureStat(instanceId, field, delta) {
    const inputId = `creature-${field}-${instanceId}`;
    const input = document.getElementById(inputId);
    if (input) {
        const currentValue = parseInt(input.value) || 0;
        const newValue = currentValue + delta;
        input.value = newValue;
        updateInstanceValue(instanceId, field, newValue);
    }
}

function getFamilyCapacities(familyName) {
    const famille = Array.from(xmlDoc.getElementsByTagName('famille'))
        .find(f => f.getAttribute('nom') === familyName);
    
    if (!famille) return [];
    
    const capacites = Array.from(famille.children)
        .find(child => child.tagName === 'capacites_famille');
    
    if (!capacites) return [];
    
    return Array.from(capacites.getElementsByTagName('capacite'));
}

function displayCreatureDetails(creature, familyName, instanceId = null) {
    if (typeof prepareCardContainerForStage1 === 'function') {
        prepareCardContainerForStage1();
    }
    if (typeof saveCurrentCardInputs === 'function') {
        saveCurrentCardInputs();
    }

    if (!instanceId || isNaN(instanceId)) {
        const fighterTab = document.querySelector('.fighter-tab.active[data-type="creature"]');
        if (fighterTab) {
            instanceId = parseInt(fighterTab.dataset.instanceId);
        } else {
            const creatureTab = document.querySelector('.creature-tab.active');
            if (creatureTab) {
                instanceId = parseInt(creatureTab.dataset.instanceId);
            }
        }
    }
    if ((!instanceId || isNaN(instanceId)) && window.creatureInstances) {
        for (const [id, inst] of window.creatureInstances.entries()) {
            if (inst === creature) {
                instanceId = id;
                break;
            }
        }
    }
    instanceId = parseInt(instanceId);

    if (!isNaN(instanceId) && window.creatureInstances && window.creatureInstances.has(instanceId)) {
        creature = window.creatureInstances.get(instanceId);
    }

    const name = creature.getElementsByTagName('nom')[0].textContent;
    const imageUrl = typeof getAdversaryImagePath === 'function' ? getAdversaryImagePath(name) : '';

    const currentAdvantage = creatureInstanceAdvantages.get(instanceId) || 0;
    const advantageText = typeof getAdvantageText === 'function' ? getAdvantageText(currentAdvantage) : '0';
    let advantageClass = 'neutral';
    if (currentAdvantage === 1 || currentAdvantage === 2) advantageClass = 'positive';
    else if (currentAdvantage === -1 || currentAdvantage === -2) advantageClass = 'negative';

    const engagementView = document.getElementById('engagementView');
    const isStage1 = engagementView && engagementView.style.display !== 'none';

    let html = `
        ${isStage1 ? '<button class="card-delete-btn" onclick="closeStage1Card()" title="Fermer">×</button>' : ''}
        <div class="creature-header">
            <div class="creature-title">
                <div class="creature-title-left">
                    <span class="creature-name" onclick="showImage('${imageUrl}')">${name}</span>
                    <div class="creature-subtitle-row">
                        <img src="images/sound-icon.png" alt="Son" class="sound-icon" id="soundIcon">
                        <div class="combat-modifier-badge ${advantageClass}" onclick="cycleCreatureCombatAdvantageInCard(${instanceId})" title="Modificateur de combat">${advantageText}</div>
                    </div>
                </div>
                <div class="creature-title-right">
                    <div id="opponent-cartouche-container" class="opponent-cartouche-container"></div>
                </div>
            </div>
        </div>`;

    // Attributs
    const attributs = creature.getElementsByTagName('attributs')[0];
    const endurance = attributs.getElementsByTagName('endurance')[0].textContent;
    const haine = attributs.getElementsByTagName('haine')[0].textContent;

    // Stats
    html += '<div class="stats-grid">';
    
    // Ligne 1: Niveau, Parade, Armure
    html += '<div class="stats-row stats-row-top">';
    html += `
        <div class="stat-diamond">
            <img src="images/diamond.png" alt="diamond">
            <div class="stat-label">Niveau</div>
            <div class="stat-value">${attributs.getElementsByTagName('niveau')[0].textContent}</div>
        </div>`;
    
    html += `
        <div class="stat-diamond">
            <img src="images/diamond.png" alt="diamond">
            <div class="stat-label">Parade</div>
            <div class="stat-value">${attributs.getElementsByTagName('parade')[0].textContent}</div>
        </div>`;
    
    html += `
        <div class="stat-diamond">
            <img src="images/diamond.png" alt="diamond">
            <div class="stat-label">Armure</div>
            <div class="stat-value">${attributs.getElementsByTagName('armure')[0].textContent}</div>
        </div>`;
    html += '</div>';

    // Ligne 2: Endurance, Haine
    html += '<div class="stats-row stats-row-bottom">';
    html += `
        <div class="stat-wrapper">
            <button class="stat-btn" onclick="adjustCreatureStat(${instanceId}, 'endurance', -1)">-</button>
            <div class="stat-diamond">
                <img src="images/diamond.png" alt="diamond">
                <div class="stat-label">Endurance</div>
                <input type="number" 
                    value="${endurance}" 
                    class="stat-input"
                    id="creature-endurance-${instanceId}"
                    oninput="updateInstanceValue(${instanceId}, 'endurance', this.value)"
                    onchange="updateInstanceValue(${instanceId}, 'endurance', this.value)">
            </div>
            <button class="stat-btn" onclick="adjustCreatureStat(${instanceId}, 'endurance', 1)">+</button>
        </div>`;
    
    html += `
        <div class="stat-wrapper">
            <button class="stat-btn" onclick="adjustCreatureStat(${instanceId}, 'haine', -1)">-</button>
            <div class="stat-diamond">
                <img src="images/diamond.png" alt="diamond">
                <div class="stat-label">Haine</div>
                <input type="number" 
                    value="${haine}" 
                    class="stat-input"
                    id="creature-haine-${instanceId}"
                    oninput="updateInstanceValue(${instanceId}, 'haine', this.value)"
                    onchange="updateInstanceValue(${instanceId}, 'haine', this.value)">
            </div>
            <button class="stat-btn" onclick="adjustCreatureStat(${instanceId}, 'haine', 1)">+</button>
        </div>`;
    html += '</div>';
    
    html += '</div>';

    // Compétences et capacités
    html += '<div class="details-grid">';

    // Compétences de combat
    const competences = creature.getElementsByTagName('competences_combat')[0];
    const puissance = attributs.getElementsByTagName('puissance')[0].textContent;
    
    if (competences.getElementsByTagName('arme').length > 0) {
        html += '<div class="combat-skills">';
        html += '<div class="combat-header">';
        html += '<h3>Combat</h3>';
        if (parseInt(puissance) >= 2) {
            html += `<span class="puissance-badge">${puissance}</span>`;
        }
        html += '</div><ul>';
        
        for (let arme of competences.getElementsByTagName('arme')) {
            const nomArme = arme.getElementsByTagName('nom_arme')[0]?.textContent || '';
            const valeurArme = parseInt(arme.getElementsByTagName('valeur_arme')[0]?.textContent || '0');
            const degatsArme = arme.getElementsByTagName('degats_arme')[0]?.textContent || '';
            const specialArme = arme.getElementsByTagName('special_arme')[0]?.textContent || '';

            const diamonds = '&#9830;'.repeat(valeurArme);

            html += `<li>
                <div class="weapon-line1">
                    <span class="weapon-name">${nomArme}</span>
                    <span class="weapon-value">${diamonds}</span>
                </div>
                <div class="weapon-line2">
                    <span class="weapon-degats">(${degatsArme})</span>
                    ${specialArme ? `<span class="weapon-special" onclick="toggleSpecialDetails(this)">${specialArme}</span>
                    <div class="weapon-special-details">${specialDescriptions[specialArme] || ''}</div>` : ''}
                </div>
            </li>`;
        }
        html += '</ul></div>';
    }

    // Capacités
    const creatureCapacites = creature.getElementsByTagName('capacites')[0];
    const familyCapacites = getFamilyCapacities(familyName);
    
    if ((creatureCapacites?.getElementsByTagName('capacite').length > 0) || familyCapacites.length > 0) {
        html += '<div class="capacites"><h3>Capacités</h3>';
        
        if (creatureCapacites) {
            for (let capacite of creatureCapacites.getElementsByTagName('capacite')) {
                const titre = capacite.getElementsByTagName('Titre_Capacite')[0].textContent;
                const details = capacite.getElementsByTagName('Detail_Capacite')[0].textContent;
                html += `
                    <div class="capacite-item" onclick="toggleDetails(this)">
                        <strong>${titre}</strong>
                        <div class="details">${details}</div>
                    </div>`;
            }
        }
        
        for (let capacite of familyCapacites) {
            const titre = capacite.getElementsByTagName('Titre_Capacite')[0].textContent;
            const details = capacite.getElementsByTagName('Detail_Capacite')[0].textContent;
            html += `
                <div class="capacite-item" onclick="toggleDetails(this)">
                    <strong>${titre}</strong>
                    <div class="details">${details}</div>
                </div>`;
            }
        
        html += '</div>';
    }

    html += `<button class="icon-button card-bottom-left-btn" id="runeButton" onclick="triggerRuneEvent()" title="Avantages"><img src="images/Rune.png" alt="Rune"></button>`;

    creatureCard.dataset.instanceId = instanceId;
    creatureCard.innerHTML = html;
    creatureCard.style.display = 'block';
    
    // Mettre à jour la liste des joueurs associés
    updateAssociatedPlayersList(instanceId);
}

function associatePlayer(instanceId, playerName) {
    if (!creaturePlayerAssociations.has(instanceId)) {
        creaturePlayerAssociations.set(instanceId, new Set());
    }
    creaturePlayerAssociations.get(instanceId).add(playerName);
    updateAssociatedPlayersList(instanceId);
    if (typeof updateRandomAssociationButtonVisibility === 'function') {
        updateRandomAssociationButtonVisibility();
    }
    if (typeof window.updateBattlemapTokens === 'function') {
        window.updateBattlemapTokens();
    }
}

function dissociatePlayer(instanceId, playerName) {
    if (creaturePlayerAssociations.has(instanceId)) {
        creaturePlayerAssociations.get(instanceId).delete(playerName);
        updateAssociatedPlayersList(instanceId);
    }
    if (typeof updateRandomAssociationButtonVisibility === 'function') {
        updateRandomAssociationButtonVisibility();
    }
    if (typeof window.updateBattlemapTokens === 'function') {
        window.updateBattlemapTokens();
    }
}

function deleteCreature(instanceId) {
    const tabElements = document.querySelectorAll(`.creature-tab[data-instance-id="${instanceId}"]`);
    tabElements.forEach(tab => tab.remove());

    creatureInstances.delete(instanceId);
    creaturePlayerAssociations.delete(instanceId);
    creatureCard.style.display = 'none';

    if (typeof updateRandomAssociationButtonVisibility === 'function') {
        updateRandomAssociationButtonVisibility();
    }
    if (typeof window.updateBattlemapTokens === 'function') {
        window.updateBattlemapTokens();
    }
}

// Charger les PJ au démarrage
window.addEventListener('DOMContentLoaded', loadPlayerCharacters);

function cycleCreatureCombatAdvantageInCard(instanceId) {
    const currentValue = creatureInstanceAdvantages.get(instanceId) || 0;
    const newValue = typeof getNextCombatAdvantageValue === 'function' ? getNextCombatAdvantageValue(currentValue) : 0;
    creatureInstanceAdvantages.set(instanceId, newValue);

    const badge = document.querySelector('.combat-modifier-badge');
    if (badge) {
        badge.textContent = typeof getAdvantageText === 'function' ? getAdvantageText(newValue) : '0';
        badge.classList.remove('positive', 'negative', 'neutral');
        if (newValue === 1 || newValue === 2) badge.classList.add('positive');
        else if (newValue === -1 || newValue === -2) badge.classList.add('negative');
        else badge.classList.add('neutral');
    }
}

window.associatePlayer = associatePlayer;
window.dissociatePlayer = dissociatePlayer;
window.cycleCreatureCombatAdvantageInCard = cycleCreatureCombatAdvantageInCard;
