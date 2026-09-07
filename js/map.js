// ===============================
// map.js
// Carte interactive Mapbox GL JS
// Dépendances : analysis.js (chargé avant)
// ===============================


// ===============================
// 1. Clé Mapbox + carte
// ===============================
mapboxgl.accessToken = 'VOTRE_CLE_MAPBOX_ICI';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-73.5673, 45.5017],
    zoom: 11,
    minZoom: 10,
    maxZoom: 16,
    maxBounds: [[-74.1, 45.3], [-73.3, 45.7]]
});

map.addControl(new mapboxgl.NavigationControl(), 'top-right');


// ===============================
// 2. Variables globales
// ===============================
let activePopup           = null;
let selectedHeatIsland    = null;
let selectedHeatPoint     = null;
let lastNearestFreshPoint = null;

const sidebar   = document.getElementById('sidebar');
const toggleBtn = document.getElementById('sidebar-toggle');
const legend    = document.getElementById('legend');

const populationCheckbox = document.getElementById('population-checkbox');
const ilotsCheckbox      = document.getElementById('ilots-checkbox');
const fraicheurCheckbox  = document.getElementById('fraicheur-checkbox');
const criticalCheckbox   = document.getElementById('critical-checkbox');
const reseauCheckbox     = document.getElementById('reseau-checkbox');
const heatmapCheckbox       = document.getElementById('heatmap-checkbox');
const isochroneCheckbox     = document.getElementById('isochrone-checkbox');
const accessibilityCheckbox = document.getElementById('accessibility-checkbox');

// Isochrone state
let activeIsochrone = null;

// Route state
let activeRouteMode = 'walking';  // mode actif
let activeRouteFrom = null;       // coordonnées départ
let activeRouteTo   = null;       // coordonnées arrivée
let allRoutesCache  = null;       // cache des 3 routes calculées


// ===============================
// 3. Popup unique
// ===============================
function openSinglePopup(lngLat, html) {
    if (activePopup) activePopup.remove();
    activePopup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: '300px'
    })
        .setLngLat(lngLat)
        .setHTML(html)
        .addTo(map);

    // Quand le popup se ferme — effacer marqueurs + itinéraire + isochrone
    activePopup.on('close', () => {
        clearRoute();
        clearIsochrone();
        activePopup = null;
    });
}


// ===============================
// 4. Libellés classes de route
//    (spécifique à l'affichage carte)
// ===============================
const ROAD_LABELS = {
    'Autoroute':              { label: '🛣️ Autoroute',               couleur: '#7c3aed' },
    'Nationale':              { label: '🏛️ Route nationale',          couleur: '#92400e' },
    'Artère':                 { label: '🏙️ Artère urbaine principale', couleur: '#b91c1c' },
    'Collectrice municipale': { label: '🔀 Rue collectrice',          couleur: '#c2410c' },
    'Collectrice de transit': { label: '🔁 Collectrice de transit',   couleur: '#d97706' },
    'Locale':                 { label: '⬜ Rue locale',               couleur: '#64748b' },
    'Liaison maritime':       { label: '⛴️ Liaison maritime',         couleur: '#0369a1' }
};

function getRoadInfo(clsrte) {
    return ROAD_LABELS[clsrte] || { label: clsrte || 'N/A', couleur: '#64748b' };
}


// ===============================
// 5. Couleurs et styles par mode de transport
// ===============================
const ROUTE_STYLES = {
    walking: { color: '#22c55e', width: 4, emoji: '🚶', label: 'À pied',     dasharray: null },
    driving: { color: '#f97316', width: 4, emoji: '🚗', label: 'En voiture', dasharray: null },
    cycling: { color: '#a78bfa', width: 4, emoji: '🚲', label: 'À vélo',     dasharray: null }
};

function applyRouteStyle(mode) {
    const s = ROUTE_STYLES[mode] || ROUTE_STYLES.walking;
    if (map.getLayer('heat-to-fresh-route-layer')) {
        map.setPaintProperty('heat-to-fresh-route-layer', 'line-color', s.color);
    }
    if (map.getLayer('heat-to-fresh-route-casing')) {
        map.setPaintProperty('heat-to-fresh-route-casing', 'line-color',
            mode === 'walking' ? '#ffffff' : 'rgba(255,255,255,0.3)');
    }
}


// ===============================
// 5. Effacer la ligne itinéraire
// ===============================
function clearRoute() {
    if (map.getSource('heat-to-fresh-route')) {
        map.getSource('heat-to-fresh-route').setData({ type: 'FeatureCollection', features: [] });
    }
    // Supprimer les marqueurs départ/arrivée
    if (typeof routeMarkers !== 'undefined') {
        routeMarkers.forEach(m => m.remove());
        routeMarkers = [];
    }
}

// Animation des pointillés sur l'itinéraire
let dashOffset = 0;
function animateRoute() {
    dashOffset = (dashOffset - 0.5) % 7;
    if (map.getLayer('heat-to-fresh-route-dash')) {
        map.setPaintProperty('heat-to-fresh-route-dash', 'line-dasharray', [0, 4, 3]);
    }
    requestAnimationFrame(animateRoute);
}


// ===============================
// 6. Récupération population au point cliqué
//    (via queryRenderedFeatures — spécifique à Mapbox)
// ===============================
async function getPopulationAtPoint(lngLat) {
    if (!map.getLayer('population-layer')) {
        return { population: 0, densite: 0, moins15: 0, plus65: 0, superf: 0 };
    }

    const point = map.project(lngLat);

    // Rayon élargi à 20px pour couvrir les MultiPolygon
    const feats = map.queryRenderedFeatures(
        [[point.x - 20, point.y - 20], [point.x + 20, point.y + 20]],
        { layers: ['population-layer'] }
    );

    // Si rien trouvé avec la couche visible, forcer une requête sur toutes les sources
    if (feats.length === 0) {
        // Chercher dans la source directement (même si couche invisible)
        const allFeats = map.querySourceFeatures('population', {
            sourceLayer: undefined
        });
        const turfPt = turf.point([lngLat.lng, lngLat.lat]);
        const match  = allFeats.find(f => {
            try { return turf.booleanPointInPolygon(turfPt, f); }
            catch(_) { return false; }
        });
        if (match) {
            const pp      = match.properties;
            const pop     = Number(pp.POPULATION_TOTALE) || 0;
            const superf  = Number(pp.SUPTERRE) || 0;
            return {
                population: pop,
                densite:    superf > 0 ? Math.round(pop / superf) : 0,
                moins15:    Number(pp.COUNT_MOINS_15) || 0,
                plus65:     Number(pp.COUNT_65_PLUS)  || 0,
                superf
            };
        }
        return { population: 0, densite: 0, moins15: 0, plus65: 0, superf: 0 };
    }

    const pp      = feats[0].properties;
    const pop     = Number(pp.POPULATION_TOTALE) || 0;
    const superf  = Number(pp.SUPTERRE) || 0;
    return {
        population: pop,
        densite:    superf > 0 ? Math.round(pop / superf) : 0,
        moins15:    Number(pp.COUNT_MOINS_15) || 0,
        plus65:     Number(pp.COUNT_65_PLUS)  || 0,
        superf
    };
}


