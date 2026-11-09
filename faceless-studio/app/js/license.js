import { CONFIG } from './config.js';

const KEY = 'fs.license.v1';
const API = 'https://api.lemonsqueezy.com/v1/licenses';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}
function write(v) {
  try {
    v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY);
  } catch {}
}

async function post(path, params) {
  const res = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function tierFrom(meta) {
  const name = String(meta?.variant_name || '').toLowerCase();
  return name.includes(String(CONFIG.lemonSqueezy.proVariantMatch || 'pro').toLowerCase()) ? 'pro' : 'basic';
}

function productMatches(meta) {
  const { storeId, productId } = CONFIG.lemonSqueezy;
  if (storeId && meta?.store_id !== storeId) return false;
  if (productId && meta?.product_id !== productId) return false;
  return true;
}

/** Returns { unlocked, tier, mode, key? } */
export function currentLicense() {
  if (CONFIG.licenseMode === 'off') return { unlocked: true, tier: 'pro', mode: 'service' };
  const saved = read();
  if (saved?.key) return { unlocked: true, tier: saved.tier || 'basic', mode: 'licensed', key: saved.key };
  return { unlocked: false, tier: null, mode: 'licensed' };
}

export async function activate(licenseKey) {
  const key = String(licenseKey || '').trim();
  if (!key) return { ok: false, message: 'Enter the license key from your purchase email.' };
  let r;
  try {
    r = await post('activate', { license_key: key, instance_name: `${CONFIG.appName} (${navigator.platform || 'browser'})` });
  } catch {
    return { ok: false, message: 'Could not reach the license server. Check your internet connection and try again.' };
  }
  const j = r.json;
  if (!j.activated) return { ok: false, message: j.error ? `That key didn't work: ${j.error}` : 'That key did not work. Copy it exactly from your purchase email.' };
  if (!productMatches(j.meta)) return { ok: false, message: 'That key is for a different product.' };
  const saved = { key, instanceId: j.instance?.id, tier: tierFrom(j.meta), activatedAt: Date.now(), checkedAt: Date.now() };
  write(saved);
  return { ok: true, tier: saved.tier };
}

/** Background re-check. Offline or server errors never lock a paying user out. */
export async function revalidate() {
  if (CONFIG.licenseMode === 'off') return { unlocked: true };
  const saved = read();
  if (!saved?.key) return { unlocked: false };
  try {
    const r = await post('validate', { license_key: saved.key, ...(saved.instanceId ? { instance_id: saved.instanceId } : {}) });
    const j = r.json;
    const status = j.license_key?.status;
    if (r.ok && j.valid === false && ['disabled', 'expired', 'inactive'].includes(status)) {
      write(null);
      return { unlocked: false, reason: status };
    }
    if (r.status === 404 || (r.ok === false && /not found|invalid/i.test(j.error || ''))) {
      write(null);
      return { unlocked: false, reason: 'invalid' };
    }
    if (j.meta) write({ ...saved, tier: tierFrom(j.meta), checkedAt: Date.now() });
  } catch {
    // offline: keep working
  }
  return { unlocked: true };
}

export function deactivateLocal() {
  write(null);
}
