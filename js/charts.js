// ===============================
// charts.js
// Module de visualisation Chart.js
// Îlots de chaleur — Montréal
// ===============================

// ===============================
// 1. Palette de couleurs globale
// ===============================
const CHART_COLORS = {
    red:    { solid: 'rgba(239,68,68,1)',   fill: 'rgba(239,68,68,0.65)'   },
    blue:   { solid: 'rgba(56,189,248,1)',  fill: 'rgba(56,189,248,0.65)'  },
    gold:   { solid: 'rgba(251,191,36,1)',  fill: 'rgba(251,191,36,0.65)'  },
    green:  { solid: 'rgba(34,197,94,1)',   fill: 'rgba(34,197,94,0.65)'   },
    orange: { solid: 'rgba(249,115,22,1)',  fill: 'rgba(249,115,22,0.65)'  },
    purple: { solid: 'rgba(167,139,250,1)', fill: 'rgba(167,139,250,0.65)' },
    teal:   { solid: 'rgba(45,212,191,1)',  fill: 'rgba(45,212,191,0.65)'  },
    gray:   { solid: 'rgba(100,116,139,1)', fill: 'rgba(100,116,139,0.6)'  },
    darkred:{ solid: 'rgba(127,29,29,1)',   fill: 'rgba(127,29,29,0.7)'    },
};

// Couleurs par score de risque
const RISK_COLORS = [
    CHART_COLORS.green,
    CHART_COLORS.gold,
    CHART_COLORS.orange,
    CHART_COLORS.red,
    CHART_COLORS.darkred
];

// ===============================
// 2. Options par défaut Chart.js
// ===============================
const CHART_DEFAULTS = {
    font: { family: 'DM Sans, system-ui, sans-serif', size: 12 },
    tickColor: '#64748b',
    gridColor: 'rgba(255,255,255,0.05)',
    legendColor: '#94a3b8',
};

function buildScales(opts = {}) {
    const base = {
        x: {
            ticks: { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.font },
            grid:  { color: CHART_DEFAULTS.gridColor }
        },
        y: {
            ticks: { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.font },
            grid:  { color: CHART_DEFAULTS.gridColor }
        }
    };
    if (opts.xHidden)       base.x.grid.display = false;
    if (opts.yLog)          base.y.type = 'logarithmic';
    if (opts.horizontal)    base.indexAxis = 'y';
    if (opts.yBeginAtZero !== false) { if (!base.y.min) base.y.min = 0; }
    return base;
}

function buildLegend(position = 'bottom') {
    return {
        position,
        labels: {
            color:   CHART_DEFAULTS.legendColor,
            padding: 14,
            font:    CHART_DEFAULTS.font,
            usePointStyle: true,
            pointStyleWidth: 10
        }
    };
}

function buildTooltip() {
    return {
        backgroundColor: 'rgba(15,23,42,0.95)',
        titleColor:      '#fff',
        bodyColor:       '#94a3b8',
        borderColor:     'rgba(255,255,255,0.08)',
        borderWidth:     1,
        padding:         10,
        cornerRadius:    8,
        titleFont:       { family: 'Syne, sans-serif', weight: '700', size: 13 },
        bodyFont:        { family: 'DM Sans, sans-serif', size: 12 }
    };
}

// ===============================
// 3. Registre des instances
//    (permet de détruire/recréer)
// ===============================
const CHART_INSTANCES = {};

function destroyChart(id) {
    if (CHART_INSTANCES[id]) {
        CHART_INSTANCES[id].destroy();
        delete CHART_INSTANCES[id];
    }
}

function registerChart(id, instance) {
    destroyChart(id);
    CHART_INSTANCES[id] = instance;
    return instance;
}


