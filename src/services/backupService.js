/**
 * Servicio de Copia de Seguridad y Restauración (Backup & Restore)
 * Exporta e importa en un único archivo JSON:
 * - Inventario completo de macetas con sus factores aprendidos Wasm
 * - Historial completo de riegos
 * - Álbum completo de fotos de evolución de IndexedDB (en Base64)
 */

import { db } from '../storage/db.js';
import { photoDb } from '../storage/photoDb.js';

class BackupService {
  /**
   * Genera y descarga el archivo de respaldo JSON
   */
  async exportFullBackup() {
    const pots = db.getPots();
    const containers = db.getContainers();
    const zones = db.getZones();
    const settings = db.getSettings();
    const logs = db.getLogs();

    // Recopilar todas las fotos de todas las macetas de IndexedDB
    const allPhotos = [];
    for (const pot of pots) {
      try {
        const potPhotos = await photoDb.getPhotosByPot(pot.id);
        allPhotos.push(...potPhotos);
      } catch (e) {
        console.warn('Error leyendo fotos para backup:', e);
      }
    }

    const backupData = {
      version: '1.4.0',
      exportedAt: new Date().toISOString(),
      appName: 'HidroBalcón PWA',
      data: {
        pots,
        containers,
        zones,
        settings,
        logs,
        photos: allPhotos
      }
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `hidrobalcon-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 2000);

    return {
      potCount: pots.length,
      logCount: logs.length,
      photoCount: allPhotos.length
    };
  }

  /**
   * Lee y restaura un archivo de respaldo JSON
   * @param {File} file
   */
  async importBackup(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = JSON.parse(e.target.result);
          if (!content.data || !content.data.pots) {
            throw new Error('El archivo no tiene el formato de copia de seguridad de HidroBalcón.');
          }

          const { pots, containers, zones, settings, logs, photos } = content.data;

          // 1. Restaurar macetas
          db.savePots(pots || []);

          // 1.1 Restaurar jardineras / contenedores padre
          if (containers && Array.isArray(containers)) {
            db.saveContainers(containers);
          }

          // 1.2 Restaurar zonas
          if (zones && Array.isArray(zones)) {
            db.saveZones(zones);
          }

          // 1.3 Restaurar ajustes agronómicos manuales
          if (settings && typeof settings === 'object') {
            db.saveSettings(settings);
          }

          // 2. Restaurar historial
          if (logs && Array.isArray(logs)) {
            db.saveLogs(logs);
          }

          // 3. Restaurar fotos en IndexedDB
          let restoredPhotos = 0;
          if (photos && Array.isArray(photos)) {
            for (const ph of photos) {
              try {
                await photoDb.addPhoto({
                  potId: ph.potId,
                  dataUrl: ph.dataUrl,
                  note: ph.note || '',
                  tag: ph.tag || '',
                  date: ph.date || new Date().toISOString(),
                  isCover: Boolean(ph.isCover),
                  isInitial: Boolean(ph.isInitial)
                });
                restoredPhotos++;
              } catch (err) {
                console.warn('Error restaurando foto individual:', err);
              }
            }
          }

          resolve({
            success: true,
            potCount: pots.length,
            logCount: (logs || []).length,
            photoCount: restoredPhotos
          });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
}

export const backupService = new BackupService();
