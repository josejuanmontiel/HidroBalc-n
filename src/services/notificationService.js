/**
 * Servicio de Notificaciones Locales PWA
 * Soporta la API de Notification del navegador y Service Worker.
 */

class NotificationService {
  constructor() {
    this.permission = 'Notification' in window ? Notification.permission : 'unsupported';
  }

  isSupported() {
    return 'Notification' in window;
  }

  getPermission() {
    if (!this.isSupported()) return 'unsupported';
    this.permission = Notification.permission;
    return this.permission;
  }

  async requestPermission() {
    if (!this.isSupported()) return 'unsupported';
    try {
      const res = await Notification.requestPermission();
      this.permission = res;
      return res;
    } catch (e) {
      console.warn('Error solicitando permisos de notificación:', e);
      return 'denied';
    }
  }

  async sendNotification(title, options = {}) {
    if (!this.isSupported()) return false;

    if (Notification.permission !== 'granted') {
      const perm = await this.requestPermission();
      if (perm !== 'granted') return false;
    }

    const defaultOptions = {
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      vibrate: [200, 100, 200],
      tag: 'riego-aviso',
      renotify: true,
      body: 'Recuerda revisar tus macetas hoy.',
      ...options
    };

    // Si hay un Service Worker activo, preferir registration.showNotification
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, defaultOptions);
        return true;
      } catch (e) {
        console.warn('Fallo showNotification de ServiceWorker, intentando new Notification:', e);
      }
    }

    try {
      new Notification(title, defaultOptions);
      return true;
    } catch (e) {
      console.warn('Error al lanzar Notification:', e);
      return false;
    }
  }

  /**
   * Envía una notificación de prueba para que el usuario verifique sonido y vibración
   */
  async testNotification() {
    return this.sendNotification('🪴 ¡Notificaciones de Riego Activas!', {
      body: 'Tu balcón está conectado al calendario. Recibirás avisos de sequía y alertas de heladas.',
      tag: 'test-riego'
    });
  }
}

export const notificationService = new NotificationService();
