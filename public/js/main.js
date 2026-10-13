// Variables globales pour PJ
let pjDocumentDoc = null;

// Chargement initial du XML et population de la liste
window.addEventListener('DOMContentLoaded', function () {
    // Charger le fichier XML des adversaires
    fetch('data/Adversaires2.xml')
        .then(response => response.text())
        .then(str => {
            const parser = new DOMParser();
            xmlDoc = parser.parseFromString(str, "text/xml");
            populateCreatureSelect();
        })
        .catch(error => {
            console.error('Erreur lors du chargement du fichier XML:', error);
            alert('Erreur lors du chargement du fichier XML');
        });

    // Charger le fichier XML des PJ
    fetch('data/PJ.xml')
        .then(response => response.text())
        .then(str => {
            const parser = new DOMParser();
            pjDocumentDoc = parser.parseFromString(str, "text/xml");
            createPlayerTabs(pjDocumentDoc);
        })
        .catch(error => {
            console.error('Erreur lors du chargement des PJ:', error);
        });

    // Écouteurs de défilement pour les flèches d'onglets
    const container = document.getElementById('fighterTabsContainer');
    if (container) {
        container.addEventListener('scroll', checkTabScrollArrows);
    }
    window.addEventListener('resize', checkTabScrollArrows);
});