// ===============================
// 7. Sources et couches
// ===============================
function addDataLayers() {

    // Population
    if (!map.getSource('population')) {
        map.addSource('population', { type: 'geojson', data: 'data/population_montreal.geojson' });
    }
    if (!map.getLayer('population-layer')) {
        map.addLayer({
            id: 'population-layer', type: 'fill', source: 'population',
            paint: {
                'fill-color': [
                    'interpolate', ['linear'], ['coalesce', ['get', 'POPULATION_TOTALE'], 0],
                    0, '#dbeafe', 500, '#93c5fd', 1500, '#3b82f6', 3000, '#1d4ed8', 5000, '#1e3a8a'
                ],
                'fill-opacity': 0.35,
                'fill-outline-color': 'rgba(29,78,216,0.3)'
            }
        });
    }

    // Îlots source commune
    if (!map.getSource('ilots')) {
        map.addSource('ilots', { type: 'geojson', data: 'data/ilots_chaleur_fraicheur.geojson' });
    }

    // Chaleur
    if (!map.getLayer('ilots-layer')) {
        map.addLayer({
            id: 'ilots-layer', type: 'fill', source: 'ilots',
            filter: ['==', ['get', 'Temp_Class'], 5.0],
            paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.55, 'fill-outline-color': 'rgba(185,28,28,0.6)' }
        });
    }

    // Fraîcheur
    if (!map.getLayer('fraicheur-layer')) {
        map.addLayer({
            id: 'fraicheur-layer', type: 'fill', source: 'ilots',
            filter: ['==', ['get', 'Temp_Class'], 1.0],
            paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.55, 'fill-outline-color': 'rgba(14,165,233,0.6)' }
        });
    }

    // Réseau routier
    if (!map.getSource('reseau')) {
        map.addSource('reseau', { type: 'geojson', data: 'data/reseau.geojson' });
    }
    if (!map.getLayer('reseau-layer')) {
        map.addLayer({
            id: 'reseau-layer', type: 'line', source: 'reseau',
            filter: ['in', ['get', 'g_clsrte'], ['literal', ['Autoroute', 'Nationale', 'Artère', 'Collectrice municipale']]],
            layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-color': ['match', ['get', 'g_clsrte'],
                    'Autoroute', '#7c3aed', 'Nationale', '#92400e',
                    'Artère', '#b91c1c', 'Collectrice municipale', '#c2410c', '#94a3b8'],
                'line-width': ['match', ['get', 'g_clsrte'], 'Autoroute', 3, 'Nationale', 2.5, 'Artère', 2, 1.2],
                'line-opacity': 0.85
            }
        }, 'ilots-layer');
    }

    // ── Heatmap thermique (densité des îlots de chaleur) ──
    if (!map.getLayer('heatmap-layer')) {
        map.addLayer({
            id: 'heatmap-layer',
            type: 'heatmap',
            source: 'ilots',
            filter: ['==', ['get', 'Temp_Class'], 5.0],
            layout: { visibility: 'none' },
            paint: {
                'heatmap-weight': 1,
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 16, 2],
                'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0,    'rgba(0,0,0,0)',
                    0.2,  'rgba(251,191,36,0.4)',
                    0.4,  'rgba(249,115,22,0.6)',
                    0.6,  'rgba(239,68,68,0.7)',
                    0.8,  'rgba(185,28,28,0.85)',
                    1.0,  'rgba(127,29,29,1)'
                ],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 18, 16, 40],
                'heatmap-opacity': 0.75
            }
        }, 'ilots-layer');
    }

    // ── Couche d'accessibilité aux refuges ──
    // Colorise les îlots de chaleur selon leur distance au refuge le plus proche
    // Calculée statiquement depuis ilots_chaleur.geojson via les propriétés Shape_Area
    if (!map.getSource('accessibility')) {
        map.addSource('accessibility', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
    }
    if (!map.getLayer('accessibility-layer')) {
        map.addLayer({
            id: 'accessibility-layer',
            type: 'fill',
            source: 'accessibility',
            layout: { visibility: 'none' },
            paint: {
                'fill-color': [
                    'match', ['get', 'access_level'],
                    'excellent', '#22c55e',
                    'bon',       '#fbbf24',
                    'difficile', '#f97316',
                    'isole',     '#dc2626',
                    '#94a3b8'
                ],
                'fill-opacity': 0.65,
                'fill-outline-color': 'rgba(0,0,0,0.15)'
            }
        });
    }

    // ── Source isochrone (initialisée vide) ──
    if (!map.getSource('isochrone')) {
        map.addSource('isochrone', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    if (!map.getLayer('isochrone-layer')) {
        map.addLayer({
            id: 'isochrone-layer',
            type: 'fill',
            source: 'isochrone',
            layout: { visibility: 'none' },
            paint: {
                'fill-color': ['match', ['get', 'contour'],
                    5,  'rgba(34,197,94,0.2)',
                    10, 'rgba(56,189,248,0.15)',
                    15, 'rgba(167,139,250,0.12)',
                    'rgba(56,189,248,0.1)'
                ],
                'fill-outline-color': ['match', ['get', 'contour'],
                    5,  '#22c55e',
                    10, '#38bdf8',
                    15, '#a78bfa',
                    '#38bdf8'
                ]
            }
        }, 'ilots-layer');
    }
    if (!map.getLayer('isochrone-line')) {
        map.addLayer({
            id: 'isochrone-line',
            type: 'line',
            source: 'isochrone',
            layout: { visibility: 'none' },
            paint: {
                'line-color': ['match', ['get', 'contour'],
                    5,  '#22c55e',
                    10, '#38bdf8',
                    15, '#a78bfa',
                    '#38bdf8'
                ],
                'line-width': 2,
                'line-opacity': 0.9
            }
        });
    }

    // Zones critiques — utilise la source 'ilots' (ilots_chaleur.geojson)
    // Dégradé basé sur la densité de population via interpolation visuelle
    if (!map.getLayer('critical-layer')) {
        map.addLayer({
            id: 'critical-layer', type: 'fill', source: 'ilots',
            filter: ['==', ['get', 'Temp_Class'], 5.0],
            layout: { visibility: 'none' },
            paint: {
                // Sans risk_score, on utilise une couleur unique rouge critique
                // Le score réel est calculé dynamiquement au clic via analysis.js
                'fill-color': '#dc2626',
                'fill-opacity': 0.72,
                'fill-outline-color': '#7f1d1d'
            }
        });
    }
    if (!map.getLayer('critical-layer-line')) {
        map.addLayer({
            id: 'critical-layer-line', type: 'line', source: 'ilots',
            filter: ['==', ['get', 'Temp_Class'], 5.0],
            layout: { visibility: 'none' },
            paint: { 'line-color': '#fbbf24', 'line-width': 1.5, 'line-dasharray': [3, 2] }
        });
    }
}


// ===============================
// 8. Highlight layers
// ===============================
function addHighlightLayers() {
    if (!map.getSource('highlight-ilots')) {
        map.addSource('highlight-ilots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    if (!map.getLayer('highlight-ilots-line')) {
        map.addLayer({ id: 'highlight-ilots-line', type: 'line', source: 'highlight-ilots', paint: { 'line-color': '#fde047', 'line-width': 3 } });
    }
    if (!map.getLayer('highlight-ilots-fill')) {
        map.addLayer({ id: 'highlight-ilots-fill', type: 'fill', source: 'highlight-ilots', paint: { 'fill-color': '#fde047', 'fill-opacity': 0.20 } });
    }
    if (!map.getSource('highlight-population')) {
        map.addSource('highlight-population', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    if (!map.getLayer('highlight-population-line')) {
        map.addLayer({ id: 'highlight-population-line', type: 'line', source: 'highlight-population', paint: { 'line-color': '#2563eb', 'line-width': 2.5 } });
    }
    if (!map.getLayer('highlight-population-fill')) {
        map.addLayer({ id: 'highlight-population-fill', type: 'fill', source: 'highlight-population', paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.12 } });
    }

    // Itinéraire refuge
    if (!map.getSource('heat-to-fresh-route')) {
        map.addSource('heat-to-fresh-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

        // Couche 1 : halo blanc (fond du tracé)
        map.addLayer({
            id: 'heat-to-fresh-route-casing',
            type: 'line',
            source: 'heat-to-fresh-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-color': '#ffffff',
                'line-width': 7,
                'line-opacity': 0.4
            }
        });

        // Couche 2 : ligne principale verte pleine
        map.addLayer({
            id: 'heat-to-fresh-route-layer',
            type: 'line',
            source: 'heat-to-fresh-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-color': '#22c55e',
                'line-width': 4,
                'line-opacity': 0.95
            }
        });

        // Couche 3 : pointillés animés par-dessus (effet de déplacement)
        map.addLayer({
            id: 'heat-to-fresh-route-dash',
            type: 'line',
            source: 'heat-to-fresh-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-color': '#ffffff',
                'line-width': 2,
                'line-opacity': 0.7,
                'line-dasharray': [0, 4, 3]
            }
        });
    }
}


// ===============================
// 9. Highlight helpers
// ===============================
function highlightIlot(f) {
    const s = map.getSource('highlight-ilots');
    if (s) s.setData({ type: 'FeatureCollection', features: [f] });
}
function removeHighlightIlot() {
    const s = map.getSource('highlight-ilots');
    if (s) s.setData({ type: 'FeatureCollection', features: [] });
}
function highlightPopulation(f) {
    const s = map.getSource('highlight-population');
    if (s) s.setData({ type: 'FeatureCollection', features: [f] });
}
function removeHighlightPopulation() {
    const s = map.getSource('highlight-population');
    if (s) s.setData({ type: 'FeatureCollection', features: [] });
}


// ===============================
// 10. Visibilité couches
// ===============================
function applyLayerVisibility() {
    const layers = {
        'population-layer':    populationCheckbox,
        'ilots-layer':         ilotsCheckbox,
        'fraicheur-layer':     fraicheurCheckbox,
        'critical-layer':      criticalCheckbox,
        'critical-layer-line': criticalCheckbox,
        'reseau-layer':        reseauCheckbox,
        'heatmap-layer':       heatmapCheckbox,
        'accessibility-layer': accessibilityCheckbox
    };
    // Isochrone — géré automatiquement au clic sur un refuge
    for (const [id, cb] of Object.entries(layers)) {
        if (map.getLayer(id) && cb) {
            map.setLayoutProperty(id, 'visibility', cb.checked ? 'visible' : 'none');
        }
    }
}


// ===============================
// 11. Légende dynamique
// ===============================
function updateLegend() {
    let html = '';

    if (populationCheckbox && populationCheckbox.checked) {
        html += `
        <div class="legend-section">
            <h4>👥 Population (hab.)</h4>
            <div style="background:linear-gradient(to right,#dbeafe,#93c5fd,#3b82f6,#1d4ed8,#1e3a8a);height:10px;border-radius:4px;margin-bottom:4px;"></div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;"><span>0</span><span>500</span><span>1 500</span><span>3 000</span><span>5 000+</span></div>
        </div><hr>`;
    }
    if (ilotsCheckbox && ilotsCheckbox.checked) {
        html += `<div class="legend-section"><h4>🔥 Îlots de chaleur</h4><div><span style="background:#ef4444;width:14px;height:14px;display:inline-block;margin-right:6px;border-radius:2px;vertical-align:middle;"></span>Classe 5 — Très chaud</div></div><hr>`;
    }
    if (fraicheurCheckbox && fraicheurCheckbox.checked) {
        html += `<div class="legend-section"><h4>❄️ Îlots de fraîcheur</h4><div><span style="background:#38bdf8;width:14px;height:14px;display:inline-block;margin-right:6px;border-radius:2px;vertical-align:middle;"></span>Classe 1 — Frais</div></div><hr>`;
    }
    if (criticalCheckbox && criticalCheckbox.checked) {
        html += `
        <div class="legend-section">
            <h4>⚠️ Zones critiques</h4>
            <div style="margin-bottom:3px;"><span style="background:#16a34a;width:14px;height:14px;display:inline-block;margin-right:6px;border-radius:2px;vertical-align:middle;"></span>🟢 Très faible (0)</div>
            <div style="margin-bottom:3px;"><span style="background:#fbbf24;width:14px;height:14px;display:inline-block;margin-right:6px;border-radius:2px;vertical-align:middle;"></span>🟡 Modéré (1)</div>
            <div style="margin-bottom:3px;"><span style="background:#f97316;width:14px;height:14px;display:inline-block;margin-right:6px;border-radius:2px;vertical-align:middle;"></span>🟠 Élevé (2)</div>
            <div style="margin-bottom:3px;"><span style="background:#dc2626;width:14px;height:14px;display:inline-block;margin-right:6px;border-radius:2px;vertical-align:middle;"></span>🔴 Critique (3)</div>
            <div><span style="background:#7f1d1d;width:14px;height:14px;display:inline-block;margin-right:6px;border-radius:2px;vertical-align:middle;"></span>⛔ Extrême (4)</div>
            <div style="font-size:11px;color:#475569;margin-top:4px;">Cliquer un îlot pour le score</div>
        </div><hr>`;
    }
    if (accessibilityCheckbox && accessibilityCheckbox.checked) {
        html += `
        <div class="legend-section">
            <h4>♿ Accessibilité aux refuges</h4>
            <div style="margin-bottom:3px;"><span style="background:#22c55e;width:14px;height:14px;display:inline-block;margin-right:6px;border-radius:2px;vertical-align:middle;"></span>🟢 Excellent (< 0.5 km)</div>
            <div style="margin-bottom:3px;"><span style="background:#fbbf24;width:14px;height:14px;display:inline-block;margin-right:6px;border-radius:2px;vertical-align:middle;"></span>🟡 Bon (0.5 – 1 km)</div>
            <div style="margin-bottom:3px;"><span style="background:#f97316;width:14px;height:14px;display:inline-block;margin-right:6px;border-radius:2px;vertical-align:middle;"></span>🟠 Difficile (1 – 2 km)</div>
            <div><span style="background:#dc2626;width:14px;height:14px;display:inline-block;margin-right:6px;border-radius:2px;vertical-align:middle;"></span>🔴 Isolé (> 2 km)</div>
            <div style="font-size:11px;color:#475569;margin-top:4px;">Distance au refuge le plus proche</div>
        </div><hr>`;
    }
    if (heatmapCheckbox && heatmapCheckbox.checked) {
        html += `
        <div class="legend-section">
            <h4>🌡️ Densité des îlots de chaleur</h4>
            <div style="background:linear-gradient(to right,rgba(251,191,36,.5),rgba(249,115,22,.7),rgba(239,68,68,.8),rgba(127,29,29,1));height:10px;border-radius:4px;margin-bottom:4px;"></div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;"><span>Faible</span><span>Forte densité</span></div>
        </div><hr>`;
    }

    if (reseauCheckbox && reseauCheckbox.checked) {
        html += `
        <div class="legend-section">
            <h4>🛣️ Réseau routier</h4>
            <div style="margin-bottom:3px;"><span style="background:#7c3aed;width:20px;height:4px;display:inline-block;margin-right:6px;vertical-align:middle;border-radius:2px;"></span>Autoroute</div>
            <div style="margin-bottom:3px;"><span style="background:#92400e;width:20px;height:4px;display:inline-block;margin-right:6px;vertical-align:middle;border-radius:2px;"></span>Route nationale</div>
            <div style="margin-bottom:3px;"><span style="background:#b91c1c;width:20px;height:4px;display:inline-block;margin-right:6px;vertical-align:middle;border-radius:2px;"></span>Artère urbaine</div>
            <div><span style="background:#c2410c;width:20px;height:4px;display:inline-block;margin-right:6px;vertical-align:middle;border-radius:2px;"></span>Rue collectrice</div>
        </div><hr>`;
    }

    legend.innerHTML = html;
}


// ===============================
// 12. Changement fond de carte
// ===============================
function changeStyle(styleURL) {
    map.setStyle(styleURL);
    map.once('style.load', () => {
        addDataLayers();
        addHighlightLayers();
        applyLayerVisibility();
        updateLegend();
    });
}


// ===============================
// 13. Contrôle fond de carte
// ===============================
class BasemapControl {
    onAdd(mapInstance) {
        this._map = mapInstance;
        this._container = document.createElement('div');
        this._container.className = 'mapboxgl-ctrl basemap-control';
        const btn  = document.createElement('div');
        btn.className = 'basemap-button';
        btn.textContent = '🗺️';
        const menu = document.createElement('div');
        menu.className = 'basemap-menu';
        [
            { name: 'Light',     style: 'mapbox://styles/mapbox/light-v11' },
            { name: 'OSM',       style: 'mapbox://styles/mapbox/streets-v12' },
            { name: 'Satellite', style: 'mapbox://styles/mapbox/satellite-v9' },
            { name: 'Sombre',    style: 'mapbox://styles/mapbox/dark-v11' },
            { name: 'Terrain',   style: 'mapbox://styles/mapbox/outdoors-v12' }
        ].forEach(opt => {
            const item = document.createElement('div');
            item.textContent = opt.name;
            item.addEventListener('click', () => { changeStyle(opt.style); menu.style.display = 'none'; });
            menu.appendChild(item);
        });
        btn.addEventListener('click', () => { menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; });
        this._container.appendChild(btn);
        this._container.appendChild(menu);
        return this._container;
    }
    onRemove() { this._container.remove(); this._map = undefined; }
}
map.addControl(new BasemapControl(), 'top-right');


// ===============================
// 13b. Réinitialiser la vue
// ===============================
class ResetViewControl {
    onAdd(mapInstance) {
        this._map = mapInstance;
        this._container = document.createElement('div');
        this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
        const btn = document.createElement('button');
        btn.type = 'button'; btn.title = 'Réinitialiser la vue'; btn.textContent = '⟳';
        btn.style.cssText = 'font-size:18px;cursor:pointer;';
        btn.addEventListener('click', () => { this._map.easeTo({ center: [-73.5673, 45.5017], zoom: 11, duration: 800 }); });
        this._container.appendChild(btn);
        return this._container;
    }
    onRemove() { this._container.remove(); this._map = undefined; }
}
map.addControl(new ResetViewControl(), 'top-right');

// Géolocalisation
map.addControl(new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
}), 'top-right');


