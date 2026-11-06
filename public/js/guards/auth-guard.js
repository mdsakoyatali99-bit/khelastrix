import { state } from '../services/auth.js';
export const requireUser = () => (state.user ? null : '/login');
export const guestOnly = () => (state.user ? '/tournaments' : null);
