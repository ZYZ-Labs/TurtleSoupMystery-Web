import { defineStore } from 'pinia';
import { loginAdmin, logoutAdmin } from '@/api/services';
import { clearAuthSession, getAuthExpiresAt, getAuthToken, getAuthUsername, saveAuthSession } from '@/lib/auth';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getAuthToken(),
    username: getAuthUsername(),
    expiresAt: getAuthExpiresAt()
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token)
  },
  actions: {
    async login(username: string, password: string) {
      const session = await loginAdmin(username, password);
      this.token = session.token;
      this.username = session.username;
      this.expiresAt = session.expiresAt;
      saveAuthSession(session);
      return session;
    },
    async logout() {
      try {
        await logoutAdmin();
      } catch {
        // Best-effort logout; local session still gets cleared.
      }

      this.clear();
    },
    clear() {
      this.token = '';
      this.username = '';
      this.expiresAt = '';
      clearAuthSession();
    }
  }
});
