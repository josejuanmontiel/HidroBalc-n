# 📝 Plan de Revisión y Hoja de Ruta (TODO) - HidroBalcón

Este documento reúne el estado general del proyecto tras el repaso agronómico, móvil y de despliegue, junto con las tareas pendientes organizadas por prioridad para su seguimiento e iteración.

---

## 📊 Estado Actual del Proyecto (Diagnóstico)

| Componente | Estado | Detalle |
| :--- | :---: | :--- |
| **Algoritmo Agronómico** | ✅ Operativo | Evapotranspiración por especie, tamaño de maceta, transpiración por barro cocido vs plástico, balcón techado vs cielo abierto y corte preventivo por heladas ($\le 2^\circ\text{C}$ y $\le 0^\circ\text{C}$). |
| **Motor WebAssembly (Go)** | ✅ Operativo | Compilado a `engine.wasm` con fallback matemático en JavaScript puro garantizado por tests unitarios. |
| **Suite de Pruebas** | ✅ 24/24 pasan | Tests automáticos para riesgos climáticos, dosis Wasm, base de datos de fotos IndexedDB y consolidación de alarmas. |
| **Despliegue & CI/CD** | ✅ Operativo | GitHub Actions compila automáticamente Go WASM y Vite ante cada push a `main`, publicando en [GitHub Pages](https://josejuanmontiel.github.io/HidroBalc-n/). |
| **PWA & Offline** | ✅ Operativo | Service Worker con estrategia Network-First y fallback a caché, manifest con rutas relativas portables. |
| **Diseño Responsive** | ✅ Optimizado | Tarjetas de tareas adaptadas con separación limpia de metadatos, chips de dosis Wasm y toolbar de acciones táctiles. |

---

## 🟢 Fase 1: Validaciones de Usabilidad & Experiencia Real (Inmediato)

- [ ] **Prueba de Instalación PWA en móvil:**
  - Abrir [https://josejuanmontiel.github.io/HidroBalc-n/](https://josejuanmontiel.github.io/HidroBalc-n/) en Chrome/Safari móvil.
  - Verificar el prompt "Añadir a pantalla de inicio" / "Instalar aplicación".
  - Comprobar que arranca a pantalla completa sin barra de navegación del navegador (modo standalone).

- [ ] **Probar la exportación de Alarma `.ics` nativa:**
  - Descargar la alarma unificada desde la vista de tareas (`📅 Descargar Alarma Calendario (.ics)`).
  - Abrir el archivo `.ics` en el calendario del móvil (Google Calendar, Apple Calendar, etc.).
  - Verificar que la alarma suena a la hora óptima y que la descripción incluye el enlace directo de vuelta (`?view=tasks&date=...`).

- [ ] **Prueba del Dedo y Calibración Wasm:**
  - Pulsar en `👉 Dedo` en cualquier maceta.
  - Seleccionar un nivel ("Sustrato Seco", "Ligeramente Húmedo", etc.).
  - Comprobar que el motor recalcula la dosis en vasos y mililitros y que la tarjeta muestra la insignia `✨ Calibrada`.

---

## 🟡 Fase 2: Robustez de Datos y PWA Offline (Corto Plazo)

- [ ] **Gestión de Ubicación Manual / Búsqueda de Municipio:**
  - Actualmente la app utiliza la geolocalización GPS del dispositivo (con Madrid como fallback por defecto).
  - Añadir un buscador de ciudades/municipios para usuarios que no deseen conceder permisos de ubicación GPS o tengan dispositivos sin geolocalización activa.

- [ ] **Aviso visual de Estado Offline / Caché:**
  - Mostrar un indicador visual discreto (badge o píldora) en la barra superior cuando el dispositivo esté sin conexión a Internet, avisando de que el pronóstico se basa en la última consulta de Open-Meteo guardada localmente.

- [ ] **Validación de Fotos Grandes en IndexedDB:**
  - IndexedDB procesa y comprime las imágenes a formato WebP (~50 KB) en el cliente.
  - Validar el rendimiento en teléfonos de gama baja al tomar fotografías directas de 12–48 megapíxeles desde la cámara para evitar picos de memoria en el canvas.

---

## 🔵 Fase 3: Empaquetado Nativo APK & Funcionalidades Avanzadas (Medio Plazo)

- [ ] **Compilar APK Nativo con Capacitor:**
  - Seguir las instrucciones de [`docs/APK_INSTRUCTIONS.md`](docs/APK_INSTRUCTIONS.md).
  - Ejecutar `npx cap add android` y compilar `app-debug.apk` con Android Studio.
  - Validar alarmas en segundo plano con sonido propio del sistema mediante `@capacitor/local-notifications`.

- [ ] **Backup y Restauración Completa (JSON + Fotos):**
  - Ampliar el botón de Backup para que exporte e importe tanto los datos de las macetas (LocalStorage) como las colecciones fotográficas de evolución botánica (IndexedDB).

- [ ] **Historial y Diario Botánico:**
  - Añadir una vista de historial o calendario mensual donde se pueda consultar qué días se regó cada planta a lo largo de las semanas y registrar notas de cultivo (poda, abono, plagas).
