# 📝 Plan de Revisión y Hoja de Ruta (TODO) - HidroBalcón

Este documento reúne el estado general del proyecto tras el repaso agronómico, móvil y de despliegue, junto con las tareas pendientes organizadas por prioridad para su seguimiento e iteración.

---

## 📊 Estado Actual del Proyecto (Di| Componente | Estado | Detalle |
| :--- | :---: | :--- |
| **Algoritmo Agronómico** | ✅ Operativo | Evapotranspiración por especie, tamaño de maceta, transpiración por barro cocido vs plástico, balcón techado vs cielo abierto y corte preventivo por heladas ($\le 2^\circ\text{C}$ y $\le 0^\circ\text{C}$). |
| **Motor WebAssembly (Go)** | ✅ Operativo | Compilado a `engine.wasm` con fallback matemático en JavaScript puro garantizado por tests unitarios. |
| **Suite de Pruebas** | ✅ 37/37 pasan | Tests automáticos para riesgos climáticos, dosis Wasm, IndexedDB, alarmas y suite completa de analíticas (timeline, baseline teórico, drenaje diario y heladas). |
| **Despliegue & CI/CD** | ✅ Operativo | GitHub Actions compila automáticamente Go WASM y Vite ante cada push a `main`, publicando en [GitHub Pages](https://josejuanmontiel.github.io/HidroBalc-n/). |
| **PWA & Offline** | ✅ Operativo | Service Worker con estrategia Network-First y fallback a caché, manifest con rutas relativas portables. |
| **Diseño Responsive & Gráficos** | ✅ Optimizado | Tarjetas de tareas adaptadas, botón 📊 en cada maceta, visor multieje interactivo con Chart.js, zoom táctil y leyendas interactivas. |

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

---

## 🔬 Fase 4: Analizador Agronómico Local & Saneador de Backups (Estilo PrimaryFoods)

Inspirado directamente en la arquitectura de [PrimaryFoods](file:///home/jose/workspace/josejuanmontiel/PrimaryFoods) (donde conviven CLI en Go, SQLite embebido sin CGO y la estación web visual `✂️ Podador Backups`), se proyecta la herramienta complementaria **HidroBalcón Analyzer** (o `BalconMetrics`).

El objetivo es mantener la **PWA móvil ultraligera y ágil** para el uso diario en la terraza (registrar riegos con un toque, temporizador de inmersión, fotos rápidas), delegando la **auditoría forense de datos, detección de inconsistencias y saneamiento de copias de seguridad** a un servicio o CLI local en Go con binario único portable.

```
[HidroBalcón PWA (Móvil / Web)]
       │
       ▼ Exportar Backup (.json con fotos WebP, jardineras y logs)
[hidrobalcon-backup-YYYY-MM-DD.json]
       │
       ▼ Drag & Drop en SPA web local o flag CLI '-backup'
┌────────────────────────────────────────────────────────────────────────┐
│               HidroBalcón Analyzer (Servicio Local en Go)              │
│                                                                        │
│  ├── 1. Inspector de Integridad & Auditoría de Entidades              │
│  │    • Detección de macetas huérfanas o contenedores sin zona         │
│  │    • Limpieza de campos fantasma (material/litros si hay jardinera) │
│  │                                                                     │
│  ├── 2. Minería Forense de Riegos vs Sobrerriego                      │
│  │    • Reconstrucción de saturación en riegos generales 'potId: all'  │
│  │    • Semáforo de asfixia radicular (humedad >65% al regar)          │
│  │                                                                     │
│  ├── 3. Matriz de Convivencia en Jardineras ("Roommate Matcher")       │
│  │    • Correlación de tasa de secado (%/día) entre plantas vecinas    │
│  │    • Alerta de compañeros incompatibles (ej. Cactus + Huerto)      │
│  │                                                                     │
│  └── 4. Estación de Poda y Saneamiento en Cascada (Pruner)             │
│       • Presets en 1-clic (purgar fotos intermedias, campos zombi)     │
│       • Poda selectiva por maceta con borrado de logs y fotos          │
│       • Compactación del JSON reduciendo hasta un 85% del peso         │
└────────────────────────────────────────────────────────────────────────┘
       │
       ▼ Generación de JSON optimizado
[hidrobalcon-backup-saneado.json] ──► Re-importar limpio en la PWA
```

---

### 🛠️ Pila Tecnológica & Dependencias (Espejo de PrimaryFoods)

La herramienta reutilizará exactamente la misma pila técnica que ha demostrado máxima robustez y facilidad de despliegue en PrimaryFoods:

* **Lenguaje:** **Go** (`go 1.25.0` o `go 1.24`) para compilación a binario único nativo, sin dependencias externas ni runtime necesario.
* **Almacenamiento Local:** **SQLite puro en Go sin CGO** (`modernc.org/sqlite v1.57.0`) con `_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)`. Permite persistir instantáneas de múltiples backups a lo largo del año sin requerir GCC instalado.
* **Identificadores y Auxiliares:** `github.com/google/uuid v1.6.0` y `github.com/dustin/go-humanize v1.0.1` para formateo legible de bytes y conteos.
* **Servidor HTTP:** `net/http` estándar de la biblioteca base de Go con:
  * Apagado gracioso (*graceful shutdown*) con captura de señales del sistema operativo (`os/signal`, `syscall.SIGTERM`, `context.WithTimeout(5 * time.Second)`).
  * Enrutador estándar `http.NewServeMux()` o sub-enrutador limpio.
* **Entrega de Frontend (Single Binary):**
  * Directiva `//go:embed web/index.html` para empaquetar toda la SPA (HTML + CSS + JS) dentro del ejecutable.
  * **Patrón de Recarga en Caliente en Desarrollo:** Igual que en `PrimaryFoods/internal/api/web.go`, el handler comprueba primero si existe el archivo en disco (`os.ReadFile("web/index.html")`); si existe, lo sirve directamente para permitir iterar el diseño en el navegador sin recompilar Go.
* **Documentación Interactiva:** Endpoint `/api/docs` sirviendo **OpenAPI 3.1** mediante `@scalar/api-reference` en CDN, idéntico a PrimaryFoods.
* **Frontend Web:** Vanilla HTML5 + CSS moderno con variables HSL/Hex (Glassmorphism Dark UI: paleta `#0b0f19`, `#131b2e`, `#182238`, acentos `#10b981` y tipografía `Outfit` + `JetBrains Mono`).

---

### 📁 Estructura del Proyecto (Paquete `BalconMetrics`)

Ubicación sugerida: `/home/jose/workspace/sandbox/gemini/calendario-riego/tools/analyzer` o repositorio satélite `josejuanmontiel/BalconMetrics`:

```
balconmetrics/
├── cmd/
│   ├── analyzer/
│   │   └── main.go           # CLI para auditoría forense por terminal, alertas y poda batch
│   └── server/
│       └── main.go           # Servidor web local HTTP (puerto 8087) con SPA embebida
├── internal/
│   ├── model/
│   │   ├── backup.go         # Modelos Go del backup JSON (BackupRoot, Pot, Container, Zone, Log, Photo)
│   │   ├── report.go         # Modelos del informe de salud agronómica, KPIs y semáforos
│   │   └── pruner.go         # PruneOptions, PruneResult y estadísticas de ahorro
│   ├── analyzer/
│   │   ├── consistency.go    # Auditor de integridad (macetas huérfanas, litros contradictorios)
│   │   ├── efficiency.go     # Minero forense de riegos generales 'potId: all' vs sobrehidratación
│   │   ├── compatibility.go  # Matriz de compatibilidad entre plantas que comparten jardinera
│   │   └── calibration.go    # Análisis de factores aprendidos (learnedDryingFactor) por volumen
│   ├── pruner/
│   │   ├── pruner.go         # Motor de saneamiento, poda en cascada y limpieza de campos fantasma
│   │   └── pruner_test.go    # Tests unitarios con backups reales (aserciones de idempotencia)
│   ├── storage/
│   │   └── sqlite.go         # Base de datos SQLite (modernc) para histórico evolutivo entre backups
│   ├── api/
│   │   ├── server.go         # Router HTTP, middlewares CORS y configuración
│   │   ├── handlers.go       # Endpoints /api/backup/inspect, /api/backup/prune, /api/health
│   │   └── web.go            # Manejo de //go:embed con fallback a disco para hot-reload y Scalar UI
├── web/
│   └── index.html            # SPA integral: Drag&Drop, Dashboard Agronómico, Roommate Matcher y Podador
├── go.mod                    # go 1.25.0 con modernc.org/sqlite y uuid
├── go.sum
├── Makefile                  # make run, make build, make audit, make test
└── README.md
```

---

### 🧱 Modelos de Datos Centrales (`internal/model/`)

#### 1. Estructura del Backup de HidroBalcón (`backup.go`):
```go
package model

type BackupRoot struct {
	Version   string          `json:"version"`
	ExportedAt string         `json:"exportedAt"`
	Data      BackupData      `json:"data"`
}

type BackupData struct {
	Pots           []PotItem           `json:"pots"`
	Containers     []ContainerItem     `json:"containers"`
	Zones          []ZoneItem          `json:"zones"`
	IrrigationLogs []IrrigationLogItem `json:"irrigationLogs"`
	Photos         []PhotoItem         `json:"photos,omitempty"`
}

type PotItem struct {
	ID                  string  `json:"id"`
	Name                string  `json:"name"`
	BotanicalName       string  `json:"botanicalName,omitempty"`
	Category            string  `json:"category"`
	ContainerID         *string `json:"containerId,omitempty"`
	SectionIndex        *int    `json:"sectionIndex,omitempty"`
	Material            string  `json:"material"`            // barro, plastico, autorriego, etc.
	SubstrateLiters     float64 `json:"substrateLiters"`
	SunExposure         string  `json:"sunExposure"`         // full_sun, morning_sun, shade, etc.
	MoistureThreshold   float64 `json:"moistureThreshold"`   // % umbral mínimo
	LearnedDryingFactor float64 `json:"learnedDryingFactor"` // factor adaptativo calibrado
	CreatedAt           string  `json:"createdAt"`
}

type ContainerItem struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	ZoneID      string  `json:"zoneId"`
	Type        string  `json:"type"`        // jardinera, mesa_cultivo, etc.
	Material    string  `json:"material"`    // plastico, terracota, etc.
	TotalLiters float64 `json:"totalLiters"`
	Sections    int     `json:"sections"`
	SunExposure string  `json:"sunExposure"`
}
```

#### 2. Opciones y Resultado de Poda (`pruner.go` — Espejo de PrimaryFoods):
```go
package model

type PruneOptions struct {
	// Presets de saneamiento en 1-clic
	SyncContainerOverrides bool     `json:"syncContainerOverrides"` // Asigna material y litros reales del contenedor padre
	StripArchivedPhotos    bool     `json:"stripArchivedPhotos"`    // Mantiene solo foto inicial y última foto por maceta
	PurgeOldLogs           bool     `json:"purgeOldLogs"`           // Elimina logs de riego con > 90 días
	FixOrphanEntities      bool     `json:"fixOrphanEntities"`      // Desvincula o reubica macetas con containerId inexistente
	
	// Poda quirúrgica selectiva
	DeletePotIDs           []string `json:"deletePotIds"`           // Elimina macetas concretas y sus fotos/logs en cascada
	DeleteContainerIDs     []string `json:"deleteContainerIds"`     // Elimina contenedores y limpia dependencias
}

type PruneResult struct {
	OriginalSizeBytes int64            `json:"originalSizeBytes"`
	PrunedSizeBytes   int64            `json:"prunedSizeBytes"`
	BytesSaved        int64            `json:"bytesSaved"`
	PercentSaved      float64          `json:"percentSaved"`
	OriginalRecords   int              `json:"originalRecords"`
	PrunedRecords     int              `json:"prunedRecords"`
	RecordsRemoved    int              `json:"recordsRemoved"`
	RemovedByTable    map[string]int   `json:"removedByTable"`
	AnomaliesFixed    []string         `json:"anomaliesFixed"`
}
```

---

### 📋 Lógica de Poda en Cascada e Integridad Referencial (`internal/pruner/pruner.go`)

Igual que el pruner de recetas y despensa de PrimaryFoods, el podador de HidroBalcón implementa **integridad referencial en cascada estricta**:

1. **Sincronización de Jardineras y Limpieza de Campos Zombi:**
   * Si `pot.ContainerID != nil`, se comprueba el contenedor padre en `data.Containers`.
   * Si existe: se eliminan los campos fantasma de maceta individual (`dimensions`, `shape`), se sincroniza `pot.Material = container.Material` y se establece `pot.SubstrateLiters = container.TotalLiters / float64(container.Sections)`.
   * Si el contenedor ya no existe en el backup: `pot.ContainerID` se anula a `nil` para evitar referencias rotas.
2. **Purgado de Fotos WebP en Cascada:**
   * Cuando se activa `StripArchivedPhotos`: se agrupan las fotos por `potId`. Para cada maceta se ordena por fecha cronológica, conservando la primera foto (histórica / siembra) y la última foto (estado actual), purgando todos los snapshots intermedios.
   * Esto reduce el tamaño de copias de seguridad de 10 MB a menos de 1.5 MB sin perder el seguimiento visual clave.
3. **Poda Quirúrgica de Macetas:**
   * Al eliminar un `potId` de la lista, el pruner elimina en cascada:
     * El registro en `pots`.
     * Todas las entradas en `irrigationLogs` asociadas a esa maceta.
     * Todas las fotografías en `photos` con dicho `potId`.

---

### 🧠 Módulos Analíticos Avanzados (`internal/analyzer/`)

Basado en el análisis forense del backup real de 20 plantas:

1. **`efficiency.go` — Auditor de Riego General vs Semáforo de Sobrerriego:**
   * Los riegos con `potId: 'all'` (como el registrado el 01-Nov-2026) resetean la humedad de toda la terraza al 100%.
   * El analizador calcula la humedad estimada que tenía cada maceta justo antes del riego.
   * Clasificación automática:
     * 🔴 **Riesgo Crítico de Asfixia Radicular:** Plantas regadas con humedad remanente $\ge 70\%$ (grave en cactus/suculentas o previo a heladas).
     * 🟢 **Riego Eficiente:** Plantas regadas cerca de su umbral óptimo ($25\% - 40\%$).
     * 🟡 **Estrés Hídrico Previo:** Plantas que cayeron por debajo de su umbral mínimo antes de recibir agua.
2. **`compatibility.go` — Matriz de Convivencia ("Roommate Matcher"):**
   * Evalúa la tasa de pérdida de humedad diaria (%/día) entre plantas que comparten el mismo contenedor físico.
   * Si en una jardinera corrida de 3 secciones conviven plantas con tasas divergentes (ej. Tasa A: $12\%/\text{día}$ vs Tasa B: $3\%/\text{día}$), genera la recomendación de intercambio físico entre macetas para sincronizar ciclos de riego.
3. **`calibration.go` — Propagación de Factores Adaptativos:**
   * Detecta que en jardineras de 31L el usuario ha calibrado un factor de $0.86\times - 0.92\times$ tras ajustar a la baja la dosis. Sugiere aplicar este mismo factor a nuevas plantas que se ubiquen en el mismo tipo de contenedor.

---

### 🌐 Endpoints de la API REST

| Método | Ruta | Parámetros / Payload | Descripción |
|---|---|---|---|
| `GET` | `/api/health` | — | Estado del servicio y versión |
| `POST` | `/api/backup/inspect` | `multipart/form-data` o `application/json` | Inspecciona el backup sin modificarlo; retorna KPIs, anomalías detectadas, desglose por contenedor y semáforos |
| `POST` | `/api/backup/prune` | Payload `PruneOptions` + `?download=true` | Aplica saneamiento, purga fotos y genera el JSON limpio (descarga directa si `download=true`) |
| `POST` | `/api/compatibility/matrix` | JSON de backup | Retorna matriz de compatibilidad hídrica y sugerencias de redistribución de plantas |
| `GET` | `/api/docs` | — | Documentación interactiva OpenAPI 3.1 con visualizador Scalar UI |
| `GET` | `/` | — | Interfaz SPA completa (HTML5 + CSS + JS Vanilla con Drag & Drop) |

---

### 💻 Interfaz de Línea de Comandos (CLI `cmd/analyzer/main.go`)

El CLI permite ejecutar diagnósticos rápidos desde el terminal o integrarse en scripts de mantenimiento:

```bash
# 1. Auditoría forense completa con semáforos por consola
go run ./cmd/analyzer -backup /home/jose/Descargas/hidrobalcon-backup-2026-11-01.json -audit

# 2. Poda y saneamiento rápido exportando archivo limpio
go run ./cmd/analyzer \
  -backup /home/jose/Descargas/hidrobalcon-backup-2026-11-01.json \
  -prune \
  -strip-photos \
  -sync-containers \
  -out /home/jose/Descargas/hidrobalcon-backup-saneado.json

# 3. Arrancar servidor web local con SPA interactiva
make run
# Servidor escuchando en: http://localhost:8087
```

**Ejemplo de salida de terminal esperada en `cmd/analyzer`:**
```
═══════════════════════════════════════════════════════════════════
🌱 HIDROBALCÓN FORENSIC ANALYZER & AUDITOR (Go 1.25)
═══════════════════════════════════════════════════════════════════
📦 Archivo inspeccionado: hidrobalcon-backup-2026-11-01.json (2.4 MB)
🌿 Macetas registradas:   20 (11 en Balcón Salón | 9 en Balcón Dormitorio)
🪴 Jardineras / Mesas:    15 contenedores (3 jardineras de 31L compartidas)
📸 Fotos de evolución:    42 fotos WebP (1.9 MB, 79% del peso total)

⚠️  ANOMALÍAS DE INTEGRIDAD DETECTADAS:
  [!] 9 plantas en jardineras conservan campos fantasma de maceta individual (8L, barro)
  [!] 1 riego general 'potId: all' regó 4 macetas con humedad > 75% (Semáforo Rojo)

📊 CONVIVENCIA EN JARDINERAS (ROOMMATE MATCHER):
  • Jardinera Dormitorio 1: Compatibilidad 94% (Verduras con tasas homogéneas ~7%/día)
  • Jardinera Salón 2:     Compatibilidad 42% ⚠️ (Cactus 2%/día junto a Planta Floral 11%/día)
    ➜ Sugerencia: Reubicar Cactus a maceta individual de barro cocido.

✂️ SIMULACIÓN DE PODA:
  • Purgando 32 fotos intermedias conservando inicio y fin: -1.6 MB (-66.7%)
  • Sincronizando materiales y partición real de litros:     9 macetas corregidas
  • Archivo resultante estimado: 780 KB (Ahorro global: 67.5%)
═══════════════════════════════════════════════════════════════════
```

---

### ⚙️ `Makefile` de Automatización

```makefile
.PHONY: build run test audit prune clean

build:
	go build -o bin/balconmetrics ./cmd/server
	go build -o bin/balcon-cli ./cmd/analyzer

run:
	go run ./cmd/server -port 8087 -db data/balconmetrics.db

test:
	go test -v ./...

audit:
	go run ./cmd/analyzer -backup /home/jose/Descargas/hidrobalcon-backup-2026-11-01.json -audit

prune:
	go run ./cmd/analyzer -backup /home/jose/Descargas/hidrobalcon-backup-2026-11-01.json -prune -strip-photos -sync-containers -out data/backup-saneado.json

clean:
	rm -rf bin/ data/*.db
```

---

### 🗺️ Pasos de Implementación al Retomar

Cuando retomemos esta fase, los pasos de ejecución serán:
1. **Inicializar módulo Go:** Crear directorio `tools/analyzer` (o repo `BalconMetrics`) con `go mod init github.com/josejuanmontiel/balconmetrics` y dependencias (`modernc.org/sqlite`, `github.com/google/uuid`, `github.com/dustin/go-humanize`).
2. **Definir modelos en `internal/model`:** Implementar structs de backup, reportes y opciones de poda.
3. **Desarrollar el podador en `internal/pruner`:** Escribir `pruner.go` y su suite de tests `pruner_test.go` utilizando el backup real de muestra.
4. **Desarrollar algoritmos analíticos en `internal/analyzer`:** Reglas de consistencia de contenedor, minero de riegos generales y roommate matcher.
5. **Implementar CLI y Servidor en `cmd/` y `internal/api`:** Montar endpoints HTTP y handlers de inspección/poda.
6. **Diseñar la Web SPA en `web/index.html`:** Crear la interfaz con Drag&Drop, tarjetas KPI, pestañas de análisis y selector de saneamiento de 1-clic con descarga directa.
