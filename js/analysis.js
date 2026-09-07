// ===============================
// analysis.js
// Module d'analyse spatiale
// Dépendances : turf.js
// Îlots de chaleur — Montréal
// ===============================


// ===============================
// 1. Cache des données
// ===============================
const ANALYSIS_CACHE = {
    ilots:      null,
    population: null,
    reseau:     null
};

async function loadGeoJSON(key, path) {
    if (ANALYSIS_CACHE[key]) return ANALYSIS_CACHE[key];
    const res  = await fetch(path);
    const data = await res.json();
    ANALYSIS_CACHE[key] = data;
    return data;
}

async function getIlotsData()      { return loadGeoJSON('ilots',      'data/ilots_chaleur_fraicheur.geojson'); }
async function getPopulationData() { return loadGeoJSON('population', 'data/population_montreal.geojson'); }
async function getReseauData()     { return loadGeoJSON('reseau',     'data/reseau.geojson'); }


// ===============================
// 2. Filtres de base
// ===============================

/** Retourne tous les îlots de chaleur (Temp_Class = 5) */
function filterChaleur(features) {
    return features.filter(f => Number(f.properties.Temp_Class) === 5.0);
}

/** Retourne tous les îlots de fraîcheur (Temp_Class = 1) */
function filterFraicheur(features) {
    return features.filter(f => Number(f.properties.Temp_Class) === 1.0);
}

/** Retourne les routes d'une ou plusieurs classes MTQ */
function filterRoutesByClass(features, classes = ['Artère', 'Nationale', 'Autoroute']) {
    return features.filter(f => classes.includes(f.properties.g_clsrte));
}


// ===============================
// 3. Calculs de surface
// ===============================

/**
 * Calcule la surface réelle d'un feature en hectares via turf.area()
 * NB : Shape_Area dans le GeoJSON est une valeur fixe de grille (non fiable)
 * @param {object} feature - GeoJSON Feature
 * @returns {number} surface en hectares
 */
function getSurfaceHa(feature) {
    try {
        return turf.area(feature) / 10000;
    } catch (_) {
        return (Number(feature.properties.Shape_Area) || 0) / 10000;
    }
}

/**
 * Surface totale d'un tableau de features en km²
 * @param {Array} features
 * @returns {number}
 */
function getTotalSurfaceKm2(features) {
    return features.reduce((acc, f) => acc + getSurfaceHa(f), 0) / 100;
}


// ===============================
// 4. Analyse de proximité — Refuges
// ===============================

/**
 * Trouve le refuge de fraîcheur le plus proche d'un point
 * @param {object} originPoint - turf.point([lng, lat])
 * @param {Array}  allFeatures - features du GeoJSON îlots
 * @returns {{ nearestFeature, nearestPoint, minDistance }}
 */
function findNearestRefuge(originPoint, allFeatures) {
    let nearestFeature = null;
    let nearestPoint   = null;
    let minDistance    = Infinity;

    filterFraicheur(allFeatures).forEach(f => {
        try {
            if (turf.booleanPointInPolygon(originPoint, f)) {
                if (minDistance > 0) {
                    nearestFeature = f;
                    nearestPoint   = originPoint;
                    minDistance    = 0;
                }
                return;
            }
        } catch (_) {}

        let boundary;
        try { boundary = turf.polygonToLine(f); } catch (_) { return; }

        const snapped  = turf.nearestPointOnLine(boundary, originPoint, { units: 'kilometers' });
        const distance = snapped.properties.dist;

        if (distance < minDistance) {
            minDistance    = distance;
            nearestFeature = f;
            nearestPoint   = snapped;
        }
    });

    return { nearestFeature, nearestPoint, minDistance };
}

/**
 * Compte le nombre de refuges à moins de X km d'un point
 * @param {object} originPoint - turf.point
 * @param {Array}  allFeatures
 * @param {number} radiusKm
 * @returns {number}
 */
function countRefugesInRadius(originPoint, allFeatures, radiusKm = 1.0) {
    const buffer = turf.buffer(originPoint, radiusKm, { units: 'kilometers' });
    return filterFraicheur(allFeatures).filter(f => {
        try { return turf.booleanIntersects(buffer, f); } catch (_) { return false; }
    }).length;
}

/**
 * Compte les îlots de chaleur à moins de X km d'un refuge
 * @param {object} feature  - feature de fraîcheur
 * @param {Array}  allFeatures
 * @param {number} radiusKm
 * @returns {number}
 */
