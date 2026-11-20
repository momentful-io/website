(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('momentful-theme');
    if (['light', 'dark', 'system'].includes(saved)) preference = saved;
  } catch {}
  document.documentElement.dataset.theme = preference;
})();