// ===============================
// 14. Sidebar toggle
// ===============================
if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        toggleBtn.textContent = sidebar.classList.contains('collapsed') ? '▶' : '◀';
    });
}


// ===============================
// 15. Checkboxes
// ===============================
[populationCheckbox, ilotsCheckbox, fraicheurCheckbox, criticalCheckbox, reseauCheckbox, heatmapCheckbox].forEach(cb => {
    if (cb) cb.addEventListener('change', () => { applyLayerVisibility(); updateLegend(); });
});

// Accessibilité — calcul au premier clic
if (accessibilityCheckbox) {
    accessibilityCheckbox.addEventListener('change', async () => {
        if (accessibilityCheckbox.checked) {
            // Construire la couche si pas encore fait
            const src = map.getSource('accessibility');
            if (src) {
                // Vérifier si la couche est déjà calculée
                const features = map.querySourceFeatures('accessibility');
                const isEmpty = features.length === 0;
                if (isEmpty) {
                    accessibilityCheckbox.disabled = true;
                    accessibilityCheckbox.parentElement.style.opacity = '0.5';
                    await buildAccessibilityLayer();
                    accessibilityCheckbox.disabled = false;
                    accessibilityCheckbox.parentElement.style.opacity = '1';
                }
            }
        }
        applyLayerVisibility();
        updateLegend();
    });
}