// ===============================
// 4. Graphique : Répartition thermique (Doughnut)
// ===============================
function createChartRepartition(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    return registerChart(canvasId, new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['🔥 Îlots de chaleur', '❄️ Îlots de fraîcheur'],
            datasets: [{
                data: [3068, 1030],
                backgroundColor: [CHART_COLORS.red.fill, CHART_COLORS.blue.fill],
                borderColor:     [CHART_COLORS.red.solid, CHART_COLORS.blue.solid],
                borderWidth: 2,
                hoverOffset: 10
            }]
        },
        options: {
            cutout: '65%',
            plugins: {
                legend:  buildLegend('bottom'),
                tooltip: buildTooltip(),
                // Label central
                centerText: { text: '4 098', subtext: 'îlots' }
            }
        },
        plugins: [{
            id: 'centerText',
            afterDraw(chart) {
                const { ctx, chartArea: { width, height, left, top } } = chart;
                const cx = left + width / 2;
                const cy = top  + height / 2;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 1.4rem Syne, sans-serif';
                ctx.fillText('4 098', cx, cy - 8);
                ctx.fillStyle = '#64748b';
                ctx.font = '0.75rem DM Sans, sans-serif';
                ctx.fillText('îlots', cx, cy + 12);
                ctx.restore();
            }
        }]
    }));
}


// ===============================
// 5. Graphique : Surface couverte (Bar horizontal)
// ===============================
function createChartSurface(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    return registerChart(canvasId, new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['🔥 Chaleur', '❄️ Fraîcheur'],
            datasets: [{
                label: 'km²',
                data: [5311, 942],
                backgroundColor: [CHART_COLORS.red.fill, CHART_COLORS.blue.fill],
                borderColor:     [CHART_COLORS.red.solid, CHART_COLORS.blue.solid],
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            indexAxis: 'y',
            plugins: {
                legend:  { display: false },
                tooltip: buildTooltip()
            },
            scales: {
                x: { ticks: { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.font }, grid: { color: CHART_DEFAULTS.gridColor } },
                y: { ticks: { color: '#94a3b8', font: { ...CHART_DEFAULTS.font, size: 13 } }, grid: { display: false } }
            }
        }
    }));
}