function countChaleursNearRefuge(feature, allFeatures, radiusKm = 1.0) {
    let centroid;
    try { centroid = turf.centroid(feature); } catch (_) { return 0; }
    const buffer = turf.buffer(centroid, radiusKm, { units: 'kilometers' });
    return filterChaleur(allFeatures).filter(f => {
        try { return turf.booleanIntersects(buffer, f); } catch (_) { return false; }
    }).length;
}


// ===============================
// 5. Analyse réseau routier
// ===============================

/**
 * Vérifie si une artère majeure est à moins de X km d'un point
 * @param {object} originPoint     - turf.point
 * @param {Array}  reseauFeatures
 * @param {number} radiusKm
 * @param {Array}  classes
 * @returns {{ found, name, class }}
 */
function findNearestArtere(originPoint, reseauFeatures, radiusKm = 0.15, classes = ['Autoroute', 'Nationale', 'Artère']) {
    const buffer  = turf.buffer(originPoint, radiusKm, { units: 'kilometers' });
    const arteres = filterRoutesByClass(reseauFeatures, classes);

    for (const road of arteres) {
        try {
            const geom = road.geometry.type === 'MultiLineString'
                ? turf.multiLineString(road.geometry.coordinates)
                : turf.lineString(road.geometry.coordinates);

            if (turf.booleanIntersects(buffer, geom)) {
                return {
                    found: true,
                    name:  road.properties.g_nomrte || road.properties.g_clsrte || 'N/A',
                    class: road.properties.g_clsrte || 'N/A'
                };
            }
        } catch (_) {}
    }

    return { found: false, name: '', class: '' };
}

/**
 * Vérifie l'accessibilité d'un refuge (artère à ≤ 300 m)
 * @param {object} feature        - feature de fraîcheur
 * @param {Array}  reseauFeatures
 * @returns {boolean}
 */
function checkRefugeAccessibility(feature, reseauFeatures) {
    let centroid;
    try { centroid = turf.centroid(feature); } catch (_) { return false; }

    return findNearestArtere(
        centroid,
        reseauFeatures,
        0.3,
        ['Artère', 'Nationale', 'Autoroute', 'Collectrice municipale']
    ).found;
}


// ===============================
// 6. Score de risque
// ===============================

/**
 * Calcule le score de risque d'un îlot de chaleur (0–4)
 *
 * Critères (1 point chacun) :
 *   densité > 1 000 hab/km²
 *   densité > 3 000 hab/km²
 *   distance refuge > 1 km
 *   artère majeure à ≤ 150 m
 *
 * @param {object} params - { densite, distanceRefuge, nearArtere }
 * @returns {number} score 0–4
 */
function calcRiskScore({ densite = 0, distanceRefuge = 0, nearArtere = false }) {
    let score = 0;
    if (densite > 1000)       score++;
    if (densite > 3000)       score++;
    if (distanceRefuge > 1.0) score++;
    if (nearArtere)           score++;
    return score;
}

/**
 * Libellé et couleurs associés à un score de risque
 * @param {number} score
 * @returns {{ emoji, label, couleur, bg, border }}
 */
function scoreToLabel(score) {
    if (score === 0) return { emoji: '🟢', label: 'Très faible', couleur: '#16a34a', bg: '#f0fdf4', border: '#86efac' };
    if (score === 1) return { emoji: '🟡', label: 'Modéré',      couleur: '#d97706', bg: '#fffbeb', border: '#fcd34d' };
    if (score === 2) return { emoji: '🟠', label: 'Élevé',       couleur: '#ea580c', bg: '#fff7ed', border: '#fdba74' };
    return                  { emoji: '🔴', label: 'Critique',     couleur: '#dc2626', bg: '#fef2f2', border: '#fca5a5' };
}


// ===============================
// 7. Analyse complète — Îlot de chaleur
// ===============================

/**
 * Analyse complète d'un îlot de chaleur cliqué sur la carte
 * Appelée depuis map.js
 *
 * @param {object} feature - GeoJSON feature de l'îlot
 * @param {object} lngLat  - { lng, lat } du clic
 * @param {number} densite - densité de population (hab/km²)
 * @returns {Promise<object>}
 */
