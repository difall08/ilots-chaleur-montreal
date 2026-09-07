# 🔥 Îlots MTL - Cartographie des Îlots de Chaleur de Montréal

Plateforme web géospatiale interactive pour la visualisation, l'analyse et la surveillance des îlots de chaleur et de fraîcheur de Montréal, combinant données populationnelles, accessibilité aux refuges climatiques et analyse du risque thermique.

![Aperçu de la plateforme](preview.png)

---

## 📌 Description

Ce projet propose une application web cartographique avancée pour analyser les îlots de chaleur urbains de Montréal. Il permet d'identifier les zones à risque, d'évaluer l'accessibilité aux refuges climatiques et de visualiser l'exposition de la population aux extrêmes thermiques.

Disponible en **français et en anglais** 🇫🇷 🇬🇧

---

## ✨ Fonctionnalités

- 🔥 **Îlots de chaleur** - classification thermique par classe (1 à 5)
- ❄️ **Îlots de fraîcheur** - refuges climatiques géolocalisés
- 👥 **Population exposée** - densité et données démographiques (<15 ans, ≥65 ans)
- 🌡️ **Densité thermique** - carte de chaleur (heatmap) avancée
- ♿ **Accessibilité aux refuges** - isochrones pied / voiture / vélo
- ⚠️ **Zones critiques** - score de risque 0–4 (densité · accès refuge · artère)
- 🛣️ **Réseau routier** - artères urbaines à proximité
- 🗾 **Fonds de carte** multiples (standard, satellite, sombre)
- 🌍 **Interface bilingue** FR / EN

---

## 🛠️ Technologies utilisées

| Technologie | Usage |
|---|---|
| HTML5 / CSS3 | Structure et style |
| JavaScript (ES6+) | Logique applicative modulaire |
| [Mapbox GL JS v3](https://www.mapbox.com/) | Moteur cartographique vectoriel |
| [Turf.js](https://turfjs.org/) | Analyses géospatiales (isochrones, buffers) |
| GeoJSON | Format des données géospatiales |
| Google Fonts (Syne, DM Sans) | Typographie |

---

## 📂 Structure du projet

```
ilots-chaleur-montreal/
├── index.html          # Page d'accueil
├── carte.html          # Carte interactive principale
├── donnees.html        # Page données et statistiques
├── equipe.html         # Page équipe
├── css/
│   └── style.css       # Styles globaux
├── js/
│   ├── app.js          # Point d'entrée — configuration et état global
│   ├── map.js          # Initialisation carte et couches Mapbox
│   ├── analysis.js     # Analyses géospatiales (risque, accessibilité)
│   └── charts.js       # Graphiques statistiques
└── data/
    ├── ilots_chaleur.geojson
    ├── ilots_chaleur_enrichi.geojson
    ├── population.geojson
    └── reseau.geojson
```

---

## 🏗️ Architecture applicative

L'application suit une architecture modulaire en JavaScript vanilla :

- **`app.js`** - Configuration globale, état partagé (`APP_CONFIG`, `APP_STATE`), gestion de la langue, notifications toast, loader
- **`map.js`** - Initialisation Mapbox, rendu des couches, popups, légende dynamique
- **`analysis.js`** - Score de risque thermique, accessibilité aux refuges, statistiques globales
- **`charts.js`** - Graphiques de la page Données

---

## 🗂️ Données

| Source | Contenu |
|---|---|
| Ville de Montréal - Données ouvertes | Îlots de chaleur et de fraîcheur |
| Statistique Canada | Données populationnelles |
| OpenStreetMap | Réseau routier |

---

## 🚀 Installation et utilisation

```bash
# Cloner le dépôt
git clone https://github.com/difall08/ilots-chaleur-montreal.git

# Ajouter votre clé Mapbox dans map.js
mapboxgl.accessToken = 'votre_cle_mapbox';

# Lancer un serveur local
npx serve .
# ou
python -m http.server 3002
```

> ⚠️ Une clé API [Mapbox](https://account.mapbox.com/) est nécessaire pour afficher la carte.

---

## 📊 Métriques du projet

- **3 068** îlots de chaleur cartographiés
- **1 030** îlots de fraîcheur (refuges)
- **5 311 km²** de surface thermique analysée
- Score de risque calculé sur **3 critères** : densité · accès refuge · artère à proximité

---

## 👩‍💻 Auteure

**Dieumbe FALL**
Géomaticienne | M.Sc. Géomatique appliquée - Université de Sherbrooke
[LinkedIn](https://www.linkedin.com/in/dieumbe-fall-55982220b/) · [GitHub](https://github.com/difall08)

---

## 📄 Licence

Projet académique - Université de Sherbrooke, 2026.
Données sous licence ouverte (Ville de Montréal / Statistique Canada / OSM).