function calculateInitiative() {
    // Retirer les anciennes pastilles d'initiative
    document.querySelectorAll('.initiative-badge').forEach(badge => badge.remove());

    const playerWrappers = Array.from(document.querySelectorAll('.player-wrapper'));
    if (playerWrappers.length === 0) return [];

    // Enregistrer les positions initiales pour l'animation FLIP
    const firstPositions = new Map();
    playerWrappers.forEach(wrapper => {
        firstPositions.set(wrapper, wrapper.getBoundingClientRect());
    });

    const totalHeroes = playerWrappers.length;

    const getPosturePriority = (wrapper) => {
        const playerIndex = parseInt(wrapper.dataset.playerIndex);
        const postureValue = window.playerAdvantages ? (window.playerAdvantages.get(playerIndex) ?? 0) : 0;
        // Posture values: 1: AVANCE, 0: EXPOSE, 3: DEFENSIF, 2: ARRIERE
        switch (postureValue) {
            case 1: return 1; // AVANCE
            case 0: return 2; // EXPOSE
            case 3: return 3; // DEFENSIF
            case 2: return 4; // ARRIERE
            default: return 2;
        }
    };

    // Préparer les données des héros
    const heroData = playerWrappers.map((wrapper, domIndex) => {
        const wits = parseInt(wrapper.dataset.wits) || 0;
        const priority = getPosturePriority(wrapper);
        return { wrapper, wits, priority, domIndex };
    });

    // Trier les héros : 1) priorité de posture (croissant), 2) Esprit (décroissant), 3) ordre DOM (croissant)
    heroData.sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        if (b.wits !== a.wits) {
            return b.wits - a.wits;
        }
        return a.domIndex - b.domIndex;
    });

    // Réordonner les héros dans le DOM
    const playerTabsContainer = document.querySelector('.player-tabs');

    heroData.forEach((hero) => {
        if (playerTabsContainer) {
            playerTabsContainer.appendChild(hero.wrapper);
        }
    });

    const orderedFighters = [];

    // Attribuer l'initiative aux héros
    heroData.forEach((hero, sortedIndex) => {
        const heroRank = sortedIndex + 1;
        const playerIndex = parseInt(hero.wrapper.dataset.playerIndex);
        const playerTab = hero.wrapper.querySelector('.player-tab');
        if (playerTab) {
            const tabContent = playerTab.querySelector('.tab-content') || playerTab;
            const badge = document.createElement('span');
            badge.className = 'initiative-badge';
            badge.textContent = heroRank;
            tabContent.appendChild(badge);
        }

        orderedFighters.push({
            type: 'hero',
            playerIndex: playerIndex,
            name: hero.wrapper.dataset.playerName,
            token: hero.wrapper.dataset.token,
            rank: heroRank
        });
    });

    // Attribuer l'initiative aux adversaires engagés
    heroData.forEach((hero, sortedIndex) => {
        const heroRank = sortedIndex + 1;
        const opponentTabs = hero.wrapper.querySelectorAll('.pj-opponents .creature-tab');
        const opponentRank = heroRank + totalHeroes;
        opponentTabs.forEach(creatureTab => {
            const instanceId = parseInt(creatureTab.dataset.instanceId);
            const tabContent = creatureTab.querySelector('.tab-content') || creatureTab;
            const badge = document.createElement('span');
            badge.className = 'initiative-badge';
            badge.textContent = opponentRank;
            tabContent.appendChild(badge);

            const creatureInstance = window.creatureInstances ? window.creatureInstances.get(instanceId) : null;
            const creatureName = creatureInstance?.getElementsByTagName('nom')[0]?.textContent || creatureTab.innerText;
            const urlImage = typeof getAdversaryImagePath === 'function' ? getAdversaryImagePath(creatureName) : '';

            orderedFighters.push({
                type: 'creature',
                instanceId: instanceId,
                familyName: creatureTab.dataset.familyName,
                name: creatureName,
                imageUrl: urlImage,
                rank: opponentRank
            });
        });
    });

    // Ajouter les créatures non engagées à la fin
    const unassignedTabs = getUnassignedCreatureTabs();
    unassignedTabs.forEach(creatureTab => {
        const instanceId = parseInt(creatureTab.dataset.instanceId);
        const creatureInstance = window.creatureInstances ? window.creatureInstances.get(instanceId) : null;
        const creatureName = creatureInstance?.getElementsByTagName('nom')[0]?.textContent || creatureTab.innerText;
        const urlImage = typeof getAdversaryImagePath === 'function' ? getAdversaryImagePath(creatureName) : '';

        orderedFighters.push({
            type: 'creature',
            instanceId: instanceId,
            familyName: creatureTab.dataset.familyName,
            name: creatureName,
            imageUrl: urlImage,
            rank: 99
        });
    });

    // Animation FLIP
    requestAnimationFrame(() => {
        heroData.forEach((hero) => {
            const wrapper = hero.wrapper;
            const firstPos = firstPositions.get(wrapper);
            if (!firstPos) return;

            const lastPos = wrapper.getBoundingClientRect();
            const deltaX = firstPos.left - lastPos.left;
            const deltaY = firstPos.top - lastPos.top;

            if (deltaX !== 0 || deltaY !== 0) {
                wrapper.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                wrapper.style.transition = 'none';

                requestAnimationFrame(() => {
                    wrapper.offsetHeight; // Force reflow
                    wrapper.style.transition = 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)';
                    wrapper.style.transform = '';
                });

                const onTransitionEnd = () => {
                    wrapper.style.transition = '';
                    wrapper.removeEventListener('transitionend', onTransitionEnd);
                };
                wrapper.addEventListener('transitionend', onTransitionEnd);
            }
        });
    });

    return orderedFighters;
}

window.calculateInitiative = calculateInitiative;

function validateEngagement() {
    const orderedFighters = calculateInitiative();
    const uniqueFighters = buildFighterTabs(orderedFighters);
    if (uniqueFighters && uniqueFighters.length > 0) {
        selectFighterTab(uniqueFighters[0]);
    } else {
        switchTab('engagement');
    }
}
window.validateEngagement = validateEngagement;

let currentFighterList = [];