// ===============================
// 16. Survol
// ===============================
map.on('mousemove', (e) => {
    const layers = ['fraicheur-layer', 'ilots-layer', 'population-layer', 'critical-layer', 'reseau-layer']
        .filter(l => map.getLayer(l));
    if (!layers.length) return;

    const features = map.queryRenderedFeatures(e.point, { layers });
    removeHighlightIlot();
    removeHighlightPopulation();

    if (!features.length) { map.getCanvas().style.cursor = ''; return; }
    map.getCanvas().style.cursor = 'pointer';

    const id = features[0].layer.id;
    if (['ilots-layer', 'fraicheur-layer', 'critical-layer'].includes(id)) highlightIlot(features[0]);
    else if (id === 'population-layer') highlightPopulation(features[0]);
});

map.on('mouseout', () => {
    map.getCanvas().style.cursor = '';
    removeHighlightIlot();
    removeHighlightPopulation();
});


// ===============================
// 16b. Changer le mode de transport
// ===============================
async function switchRouteMode(mode) {
    if (!activeRouteFrom || !activeRouteTo) return;
    activeRouteMode = mode;

    // Mettre à jour le style des boutons du popup
    document.querySelectorAll('.route-mode-btn').forEach(btn => {
        btn.style.background = btn.dataset.mode === mode
            ? ROUTE_STYLES[mode].color
            : 'rgba(255,255,255,.06)';
        btn.style.color = btn.dataset.mode === mode ? '#fff' : '#94a3b8';
        btn.style.borderColor = btn.dataset.mode === mode
            ? ROUTE_STYLES[mode].color
            : 'rgba(255,255,255,.12)';
    });

    // Utiliser le cache si disponible
    let routeData = allRoutesCache ? allRoutesCache[mode] : null;

    if (!routeData) {
        routeData = await getRoute(activeRouteFrom, activeRouteTo, mapboxgl.accessToken, mode);
    }

    if (routeData) {
        map.getSource('heat-to-fresh-route').setData({
            type: 'Feature',
            geometry: routeData.geometry
        });
        applyRouteStyle(mode);

        // Mettre à jour les infos dans le popup
        const distEl = document.getElementById('route-dist');
        const durEl  = document.getElementById('route-dur');
        if (distEl) distEl.textContent = routeData.distText;
        if (durEl)  durEl.textContent  = `${routeData.emoji} ${routeData.durationText}`;
    }
}


