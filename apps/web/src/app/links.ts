/** Sitio principal de Qhub (landing): desde el inicio de sesión se vuelve a él. */
export const LANDING_URL = ((import.meta.env as Record<string, string | undefined>).VITE_QHUB_LANDING_URL?.trim() || 'https://qhub-landing.vercel.app').replace(/\/+$/, '');
