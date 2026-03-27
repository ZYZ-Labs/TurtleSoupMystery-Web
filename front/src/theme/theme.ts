import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';

export const vuetify = createVuetify({
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi }
  },
  defaults: {
    VCard: {
      rounded: 'xl'
    },
    VBtn: {
      rounded: 'lg'
    },
    VTextField: {
      variant: 'outlined'
    },
    VTextarea: {
      variant: 'outlined'
    },
    VSelect: {
      variant: 'outlined'
    }
  },
  theme: {
    defaultTheme: 'BerrySoupTheme',
    themes: {
      BerrySoupTheme: {
        dark: false,
        colors: {
          primary: '#1f6feb',
          secondary: '#0f766e',
          accent: '#ffb547',
          success: '#1f9d55',
          warning: '#f59e0b',
          error: '#dc2626',
          info: '#0284c7',
          background: '#f3f7fb',
          surface: '#ffffff',
          'on-surface': '#18212f',
          'on-background': '#18212f'
        },
        variables: {
          'border-color': '#d6e1ed',
          'high-emphasis-opacity': 0.93,
          'medium-emphasis-opacity': 0.74,
          'theme-overlay-multiplier': 1
        }
      }
    }
  }
});
