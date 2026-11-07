/**
 * Gestionnaire de Drag & Drop tactile pour mobile
 * Simule les événements HTML5 Drag & Drop à partir des événements Touch
 * Implémente aussi le mode "Déplacement" pour les créatures (Appui long -> Sélection -> Tap sur PJ)
 */

class TouchDragManager {
    constructor() {
        this.dragSource = null;
        this.dragGhost = null;
        this.isDragging = false;

        // État pour le mode "Déplacement" (Créatures)
        this.isMoveMode = false;
        this.moveModeSource = null;

        this.longPressTimer = null;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.lastTouchX = 0;
        this.lastTouchY = 0;

        // Stockage des données transférées pendant le drag (pour simuler dataTransfer)
        this.dataTransferStore = {};

        // Configuration
        this.longPressDuration = 500; // ms avant de déclencher le drag ou le mode déplacement
        this.moveThreshold = 10; // pixels de mouvement tolérés avant d'annuler le long press

        this.init();
    }

    init() {
        // Écouteurs globaux pour intercepter les interactions sur les éléments draggable
        document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        document.addEventListener('touchcancel', this.handleTouchEnd.bind(this));
        document.addEventListener('contextmenu', this.handleContextMenu.bind(this));

        // Écouteur global pour annuler le mode déplacement si on clique ailleurs (pour les interactions non-tactiles ou hybrides)
        document.addEventListener('click', (e) => {
            if (this.isMoveMode && !this.getPlayerWrapper(e.target) && e.target !== this.moveModeSource) {
                // On laisse gérer handleTouchStart pour le tactile, ceci est un fallback
            }
        });
    }

