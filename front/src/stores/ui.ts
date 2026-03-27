import { defineStore } from 'pinia';

type SnackbarTone = 'primary' | 'success' | 'warning' | 'error';

export const useUiStore = defineStore('ui', {
  state: () => ({
    open: false,
    message: '',
    color: 'primary' as SnackbarTone
  }),
  actions: {
    notify(message: string, color: SnackbarTone = 'primary') {
      this.message = message;
      this.color = color;
      this.open = true;
    },
    close() {
      this.open = false;
    }
  }
});
