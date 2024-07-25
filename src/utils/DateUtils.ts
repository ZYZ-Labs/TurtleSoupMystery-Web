/**
 * 延迟操作
 * @param ms
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export {delay}