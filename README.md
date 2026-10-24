# 🌱 HidroBalcón PWA - Calendario de Riego Inteligente & Alerta de Heladas en Terraza

[![Deploy to GitHub Pages](https://github.com/josejuanmontiel/HidroBalc-n/actions/workflows/deploy.yml/badge.svg)](https://github.com/josejuanmontiel/HidroBalc-n/actions/workflows/deploy.yml)
[![Demo Online](https://img.shields.io/badge/Demo-GitHub%20Pages-10b981.svg)](https://josejuanmontiel.github.io/HidroBalc-n/)

Aplicación web progresiva (**PWA**) y móvil para el **cálculo agronómico de riego y prevención de heladas en macetas, terrazas y balcones**. 100% en el navegador (cliente) sin servidores externos requeridos ni fuga de privacidad.

👉 **Demo en vivo desplegada en GitHub Pages:** [https://josejuanmontiel.github.io/HidroBalc-n/](https://josejuanmontiel.github.io/HidroBalc-n/)

---

## ✨ Características Principales

### 🌿 1. Algoritmo Agronómico & Motor Dual (Go WebAssembly + JS Fallback)
* **Cálculo de Evapotranspiración y Secado:** Basado en fórmulas agronómicas que ponderan temperatura ambiente, humedad relativa, velocidad del viento y radiación solar obtenidas sin API keys vía Open-Meteo.
* **Factores Críticos de Maceta:**
  * **Material:** Barro cocido / terracota (transpiración por porosidad acelerada) vs plástico / cerámica esmaltada.
  * **Ubicación:** Balcón techado (sin riego por lluvia) vs cielo abierto (la lluvia compensa el riego).
  * **Volumen:** Desde macetas pequeñas de 2L hasta jardineras de 50L.
* **Doble Motor de Cálculo:** Escrito en **Go compilado a WebAssembly** (`wasm/main.go`) con fallback matemático automático en JavaScript puro.

### ❄️ 2. Detección Inteligente de Heladas
* Alertas preventivas ante mínimas $\le 2^\circ\text{C}$ o $\le 0^\circ\text{C}$.
* **Suspensión automática de riegos programados:** Evita regar sustratos antes de una helada nocturna para impedir la congelación y rotura del cepellón radicular.

### 🔔 3. Consolidación de Alarmas & Notificaciones Nativas
* **Una sola alarma por día:** Si 5 plantas coinciden el mismo día, genera una única cita o alarma unificada para no saturar al usuario.
* **Deep Linking Directo (`?view=tasks`):** La notificación y el evento del calendario abren la app directamente en el **Checklist Interactivo** del día.
* **Temporizador de Inmersión:** Campana de audio armónica sintetizada con Web Audio API (1, 3, 5 y 15 min) para orquídeas o riego por capilaridad.

### 📸 4. Álbum de Fotos & Evolución Botánica
* Captura directa desde la cámara del móvil.
* **Compresión en cliente a WebP** (~50 KB) con persistencia offline en **IndexedDB**.
* **Gestión de Portada y Foto Inicial:** Elección de cualquier foto como portada del balcón y fijación de foto inicial para la comparativa "Antes vs Hoy".
* **Sección de Etiquetas Botánicas:** Categorización y badges para fotos de etiquetas comerciales o fichas botánicas de plantas.
* **Edición Rápida de Nombre:** Renombrado directo con un toque en cualquier maceta ya creada.

### 🪴 5. Jardineras Corridas Compartidas & Retroalimentación de Riego
* **Contenedores Padre (Jardineras Corridas):** Gestión de jardineras grandes (>25L, barro o plástico) que alojan varias plantas botánicas en sus compartimentos o secciones. Las plantas heredan la inercia térmica y el sustrato se prorratea para un cálculo de secado y dosis mucho más preciso.
* **Modal de Confirmación & Ajuste de Riego:** Posibilidad de regular los vasos vertidos reales (50%, 75%, 100%, 125% o con selector continuo). Si decides regar menos, el motor Go Wasm recibe la retroalimentación y calibra automáticamente el factor de retención hídrica.

### 📱 6. PWA & Preparado para APK Android
* Soporte offline completo con **Service Worker**.
* Totalmente adaptativo (**Mobile-First**) con diseño optimizado para pantallas táctiles y notch/safe-areas (`viewport-fit=cover`).
* Configuración con **Capacitor** en `capacitor.config.json` y guía completa en `docs/APK_INSTRUCTIONS.md`.

---

## 🛠️ Tecnologías Empleadas

* **Frontend:** HTML5, Vanilla CSS moderno (Glassmorphism, Dark UI, Grid & Flexbox, micro-animaciones).
* **Lógica & Bundler:** JavaScript ES Modules + [Vite](https://vite.dev/).
* **WebAssembly:** [Go](https://golang.org/) (`syscall/js`) para el cómputo agronómico y simulación de escenarios.
* **Almacenamiento Local:** LocalStorage + IndexedDB (`photoDb`).
* **Datos Meteorológicos:** Open-Meteo API (sin servidor intermediario, CORS habilitado y caché local).
* **Test Runner:** [Vitest](https://vitest.dev/) con suite completa de pruebas unitarias y de integración.
* **CI/CD:** GitHub Actions para compilación Go WASM + Vite y despliegue continuo en **GitHub Pages**.

---

## 🚀 Puesta en Marcha en Local

### Prerrequisitos
* Node.js $\ge 18$
* Go $\ge 1.22$ (opcional, solo para recompilar el binario WASM)

### Instalación y Ejecución

```bash
# 1. Clonar el repositorio
git clone https://github.com/josejuanmontiel/HidroBalc-n.git
cd HidroBalc-n

# 2. Instalar dependencias
npm install

# 3. Iniciar servidor de desarrollo local
npm run dev

# 4. Ejecutar la suite de pruebas
npm run test
```

### Compilar el Motor Go a WebAssembly (Opcional)

```bash
GOOS=js GOARCH=wasm go build -o public/engine.wasm wasm/main.go
cp $(go env GOROOT)/lib/wasm/wasm_exec.js public/wasm_exec.js
```

### Compilar para Producción

```bash
npm run build
# Los archivos listos para servir se generarán en dist/
```

---

## 🌐 Despliegue en GitHub Pages

El proyecto incluye un flujo automatizado en `.github/workflows/deploy.yml`. 

Cada vez que se hace un `push` a la rama `main`:
1. Ejecuta la suite de pruebas automatizadas.
2. Compila el motor Go WebAssembly `public/engine.wasm`.
3. Compila el frontend Vite configurado con la ruta base `/HidroBalc-n/`.
4. Publica automáticamente la aplicación en GitHub Pages.

---

## 📱 Compilar como APK para Android (Capacitor)

El proyecto incluye soporte nativo listo para empaquetar con Capacitor:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npm run build
npx cap sync
npx cap open android
```

Consulta los detalles y opciones de permisos en [docs/APK_INSTRUCTIONS.md](docs/APK_INSTRUCTIONS.md).

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.
