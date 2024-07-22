// src/router/index.ts
import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import Home from '../views/Home.vue';
import AutoMatch from '../views/AutoMatch.vue';
import CreateRoom from '../views/CreateRoom.vue';

const routes: Array<RouteRecordRaw> = [
    {
        path: '/',
        name: 'Home',
        component: Home
    },
    {
        path: '/auto-match',
        name: 'AutoMatch',
        component: AutoMatch
    },
    {
        path: '/create-room',
        name: 'CreateRoom',
        component: CreateRoom
    }
];

const router = createRouter({
    history: createWebHistory(import.meta.env.VITE_BASE_URL),
    routes
});

export default router;
