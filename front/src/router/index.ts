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
            title: '房间历史'
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
