// @ts-check
/** @param {string} version @returns {string|null} */
export function nodeVersionIssue(version) {
 const match=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
 if(match && Number(match[1])===24 && Number(match[2])>=16)return null;
 return '请安装 Node.js >=24.16.0 且 <25 的正式版本；推荐使用已验证的 24.16.0。';
}
/** @param {string|undefined} selection @returns {{channel?: 'msedge'|'chrome'}} */
export function browserOptions(selection) {
 if(selection===undefined||selection===''||selection==='chromium')return {};
 if(selection==='msedge'||selection==='chrome')return {channel:selection};
 throw new Error('E2E_BROWSER 仅支持 chromium、msedge 或 chrome。');
}
