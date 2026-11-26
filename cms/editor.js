// Starts Sveltia CMS at /admin/: online with a GitHub access token,
// locally (npm run editor) through "Work with Local Repository".
import config from './config.js';

window.CMS_MANUAL_INIT = true;
if (['localhost', '127.0.0.1'].includes(location.hostname))
  // The local editor works without signing in, so it hides the GitHub sign-in.
  new MutationObserver(() => {
    for (const button of document.querySelectorAll('button'))
      if (/Sign In Using Access Token|Sign In with/.test(button.textContent))
        button.hidden = true;
  }).observe(document.body, { childList: true, subtree: true });

const script = document.createElement('script');
script.src = '/admin/sveltia-cms.js';
script.onload = () => CMS.init({ config });
document.head.append(script);
