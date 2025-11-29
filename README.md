# SetSound Suite - React TypeScript Edition

Suite audio complète développée en React + TypeScript avec Vite, offrant 4 outils professionnels d'édition audio.

## 🎵 Fonctionnalités

### 1. **Coupeur Audio** (AudioCutter)
- ✅ Chargement de fichiers audio (drag & drop)
- ✅ Visualisation waveform en temps réel
- ✅ Lecture/Pause/Stop avec contrôles
- ✅ Rognage précis avec marqueurs
- ✅ Effets Fade In/Fade Out
- ✅ Export en WAV

### 2. **Fusionneur Audio** (AudioJoiner)
- ✅ Fusion de plusieurs pistes audio
- ✅ Réorganisation des pistes
- ✅ Normalisation du volume
- ✅ Fades entre pistes
- ✅ Export du résultat

### 3. **Détecteur BPM** (BPMDetector)
- ✅ Détection automatique du tempo (BPM)
- ✅ Analyse de la tonalité
- ✅ Algorithme d'autocorrélation
- ✅ Affichage de la confiance

### 4. **Enregistreur Audio** (AudioRecorder)
- ✅ Enregistrement microphone
- ✅ Visualisation en temps réel
- ✅ Contrôle de la qualité
- ✅ Export des enregistrements

### 5. **Vocal Remover** (En développement)
- 🚧 Suppression vocale (à venir)

## 🛠️ Technologies

- **React 18** - Framework UI
- **TypeScript** - Typage statique
- **Vite** - Build tool ultra-rapide
- **Tailwind CSS** - Styling moderne
- **Web Audio API** - Traitement audio natif
- **PWA** - Application installable

## 📦 Installation

### Prérequis
- Node.js 18+ 
- npm ou pnpm

### Étapes

1. **Cloner le projet**
```bash
cd App-jemaos/setsound-suite-tsx
```

2. **Installer les dépendances**
```bash
npm install
# ou
pnpm install
```

3. **Lancer en développement**
```bash
npm run dev
# ou
pnpm dev
```

4. **Build pour production**
```bash
npm run build
# ou
pnpm build
```

5. **Prévisualiser le build**
```bash
npm run preview
# ou
pnpm preview
```

## 📁 Structure du Projet

```
setsound-suite-tsx/
├── public/                 # Assets statiques
├── src/
│   ├── components/        # Composants React
│   │   ├── Sidebar.tsx   # Navigation
│   │   └── tools/        # Outils audio
│   │       ├── AudioCutter.tsx
│   │       ├── AudioJoiner.tsx
│   │       ├── BPMDetector.tsx
│   │       ├── AudioRecorder.tsx
│   │       └── VocalRemover.tsx
│   ├── hooks/            # Hooks personnalisés
│   │   ├── useAudioContext.ts
│   │   ├── useWaveform.ts
│   │   └── useAudioPlayer.ts
│   ├── utils/            # Utilitaires
│   │   ├── audioUtils.ts
│   │   └── bpmDetector.ts
│   ├── types/            # Types TypeScript
│   │   └── index.ts
│   ├── App.tsx           # Composant principal
│   ├── main.tsx          # Point d'entrée
│   └── index.css         # Styles globaux
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## 🎨 Fonctionnalités Techniques

### Traitement Audio
- **Web Audio API** pour le traitement en temps réel
- **AudioBuffer** pour la manipulation des données
- **Canvas API** pour les visualisations waveform
- **MediaRecorder API** pour l'enregistrement

### Algorithmes Implémentés
- ✅ Génération de waveform optimisée
- ✅ Trim/Cut audio avec précision
- ✅ Fade In/Out avec courbes
- ✅ Normalisation audio
- ✅ Fusion de buffers audio
- ✅ Détection BPM par autocorrélation
- ✅ Export WAV avec headers corrects

### Hooks React Personnalisés
- `useAudioContext` - Gestion du contexte audio
- `useWaveform` - Génération et affichage waveform
- `useAudioPlayer` - Contrôle de lecture audio

## 🚀 Déploiement

### Netlify / Vercel
```bash
npm run build
# Déployer le dossier dist/
```

### GitHub Pages
```bash
npm run build
# Configurer GitHub Pages sur le dossier dist/
```

## 🎯 Améliorations Futures

- [ ] Support MP3 export (avec lamejs)
- [ ] Vocal removal avec ML
- [ ] Effets audio avancés (reverb, delay, etc.)
- [ ] Support multi-pistes
- [ ] Sauvegarde de projets
- [ ] Raccourcis clavier
- [ ] Mode sombre/clair
- [ ] Support mobile amélioré

## 📝 Notes de Développement

### Différences avec la version originale
- ✅ Code TypeScript typé
- ✅ Architecture React moderne
- ✅ Hooks personnalisés réutilisables
- ✅ Meilleure séparation des responsabilités
- ✅ Fonctionnalités audio réellement implémentées
- ✅ Gestion d'état améliorée
- ✅ Performance optimisée

### Fonctionnalités Complétées
- ✅ Toutes les fonctions de découpe audio
- ✅ Fusion audio réelle (pas de simulation)
- ✅ Détection BPM fonctionnelle
- ✅ Export WAV complet
- ✅ Visualisation waveform responsive

## 🐛 Problèmes Connus

- Le support Safari peut nécessiter des interactions utilisateur pour l'AudioContext
- L'enregistrement audio système nécessite des permissions spéciales
- Les fichiers très volumineux peuvent ralentir le navigateur

## 📄 Licence

MIT

## 👨‍💻 Auteur

Développé avec ❤️ par Kilo Code
Version: 2.0.0
Date: Novembre 2024