// ===============================
// 17. Centrer sur le refuge
// ===============================
function flyToRefuge() {
    if (!lastNearestFreshPoint) return;
    map.flyTo({ center: lastNearestFreshPoint.geometry.coordinates, zoom: 14, duration: 1200 });
}


// ===============================
// 18. Clic principal
//     Délègue les calculs à analysis.js
// ===============================
map.on('click', async (e) => {
    const layers = ['fraicheur-layer', 'ilots-layer', 'population-layer', 'critical-layer', 'reseau-layer']
        .filter(l => map.getLayer(l));
    if (!layers.length) return;

    const features = map.queryRenderedFeatures(e.point, { layers });

    if (!features.length) {
        if (activePopup) { activePopup.remove(); activePopup = null; }
        clearRoute();
        clearIsochrone();
        return;
    }

    const feature = features[0];
    const p       = feature.properties;
    const layerId = feature.layer.id;


    // ── RÉSEAU ROUTIER ──────────────────────────────
    if (layerId === 'reseau-layer') {
        const roadInfo = getRoadInfo(p.g_clsrte || 'N/A');
        const nom      = p.g_nomrte   || 'Segment sans nom';
        const voies    = p.g_nbrvoies || 'N/A';
        const gestion  = p.g_gestion  || 'N/A';
        const etat     = p.g_etatrev  || 'N/A';
        const longueur = p.Shape_Leng ? (Number(p.Shape_Leng) / 1000).toFixed(3) : 'N/A';

        openSinglePopup(e.lngLat, `
            <div style="font-family:system-ui;width:270px;">
                <h4 style="margin:0 0 4px;color:${roadInfo.couleur};">${nom}</h4>
                <div style="font-size:12px;font-weight:600;color:${roadInfo.couleur};margin-bottom:8px;">${roadInfo.label}</div>
                <table style="width:100%;font-size:13px;border-collapse:collapse;">
                    <tr><td style="padding:3px 0;color:#64748b;">Nb voies</td><td style="text-align:right;">${voies}</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">Gestion</td><td style="text-align:right;">${gestion}</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">Revêtement</td><td style="text-align:right;">${etat}</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">Longueur segment</td><td style="text-align:right;">${longueur} km</td></tr>
                </table>
            </div>`);
        return;
    }


    // ── POPULATION + ANALYSE PAR ARRONDISSEMENT ────
    if (layerId === 'population-layer') {
        const population = Number(p.POPULATION_TOTALE) || 0;
        const superfTerr = Number(p.SUPTERRE) || 0;
        const densite    = superfTerr > 0 ? Math.round(population / superfTerr) : 0;
        const moins15    = Number(p.COUNT_MOINS_15) || 0;
        const plus65     = Number(p.COUNT_65_PLUS)  || 0;
        const pctMoins15 = population > 0 ? ((moins15 / population) * 100).toFixed(1) : '0';
        const pctPlus65  = population > 0 ? ((plus65  / population) * 100).toFixed(1) : '0';
        const adidu      = p.ADIDU || 'N/A';

        let densLabel = '⬜ Très faible';
        if (densite > 5000)      densLabel = '🟦 Très dense';
        else if (densite > 3000) densLabel = '🟪 Dense';
        else if (densite > 1500) densLabel = '🟧 Modérée';
        else if (densite > 500)  densLabel = '🟨 Faible';

        // Indice de vulnérabilité (enfants + aînés)
        const pctVuln = parseFloat(pctMoins15) + parseFloat(pctPlus65);
        let vulnLabel = '🟢 Faible';
        if      (pctVuln > 40) vulnLabel = '🔴 Très élevée';
        else if (pctVuln > 25) vulnLabel = '🟠 Élevée';
        else if (pctVuln > 15) vulnLabel = '🟡 Modérée';

        // ── Analyse thermique du secteur ──
        const clickPoint = turf.point([e.lngLat.lng, e.lngLat.lat]);
        let nbChaleurSecteur = 0;
        let nbFraicheurSecteur = 0;
        let scoreMoyen = 'N/A';

        try {
            const ilotsData = await getIlotsData();
            const buf1km    = turf.buffer(clickPoint, 1.0, { units: 'kilometers' });
            nbChaleurSecteur  = ilotsData.features.filter(f => {
                if (Number(f.properties.Temp_Class) !== 5.0) return false;
                try { return turf.booleanIntersects(buf1km, f); } catch(_) { return false; }
            }).length;
            nbFraicheurSecteur = ilotsData.features.filter(f => {
                if (Number(f.properties.Temp_Class) !== 1.0) return false;
                try { return turf.booleanIntersects(buf1km, f); } catch(_) { return false; }
            }).length;

            // Score moyen du secteur
            if (nbChaleurSecteur > 0) {
                const ratio = nbFraicheurSecteur / nbChaleurSecteur;
                if (ratio < 0.1)      scoreMoyen = '🔴 Très critique';
                else if (ratio < 0.2) scoreMoyen = '🟠 Élevé';
                else if (ratio < 0.4) scoreMoyen = '🟡 Modéré';
                else                  scoreMoyen = '🟢 Favorable';
            }
        } catch(err) {}

        openSinglePopup(e.lngLat, `
            <div style="font-family:system-ui;width:270px;">
                <h4 style="margin:0 0 4px;color:#1d4ed8;">👥 Aire de diffusion</h4>
                <div style="font-size:12px;color:#64748b;margin-bottom:8px;">Code : ${adidu}</div>

                <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.05em;margin-bottom:5px;">👥 DÉMOGRAPHIE</div>
                <table style="width:100%;font-size:13px;border-collapse:collapse;">
                    <tr><td style="padding:3px 0;color:#64748b;">Population totale</td>
                        <td style="text-align:right;font-weight:600;">${population.toLocaleString('fr-CA')} hab.</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">Superficie terrestre</td>
                        <td style="text-align:right;">${superfTerr.toFixed(2)} km²</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">Densité</td>
                        <td style="text-align:right;font-weight:600;">${densite.toLocaleString('fr-CA')} hab/km²</td></tr>
                </table>
                <div style="margin-top:6px;padding:5px 8px;background:rgba(30,41,59,.6);border-radius:5px;font-size:12px;color:#e2e8f0;">${densLabel}</div>

                <hr style="margin:8px 0;border:none;border-top:1px solid rgba(255,255,255,.08);">
                <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.05em;margin-bottom:7px;">⚠️ TRANCHES D'ÂGE & VULNÉRABILITÉ</div>

                <!-- Barres de répartition par âge -->
                <div style="margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:3px;">
                        <span>👶 < 15 ans</span><span>${pctMoins15}% · ${moins15.toLocaleString('fr-CA')} hab.</span>
                    </div>
                    <div style="background:rgba(255,255,255,.06);border-radius:3px;height:5px;overflow:hidden;">
                        <div style="width:${pctMoins15}%;height:100%;background:#38bdf8;border-radius:3px;"></div>
                    </div>
                </div>
                <div style="margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:3px;">
                        <span>🧑 15–64 ans</span><span>${(100 - parseFloat(pctMoins15) - parseFloat(pctPlus65)).toFixed(1)}% · ${(population - moins15 - plus65).toLocaleString('fr-CA')} hab.</span>
                    </div>
                    <div style="background:rgba(255,255,255,.06);border-radius:3px;height:5px;overflow:hidden;">
                        <div style="width:${(100 - parseFloat(pctMoins15) - parseFloat(pctPlus65)).toFixed(1)}%;height:100%;background:#2dd4bf;border-radius:3px;"></div>
                    </div>
                </div>
                <div style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:3px;">
                        <span>👴 ≥ 65 ans</span><span>${pctPlus65}% · ${plus65.toLocaleString('fr-CA')} hab.</span>
                    </div>
                    <div style="background:rgba(255,255,255,.06);border-radius:3px;height:5px;overflow:hidden;">
                        <div style="width:${pctPlus65}%;height:100%;background:#f97316;border-radius:3px;"></div>
                    </div>
                </div>

                <!-- Score de vulnérabilité -->
                <div style="padding:8px 10px;border-radius:6px;background:rgba(30,41,59,.7);border:1px solid rgba(255,255,255,.08);">
                    <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">Indice de vulnérabilité</div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div style="flex:1;background:rgba(255,255,255,.06);border-radius:4px;height:8px;overflow:hidden;">
                            <div style="width:${Math.min(100,pctVuln).toFixed(1)}%;height:100%;background:${pctVuln > 40 ? '#dc2626' : pctVuln > 25 ? '#f97316' : pctVuln > 15 ? '#fbbf24' : '#22c55e'};border-radius:4px;transition:width .3s;"></div>
                        </div>
                        <span style="font-size:13px;font-weight:700;color:#fff;white-space:nowrap;">${pctVuln.toFixed(1)}%</span>
                    </div>
                    <div style="font-size:12px;margin-top:4px;">${vulnLabel}</div>
                </div>

                <hr style="margin:8px 0;border:none;border-top:1px solid rgba(255,255,255,.08);">
                <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.05em;margin-bottom:5px;">🌡️ ANALYSE THERMIQUE (rayon 1 km)</div>
                <table style="width:100%;font-size:13px;border-collapse:collapse;">
                    <tr><td style="padding:3px 0;color:#64748b;">Îlots de chaleur</td>
                        <td style="text-align:right;font-weight:600;color:#ef4444;">${nbChaleurSecteur}</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">Îlots de fraîcheur</td>
                        <td style="text-align:right;font-weight:600;color:#38bdf8;">${nbFraicheurSecteur}</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">Pression thermique</td>
                        <td style="text-align:right;">${scoreMoyen}</td></tr>
                </table>
            </div>`);
        return;
    }


    // ── ÎLOT DE CHALEUR ─────────────────────────────
    if (layerId === 'ilots-layer' || layerId === 'critical-layer') {
        selectedHeatIsland = feature;
        selectedHeatPoint  = turf.point([e.lngLat.lng, e.lngLat.lat]);

        // Population via Mapbox
        const popData = await getPopulationAtPoint(e.lngLat);
        const { population, densite, moins15, plus65 } = popData;

        // ── Analyse spatiale via analysis.js ──
        const result = await analyzeHeatIsland(feature, e.lngLat, densite);

        // ── Itinéraire multi-modal via Mapbox Directions API ──
        let walkRoute = null;
        activeRouteTo   = null;
        activeRouteFrom = null;
        allRoutesCache  = null;
        activeRouteMode = 'walking';

        if (result.refuge.point) {
            lastNearestFreshPoint = result.refuge.point;
            activeRouteFrom = selectedHeatPoint.geometry.coordinates;
            activeRouteTo   = result.refuge.point.geometry.coordinates;

            // Calculer les 3 modes en parallèle
            allRoutesCache = await getAllRoutes(activeRouteFrom, activeRouteTo, mapboxgl.accessToken);
            walkRoute = allRoutesCache.walking;

            if (walkRoute) {
                map.getSource('heat-to-fresh-route').setData({
                    type: 'Feature', geometry: walkRoute.geometry
                });
                applyRouteStyle('walking');
            } else {
                // Fallback ligne droite
                map.getSource('heat-to-fresh-route').setData(
                    createRouteLine(activeRouteFrom, activeRouteTo)
                );
            }
            addRouteMarkers(activeRouteFrom, activeRouteTo);
        }

        const { surfaceHa, refuge, artere, risk } = result;
        const dotDensite = densite > 3000 ? '●●' : densite > 1000 ? '●○' : '○○';
        const dotRefuge  = refuge.distance > 1.0 ? '●' : '○';
        const dotArtere  = artere.found ? '●' : '○';

        openSinglePopup(e.lngLat, `
            <div style="font-family:system-ui;width:270px;">
                <h4 style="margin:0 0 4px;color:#b91c1c;">🔥 Îlot de chaleur</h4>

                <table style="width:100%;font-size:13px;border-collapse:collapse;">
                    <tr><td style="padding:3px 0;color:#64748b;">Surface réelle</td>
                        <td style="text-align:right;font-weight:600;">${formatSurface(surfaceHa)}</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">Classe thermique</td>
                        <td style="text-align:right;">Classe 5 — Très chaud</td></tr>
                </table>

                <hr style="margin:8px 0;border:none;border-top:1px solid #f1f5f9;">
                <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.05em;margin-bottom:5px;">👥 POPULATION EXPOSÉE</div>
                <table style="width:100%;font-size:13px;border-collapse:collapse;">
                    <tr><td style="padding:3px 0;color:#64748b;">Population totale</td>
                        <td style="text-align:right;">${formatNumber(population)} hab.</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">Densité</td>
                        <td style="text-align:right;font-weight:600;">${formatNumber(densite)} hab/km²</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">< 15 ans</td>
                        <td style="text-align:right;color:#fbbf24;">${formatNumber(popData.moins15)} hab.</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">≥ 65 ans</td>
                        <td style="text-align:right;color:#f97316;">${formatNumber(popData.plus65)} hab.</td></tr>
                </table>

                <hr style="margin:8px 0;border:none;border-top:1px solid #f1f5f9;">
                <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.05em;margin-bottom:8px;">❄️ ACCÈS AUX REFUGES</div>

                <!-- Sélecteur de mode de transport -->
                <div style="display:flex;gap:5px;margin-bottom:10px;">
                    <button class="route-mode-btn" data-mode="walking"
                        onclick="switchRouteMode('walking')"
                        style="flex:1;padding:6px 4px;border-radius:6px;border:1px solid #22c55e;background:#22c55e;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">
                        🚶 Pied
                    </button>
                    <button class="route-mode-btn" data-mode="driving"
                        onclick="switchRouteMode('driving')"
                        style="flex:1;padding:6px 4px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#94a3b8;font-size:12px;font-weight:600;cursor:pointer;">
                        🚗 Voiture
                    </button>
                    <button class="route-mode-btn" data-mode="cycling"
                        onclick="switchRouteMode('cycling')"
                        style="flex:1;padding:6px 4px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#94a3b8;font-size:12px;font-weight:600;cursor:pointer;">
                        🚲 Vélo
                    </button>
                </div>

                <!-- Infos de l'itinéraire actif -->
                <table style="width:100%;font-size:13px;border-collapse:collapse;">
                    <tr><td style="padding:3px 0;color:#64748b;">Distance</td>
                        <td id="route-dist" style="text-align:right;font-weight:600;">${walkRoute ? walkRoute.distText : result.refuge.distText}</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">Durée estimée</td>
                        <td id="route-dur" style="text-align:right;">🚶 ${walkRoute ? walkRoute.durationText : 'N/A'}</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">Refuges à ≤ 1 km</td>
                        <td style="text-align:right;">${refuge.nbProches}</td></tr>
                </table>



                ${artere.found ? `
                <hr style="margin:8px 0;border:none;border-top:1px solid #f1f5f9;">
                <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.05em;margin-bottom:4px;">🛣️ RÉSEAU ROUTIER</div>
                <div style="font-size:13px;">Route majeure à ≤ 150 m :<br>
                    <strong style="color:#b91c1c;">${artere.name}</strong><br>
                    <span style="font-size:11px;color:#94a3b8;">${getRoadInfo(artere.class).label}</span>
                </div>` : ''}

                <hr style="margin:8px 0;border:none;border-top:1px solid #f1f5f9;">
                <div style="padding:10px;border-radius:8px;background:${risk.label.bg};border:1px solid ${risk.label.border};">
                    <div style="font-size:15px;font-weight:700;color:${risk.label.couleur};">${risk.label.emoji} Risque ${risk.label.label}</div>
                    <div style="font-size:11px;color:#64748b;margin-top:5px;line-height:1.6;">
                        Score <strong>${risk.score}/4</strong><br>
                        Densité : ${dotDensite} &nbsp;|&nbsp; Refuge : ${dotRefuge} &nbsp;|&nbsp; Artère : ${dotArtere}
                    </div>
                </div>

                ${lastNearestFreshPoint ? `
                <button onclick="flyToRefuge()" style="margin-top:8px;padding:7px 0;width:100%;background:#0ea5e9;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">
                    📍 Centrer sur le refuge ❄️
                </button>` : ''}
            </div>`);
        return;
    }


    // ── ÎLOT DE FRAÎCHEUR ───────────────────────────
    if (layerId === 'fraicheur-layer') {

        // Population sous le clic
        const popData = await getPopulationAtPoint(e.lngLat);
        const { } = popData;

        // ── Analyse spatiale via analysis.js ──
        const result = await analyzeRefuge(feature);
        const { surfaceHa, capaciteEst, thermique, accessibilite } = result;

        // ── Isochrone piéton autour du refuge ──
        const refugeCentroid = getFeatureCentroid(feature);
        await showIsochrone(refugeCentroid.geometry.coordinates);

        openSinglePopup(e.lngLat, `
            <div style="font-family:system-ui;width:270px;">
                <h4 style="margin:0 0 4px;color:#0284c7;">❄️ Îlot de fraîcheur</h4>

                <table style="width:100%;font-size:13px;border-collapse:collapse;">
                    <tr><td style="padding:3px 0;color:#64748b;">Surface réelle</td>
                        <td style="text-align:right;font-weight:600;">${formatSurface(surfaceHa)}</td></tr>
                    <tr><td style="padding:3px 0;color:#64748b;">Classe thermique</td>
                        <td style="text-align:right;">Classe 1 — Frais</td></tr>
                </table>

                <hr style="margin:8px 0;border:none;border-top:1px solid #f1f5f9;">
                <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.05em;margin-bottom:5px;">🔥 CONTEXTE THERMIQUE</div>
                <table style="width:100%;font-size:13px;border-collapse:collapse;">
                    <tr><td style="padding:3px 0;color:#64748b;">Îlots de chaleur à ≤ 1 km</td>
                        <td style="text-align:right;font-weight:600;">${thermique.nbChaleursProches}</td></tr>
                </table>
                <div style="margin-top:6px;padding:6px 8px;background:#f0f9ff;border-radius:5px;border-left:3px solid #0ea5e9;font-size:12px;color:#0369a1;">
                    ${thermique.contexteLabel}
                </div>

                <hr style="margin:8px 0;border:none;border-top:1px solid #f1f5f9;">
                <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.05em;margin-bottom:4px;">🛣️ ACCESSIBILITÉ</div>
                <div style="font-size:12px;padding:5px 8px;background:rgba(30,41,59,.6);border-radius:5px;border-left:3px solid #94a3b8;color:#e2e8f0;">
                    ${accessibilite.label}
                </div>

                <div style="margin-top:8px;padding:6px 8px;background:rgba(34,197,94,.08);border-radius:5px;border-left:3px solid #22c55e;font-size:12px;color:#22c55e;">
                    🚶 Zone d'accessibilité piétonne (5/10/15 min) affichée sur la carte
                </div>
            </div>`);
        return;
    }
});


