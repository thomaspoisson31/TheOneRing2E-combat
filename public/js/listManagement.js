function renderAdversariesList() {
    const container = document.getElementById('adversariesListContainer');
    if (!container) return;

    container.innerHTML = '';

    if (!xmlDoc) return;

    // Récupérer et trier les familles
    const familles = Array.from(xmlDoc.getElementsByTagName('famille'));
    familles.sort((a, b) => a.getAttribute('nom').localeCompare(b.getAttribute('nom')));

    for (let famille of familles) {
        const familyName = famille.getAttribute('nom');
        const displayName = familyName.replace('_', ' ');

        // Créer la section pour la famille
        const familySection = document.createElement('div');
        familySection.className = 'adversary-family-section';

        const familyTitle = document.createElement('h3');
        familyTitle.className = 'adversary-family-title';
        familyTitle.textContent = displayName;
        familySection.appendChild(familyTitle);

        const tilesContainer = document.createElement('div');
        tilesContainer.className = 'adversary-tiles-container';

        // Récupérer et trier les créatures de cette famille
        const creatures = Array.from(famille.getElementsByTagName('creature'));
        creatures.sort((a, b) => {
            const nameA = a.getElementsByTagName('nom')[0]?.textContent || "";
            const nameB = b.getElementsByTagName('nom')[0]?.textContent || "";
            return nameA.localeCompare(nameB);
        });

        for (let creature of creatures) {
            const creatureNameElement = creature.getElementsByTagName('nom')[0];
            if (creatureNameElement) {
                const creatureName = creatureNameElement.textContent;

                const tile = document.createElement('button');
                tile.className = 'adversary-tile-btn';
                tile.title = creatureName;

                const nameSpan = document.createElement('span');
                nameSpan.className = 'adversary-tile-name';
                nameSpan.textContent = creatureName;

                tile.appendChild(nameSpan);

                tile.addEventListener('click', () => {
                    if (typeof displayCreature === 'function') {
                        displayCreature(creature, familyName, true, false);
                    }
                });

                tilesContainer.appendChild(tile);
            }
        }

        familySection.appendChild(tilesContainer);
        container.appendChild(familySection);
    }
}

function populateCreatureSelect() {
    renderAdversariesList();
}

function updateCreatureList(familyName) {
    // Deprecated for new UI
}

window.renderAdversariesList = renderAdversariesList;
