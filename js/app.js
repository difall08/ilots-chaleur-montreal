// ===============================
// app.js
// Point d'entrée principal de l'application
// Orchestre : map.js · analysis.js · charts.js
// Îlots de chaleur — Montréal
// ===============================


// ===============================
// 1. Configuration globale
// ===============================
const APP_CONFIG = {
    version:   '1.0.0',
    lang:      localStorage.getItem('lang') || 'fr',
    mapCenter: [-73.5673, 45.5017],
    mapZoom:   11,

    // Seuils d'analyse
    thresholds: {
        densiteModere:   1000,   // hab/km²
        densiteEleve:    3000,
        densiteCritique: 6000,
        refugeProche:    1.0,    // km
        artereProche:    0.15,   // km
        bufferRefuge:    1.0,    // km (nb refuges proches)
        bufferAccessibilite: 0.3 // km
    },

    // Données
    dataPaths: {
        ilots:      'data/ilots_chaleur.geojson',
        population: 'data/population.geojson',
        reseau:     'data/reseau.geojson',
        ilotsEnrichi: 'data/ilots_chaleur_enrichi.geojson'
    }
};


// ===============================
// 2. État global de l'application
// ===============================
const APP_STATE = {
    // Langue active
    lang: APP_CONFIG.lang,

    // Couches actives
    layers: {
        population: true,
        ilots:      true,
        fraicheur:  true,
        reseau:     false,
        critical:   false
    },

    // Sélection en cours
    selected: {
        feature:    null,   // feature GeoJSON cliqué
        type:       null,   // 'chaleur' | 'fraicheur' | 'population' | 'reseau'
        lngLat:     null,   // { lng, lat }
        analysis:   null    // résultat de analyzeHeatIsland() ou analyzeRefuge()
    },

    // Cache des stats globales
    globalStats: null
};


// ===============================
// 3. Gestion de la langue
// ===============================

/**
 * Change la langue de l'interface
 * Synchronise localStorage + classes CSS
 * @param {string} lang - 'fr' | 'en'
 */
function setLang(lang) {
    APP_STATE.lang = lang;
    localStorage.setItem('lang', lang);

    document.body.classList.toggle('lang-en', lang === 'en');

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === lang);
    });

    // Mise à jour de l'attribut lang de la page
    document.documentElement.lang = lang === 'en' ? 'en' : 'fr';
}

/**
 * Retourne un texte traduit selon la langue active
 * @param {string} fr - texte français
 * @param {string} en - texte anglais
 * @returns {string}
 */
function t(fr, en) {
    return APP_STATE.lang === 'en' ? en : fr;
}


// ===============================
// 4. Gestion des couches
// ===============================

/**
 * Active ou désactive une couche et met à jour l'état
 * @param {string}  layerName - clé dans APP_STATE.layers
 * @param {boolean} visible
 */
function setLayerVisibility(layerName, visible) {
    APP_STATE.layers[layerName] = visible;

    // Synchroniser avec la checkbox si elle existe
    const cb = document.getElementById(`${layerName}-checkbox`);
    if (cb && cb.checked !== visible) cb.checked = visible;

    // Déclencher la mise à jour de la carte (définie dans map.js)
    if (typeof applyLayerVisibility === 'function') applyLayerVisibility();
    if (typeof updateLegend === 'function')         updateLegend();
}

/**
 * Active toutes les couches d'un coup
 */
function showAllLayers() {
    Object.keys(APP_STATE.layers).forEach(layer => setLayerVisibility(layer, true));
}

/**
 * Réinitialise les couches à leur état par défaut
 */
function resetLayers() {
    setLayerVisibility('population', true);
    setLayerVisibility('ilots',      true);
    setLayerVisibility('fraicheur',  true);
    setLayerVisibility('reseau',     false);
    setLayerVisibility('critical',   false);
}


// ===============================
// 5. Gestion de la sélection
// ===============================

/**
 * Met à jour la sélection en cours
 * @param {object} feature  - GeoJSON feature
 * @param {string} type     - type de feature
 * @param {object} lngLat   - { lng, lat }
 * @param {object} analysis - résultat d'analyse (optionnel)
 */
function setSelection(feature, type, lngLat, analysis = null) {
    APP_STATE.selected = { feature, type, lngLat, analysis };
}

/**
 * Efface la sélection en cours
 */
function clearSelection() {
    APP_STATE.selected = { feature: null, type: null, lngLat: null, analysis: null };
}

/**
 * Retourne true si un îlot de chaleur est actuellement sélectionné
 */
function hasHeatIslandSelected() {
    return APP_STATE.selected.type === 'chaleur' && APP_STATE.selected.feature !== null;
}


// ===============================
// 6. Statistiques globales
// ===============================

/**
 * Charge et met en cache les statistiques globales
 * Appelée au chargement de la page si analysis.js est disponible
 * @returns {Promise<object>}
 */
async function loadGlobalStats() {
    if (APP_STATE.globalStats) return APP_STATE.globalStats;

    try {
        if (typeof getGlobalStats === 'function') {
            APP_STATE.globalStats = await getGlobalStats();
        } else {
            // Valeurs statiques si analysis.js non chargé
            APP_STATE.globalStats = {
                nbChaleur:            3068,
                nbFraicheur:          1030,
                nbTotal:              4098,
                surfaceChaleurKm2:    '5311.0',
                surfaceFraicheurKm2:  '941.7',
                ratioChaleurFraicheur:'2.98'
            };
        }
    } catch (err) {
        console.warn('[app] getGlobalStats error:', err);
        APP_STATE.globalStats = {
            nbChaleur: 3068, nbFraicheur: 1030, nbTotal: 4098
        };
    }

    return APP_STATE.globalStats;
}

