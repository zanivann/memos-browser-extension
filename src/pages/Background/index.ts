import {
    encodeContent,
    encodeURL,
    executeScript,
    getBrowser,
} from '../../@/lib/utils.ts';
import { updateMemo, searchMemoByURL } from '../../@/lib/actions/memos.ts';
import { getConfig, isConfigured } from '../../@/lib/config.ts';
import OnClickData = chrome.contextMenus.OnClickData;

const browser = getBrowser();

browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
        title: 'Open memo',
        contexts: ['page'],
        id: 'openMemo',
    });
    browser.contextMenus.create({
        title: 'Append link to page memo',
        contexts: ['link'],
        id: 'link',
    });
    browser.contextMenus.create({
        title: 'Append selection to page memo',
        contexts: ['selection'],
        id: 'selection',
    });
    browser.contextMenus.create({
        title: 'Append image to page memo',
        contexts: ['image'],
        id: 'image',
    });
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await genericOnClick(info, tab);
});

async function genericOnClick(
    info: OnClickData,
    tab: chrome.tabs.Tab | undefined
) {
    const configured = await isConfigured();
    if (!tab?.url || !tab?.title || !configured) {
        return;
    }

    const config = await getConfig();
    const memo = await searchMemoByURL(
        config.baseUrl,
        config.apiKey,
        config.user,
        tab.url
    );

    if (!memo) {
        console.warn("Nenhum memo associado a esta página.");
        return;
    }

    if (info.menuItemId !== 'openMemo') {
        let pageContent = '';
        
        if (info.menuItemId === 'link' && info.linkUrl) {
            pageContent = info.linkUrl;
        } else if (info.menuItemId === 'image' && info.srcUrl) {
            pageContent = '![Image](' + encodeURL(info.srcUrl) + ')';
        } else if (info.menuItemId === 'selection' && info.selectionText) {
            if (!tab.id) {
                return;
            }
            pageContent = encodeContent(info.selectionText);
            
            try {
                const result = await executeScript(tab.id, getSelectedTextElements);
                const data: any = result;
                const baseMarker = '__MEMOS_MARKER__';
                let replacements = new Map<string, string>();
                let counter = 1;

                data.olItems.forEach((item: any) => {
                    pageContent = pageContent.replace(item.text, baseMarker + counter);
                    replacements.set(baseMarker + counter, `${item.number}. ${item.text}`);
                    counter++;
                });
                replacements.forEach((value, key) => {
                    pageContent = pageContent.replace(key, value);
                });
                replacements.clear();
                counter = 1;

                data.ulItems.forEach((item: any) => {
                    pageContent = pageContent.replace(item, baseMarker + counter);
                    replacements.set(baseMarker + counter, `- ${item}`);
                    counter++;
                });
                replacements.forEach((value, key) => {
                    pageContent = pageContent.replace(key, value);
                });
                replacements.clear();
                counter = 1;

                data.strongs.forEach((strong: any) => {
                    pageContent = pageContent.replace(strong, baseMarker + counter);
                    replacements.set(baseMarker + counter, `**${strong}**`);
                    counter++;
                });
                replacements.forEach((value, key) => {
                    pageContent = pageContent.replace(key, value);
                });
                replacements.clear();
                counter = 1;

                data.links.forEach((link: any) => {
                    let url = '';
                    try {
                        url = new URL(link.url).href;
                    } catch {
                        if (tab.url) {
                            if (link.url.startsWith('#')) {
                                url = tab.url + link.url;
                            } else {
                                try {
                                    url = new URL(link.url, new URL(tab.url).origin).href;
                                } catch (error) {
                                    console.error(error);
                                    url = '';
                                }
                            }
                        }
                    }
                    url = encodeURL(url);
                    let text = link.text;
                    pageContent = pageContent.replace(text, baseMarker + counter);
                    text = text.replace(/\[/g, '(').replace(/\]/g, ')'); 
                    if (url !== '') {
                        replacements.set(baseMarker + counter, `[${text}](${url})`);
                    } else {
                        replacements.set(baseMarker + counter, text);
                    }
                    counter++;
                });
                replacements.forEach((value, key) => {
                    pageContent = pageContent.replace(key, value);
                });
                replacements.clear();
                counter = 1;

                data.headers.h1.forEach((header: any) => {
                    pageContent = pageContent.replace(header, baseMarker + counter);
                    replacements.set(baseMarker + counter, `# ${header}`);
                    counter++;
                });
                data.headers.h2.forEach((header: any) => {
                    pageContent = pageContent.replace(header, baseMarker + counter);
                    replacements.set(baseMarker + counter, `## ${header}`);
                    counter++;
                });
                data.headers.h3.forEach((header: any) => {
                    pageContent = pageContent.replace(header, baseMarker + counter);
                    replacements.set(baseMarker + counter, `### ${header}`);
                    counter++;
                });
                data.headers.h4.forEach((header: any) => {
                    pageContent = pageContent.replace(header, baseMarker + counter);
                    replacements.set(baseMarker + counter, `#### ${header}`);
                    counter++;
                });
                data.headers.h5.forEach((header: any) => {
                    pageContent = pageContent.replace(header, baseMarker + counter);
                    replacements.set(baseMarker + counter, `##### ${header}`);
                    counter++;
                });
                data.headers.h6.forEach((header: any) => {
                    pageContent = pageContent.replace(header, baseMarker + counter);
                    replacements.set(baseMarker + counter, `###### ${header}`);
                    counter++;
                });

                replacements.forEach((value, key) => {
                    pageContent = pageContent.replace(key, value);
                });
            } catch (err) {
                console.error(err);
            }
        }

        if (pageContent !== '') {
            try {
                const lines = memo.content.split('\n');
                const lastLine = lines.pop();

                let newContent = '';
                if (lastLine && lastLine[0] === '#') {
                    lines.push(pageContent);
                    lines.push('\n' + lastLine);
                    newContent = lines.join('\n');
                } else {
                    newContent = memo.content + '\n\n' + pageContent;
                }

                updateMemo(
                    config.baseUrl,
                    memo.name,
                    null,
                    newContent,
                    config.apiKey
                );
            } catch (error) {
                console.error(error);
            }
        }
    } else {
        const url = `${config.baseUrl}/m/${memo.name.split('/')[1]}`;
        browser.tabs.create({ url });
    }
}