// ===============================
// 18a. Couche d'accessibilité — calcul depuis les données
// ===============================
async function buildAccessibilityLayer() {
    try {
        const ilotsData = await getIlotsData();
        const chaleur   = ilotsData.features.filter(f => Number(f.properties.Temp_Class) === 5.0);
        const refuges   = ilotsData.features.filter(f => Number(f.properties.Temp_Class) === 1.0);

        if (!chaleur.length || !refuges.length) return;

        // Optimisation : on calcule les centroïdes des refuges une seule fois
        // puis on fait une distance point-à-point (beaucoup plus rapide que polygonToLine)
        const refugeCentroids = refuges.map(r => {
            try { return turf.centroid(r).geometry.coordinates; }
            catch(_) { return null; }
        }).filter(Boolean);

        const enriched = chaleur.map(feat => {
            let centroid;
            try { centroid = turf.centroid(feat).geometry.coordinates; }
            catch(_) { return { ...feat, properties: { ...feat.properties, access_level: 'difficile', dist_refuge: '1.00' } }; }

            // Distance au centroïde du refuge le plus proche (approximation rapide)
            let minDist = Infinity;
            refugeCentroids.forEach(rc => {
                const d = turf.distance(centroid, rc, { units: 'kilometers' });
                if (d < minDist) minDist = d;
            });

            // Niveau d'accessibilité (seuils ajustés pour centroïde-centroïde)
            let access_level;
            if      (minDist < 0.8) access_level = 'excellent';
            else if (minDist < 1.5) access_level = 'bon';
            else if (minDist < 2.5) access_level = 'difficile';
            else                    access_level = 'isole';

            return {
                ...feat,
                properties: { ...feat.properties, access_level, dist_refuge: minDist.toFixed(2) }
            };
        });

        map.getSource('accessibility').setData({
            type: 'FeatureCollection',
            features: enriched
        });

        console.log('[map] Accessibilité calculée:', enriched.length, 'îlots');

    } catch (err) {
        console.warn('[map] Accessibility layer error:', err);
    }
}


