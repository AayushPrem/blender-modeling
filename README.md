# blender-modeling
# College Room 3D Experience

A real-time 3D recreation of my college room, built with Blender and Three.js. Experience the space in both first-person and third-person perspectives with interactive lighting and smooth navigation.

## Features

- **First-Person View** - Immersive walkthrough experience
- **Third-Person View** - Character-based exploration  
- **Interactive Lighting** - Toggle lamp with L key
- **Real-time Shadows** - Dynamic lighting and shadows
- **Smooth Controls** - WASD movement with mouse look

## Built With

- **Blender** - 3D modeling, texturing, and lighting
- **Three.js** - WebGL rendering and interaction
- **GLB Format** - Optimized asset delivery

## Controls

- **WASD** - Move around
- **Mouse** - Look/orbit camera
- **L Key** - Toggle lamp on/off
- **FPS/TPS Buttons** - Switch between views

## Development

All 3D assets were modeled from scratch in Blender based on my actual college room, then exported to GLB format for real-time rendering in Three.js. The scene features:

- Accurate room layout and furniture
- Realistic materials and textures
- Blender-exported lighting system
- Custom shader for interactive lamp

 

---

*Modeled with Blender, brought to life with Three.js*

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation & Running

1. **Clone the repository**
   ```bash
   git clone https://github.com/AayushPrem/blender-modeling.git
   cd blender-modeling

   Install dependencies

bash
npm install
Start the development server

bash
npm start
This automatically opens your browser to http://localhost:1234 with hot reloading enabled.

## 📁 Project Structure

**Source Files:**
- `src/index.html` - Main HTML entry point
- `src/script.js` - Three.js application with FPS/TPS controls
- `src/assets/model2.glb` - Blender room model export
- `src/assets/red_animator_vs_animation.glb` - Animated character model

**Configuration:**
- `package.json` - Project dependencies and scripts

**Auto-generated:**
- `dist/` - Production build (`npm run build`)
- `node_modules/` - Dependencies (`npm install`)
- `.parcel-cache/` - Parcel build cache