function getSelectedTextElements(): any {
    const links: { text: string; url: string }[] = [];
    const strongs: string[] = [];
    const ulItems: string[] = [];
    const olItems: { number: number; text: string }[] = [];
    const headers = { h1: [] as string[], h2: [] as string[], h3: [] as string[], h4: [] as string[], h5: [] as string[], h6: [] as string[] };
    
    const data = { links, strongs, ulItems, olItems, headers };

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return data;
    }

    const range = selection.getRangeAt(0);
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());

    container.querySelectorAll('a').forEach((anchor) => {
        const linkText = anchor.textContent?.trim() || 'Link';
        const href = anchor.getAttribute('href') || '';
        data.links.push({ text: linkText, url: href });
    });

    container.querySelectorAll('strong').forEach((anchor) => {
        const text = anchor.textContent?.trim();
        if (text) data.strongs.push(text);
    });

    container.querySelectorAll('ul').forEach((ul) => {
        const items = Array.from(ul.querySelectorAll('li'))
            .map((li) => li.textContent?.trim())
            .filter(Boolean) as string[];
        data.ulItems.push(...items);
    });

    container.querySelectorAll('ol').forEach((ol) => {
        let counter = 1;
        ol.querySelectorAll('li').forEach((li) => {
            const text = li.textContent?.trim();
            if (text) {
                data.olItems.push({ number: counter++, text });
            }
        });
    });

    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach((tag) => {
        container.querySelectorAll(tag).forEach((anchor) => {
            const text = anchor.textContent?.trim();
            if (text) (data.headers as any)[tag].push(text);
        });
    });

    return data;
}