    // Trouve l'élément draggable parent le plus proche
    getDraggableParent(element) {
        let current = element;
        while (current && current !== document.body) {
            if (current.getAttribute('draggable') === 'true') {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }

    // Trouve le wrapper du joueur parent le plus proche
    getPlayerWrapper(element) {
        let current = element;
        while (current && current !== document.body) {
            if (current.classList && current.classList.contains('player-wrapper')) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }

    handleTouchStart(e) {
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);

        // --- GESTION DU MODE DÉPLACEMENT (CRÉATURES) ---
        if (this.isMoveMode) {
            // Si on est en mode déplacement, on cherche si on a touché un PJ
            const playerWrapper = this.getPlayerWrapper(target);

            if (playerWrapper) {
                // On a touché un PJ, on exécute le déplacement
                e.preventDefault(); // Empêcher le clic/focus standard
                e.stopPropagation();
                this.executeMove(playerWrapper);
            } else {
                // On a touché ailleurs
                // Si on touche la créature elle-même, on ne fait rien (ou on annule ?)
                // Si on touche autre chose, on annule le mode
                if (target !== this.moveModeSource && !this.moveModeSource.contains(target)) {
                     this.exitMoveMode();
                }
            }
            return;
        }
        // -----------------------------------------------

        // Si déjà en train de drag, on ignore (multi-touch)
        if (this.isDragging) return;

        const draggable = this.getDraggableParent(target);

        if (!draggable) return;

        // On vérifie si c'est bien une créature ou un joueur (cibles du drag & drop)
        if (!draggable.classList.contains('player-wrapper')) { // les onglets adversaires ne sont plus deplacables (associations uniquement via la battlemap)
            return;
        }

        this.dragSource = draggable;
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.lastTouchX = touch.clientX;
        this.lastTouchY = touch.clientY;

        // Démarrer le timer pour détecter l'appui long
        this.longPressTimer = setTimeout(() => {
            if (this.dragSource.classList.contains('creature-tab')) {
                // Pour les créatures : Mode Déplacement
                this.enterMoveMode(this.dragSource);
            } else if (this.dragSource.classList.contains('player-wrapper')) {
                // Pour les joueurs : Drag & Drop classique
                this.startDrag(touch);
            }
        }, this.longPressDuration);
    }

    handleTouchMove(e) {
        // En mode déplacement, on autorise le scroll et on ignore le reste
        if (this.isMoveMode) return;

        const touch = e.touches[0];
        this.lastTouchX = touch.clientX;
        this.lastTouchY = touch.clientY;

        if (this.isDragging) {
            // Si on drag, on empêche le scroll
            if (e.cancelable) e.preventDefault();

            // Mettre à jour la position du fantôme
            this.updateGhostPosition(touch.clientX, touch.clientY);

            // Simuler dragover sur l'élément sous le doigt
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            if (target) {
                this.fireSyntheticEvent('dragover', target, touch.clientX, touch.clientY);
            }
        } else if (this.longPressTimer) {
            // Si on bouge pendant l'attente du long press
            const dx = Math.abs(touch.clientX - this.touchStartX);
            const dy = Math.abs(touch.clientY - this.touchStartY);

            if (dx > this.moveThreshold || dy > this.moveThreshold) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;

                // Pour les joueurs, le mouvement déclenche le drag immédiatement (comportement existant)
                if (this.dragSource && this.dragSource.classList.contains('player-wrapper')) {
                    this.startDrag(touch);
                }
                // Pour les créatures, le mouvement annule l'appui long (pas de drag)
            }
        }
    }

    handleTouchEnd(e) {
        // Annuler le timer si on relâche avant la fin du long press
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        if (this.isDragging) {
            // Terminer le drag
            this.endDrag(e);
        }

        // Si on est en mode déplacement et qu'on vient de relâcher le doigt sur la créature source
        // On empêche le clic qui suivrait (pour éviter d'ouvrir la fiche détail juste après l'activation)
        if (this.isMoveMode && this.dragSource === this.moveModeSource) {
            if (e.cancelable) e.preventDefault();
        }

        // Réinitialisation partielle
        if (!this.isDragging && !this.isMoveMode) {
            this.dragSource = null;
        }
    }

    handleContextMenu(e) {
        // Si on est en train de drag ou qu'on vient de déclencher le drag ou le mode move, on empêche le menu contextuel
        if (this.isDragging || (this.dragSource && !this.longPressTimer)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    // --- MODE DÉPLACEMENT (NOUVEAU) ---
    enterMoveMode(element) {
        this.isMoveMode = true;
        this.moveModeSource = element;

        // Ajouter la classe d'animation
        element.classList.add('move-mode-active');

        // Feedback tactile
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }

    exitMoveMode() {
        if (this.moveModeSource) {
            this.moveModeSource.classList.remove('move-mode-active');
        }
        this.isMoveMode = false;
        this.moveModeSource = null;
        this.dragSource = null;
    }

    executeMove(playerWrapper) {
        if (!this.moveModeSource) return;

        const instanceId = parseInt(this.moveModeSource.dataset.instanceId);
        const playerName = playerWrapper.dataset.playerName;

        if (instanceId && playerName) {
            // 1. Déplacer l'élément DOM dans la colonne du joueur
            const opponentsContainer = playerWrapper.querySelector('.pj-opponents');
            if (opponentsContainer) {
                // On l'ajoute à la fin par défaut
                opponentsContainer.appendChild(this.moveModeSource);
            }

            // 2. Mettre à jour l'association logique
            if (typeof associatePlayer === 'function') {
                associatePlayer(instanceId, playerName);
            }

            // Feedback de succès
            if (navigator.vibrate) {
                navigator.vibrate([50, 50, 50]);
            }
        }

        this.exitMoveMode();
    }
    // ----------------------------------

    startDrag(touch) {
        this.isDragging = true;
        this.longPressTimer = null;
        this.dataTransferStore = {}; // Réinitialiser le store de données

        // Créer le fantôme visuel
        this.createGhost();
        this.updateGhostPosition(touch.clientX, touch.clientY);

        // Ajouter la classe de dragging à la source
        if (this.dragSource.classList.contains('creature-tab')) {
            this.dragSource.classList.add('dragging-creature');
            this.fireSyntheticEvent('dragstart', this.dragSource, touch.clientX, touch.clientY);

        } else if (this.dragSource.classList.contains('player-wrapper')) {
            this.dragSource.classList.add('dragging');
            this.fireSyntheticEvent('dragstart', this.dragSource, touch.clientX, touch.clientY);
        }

        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }

    endDrag(e) {
        this.isDragging = false;

        // Trouver la cible finale
        let clientX = this.lastTouchX;
        let clientY = this.lastTouchY;

        if (e && e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        }

        const target = document.elementFromPoint(clientX, clientY);

        if (target) {
            // Simuler drop
            this.fireSyntheticEvent('drop', target, clientX, clientY);
        }

        // Simuler dragend sur la source
        if (this.dragSource) {
            this.fireSyntheticEvent('dragend', this.dragSource, clientX, clientY);

            // Nettoyage des classes
            this.dragSource.classList.remove('dragging-creature');
            this.dragSource.classList.remove('dragging');
        }

        // Supprimer le fantôme
        this.removeGhost();
        this.dragSource = null;
        this.dataTransferStore = {};
    }

    createGhost() {
        if (!this.dragSource) return;

        this.dragGhost = this.dragSource.cloneNode(true);

        // Styles pour le fantôme
        this.dragGhost.style.position = 'fixed';
        this.dragGhost.style.pointerEvents = 'none'; // Important pour que elementFromPoint ignore le fantôme
        this.dragGhost.style.zIndex = '9999';
        this.dragGhost.style.opacity = '0.8';
        this.dragGhost.style.transform = 'scale(1.05)';
        this.dragGhost.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
        this.dragGhost.style.width = this.dragSource.offsetWidth + 'px';
        this.dragGhost.style.height = this.dragSource.offsetHeight + 'px';

        document.body.appendChild(this.dragGhost);
    }

    updateGhostPosition(x, y) {
        if (!this.dragGhost) return;

        // Centrer le fantôme sous le doigt
        const width = this.dragGhost.offsetWidth;
        const height = this.dragGhost.offsetHeight;

        this.dragGhost.style.left = (x - width / 2) + 'px';
        this.dragGhost.style.top = (y - height / 2) + 'px';
    }

    removeGhost() {
        if (this.dragGhost && this.dragGhost.parentNode) {
            this.dragGhost.parentNode.removeChild(this.dragGhost);
        }
        this.dragGhost = null;
    }

    fireSyntheticEvent(type, target, x, y) {
        let event;

        // Création d'un événement DragEvent simulé
        try {
            event = new CustomEvent(type, {
                bubbles: true,
                cancelable: true,
                detail: {
                    originalEvent: null
                }
            });
        } catch (e) {
            event = document.createEvent('CustomEvent');
            event.initCustomEvent(type, true, true, {});
        }

        // Ajouter les propriétés de coordonnées
        event.clientX = x;
        event.clientY = y;
        event.pageX = x + window.scrollX;
        event.pageY = y + window.scrollY;

        // Mocker dataTransfer avec stockage persistant
        const dataStore = this.dataTransferStore;

        event.dataTransfer = {
            dropEffect: 'move',
            effectAllowed: 'all',
            setData: function(format, data) {
                dataStore[format] = data;
            },
            getData: function(format) {
                return dataStore[format];
            },
            clearData: function(format) {
                if (format) delete dataStore[format];
                else for (let key in dataStore) delete dataStore[key];
            },
            setDragImage: function() {}
        };

        // Dispatch
        target.dispatchEvent(event);
        return event;
    }
}

// Initialisation au chargement du DOM
window.addEventListener('DOMContentLoaded', () => {
    new TouchDragManager();
});
