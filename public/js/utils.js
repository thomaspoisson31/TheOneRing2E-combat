// Fonction pour formater le nom en initiales
function formatNameToInitials(name) {
    return name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .join('');
}

function getAdversaryImagePath(name) {
    if (!name) return '';
    const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const lower = normalized.toLowerCase();
    const slug = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `images/Adversaires/${slug}.jpg`;
}

function getAdvantageText(value) {
    switch (value) {
        case -2: return '-2D';
        case -1: return '-1D';
        case 1: return '+1D';
        case 2: return '+2D';
        default: return '0';
    }
}

function getNextCombatAdvantageValue(currentValue) {
    switch (currentValue) {
        case 0: return 1;
        case 1: return -1;
        case -1: return 2;
        case 2: return -2;
        case -2: return 0;
        default: return 0;
    }
}

function updateAdvantageElementStyle(element, value) {
    if (!element) return;
    element.textContent = getAdvantageText(value);
    element.classList.remove('positive', 'negative', 'distance');
    if (value === 1 || value === 2) {
        element.classList.add('positive');
    } else if (value === -1 || value === -2) {
        element.classList.add('negative');
    }
}

function getPostureText(value) {
    switch (value) {
        case 0: return 'EXPOSE';
        case 1: return 'AVANCE: +1D';
        case 2: return 'ARRIERE';
        case 3: return 'DEFENSIF: -1D';
        default: return 'EXPOSE';
    }
}

function getNextPostureState(currentValue) {
    switch (currentValue) {
        case 0: return 1;
        case 1: return 2;
        case 2: return 3;
        case 3: return 0;
        default: return 0;
    }
}

function updatePostureElementStyle(element, value) {
    if (!element) return;
    element.innerHTML = getPostureText(value).replace(': ', '<br>');
    element.classList.remove('posture-expose', 'posture-avance', 'posture-arriere', 'posture-defensif', 'positive', 'negative', 'distance');
    switch (value) {
        case 0:
            element.classList.add('posture-expose');
            break;
        case 1:
            element.classList.add('posture-avance');
            break;
        case 2:
            element.classList.add('posture-arriere');
            break;
        case 3:
            element.classList.add('posture-defensif');
            break;
        default:
            element.classList.add('posture-expose');
            break;
    }
}

window.getAdvantageText = getAdvantageText;
window.getNextCombatAdvantageValue = getNextCombatAdvantageValue;
window.updateAdvantageElementStyle = updateAdvantageElementStyle;
window.getPostureText = getPostureText;
function saveCurrentCardInputs() {
    const card = document.getElementById('creatureCard');
    if (!card) return;
    const inputs = card.querySelectorAll('.stat-input');
    inputs.forEach(input => {
        if (!input.id || input.value === '') return;
        const val = input.value;
        if (input.id.startsWith('creature-')) {
            const parts = input.id.split('-');
            if (parts.length >= 3) {
                const field = parts[1];
                const instanceId = parseInt(parts[2]);
                if (!isNaN(instanceId) && typeof updateInstanceValue === 'function') {
                    updateInstanceValue(instanceId, field, val);
                }
            }
        } else if (input.id.startsWith('player-')) {
            const parts = input.id.split('-');
            if (parts.length >= 3) {
                const field = parts[1];
                const playerIndex = parseInt(parts[2]);
                if (!isNaN(playerIndex) && typeof updatePlayerValue === 'function') {
                    updatePlayerValue(playerIndex, field, val);
                }
            }
        }
    });
}

function prepareCardContainerForStage1() {
    const engagementView = document.getElementById('engagementView');
    if (engagementView && engagementView.style.display !== 'none') {
        const adversariesPanel = document.getElementById('adversariesPanel');
        const creatureCard = document.getElementById('creatureCard');
        if (adversariesPanel && creatureCard) {
            if (creatureCard.parentNode !== adversariesPanel) {
                adversariesPanel.appendChild(creatureCard);
            }
            const header = adversariesPanel.querySelector('.adversaries-header');
            const list = adversariesPanel.querySelector('.adversaries-list-container');
            if (header) header.style.display = 'none';
            if (list) list.style.display = 'none';
            creatureCard.style.display = 'block';
        }
    }
}

function prepareCardContainerForStage2() {
    const fighterCardContainer = document.querySelector('.fighter-card-container');
    const creatureCard = document.getElementById('creatureCard');
    const adversariesPanel = document.getElementById('adversariesPanel');
    if (adversariesPanel) {
        const header = adversariesPanel.querySelector('.adversaries-header');
        const list = adversariesPanel.querySelector('.adversaries-list-container');
        if (header) header.style.display = '';
        if (list) list.style.display = '';
    }
    if (fighterCardContainer && creatureCard && creatureCard.parentNode !== fighterCardContainer) {
        fighterCardContainer.appendChild(creatureCard);
    }
}

function closeStage1Card() {
    if (typeof saveCurrentCardInputs === 'function') {
        saveCurrentCardInputs();
    }
    const creatureCard = document.getElementById('creatureCard');
    if (creatureCard) {
        creatureCard.style.display = 'none';
        delete creatureCard.dataset.instanceId;
    }
    const adversariesPanel = document.getElementById('adversariesPanel');
    if (adversariesPanel) {
        const header = adversariesPanel.querySelector('.adversaries-header');
        const list = adversariesPanel.querySelector('.adversaries-list-container');
        if (header) header.style.display = '';
        if (list) list.style.display = '';
    }
    document.querySelectorAll('.player-tab, .creature-tab').forEach(tab => tab.classList.remove('active'));
}

window.getNextPostureState = getNextPostureState;
window.updatePostureElementStyle = updatePostureElementStyle;
window.saveCurrentCardInputs = saveCurrentCardInputs;
window.getAdversaryImagePath = getAdversaryImagePath;
window.prepareCardContainerForStage1 = prepareCardContainerForStage1;
window.prepareCardContainerForStage2 = prepareCardContainerForStage2;
window.closeStage1Card = closeStage1Card;