// ===============================
// 18b. Marqueurs départ / arrivée de l'itinéraire
// ===============================
let routeMarkers = [];

function addRouteMarkers(from, to) {
    // Supprimer les anciens marqueurs
    routeMarkers.forEach(m => m.remove());
    routeMarkers = [];

    // Marqueur départ — 🔥 rouge
    const elFrom = document.createElement('div');
    elFrom.style.cssText = `
        width: 32px; height: 32px;
        background: #ef4444;
        border: 3px solid #fff;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 4px 12px rgba(239,68,68,0.5);
        cursor: pointer;
    `;
    const innerFrom = document.createElement('div');
    innerFrom.style.cssText = `
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        transform: rotate(45deg); font-size: 14px;
    `;
    innerFrom.textContent = '🔥';
    elFrom.appendChild(innerFrom);

    const markerFrom = new mapboxgl.Marker({ element: elFrom, anchor: 'bottom-left' })
        .setLngLat(from)
        .addTo(map);
    routeMarkers.push(markerFrom);

    // Marqueur arrivée — ❄️ bleu
    const elTo = document.createElement('div');
    elTo.style.cssText = `
        width: 32px; height: 32px;
        background: #0ea5e9;
        border: 3px solid #fff;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 4px 12px rgba(14,165,233,0.5);
        cursor: pointer;
    `;
    const innerTo = document.createElement('div');
    innerTo.style.cssText = `
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        transform: rotate(45deg); font-size: 14px;
    `;
    innerTo.textContent = '❄️';
    elTo.appendChild(innerTo);

    const markerTo = new mapboxgl.Marker({ element: elTo, anchor: 'bottom-left' })
        .setLngLat(to)
        .addTo(map);
    routeMarkers.push(markerTo);
}


