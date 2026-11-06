import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js';
import { firebaseConfig, FUNCTIONS_REGION, APPCHECK_SITE_KEY } from '../config/firebase-config.js';

export const app = initializeApp(firebaseConfig);
if (APPCHECK_SITE_KEY) initializeAppCheck(app, { provider: new ReCaptchaV3Provider(APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
export const auth = getAuth(app);
export const db = getDatabase(app);
export const fns = getFunctions(app, FUNCTIONS_REGION);