// ===============================
// 6. Graphique : Distribution des scores de risque (Bar)
// ===============================
function createChartRisk(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = [
        'Score 0 — 🟢 Très faible',
        'Score 1 — 🟡 Modéré',
        'Score 2 — 🟠 Élevé',
        'Score 3 — 🔴 Critique',
        'Score 4 — ⛔ Extrême'
    ];

    return registerChart(canvasId, new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: "Nb d'îlots",
                data: [1072, 737, 617, 637, 5],
                backgroundColor: RISK_COLORS.map(c => c.fill),
                borderColor:     RISK_COLORS.map(c => c.solid),
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            plugins: {
                legend:  { display: false },
                tooltip: {
                    ...buildTooltip(),
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.y.toLocaleString('fr-CA')} îlots`
                    }
                }
            },
            scales: {
                x: { ticks: { color: CHART_DEFAULTS.tickColor, font: { ...CHART_DEFAULTS.font, size: 11 } }, grid: { color: CHART_DEFAULTS.gridColor } },
                y: { ticks: { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.font }, grid: { color: CHART_DEFAULTS.gridColor } }
            }
        }
    }));
}


// ===============================
// 7. Graphique : Distribution densité population (Bar)
// ===============================
function createChartDensite(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    return registerChart(canvasId, new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['0–500', '500–1K', '1K–3K', '3K–6K', '6K–12K', '12K–20K', '20K+'],
            datasets: [{
                label: 'Nb zones',
                data: [248, 210, 520, 680, 890, 460, 260],
                backgroundColor: CHART_COLORS.purple.fill,
                borderColor:     CHART_COLORS.purple.solid,
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            plugins: {
                legend:  { display: false },
                tooltip: {
                    ...buildTooltip(),
                    callbacks: {
                        title: ([item]) => `Densité : ${item.label} hab/km²`,
                        label: ctx => ` ${ctx.parsed.y} zones`
                    }
                }
            },
            scales: {
                x: { ticks: { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.font }, grid: { color: CHART_DEFAULTS.gridColor } },
                y: { ticks: { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.font }, grid: { color: CHART_DEFAULTS.gridColor } }
            }
        }
    }));
}


// ===============================
// 8. Graphique : Statuts municipaux (Doughnut)
// ===============================
function createChartStatut(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    return registerChart(canvasId, new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Ville (V)', 'Municipalité (M)', 'Territoire (T)', 'Autres'],
            datasets: [{
                data: [1850, 890, 380, 161],
                backgroundColor: [
                    CHART_COLORS.blue.fill,
                    CHART_COLORS.teal.fill,
                    CHART_COLORS.green.fill,
                    CHART_COLORS.gray.fill
                ],
                borderWidth: 2,
                hoverOffset: 6
            }]
        },
        options: {
            cutout: '60%',
            plugins: {
                legend:  buildLegend('bottom'),
                tooltip: buildTooltip()
            }
        }
    }));
}


// ===============================
// 9. Graphique : Régions administratives (Bar)
// ===============================
function createChartRegion(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    return registerChart(canvasId, new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Montréal', 'Laval', 'Montérégie', 'Laurentides', 'Lanaudière'],
            datasets: [{
                label: 'Nb zones',
                data: [3219, 20, 18, 7, 4],
                backgroundColor: [
                    CHART_COLORS.red.fill,
                    CHART_COLORS.blue.fill,
                    CHART_COLORS.gold.fill,
                    CHART_COLORS.green.fill,
                    CHART_COLORS.purple.fill
                ],
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            plugins: {
                legend:  { display: false },
                tooltip: buildTooltip()
            },
            scales: {
                x: { ticks: { color: CHART_DEFAULTS.tickColor, font: { ...CHART_DEFAULTS.font, size: 11 } }, grid: { color: CHART_DEFAULTS.gridColor } },
                y: {
                    type: 'logarithmic',
                    ticks: { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.font },
                    grid:  { color: CHART_DEFAULTS.gridColor }
                }
            }
        }
    }));
}


// ===============================
// 10. Graphique : Réseau routier (Doughnut)
// ===============================
function createChartReseau(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    return registerChart(canvasId, new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Locale', 'Artère', 'Collectrice mun.', 'Autoroute', 'Nationale', 'Autres'],
            datasets: [{
                data: [29760, 7218, 6755, 1659, 837, 64],
                backgroundColor: [
                    CHART_COLORS.gray.fill,
                    CHART_COLORS.red.fill,
                    CHART_COLORS.orange.fill,
                    CHART_COLORS.purple.fill,
                    'rgba(146,64,14,0.7)',
                    CHART_COLORS.teal.fill
                ],
                borderWidth: 2,
                hoverOffset: 6
            }]
        },
        options: {
            cutout: '55%',
            plugins: {
                legend:  buildLegend('bottom'),
                tooltip: {
                    ...buildTooltip(),
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.toLocaleString('fr-CA')} segments (${
                            ((ctx.parsed / 46293) * 100).toFixed(1)
                        }%)`
                    }
                }
            }
        }
    }));
}


