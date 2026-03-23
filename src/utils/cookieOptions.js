// KIP · src/utils/cookieOptions.js
// Opciones de cookie reutilizadas en auth routes

const isProduction = process.env.NODE_ENV === 'production';

export const sessionCookieOptions = {
  httpOnly: true,
  secure:   process.env.COOKIE_SECURE === 'true' || isProduction,
  sameSite: 'lax',
  path:     '/',
  domain:   process.env.COOKIE_DOMAIN || undefined,
};

export const authIndicatorOptions = {
  // Cookie pública (NO httpOnly) que indica al JS si hay sesión activa.
  // No contiene el token — solo sirve como indicador booleano.
  httpOnly: false,
  secure:   process.env.COOKIE_SECURE === 'true' || isProduction,
  sameSite: 'lax',
  path:     '/',
};
