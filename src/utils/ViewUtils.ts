import {useStore} from "../store";

/**
 * 显示标题
 * @param title
 */
function showTitle(title: string) {
    const store = useStore();
    store.commit('setTitle', title);
    store.commit('setHeaderStatus', true);
}

/**
 * 隐藏标题
 */
function hideTitle() {
    const store = useStore();
    store.commit('setHeaderStatus', false);
}

export {showTitle, hideTitle}