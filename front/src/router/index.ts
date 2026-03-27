import { createRouter, createWebHistory } from 'vue-router';
import MainLayout from '@/layouts/MainLayout.vue';
import DashboardView from '@/views/DashboardView.vue';
import GameView from '@/views/GameView.vue';
import HistoryView from '@/views/HistoryView.vue';
import SettingsView from '@/views/SettingsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
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
            title: '作战总览'
          }
        },
        {
          path: 'game/:sessionId?',
          component: GameView,
          meta: {
            title: '游戏会话'
          }
        },
        {
          path: 'history',
          component: HistoryView,
          meta: {
            title: '对局历史'
          }
        },
        {
          path: 'settings',
          component: SettingsView,
          meta: {
            title: '系统设置'
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
