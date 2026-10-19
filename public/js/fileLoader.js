// Gestionnaire pour la sélection des fichiers
function initFileLoader() {
    const fileList = document.getElementById('fileList');
    if (fileList) {
        fileList.addEventListener('click', (e) => {
            if (e.target.tagName === 'LI') {
                // Retirer la sélection précédente
                const items = fileList.getElementsByTagName('li');
                for (let item of items) {
                    item.classList.remove('selected');
                }
                
                // Ajouter la sélection au fichier cliqué
                e.target.classList.add('selected');
            }
        });
    }
}

// Fermer la fenêtre modale
function closeFileModal() {
    const fileModal = document.getElementById('fileModal');
    if (fileModal) {
        fileModal.style.display = 'none';
    }
}

// Ouvrir la fenêtre modale
function openFileModal() {
    const fileModal = document.getElementById('fileModal');
    if (fileModal) {
        fileModal.style.display = 'block';
    }
}

// Mettre à jour la sélection visuelle dans la liste des fichiers
function updateModalFileSelection(fileName) {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;
    const items = fileList.getElementsByTagName('li');
    for (let item of items) {
        if (item.dataset.file === fileName) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    }
}
window.updateModalFileSelection = updateModalFileSelection;

// Charger le fichier sélectionné
function loadSelectedFile() {
    const fileList = document.getElementById('fileList');
    const selectedFile = fileList?.querySelector('.selected');
    if (selectedFile) {
        const fileName = selectedFile.dataset.file;
        
        // Sauvegarder la section combat PJ existante (avec headers) ou player-tabs
        const combatSection = document.querySelector('.combat-section') || document.querySelector('.player-tabs');
        
        // Charger le nouveau fichier XML
        fetch(`data/${fileName}`)
            .then(response => response.text())
            .then(str => {
                const parser = new DOMParser();
                xmlDoc = parser.parseFromString(str, "text/xml");
                
                // Réinitialiser l'interface
                if (typeof creatureSelect !== 'undefined' && creatureSelect) creatureSelect.value = '';
                if (creatureCard) creatureCard.style.display = 'none';
                if (creatureTabs) creatureTabs.innerHTML = '';
                
                // Restaurer la section combat s'il existait
                if (combatSection) {
                    creatureTabs.appendChild(combatSection);
                }
                
                // Mettre à jour la liste des créatures
                populateCreatureSelect();
                
                // Fermer la fenêtre modale
                closeFileModal();
            })
            .catch(error => {
                console.error('Erreur lors du chargement du fichier XML:', error);
                alert('Erreur lors du chargement du fichier XML');
            });
    }
}

// Fermer la fenêtre modale si on clique en dehors
window.addEventListener('click', (e) => {
    const fileModal = document.getElementById('fileModal');
    if (e.target === fileModal) {
        closeFileModal();
    }
});

// Initialiser le gestionnaire d'événements au chargement de la page
window.addEventListener('DOMContentLoaded', initFileLoader);