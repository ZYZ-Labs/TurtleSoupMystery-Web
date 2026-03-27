import { StateStore } from '../storage/stateStore.js';

const store = new StateStore();
await store.ensureInitialized();

console.log('Initialized SQLite runtime storage.');