async function analyzeHeatIsland(feature, lngLat, densite = 0) {
    const originPoint = turf.point([lngLat.lng, lngLat.lat]);
    const surfaceHa   = getSurfaceHa(feature);

    // Refuge le plus proche
    let refugeResult = { nearestFeature: null, nearestPoint: null, minDistance: Infinity };
    let nbRefuges    = 0;

    try {
        const ilots  = await getIlotsData();
        refugeResult = findNearestRefuge(originPoint, ilots.features);
        nbRefuges    = countRefugesInRadius(originPoint, ilots.features, 1.0);
    } catch (err) { console.warn('[analysis] Ilots:', err); }

    // Artère proche
    let artereResult = { found: false, name: '', class: '' };
    try {
        const reseau = await getReseauData();
        artereResult = findNearestArtere(originPoint, reseau.features, 0.15);
    } catch (err) { console.warn('[analysis] Réseau:', err); }

    // Score de risque
    const score = calcRiskScore({
        densite,
        distanceRefuge: refugeResult.minDistance,
        nearArtere:     artereResult.found
    });

    return {
        surfaceHa,
        refuge: {
            distance:  refugeResult.minDistance,
            distText:  formatDistance(refugeResult.minDistance),
            feature:   refugeResult.nearestFeature,
            point:     refugeResult.nearestPoint,
            nbProches: nbRefuges
        },
        artere: {
            found: artereResult.found,
            name:  artereResult.name,
            class: artereResult.class
        },
        risk: {
            score,
            label: scoreToLabel(score)
        }
    };
}


// ===============================
// 8. Analyse complète — Refuge
// ===============================

/**
 * Analyse complète d'un îlot de fraîcheur cliqué sur la carte
 * Appelée depuis map.js
 *
 * @param {object} feature - GeoJSON feature du refuge
 * @returns {Promise<object>}
 */
async function analyzeRefuge(feature) {
    const surfaceHa   = getSurfaceHa(feature);
    const capaciteEst = Math.round((surfaceHa * 10000) / 10);

    let nbChaleursProches = 0;
    let accessible        = false;

    try {
        const ilots       = await getIlotsData();
        nbChaleursProches = countChaleursNearRefuge(feature, ilots.features, 1.0);
    } catch (err) { console.warn('[analysis] Ilots:', err); }

    try {
        const reseau = await getReseauData();
        accessible   = checkRefugeAccessibility(feature, reseau.features);
    } catch (err) { console.warn('[analysis] Réseau:', err); }

    // Contexte thermique
    let contexteLabel, contexteColor;
    if (nbChaleursProches >= 5) {
        contexteLabel = '⚠️ Refuge très sollicité — nombreux îlots de chaleur proches';
        contexteColor = '#f97316';
    } else if (nbChaleursProches >= 2) {
        contexteLabel = '🌿 Refuge modérément sollicité';
        contexteColor = '#fbbf24';
    } else {
        contexteLabel = '✅ Zone fraîche bien isolée';
        contexteColor = '#22c55e';
    }

    return {
        surfaceHa,
        capaciteEst,
        thermique: {
            nbChaleursProches,
            contexteLabel,
            contexteColor
        },
        accessibilite: {
            accessible,
            label: accessible
                ? "✅ Bien desservi — artère à ≤ 300 m"
                : "⚠️ Accès limité — peu d'axes majeurs proches"
        }
    };
}


// ===============================
// 9. Statistiques globales
// ===============================

/**
 * Statistiques globales sur l'ensemble des îlots
 * Utilisées dans donnees.html et app.js
 * @returns {Promise<object>}
 */
async function getGlobalStats() {
    const ilots    = await getIlotsData();
    const chaleur  = filterChaleur(ilots.features);
    const fraicheur = filterFraicheur(ilots.features);

    return {
        nbChaleur:            chaleur.length,
        nbFraicheur:          fraicheur.length,
        nbTotal:              ilots.features.length,
        surfaceChaleurKm2:    getTotalSurfaceKm2(chaleur).toFixed(1),
        surfaceFraicheurKm2:  getTotalSurfaceKm2(fraicheur).toFixed(1),
        ratioChaleurFraicheur:(chaleur.length / fraicheur.length).toFixed(2)
    };
}

/**
 * Densité spatiale d'un îlot : nb d'îlots de chaleur voisins dans un rayon
 * @param {object} feature
 * @param {Array}  features
 * @param {number} radiusKm
 * @returns {number}
 */
function getHeatIslandDensity(feature, features, radiusKm = 0.5) {
    let centroid;
    try { centroid = turf.centroid(feature); } catch (_) { return 0; }
    const buffer = turf.buffer(centroid, radiusKm, { units: 'kilometers' });
    return filterChaleur(features).filter(f => {
        if (f === feature) return false;
        try { return turf.booleanIntersects(buffer, f); } catch (_) { return false; }
    }).length;
}


// ===============================
// 10. Utilitaires
// ===============================

/**
 * Crée une ligne GeoJSON entre deux coordonnées (itinéraire)
 * @param {Array} from - [lng, lat]
 * @param {Array} to   - [lng, lat]
 * @returns {object} GeoJSON Feature LineString
 */
function createRouteLine(from, to) {
    return turf.lineString([from, to]);
}

