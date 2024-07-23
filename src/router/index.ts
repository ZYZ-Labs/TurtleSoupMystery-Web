// src/router/index.ts
import {createRouter, createWebHistory, RouteRecordRaw} from 'vue-router';
import Home from '../views/Home.vue';
import AutoMatch from '../views/AutoMatch.vue';
import CreateRoom from '../views/CreateRoom.vue';
import Login from '../views/Login.vue';

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
    },
    {
        path: '/login',
        name: 'Login',
        component: Login
    }
];

const router = createRouter({
    history: createWebHistory(import.meta.env.VITE_BASE_URL),
    routes
});

export default router;