// ===============================
// 11. Graphique : Nombre de voies (Bar)
// ===============================
function createChartVoies(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    return registerChart(canvasId, new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['1 voie', '2 voies', '3 voies', '4 voies', '5+ voies', 'INC'],
            datasets: [{
                label: 'Nb segments',
                data: [7508, 31547, 2059, 1121, 8, 4040],
                backgroundColor: CHART_COLORS.gold.fill,
                borderColor:     CHART_COLORS.gold.solid,
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            plugins: {
                legend:  { display: false },
                tooltip: {
                    ...buildTooltip(),
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.y.toLocaleString('fr-CA')} segments`
                    }
                }
            },
            scales: {
                x: { ticks: { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.font }, grid: { color: CHART_DEFAULTS.gridColor } },
                y: { ticks: { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.font }, grid: { color: CHART_DEFAULTS.gridColor } }
            }
        }
    }));
}


// ===============================
// 12. Graphique : Comparaison refuge / chaleur (Radar)
//     Utile pour la carte ou un dashboard futur
// ===============================
function createChartRadarZone(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const defaults = {
        labels: ['Surface (ha)', 'Densité pop.', 'Nb refuges ≤1km', 'Distance refuge (km)', 'Artère ≤150m'],
        values: data || [0, 0, 0, 0, 0]
    };

    return registerChart(canvasId, new Chart(ctx, {
        type: 'radar',
        data: {
            labels: defaults.labels,
            datasets: [{
                label: 'Zone sélectionnée',
                data: defaults.values,
                backgroundColor: CHART_COLORS.red.fill.replace('0.65', '0.2'),
                borderColor:     CHART_COLORS.red.solid,
                borderWidth: 2,
                pointBackgroundColor: CHART_COLORS.red.solid,
                pointRadius: 4
            }]
        },
        options: {
            scales: {
                r: {
                    ticks:      { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.font, backdropColor: 'transparent' },
                    grid:       { color: 'rgba(255,255,255,0.08)' },
                    angleLines: { color: 'rgba(255,255,255,0.06)' },
                    pointLabels:{ color: '#94a3b8', font: { ...CHART_DEFAULTS.font, size: 11 } }
                }
            },
            plugins: {
                legend:  { display: false },
                tooltip: buildTooltip()
            }
        }
    }));
}


// ===============================
// 13. Graphique : Évolution (Line) — placeholder
//     Pour une future intégration temporelle
// ===============================
function createChartLine(canvasId, labels, datasets) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const styledDatasets = datasets.map((ds, i) => {
        const colors = Object.values(CHART_COLORS);
        const c = colors[i % colors.length];
        return {
            ...ds,
            borderColor:     c.solid,
            backgroundColor: c.fill.replace('0.65', '0.1'),
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: c.solid,
            pointRadius: 4
        };
    });

    return registerChart(canvasId, new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: styledDatasets },
        options: {
            plugins: {
                legend:  buildLegend('top'),
                tooltip: buildTooltip()
            },
            scales: {
                x: { ticks: { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.font }, grid: { color: CHART_DEFAULTS.gridColor } },
                y: { ticks: { color: CHART_DEFAULTS.tickColor, font: CHART_DEFAULTS.font }, grid: { color: CHART_DEFAULTS.gridColor } }
            }
        }
    }));
}


// ===============================
// 14. Initialisation globale
//     Appelé depuis donnees.html
// ===============================
function initAllCharts() {
    createChartRepartition('chartRepartition');
    createChartSurface('chartSurface');
    createChartRisk('chartRisk');
    createChartDensite('chartDensite');
    createChartStatut('chartStatut');
    createChartRegion('chartRegion');
    createChartReseau('chartReseau');
    createChartVoies('chartVoies');
}


// ===============================
// 15. Mise à jour dynamique d'un graphique radar
//     Appelé depuis map.js lors d'un clic sur un îlot
// ===============================
function updateRadarChart(canvasId, zoneData) {
    const instance = CHART_INSTANCES[canvasId];
    if (!instance) return;

    instance.data.datasets[0].data = [
        zoneData.surfaceHa    || 0,
        zoneData.densite      || 0,
        zoneData.nbRefuges    || 0,
        zoneData.distRefuge   || 0,
        zoneData.artere ? 1 : 0
    ];
    instance.update();
}


// ===============================
// Exports (si module ES)
// ===============================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CHART_COLORS,
        RISK_COLORS,
        createChartRepartition,
        createChartSurface,
        createChartRisk,
        createChartDensite,
        createChartStatut,
        createChartRegion,
        createChartReseau,
        createChartVoies,
        createChartRadarZone,
        createChartLine,
        updateRadarChart,
        destroyChart,
        initAllCharts
    };
}