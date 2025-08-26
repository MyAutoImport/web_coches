'use strict';
/**
 * Utils de seguridad y UX
 * Cárgalo con defer: <script src="js/utils.js" defer></script>
 */

// Saneado básico de texto → HTML
function sanitizeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str.toString();
  return div.innerHTML;
}

// Insertar HTML confiable (usar sólo con contenido ya saneado)
function safeInnerHTML(element, htmlContent) {
  if (!element) return;
  element.innerHTML = htmlContent;
}

// Insertar texto de forma segura
function safeTextContent(element, textContent) {
  if (!element) return;
  element.textContent = textContent || '';
}

// Sistema simple de notificaciones
class NotificationSystem {
  constructor() { this.container = this.createContainer(); }
  createContainer() {
    let el = document.getElementById('notifications-container');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'notifications-container';
    el.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 9999;
      pointer-events: none; max-width: 400px;
    `;
    document.body.appendChild(el);
    return el;
  }
  show(message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    const colors = {
      error: { bg: '#FED7D7', color: '#C53030', border: '#F56565' },
      success: { bg: '#C6F6D5', color: '#25855A', border: '#48BB78' },
      warning: { bg: '#FEEBC8', color: '#DD6B20', border: '#ED8936' },
      info: { bg: '#BEE3F8', color: '#3182CE', border: '#4299E1' }
    };
    const style = colors[type] || colors.info;
    notification.style.cssText = `
      background:${style.bg}; color:${style.color}; border:1px solid ${style.border};
      padding:16px 20px; border-radius:8px; margin-bottom:12px; box-shadow:0 4px 12px rgba(0,0,0,0.1);
      pointer-events:auto; transform:translateX(100%); transition:transform .3s ease; word-wrap:break-word;
      font-weight:500; font-size:.9rem;
    `;
    notification.textContent = message;
    this.container.appendChild(notification);
    requestAnimationFrame(() => notification.style.transform = 'translateX(0)');
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => notification.parentNode && notification.parentNode.removeChild(notification), 300);
    }, duration);
  }
  error(m){ this.show(m,'error',7000) }
  success(m){ this.show(m,'success',4000) }
  warning(m){ this.show(m,'warning',6000) }
  info(m){ this.show(m,'info',5000) }
}

// Validación client-side
const Validator = {
  email(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return !!email && regex.test(email) && email.length <= 254;
  },
  phone(phone) {
    const cleaned = (phone || '').replace(/\D/g, '');
    return cleaned.length >= 9 && cleaned.length <= 15;
  },
  required(value, minLength = 1) {
    return !!value && value.toString().trim().length >= minLength;
  },
  maxLength(value, max) {
    return !value || value.toString().length <= max;
  }
};

// Exponer utilidades globales
window.notify = new NotificationSystem();
window.Validator = Validator;
window.sanitizeHTML = sanitizeHTML;
window.safeInnerHTML = safeInnerHTML;
window.safeTextContent = safeTextContent;

console.log('🛡️ utils.js listo');