// ===============================
// 18b. Isochrone piéton — Mapbox Isochrone API
// ===============================
async function showIsochrone(lngLat) {
    const url = `https://api.mapbox.com/isochrone/v1/mapbox/walking/${lngLat[0]},${lngLat[1]}` +
        `?contours_minutes=5,10,15&polygons=true&denoise=1&generalize=500` +
        `&access_token=${mapboxgl.accessToken}`;

    try {
        const res  = await fetch(url);
        const data = await res.json();

        if (!data.features || data.features.length === 0) return;

        // L'API Mapbox retourne 'contour' en minutes dans les propriétés
        // On s'assure que la propriété est bien présente
        data.features.forEach(f => {
            // contour_minutes ou contour selon la version API
            if (!f.properties.contour) {
                f.properties.contour = f.properties.contour_minutes ||
                                       f.properties.time || 10;
            }
        });

        map.getSource('isochrone').setData(data);

        // Activer les couches isochrone — indépendamment de la checkbox
        map.setLayoutProperty('isochrone-layer', 'visibility', 'visible');
        map.setLayoutProperty('isochrone-line',  'visibility', 'visible');

        // Synchroniser la checkbox
        if (isochroneCheckbox) {
            isochroneCheckbox.checked = true;
            updateLegend();
        }

        activeIsochrone = lngLat;
        console.log('[map] Isochrone loaded:', data.features.length, 'zones');

    } catch (err) {
        console.warn('[map] Isochrone API error:', err);
    }
}

function clearIsochrone() {
    if (map.getSource('isochrone')) {
        map.getSource('isochrone').setData({ type: 'FeatureCollection', features: [] });
    }
    map.setLayoutProperty('isochrone-layer', 'visibility', 'none');
    map.setLayoutProperty('isochrone-line',  'visibility', 'none');
    activeIsochrone = null;
}


// ===============================
// 19. Chargement initial
// ===============================
map.on('load', () => {
    // S'assurer que les couches par défaut sont bien cochées
    if (populationCheckbox) populationCheckbox.checked = true;
    if (ilotsCheckbox)      ilotsCheckbox.checked      = true;
    if (fraicheurCheckbox)  fraicheurCheckbox.checked   = true;
    if (reseauCheckbox)     reseauCheckbox.checked      = false;
    if (criticalCheckbox)   criticalCheckbox.checked    = false;
    if (heatmapCheckbox)    heatmapCheckbox.checked     = false;
    if (isochroneCheckbox)       isochroneCheckbox.checked       = false;
    if (accessibilityCheckbox)   accessibilityCheckbox.checked   = false;

    addDataLayers();
    addHighlightLayers();
    applyLayerVisibility();
    updateLegend();
    animateRoute();
});