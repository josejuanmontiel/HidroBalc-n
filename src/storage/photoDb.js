/**
 * Capa de Almacenamiento de Fotos con IndexedDB
 * Permite almacenar cientos de megabytes de fotos de evolución localmente
 * sin consumir espacio en LocalStorage y con compresión en el cliente.
 */

const DB_NAME = 'hidrobalcon_photos_db';
const DB_VERSION = 1;
const STORE_NAME = 'plant_photos';

export class PhotoDatabase {
  constructor() {
    this.dbPromise = this.initDB();
  }

  async initDB() {
    if (typeof indexedDB === 'undefined') {
      return null;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('potId', 'potId', { unique: false });
          store.createIndex('date', 'date', { unique: false });
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  /**
   * Comprime un archivo de imagen (File o Blob) usando Canvas en el navegador
   * Reduce fotos de 5-10MB a 40-70KB en WebP o JPEG de alta fidelidad
   * @param {File|Blob} file 
   * @param {number} maxDimension - Tamaño máximo en píxeles (ancho o alto)
   * @param {number} quality - Calidad 0.1 a 1.0
   */
  async compressImage(file, maxDimension = 900, quality = 0.78) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;

          if (width > height) {
            if (width > maxDimension) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Intentar WebP, fallback a JPEG
          let dataUrl = canvas.toDataURL('image/webp', quality);
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          resolve({
            dataUrl,
            width,
            height,
            sizeBytes: Math.round((dataUrl.length * 3) / 4)
          });
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Guarda una foto para una maceta
   */
  async addPhoto({ potId, dataUrl, note = '', date = new Date().toISOString(), isCover = false }) {
    const db = await this.dbPromise;
    if (!db) return null;

    const photo = {
      id: `photo-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      potId,
      dataUrl,
      note,
      date,
      isCover: Boolean(isCover)
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      if (isCover) {
        // Quitar isCover de las demás fotos de esta misma maceta
        const index = store.index('potId');
        const req = index.openCursor(IDBKeyRange.only(potId));
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (cursor.value.isCover) {
              const updated = { ...cursor.value, isCover: false };
              cursor.update(updated);
            }
            cursor.continue();
          }
        };
      }

      store.add(photo);
      tx.oncomplete = () => resolve(photo);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene todas las fotos de una maceta ordenadas por fecha (más recientes primero)
   */
  async getPhotosByPot(potId) {
    const db = await this.dbPromise;
    if (!db) return [];

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('potId');
      const request = index.getAll(IDBKeyRange.only(potId));

      request.onsuccess = () => {
        const photos = request.result || [];
        // Ordenar de más reciente a más antigua
        photos.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        resolve(photos);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtiene la foto de portada de una maceta (o la más reciente si no hay ninguna marcada como portada)
   */
  async getCoverPhoto(potId) {
    const photos = await this.getPhotosByPot(potId);
    if (photos.length === 0) return null;
    const cover = photos.find(p => p.isCover);
    return cover || photos[0];
  }

  /**
   * Elimina una foto por su ID
   */
  async deletePhoto(photoId) {
    const db = await this.dbPromise;
    if (!db) return false;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(photoId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Marca una foto como portada de la maceta
   */
  async setCoverPhoto(potId, photoId) {
    const db = await this.dbPromise;
    if (!db) return false;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('potId');
      const req = index.openCursor(IDBKeyRange.only(potId));

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const isTarget = cursor.value.id === photoId;
          const updated = { ...cursor.value, isCover: isTarget };
          cursor.update(updated);
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }
}

export const photoDb = new PhotoDatabase();