function buildFighterTabs(orderedFighters) {
    const container = document.getElementById('fighterTabsContainer');
    if (!container) return [];

    container.innerHTML = '';

    const seen = new Set();
    const uniqueFighters = [];
    (orderedFighters || []).forEach(fighter => {
        const key = fighter.type === 'hero' ? `hero_${fighter.playerIndex}` : `creature_${fighter.instanceId}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueFighters.push(fighter);
        }
    });

    currentFighterList = uniqueFighters;

    uniqueFighters.forEach(fighter => {
        const tabBtn = document.createElement('button');
        tabBtn.className = 'fighter-tab';

        if (fighter.type === 'hero') {
            tabBtn.dataset.type = 'hero';
            tabBtn.dataset.playerIndex = fighter.playerIndex;

            if (fighter.token) {
                const img = document.createElement('img');
                img.src = `images/PJ/${fighter.token}.png`;
                img.alt = fighter.name;
                img.className = 'fighter-tab-token';
                tabBtn.appendChild(img);
            } else {
                const nameSpan = document.createElement('span');
                nameSpan.className = 'fighter-tab-name';
                nameSpan.textContent = fighter.name;
                tabBtn.appendChild(nameSpan);
            }
        } else {
            tabBtn.dataset.type = 'creature';
            tabBtn.dataset.instanceId = fighter.instanceId;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'fighter-tab-name';
            nameSpan.textContent = fighter.name || `Créature ${fighter.instanceId}`;
            tabBtn.appendChild(nameSpan);
        }

        tabBtn.addEventListener('click', () => {
            selectFighterTab(fighter);
        });

        container.appendChild(tabBtn);
    });

    checkTabScrollArrows();
    return uniqueFighters;
}

function switchTab(tabType, fighterData = null) {
    if (typeof saveCurrentCardInputs === 'function') {
        saveCurrentCardInputs();
    }
    const engagementTab = document.getElementById('engagementTab');
    const engagementView = document.getElementById('engagementView');
    const fighterView = document.getElementById('fighterView');

    // Retirer toutes les croix de suppression sur les onglets
    document.querySelectorAll('.tab-delete-btn').forEach(btn => btn.remove());

    if (tabType === 'engagement') {
        if (engagementTab) engagementTab.classList.add('active');
        document.querySelectorAll('.fighter-tab').forEach(tab => tab.classList.remove('active'));

        if (engagementView) engagementView.style.display = 'block';
        if (fighterView) fighterView.style.display = 'none';
    } else if (tabType === 'fighter' && fighterData) {
        if (engagementTab) engagementTab.classList.remove('active');
        if (engagementView) engagementView.style.display = 'none';
        if (fighterView) fighterView.style.display = 'block';

        selectFighterTab(fighterData);
    }
}
window.switchTab = switchTab;

function selectFighterTab(fighter) {
    if (typeof saveCurrentCardInputs === 'function') {
        saveCurrentCardInputs();
    }
    const engagementTab = document.getElementById('engagementTab');
    const engagementView = document.getElementById('engagementView');
    const fighterView = document.getElementById('fighterView');

    if (engagementTab) engagementTab.classList.remove('active');
    if (engagementView) engagementView.style.display = 'none';
    if (fighterView) fighterView.style.display = 'block';

    // Retirer 'active' et la croix 'x' de tous les onglets
    document.querySelectorAll('.fighter-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-delete-btn').forEach(btn => btn.remove());

    // Trouver l'élément d'onglet correspondant
    let targetTab = null;
    if (fighter.type === 'hero') {
        targetTab = document.querySelector(`.fighter-tab[data-type="hero"][data-player-index="${fighter.playerIndex}"]`);
    } else {
        targetTab = document.querySelector(`.fighter-tab[data-type="creature"][data-instance-id="${fighter.instanceId}"]`);
    }

    if (targetTab) {
        targetTab.classList.add('active');

        // Ajouter la croix de suppression rouge foncé (Précision 2)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tab-delete-btn';
        deleteBtn.title = 'Supprimer';
        deleteBtn.textContent = '×';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteActiveFighter(fighter);
        });
        targetTab.appendChild(deleteBtn);
    }

    // Mettre à jour l'illustration de gauche
    const imgContainer = document.getElementById('fighterImageContainer');
    const imgEl = document.getElementById('fighterIllustrationImg');

    if (imgContainer) {
        imgContainer.style.display = '';
    }

    if (fighter.type === 'hero') {
        if (imgEl && fighter.token) {
            imgEl.onerror = () => {
                if (imgContainer) imgContainer.style.visibility = 'hidden';
                imgEl.style.display = 'none';
            };
            if (imgContainer) imgContainer.style.visibility = 'visible';
            imgEl.style.display = 'block';
            imgEl.src = `images/PJ/${fighter.token}.png`;
            imgEl.alt = fighter.name;
        } else if (imgContainer) {
            if (imgEl) {
                imgEl.onerror = null;
                imgEl.src = '';
                imgEl.alt = '';
                imgEl.style.display = 'none';
            }
            imgContainer.style.visibility = 'hidden';
        }

        // Afficher le profil du héros
        let playerInst = window.playerInstances ? window.playerInstances.get(fighter.playerIndex) : null;
        if (!playerInst && pjDocumentDoc) {
            const players = pjDocumentDoc.getElementsByTagName('Player_Character');
            if (players[fighter.playerIndex]) {
                playerInst = players[fighter.playerIndex].cloneNode(true);
                window.playerInstances.set(fighter.playerIndex, playerInst);
            }
        }
        if (playerInst && typeof displayPlayerProfile === 'function') {
            displayPlayerProfile(playerInst);
        }
    } else {
        const creatureInstance = window.creatureInstances ? window.creatureInstances.get(fighter.instanceId) : null;
        const creatureName = creatureInstance?.getElementsByTagName('nom')[0]?.textContent || fighter.name;
        const urlImage = typeof getAdversaryImagePath === 'function' ? getAdversaryImagePath(creatureName) : fighter.imageUrl;

        if (imgEl && urlImage) {
            imgEl.onerror = () => {
                if (imgContainer) imgContainer.style.visibility = 'hidden';
                imgEl.style.display = 'none';
            };
            if (imgContainer) imgContainer.style.visibility = 'visible';
            imgEl.style.display = 'block';
            imgEl.src = urlImage;
            imgEl.alt = fighter.name;
        } else if (imgContainer) {
            if (imgEl) {
                imgEl.onerror = null;
                imgEl.src = '';
                imgEl.alt = '';
                imgEl.style.display = 'none';
            }
            imgContainer.style.visibility = 'hidden';
        }

        if (creatureInstance && typeof displayCreatureDetails === 'function') {
            displayCreatureDetails(creatureInstance, fighter.familyName, fighter.instanceId);
        }
    }
}
window.selectFighterTab = selectFighterTab;

function deleteActiveFighter(fighter) {
    if (fighter.type === 'hero') {
        if (typeof deletePlayer === 'function') {
            deletePlayer(fighter.playerIndex);
        }
    } else {
        if (typeof deleteCreature === 'function') {
            deleteCreature(fighter.instanceId);
        }
    }

    // Reconstruire les onglets et basculer
    const orderedFighters = calculateInitiative();
    const uniqueFighters = buildFighterTabs(orderedFighters);

    if (uniqueFighters && uniqueFighters.length > 0) {
        selectFighterTab(uniqueFighters[0]);
    } else {
        switchTab('engagement');
    }
}
window.deleteActiveFighter = deleteActiveFighter;

function scrollFighterTabs(direction) {
    const container = document.getElementById('fighterTabsContainer');
    if (container) {
        container.scrollBy({ left: direction * 150, behavior: 'smooth' });
        setTimeout(checkTabScrollArrows, 300);
    }
}
window.scrollFighterTabs = scrollFighterTabs;

function checkTabScrollArrows() {
    const container = document.getElementById('fighterTabsContainer');
    const leftBtn = document.getElementById('scrollLeftBtn');
    const rightBtn = document.getElementById('scrollRightBtn');
    if (!container || !leftBtn || !rightBtn) return;

    const isOverflowing = container.scrollWidth > container.clientWidth;
    if (isOverflowing) {
        leftBtn.style.display = container.scrollLeft > 5 ? 'flex' : 'none';
        rightBtn.style.display = (container.scrollWidth - container.clientWidth - container.scrollLeft) > 5 ? 'flex' : 'none';
    } else {
        leftBtn.style.display = 'none';
        rightBtn.style.display = 'none';
    }
}
window.checkTabScrollArrows = checkTabScrollArrows;

function createPlayerTabs(pjDoc) {
    const players = pjDoc.getElementsByTagName('Player_Character');
    const tabsContainer = document.getElementById('creatureTabs');
    
    // Créer un conteneur principal incluant les colonnes de combat
    const combatSection = document.createElement('div');
    combatSection.className = 'combat-section';

    // Créer un conteneur spécifique pour les onglets PJ
    const playerTabsContainer = document.createElement('div');
    playerTabsContainer.className = 'player-tabs';
    combatSection.appendChild(playerTabsContainer);

    // --- LOGIQUE DRAG & DROP DU CONTENEUR ---
    playerTabsContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        
        const draggingItem = playerTabsContainer.querySelector('.dragging');
        if (!draggingItem) return;

        const siblings = [...playerTabsContainer.querySelectorAll('.player-wrapper:not(.dragging)')];

        const nextSibling = siblings.find(sibling => {
            const box = sibling.getBoundingClientRect();
            return e.clientX <= box.left + box.width / 2;
        });

        if (nextSibling) {
            playerTabsContainer.insertBefore(draggingItem, nextSibling);
        } else {
            playerTabsContainer.appendChild(draggingItem);
        }
    });
    // ----------------------------------------
    
    Array.from(players).forEach((player, index) => {
        const name = player.getElementsByTagName('Name')[0]?.textContent;
        const tokenName = player.getElementsByTagName('token')[0]?.textContent;
        const wits = player.getElementsByTagName('WITS')[0]?.textContent || '0';
        
        if (name) {
            const wrapper = document.createElement('div');
            wrapper.className = 'player-wrapper';
            wrapper.dataset.playerIndex = index;
            wrapper.dataset.playerName = name;
            wrapper.dataset.wits = wits;
            if (tokenName) wrapper.dataset.token = tokenName;

            wrapper.setAttribute('draggable', true);

            wrapper.addEventListener('dragstart', () => {
                wrapper.classList.add('dragging');
            });

            wrapper.addEventListener('dragend', () => {
                wrapper.classList.remove('dragging');
            });

            const tabElement = document.createElement('div');
            tabElement.className = 'player-tab';
            tabElement.dataset.playerIndex = index;

            const tabContent = document.createElement('div');
            tabContent.className = 'tab-content';

            if (tokenName) {
                const tokenImage = document.createElement('img');
                tokenImage.src = `images/PJ/${tokenName}.png`;
                tokenImage.alt = name;
                tokenImage.className = 'player-token';
                tabContent.appendChild(tokenImage);
            } else {
                tabContent.textContent = name.substring(0, 2).toUpperCase();
            }

            tabElement.appendChild(tabContent);

            const advantageIndicator = document.createElement('div');
            advantageIndicator.className = 'advantage-indicator posture-advantage';
            const initialPosture = (window.playerAdvantages && window.playerAdvantages.has(index)) ? window.playerAdvantages.get(index) : 0;
            if (typeof updatePostureElementStyle === 'function') {
                updatePostureElementStyle(advantageIndicator, initialPosture);
            } else {
                advantageIndicator.textContent = 'EXPOSE';
                advantageIndicator.classList.add('posture-expose');
            }
            advantageIndicator.style.display = 'block';
            advantageIndicator.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof cyclePlayerAdvantage === 'function') {
                    cyclePlayerAdvantage(index, advantageIndicator);
                }
            });

            const opponentsContainer = document.createElement('div');
            opponentsContainer.className = 'pj-opponents';

            opponentsContainer.addEventListener('dragover', (e) => {
                const draggingCreature = document.querySelector('.dragging-creature');
                if (!draggingCreature) return;

                e.preventDefault();
                e.stopPropagation();

                const siblings = [...opponentsContainer.querySelectorAll('.creature-tab:not(.dragging-creature)')];
                const nextSibling = siblings.find(sibling => {
                    const box = sibling.getBoundingClientRect();
                    return e.clientY <= box.top + box.height / 2;
                });

                if (window.dragPlaceholder) {
                    if (nextSibling) {
                        opponentsContainer.insertBefore(window.dragPlaceholder, nextSibling);
                    } else {
                        opponentsContainer.appendChild(window.dragPlaceholder);
                    }
                }
            });

            opponentsContainer.addEventListener('drop', (e) => {
                const draggingCreature = document.querySelector('.dragging-creature');
                if (!draggingCreature) return;

                e.preventDefault();
                e.stopPropagation();

                const instanceId = parseInt(draggingCreature.dataset.instanceId);
                const newPlayerName = wrapper.dataset.playerName;

                const isEngagedElsewhere = draggingCreature.parentNode &&
                                           draggingCreature.parentNode.classList.contains('pj-opponents') &&
                                           draggingCreature.parentNode !== opponentsContainer;

                if (isEngagedElsewhere) {
                    const clonedTab = draggingCreature.cloneNode(true);
                    clonedTab.classList.remove('dragging-creature');
                    clonedTab.classList.add('secondary');

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
                        const creatureInstance = window.creatureInstances ? window.creatureInstances.get(instanceId) : null;
                        if (creatureInstance && typeof displayCreatureDetails === 'function') {
                            displayCreatureDetails(creatureInstance, clonedTab.dataset.familyName, instanceId);
                        }
                    });

                    if (window.dragPlaceholder && window.dragPlaceholder.parentNode === opponentsContainer) {
                        opponentsContainer.insertBefore(clonedTab, window.dragPlaceholder);
                        window.dragPlaceholder.remove();
                    } else {
                        opponentsContainer.appendChild(clonedTab);
                    }
                } else {
                    if (window.dragPlaceholder && window.dragPlaceholder.parentNode === opponentsContainer) {
                        opponentsContainer.insertBefore(draggingCreature, window.dragPlaceholder);
                        window.dragPlaceholder.remove();
                    } else {
                        opponentsContainer.appendChild(draggingCreature);
                    }
                }

                if (instanceId && newPlayerName && typeof associatePlayer === 'function') {
                    associatePlayer(instanceId, newPlayerName);
                }
            });

            tabElement.addEventListener('click', function() {
                creatureSelect.value = '';
                document.querySelectorAll('.player-tab, .creature-tab').forEach(tab => 
                    tab.classList.remove('active')
                );
                this.classList.add('active');

                const playerInstance = player.cloneNode(true);
                playerInstances.set(index, playerInstance);
                displayPlayerProfile(playerInstance);
            });
            
            wrapper.appendChild(tabElement);
            wrapper.appendChild(advantageIndicator);
            wrapper.appendChild(opponentsContainer);
            
            playerTabsContainer.appendChild(wrapper);
        }
    });

    if (tabsContainer.firstChild) {
        tabsContainer.insertBefore(combatSection, tabsContainer.firstChild);
    } else {
        tabsContainer.appendChild(combatSection);
    }
    
    tabsContainer.addEventListener('dragover', (e) => {
        const draggingCreature = document.querySelector('.dragging-creature');
        if (!draggingCreature) return;
        e.preventDefault();
    });

    tabsContainer.addEventListener('drop', (e) => {
        const draggingCreature = document.querySelector('.dragging-creature');
        if (!draggingCreature) return;

        e.preventDefault();
        
        if (window.dragPlaceholder && window.dragPlaceholder.parentNode) {
            window.dragPlaceholder.remove();
        }

        const instanceId = parseInt(draggingCreature.dataset.instanceId);

        const allTabs = document.querySelectorAll(`.creature-tab[data-instance-id="${instanceId}"]`);
        allTabs.forEach(tab => {
            if (tab !== draggingCreature) {
                tab.remove();
            }
        });

        draggingCreature.classList.remove('secondary');
        tabsContainer.appendChild(draggingCreature);

        if (window.creaturePlayerAssociations && window.creaturePlayerAssociations.has(instanceId)) {
            window.creaturePlayerAssociations.get(instanceId).clear();
        }

        if (typeof updateAssociatedPlayersList === 'function') {
            updateAssociatedPlayersList(instanceId);
        }

        updateRandomAssociationButtonVisibility();
    });
}

function getUnassignedCreatureTabs() {
    const tabsContainer = document.getElementById('creatureTabs');
    if (!tabsContainer) return [];
    return Array.from(tabsContainer.querySelectorAll(':scope > .creature-tab'));
}

function getEligibleHeroes() {
    const playerWrappers = Array.from(document.querySelectorAll('.player-wrapper'));
    const eligibleHeroes = [];

    playerWrappers.forEach((wrapper) => {
        const playerIndex = parseInt(wrapper.dataset.playerIndex);
        const name = wrapper.dataset.playerName;

        let endurance = 0;
        const input = document.getElementById(`player-Endurance-${playerIndex}`);
        if (input) {
            endurance = parseInt(input.value) || 0;
        } else if (window.playerInstances && window.playerInstances.has(playerIndex)) {
            const instance = window.playerInstances.get(playerIndex);
            const val = instance.getElementsByTagName('Endurance')[0]?.textContent;
            endurance = parseInt(val) || 0;
        } else if (window.playerCharacters && window.playerCharacters[playerIndex]) {
            endurance = 10;
        }

        if (endurance > 0) {
            const opponentsContainer = wrapper.querySelector('.pj-opponents');
            eligibleHeroes.push({
                wrapper: wrapper,
                playerIndex: playerIndex,
                name: name,
                endurance: endurance,
                opponentsContainer: opponentsContainer
            });
        }
    });

    return eligibleHeroes;
}

function updateRandomAssociationButtonVisibility() {
    const diceBtn = document.getElementById('randomAssociationBtn');
    if (!diceBtn) return;

    const unassignedTabs = getUnassignedCreatureTabs();
    const eligibleHeroes = getEligibleHeroes();

    if (unassignedTabs.length > 0 && eligibleHeroes.length > 0) {
        diceBtn.style.display = 'inline-flex';
    } else {
        diceBtn.style.display = 'none';
    }
}
window.updateRandomAssociationButtonVisibility = updateRandomAssociationButtonVisibility;

function performRandomAssociation() {
    const unassignedTabs = getUnassignedCreatureTabs();
    let eligibleHeroes = getEligibleHeroes();

    if (unassignedTabs.length === 0 || eligibleHeroes.length === 0) {
        updateRandomAssociationButtonVisibility();
        return;
    }

    const creaturesToAssign = [...unassignedTabs].sort(() => Math.random() - 0.5);

    while (creaturesToAssign.length > 0) {
        const heroCounts = eligibleHeroes.map(hero => ({
            hero: hero,
            count: hero.opponentsContainer ? hero.opponentsContainer.querySelectorAll('.creature-tab').length : 0
        }));

        const minCount = Math.min(...heroCounts.map(h => h.count));
        const minCountHeroes = heroCounts.filter(h => h.count === minCount).map(h => h.hero);

        let chosenHero = null;

        if (creaturesToAssign.length >= minCountHeroes.length) {
            chosenHero = minCountHeroes[Math.floor(Math.random() * minCountHeroes.length)];
        } else {
            const minEndurance = Math.min(...minCountHeroes.map(h => h.endurance));
            const lowestEnduranceHeroes = minCountHeroes.filter(h => h.endurance === minEndurance);
            chosenHero = lowestEnduranceHeroes[Math.floor(Math.random() * lowestEnduranceHeroes.length)];
        }

        if (chosenHero && creaturesToAssign.length > 0) {
            const creatureTab = creaturesToAssign.shift();
            const instanceId = parseInt(creatureTab.dataset.instanceId);

            chosenHero.opponentsContainer.appendChild(creatureTab);

            if (instanceId && chosenHero.name && typeof associatePlayer === 'function') {
                associatePlayer(instanceId, chosenHero.name);
            }
        }
    }

    const activeTab = document.querySelector('.creature-tab.active');
    if (activeTab && typeof updateAssociatedPlayersList === 'function') {
        updateAssociatedPlayersList(parseInt(activeTab.dataset.instanceId));
    }

    updateRandomAssociationButtonVisibility();
}
window.performRandomAssociation = performRandomAssociation;
