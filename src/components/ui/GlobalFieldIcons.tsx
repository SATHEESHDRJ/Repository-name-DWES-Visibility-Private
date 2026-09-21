import { useEffect } from 'react';
import '../../styles/form-field-icons.css';

type FieldControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const DECORATED = 'data-dwes-field-icon-ready';

function fieldContext(control: FieldControl): string {
  const labels = control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement
    ? Array.from(control.labels ?? []).map(label => label.textContent ?? '').join(' ')
    : '';
  const nearbyLabel = control.closest('.form-group, label, [class*="field"], td, th')?.querySelector('label')?.textContent ?? '';
  return [
    control.getAttribute('data-field-icon'),
    control.type,
    control.name,
    control.id,
    control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement ? control.placeholder : '',
    control.getAttribute('aria-label'),
    control.getAttribute('title'),
    labels,
    nearbyLabel,
  ].filter(Boolean).join(' ').toLowerCase();
}

function resolveIcon(control: FieldControl): string {
  const context = fieldContext(control);
  const explicit = control.getAttribute('data-field-icon');
  if (explicit) return explicit;

  if (control instanceof HTMLTextAreaElement) return /reason|issue|problem|comment|message/.test(context) ? 'comment' : 'notes';
  if (control instanceof HTMLInputElement && control.type === 'file') return 'upload_file';
  if (/search|find|lookup|filter|query/.test(context)) return 'search';
  if (/date|calendar|deadline|due|start day|end day/.test(context)) return 'calendar_month';
  if (/time|hour|duration/.test(context)) return 'schedule';
  if (/password|passcode|secret|credential/.test(context)) return 'lock';
  if (/email|e-mail/.test(context)) return 'mail';
  if (/phone|mobile|whatsapp|contact number/.test(context)) return 'call';
  if (/location|address|region|country|site|city/.test(context)) return 'location_on';
  if (/project|substation|client|company|organization/.test(context)) return 'domain';
  if (/panel|frame|cubicle|bay/.test(context)) return 'view_quilt';
  if (/technician|supervisor|director|engineer|employee|user|person|assignee|owner|full name|username/.test(context)) return 'person';
  if (/role|status|state|mode|type|category|priority|severity|option/.test(context)) return 'category';
  if (/cable|wire|core|ferrule|terminal/.test(context)) return 'cable';
  if (/drawing|document|file|attachment|pdf|excel|schedule/.test(context)) return 'description';
  if (/url|link|endpoint|host/.test(context)) return 'link';
  if (/token|api key|key id/.test(context)) return 'key';
  if (/code|number|sequence|quantity|count|port|id\b/.test(context)) return 'tag';
  if (/description|note|remark|details|summary/.test(context)) return 'notes';
  if (control instanceof HTMLSelectElement || control.hasAttribute('list')) return 'list_alt';
  if (control instanceof HTMLInputElement && control.type === 'number') return 'pin';
  return 'edit';
}

function hasExistingLeadingIcon(control: FieldControl): boolean {
  const parent = control.parentElement;
  if (!parent) return false;
  if (parent.classList.contains('field-with-icon') || parent.classList.contains('login-input-wrap')) return true;
  return Array.from(parent.children).some(child => {
    if (child === control || !(child instanceof HTMLElement)) return false;
    const hasIcon = child.matches('.field-lead-icon, .login-input-icon')
      || Boolean(child.querySelector('.ui-icon, .material-symbols-rounded, .dashboard-3d-icon'));
    return hasIcon && (child.classList.contains('absolute') || getComputedStyle(child).position === 'absolute');
  });
}

function positionIcon(control: FieldControl, icon: HTMLElement) {
  const isTextarea = control instanceof HTMLTextAreaElement;
  icon.style.left = `${control.offsetLeft + 13}px`;
  icon.style.top = `${control.offsetTop + (isTextarea ? 17 : Math.max(20, control.offsetHeight / 2))}px`;
}

function decorate(control: FieldControl) {
  if (control.hasAttribute(DECORATED)) return;
  if (control.closest('.login-page-root, [data-no-field-icons]')) return;
  if (control instanceof HTMLInputElement && ['hidden', 'checkbox', 'radio', 'range', 'color', 'button', 'submit', 'reset'].includes(control.type)) return;
  const parent = control.parentElement;
  if (!parent) return;

  control.setAttribute(DECORATED, 'true');
  parent.classList.add('dwes-field-icon-shell');

  if (hasExistingLeadingIcon(control)) {
    control.classList.add('dwes-field-control--existing-icon');
    return;
  }

  const icon = document.createElement('span');
  icon.className = 'dwes-auto-field-icon material-symbols-rounded';
  icon.textContent = resolveIcon(control);
  icon.setAttribute('aria-hidden', 'true');
  parent.appendChild(icon);
  control.classList.add('dwes-field-control--icon');
  requestAnimationFrame(() => positionIcon(control, icon));
}

function decorateWithin(root: ParentNode) {
  if (root instanceof HTMLInputElement || root instanceof HTMLSelectElement || root instanceof HTMLTextAreaElement) decorate(root);
  root.querySelectorAll<FieldControl>('input, select, textarea').forEach(decorate);
}

function repositionAll() {
  document.querySelectorAll<FieldControl>('.dwes-field-control--icon').forEach(control => {
    const icon = control.parentElement?.querySelector<HTMLElement>(':scope > .dwes-auto-field-icon');
    if (icon) positionIcon(control, icon);
  });
}

/**
 * Presentation-only enhancer for the application's heterogeneous legacy forms.
 * It never changes values, events, validation attributes, or field structure.
 */
export default function GlobalFieldIcons() {
  useEffect(() => {
    decorateWithin(document);
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node instanceof HTMLElement) decorateWithin(node);
      }));
      requestAnimationFrame(repositionAll);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', repositionAll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', repositionAll);
      document.querySelectorAll('.dwes-auto-field-icon').forEach(icon => icon.remove());
      document.querySelectorAll(`[${DECORATED}]`).forEach(control => {
        control.removeAttribute(DECORATED);
        control.classList.remove('dwes-field-control--icon', 'dwes-field-control--existing-icon');
      });
      document.querySelectorAll('.dwes-field-icon-shell').forEach(shell => shell.classList.remove('dwes-field-icon-shell'));
    };
  }, []);

  return null;
}
