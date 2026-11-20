// Configurações centrais do app. Tudo que muda de uma instalação para outra fica aqui.
const env = import.meta.env;

export const APP_NOME = 'AppPani';
export const APP_VERSAO = '1.1.0';

// Endereço público do site (links de e-mail, compartilhamento, deep links)
export const APP_URL = String(env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');

// Esquema do app nativo (deve ser igual ao appId do capacitor.config.json)
export const NATIVE_SCHEME = 'app.apppani.mobile';

export const SUPORTE_EMAIL = env.VITE_SUPORTE_EMAIL || 'suporte@apppani.app';
export const EMPRESA = env.VITE_EMPRESA || 'AppPani';

export const SENHA_MIN = 8;

export const FEATURES = {
  apple: env.VITE_APPLE_LOGIN === 'true',
};