/** Centroïde d'un feature */
function getFeatureCentroid(feature) {
    return turf.centroid(feature);
}

/**
 * Formate une distance km en texte lisible
 * @param {number} km
 * @returns {string}
 */
function formatDistance(km) {
    if (!isFinite(km) || km == null) return 'N/A';
    if (km < 0.1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(2)} km`;
}

/**
 * Formate une surface ha en texte lisible
 * @param {number} ha
 * @returns {string}
 */
function formatSurface(ha) {
    if (ha >= 100) return `${(ha / 100).toFixed(1)} km²`;
    return `${ha.toFixed(1)} ha`;
}

/**
 * Formate un nombre en locale française
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
    return Number(n).toLocaleString('fr-CA');
}


// ===============================
// 11. Itinéraire piéton via Mapbox Directions API
//     Remplace la ligne droite (vol d'oiseau)
//     par le vrai chemin sur le réseau routier
// ===============================

/**
 * Calcule l'itinéraire piéton entre deux points via Mapbox Directions API
 *
 * @param {Array} from  - [lng, lat] point de départ (îlot de chaleur)
 * @param {Array} to    - [lng, lat] point d'arrivée (refuge)
 * @param {string} token - clé Mapbox (mapboxgl.accessToken)
 * @returns {Promise<{
 *   geometry: GeoJSON LineString,
 *   distanceKm: number,
 *   durationMin: number,
 *   distText: string,
 *   durationText: string
 * } | null>}
 */
/**
 * Calcule un itinéraire entre deux points via Mapbox Directions API
 * @param {Array} from   - [lng, lat]
 * @param {Array} to     - [lng, lat]
 * @param {string} token - clé Mapbox
 * @param {string} mode  - 'walking' | 'driving' | 'cycling'
 * @returns {Promise<object|null>}
 */
async function getRoute(from, to, token, mode = 'walking') {
    const url = `https://api.mapbox.com/directions/v5/mapbox/${mode}/` +
        `${from[0]},${from[1]};${to[0]},${to[1]}` +
        `?geometries=geojson&overview=full&steps=false` +
        `&access_token=${token}`;

    try {
        const res  = await fetch(url);
        const data = await res.json();

        if (!data.routes || data.routes.length === 0) {
            console.warn(`[analysis] Directions API (${mode}): no route found`);
            return null;
        }

        const route       = data.routes[0];
        const distanceKm  = route.distance / 1000;
        const durationMin = Math.ceil(route.duration / 60);

        const modeLabels = {
            walking: { emoji: '🚶', label: 'À pied',           color: '#22c55e' },
            driving: { emoji: '🚗', label: 'En voiture',       color: '#f97316' },
            cycling: { emoji: '🚲', label: 'À vélo',           color: '#a78bfa' }
        };

        return {
            mode,
            geometry:     route.geometry,
            distanceKm,
            durationMin,
            distText:     formatDistance(distanceKm),
            durationText: durationMin < 60
                ? `${durationMin} min`
                : `${Math.floor(durationMin/60)}h${String(durationMin%60).padStart(2,'0')}`,
            ...modeLabels[mode] || modeLabels.walking
        };

    } catch (err) {
        console.warn(`[analysis] Directions API (${mode}) error:`, err);
        return null;
    }
}

// Alias pour compatibilité
async function getWalkingRoute(from, to, token) {
    return getRoute(from, to, token, 'walking');
}

/**
 * Calcule les 3 modes de transport en parallèle
 * @param {Array} from - [lng, lat]
 * @param {Array} to   - [lng, lat]
 * @param {string} token
 * @returns {Promise<{walking, driving, cycling}>}
 */
async function getAllRoutes(from, to, token) {
    const [walking, driving, cycling] = await Promise.all([
        getRoute(from, to, token, 'walking'),
        getRoute(from, to, token, 'driving'),
        getRoute(from, to, token, 'cycling')
    ]);
    return { walking, driving, cycling };
}


// ===============================
// Exports (si module ES)
// ===============================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getIlotsData, getPopulationData, getReseauData,
        filterChaleur, filterFraicheur, filterRoutesByClass,
        getSurfaceHa, getTotalSurfaceKm2,
        findNearestRefuge, countRefugesInRadius, countChaleursNearRefuge,
        findNearestArtere, checkRefugeAccessibility,
        calcRiskScore, scoreToLabel,
        analyzeHeatIsland, analyzeRefuge,
        getGlobalStats, getHeatIslandDensity,
        createRouteLine, getFeatureCentroid,
        formatDistance, formatSurface, formatNumber,
        getRoute, getWalkingRoute, getAllRoutes
    };
}