/**
 * Injecte les stats globales dans les éléments HTML portant data-stat="..."
 * Exemple : <span data-stat="nbChaleur"></span>
 */
async function injectStats() {
    const stats = await loadGlobalStats();

    document.querySelectorAll('[data-stat]').forEach(el => {
        const key = el.getAttribute('data-stat');
        if (stats[key] !== undefined) {
            el.textContent = typeof stats[key] === 'number'
                ? stats[key].toLocaleString('fr-CA')
                : stats[key];
        }
    });
}


// ===============================
// 7. Notifications / Toasts
// ===============================

/**
 * Affiche une notification toast temporaire
 * @param {string} message
 * @param {string} type - 'info' | 'success' | 'warning' | 'error'
 * @param {number} duration - ms
 */
function showToast(message, type = 'info', duration = 3000) {
    // Créer le conteneur si absent
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed; bottom: 1.5rem; right: 1.5rem;
            z-index: 9999; display: flex; flex-direction: column; gap: .5rem;
        `;
        document.body.appendChild(container);
    }

    const colors = {
        info:    { bg: '#1e293b', border: 'rgba(56,189,248,.4)',  icon: 'ℹ️' },
        success: { bg: '#14532d', border: 'rgba(34,197,94,.4)',   icon: '✅' },
        warning: { bg: '#451a03', border: 'rgba(251,191,36,.4)',  icon: '⚠️' },
        error:   { bg: '#450a0a', border: 'rgba(239,68,68,.4)',   icon: '❌' }
    };
    const c = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${c.bg};
        border: 1px solid ${c.border};
        border-radius: 10px;
        padding: 10px 16px;
        font-family: DM Sans, sans-serif;
        font-size: 13px;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,.3);
        animation: slideIn .25s ease;
        max-width: 300px;
    `;
    toast.innerHTML = `<span>${c.icon}</span><span>${message}</span>`;

    // Animation CSS
    if (!document.getElementById('toast-style')) {
        const style = document.createElement('style');
        style.id = 'toast-style';
        style.textContent = `
            @keyframes slideIn  { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:none} }
            @keyframes slideOut { from{opacity:1;transform:none} to{opacity:0;transform:translateX(20px)} }
        `;
        document.head.appendChild(style);
    }

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut .25s ease forwards';
        setTimeout(() => toast.remove(), 250);
    }, duration);
}


// ===============================
// 8. Loader / Indicateur de chargement
// ===============================

/**
 * Affiche ou masque un indicateur de chargement
 * @param {boolean} visible
 * @param {string}  message
 */
function setLoader(visible, message = '') {
    let loader = document.getElementById('app-loader');

    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'app-loader';
        loader.style.cssText = `
            position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
            background: rgba(15,23,42,.95);
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 999px;
            padding: 8px 20px;
            font-family: DM Sans, sans-serif;
            font-size: 13px;
            color: #94a3b8;
            display: flex; align-items: center; gap: 8px;
            z-index: 9998;
            box-shadow: 0 4px 16px rgba(0,0,0,.3);
            transition: opacity .3s;
        `;
        document.body.appendChild(loader);
    }

    if (visible) {
        loader.innerHTML = `<span style="animation:spin .8s linear infinite;display:inline-block;">⟳</span> ${message || t('Chargement…', 'Loading…')}`;
        loader.style.opacity = '1';
        loader.style.display = 'flex';
    } else {
        loader.style.opacity = '0';
        setTimeout(() => { loader.style.display = 'none'; }, 300);
    }
}


// ===============================
// 9. Utilitaires URL / Navigation
// ===============================

/**
 * Retourne le nom de la page courante
 * @returns {string} ex: 'carte', 'donnees', 'equipe', 'index'
 */
function getCurrentPage() {
    const path = window.location.pathname;
    const file = path.split('/').pop().replace('.html', '') || 'index';
    return file;
}

/**
 * Met à jour le lien actif dans la navigation
 */
function updateActiveNav() {
    const page = getCurrentPage();
    document.querySelectorAll('.main-nav a').forEach(link => {
        const href = link.getAttribute('href').replace('.html', '');
        link.classList.toggle('active', href.includes(page));
    });
}


// ===============================
// 10. Initialisation
// ===============================

/**
 * Initialisation de l'application
 * Appelée au DOMContentLoaded
 */
async function initApp() {
    // Langue
    setLang(APP_CONFIG.lang);

    // Navigation active
    updateActiveNav();

    // Injection stats (si éléments data-stat présents)
    if (document.querySelector('[data-stat]')) {
        await injectStats();
    }

    // Initialisation des graphiques si on est sur donnees.html
    if (getCurrentPage() === 'donnees') {
        if (typeof initAllCharts === 'function') {
            initAllCharts();
        }
    }

    console.log(`[app] v${APP_CONFIG.version} — page: ${getCurrentPage()} — lang: ${APP_STATE.lang}`);
}

// Lancement au chargement du DOM
document.addEventListener('DOMContentLoaded', initApp);


// ===============================
// 11. Exports globaux
//     Exposés sur window pour map.js et charts.js
// ===============================
window.APP_CONFIG  = APP_CONFIG;
window.APP_STATE   = APP_STATE;
window.setLang     = setLang;
window.t           = t;
window.showToast   = showToast;
window.setLoader   = setLoader;
window.setSelection     = setSelection;
window.clearSelection   = clearSelection;
window.hasHeatIslandSelected = hasHeatIslandSelected;
window.setLayerVisibility    = setLayerVisibility;
window.resetLayers           = resetLayers;