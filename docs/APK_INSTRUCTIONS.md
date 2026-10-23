# 📱 Guía para Convertir HidroBalcón PWA en un APK Nativo de Android

Esta guía te explica cómo generar un archivo `.apk` instalable en tu teléfono móvil Android utilizando **Capacitor**, permitiendo que las alarmas y notificaciones se ejecuten directamente en el `AlarmManager` del sistema operativo (100% offline y sin necesidad de ningún servidor).

---

## 🚀 Ventajas del APK Nativo con Capacitor

1. **Alarmas Reales de Sistema:** Despierta el teléfono con sonido y vibración aunque la pantalla esté apagada o el móvil bloqueado.
2. **Cero Servidores y Cero Costes:** El algoritmo agronómico corre en local en tu procesador.
3. **Mismo Código:** Cualquier cambio en la interfaz web se refleja automáticamente.

---

## 🛠️ Requisitos Previos

- Tener instalado [Node.js](https://nodejs.org/) (versión 18 o superior).
- Tener instalado [Android Studio](https://developer.android.com/studio) (con el SDK de Android y herramientas de línea de comandos).

---

## 📦 Paso a Paso para Generar el APK

### 1. Instalar dependencias de Capacitor en el proyecto

Abre la terminal en la raíz del proyecto (`calendario-riego`) y ejecuta:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/local-notifications
```

### 2. Compilar el Frontend Web

Genera los archivos optimizados de producción:

```bash
npm run build
```

### 3. Inicializar y Añadir la Plataforma Android

```bash
npx cap add android
```

Esto creará automáticamente la carpeta `/android` con el proyecto nativo de Android Studio preconfigurado.

### 4. Sincronizar Cambios

Cada vez que modifiques código web y hagas `npm run build`, sincroniza los archivos con:

```bash
npx cap sync
```

### 5. Abrir en Android Studio y Compilar el APK

Ejecuta:

```bash
npx cap open android
```

En Android Studio:
1. Espera a que termine la sincronización de Gradle.
2. Ve al menú superior: **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
3. Una vez terminado, aparecerá una notificación: pulsa en **locate**.
4. ¡Listo! Tendrás tu archivo `app-debug.apk` listo para copiar a tu móvil e instalar.

---

## 💡 Opción Inmediata: PWA sin compilar nada

Si no quieres compilar el APK con Android Studio:
1. Abre la aplicación en el navegador Google Chrome de tu móvil.
2. Pulsa los tres puntos superiores (⋮).
3. Selecciona **"Añadir a la pantalla de inicio"** o **"Instalar aplicación"**.
4. Usa el botón **"⏰ Alarma"** en cualquier maceta para enviar el recordatorio con alarma sonora a tu aplicación de calendario habitual del teléfono.
