chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Progress DZ - Abdelghani Amrani Extension installed');

        chrome.storage.local.set({
            apiBaseUrl: 'http://localhost:3000',
            autoLogin: false
        });
    }

    if (chrome.contextMenus && chrome.contextMenus.create) {
        try {
            chrome.contextMenus.create({
                id: 'open-in-tab',
                title: 'Open Progress DZ in New Tab',
                contexts: ['action']
            });
        } catch (error) {
            console.warn('Failed to create context menu:', error);
        }
    }
});

chrome.runtime.onStartup.addListener(() => {
    console.log('Progress DZ - Abdelghani Amrani Extension started');
});
