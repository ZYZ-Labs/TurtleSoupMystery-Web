import { createRouter, createWebHistory } from 'vue-router';
import { hasAuthToken } from '@/lib/auth';
import MainLayout from '@/layouts/MainLayout.vue';
import DashboardView from '@/views/DashboardView.vue';
import GameView from '@/views/GameView.vue';
import HistoryView from '@/views/HistoryView.vue';
import LoginView from '@/views/LoginView.vue';
import SettingsView from '@/views/SettingsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      component: LoginView,
      meta: {
        title: '管理员登录',
        public: true
      }
    },
    {
      path: '/',
      component: MainLayout,
      children: [
        {
          path: '',
          redirect: '/dashboard'
        },
        {
          path: 'dashboard',
          component: DashboardView,
          meta: {
            title: '总览看板'
          }
        },
        {
          path: 'game/:roomCode?',
          component: GameView,
          meta: {
            title: '多人房间'
          }
        },
        {
          path: 'history',
          component: HistoryView,
          meta: {
            title: '房间历史',
            requiresAuth: true
          }
        },
        {
          path: 'settings',
          component: SettingsView,
          meta: {
            title: '系统设置',
            requiresAuth: true
          }
        }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/dashboard'
    }
  ]
});

router.beforeEach((to) => {
  const authenticated = hasAuthToken();
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);

  if (requiresAuth && !authenticated) {
    return {
      path: '/login',
      query: {
        redirect: to.fullPath
      }
    };
  }

  if (to.path === '/login' && authenticated) {
    const redirect = typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/') ? to.query.redirect : '/history';
    return redirect;
  }

  return true;
});
