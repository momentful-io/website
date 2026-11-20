const theme = document.querySelector('#theme');
theme.value = document.documentElement.dataset.theme || 'system';
document.querySelector('.theme-control').hidden = false;
theme.addEventListener('change', () => {
  document.documentElement.dataset.theme = theme.value;
  try {
    localStorage.setItem('momentful-theme', theme.value);
  } catch {}
});
const toggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
toggle.hidden = false;
document.documentElement.classList.add('has-js');
const header = document.querySelector('.site-header');
const mobile = matchMedia('(max-width: 640px)');
function syncMenu(open) {
  header.dataset.open = String(open);
  navigation.inert = mobile.matches && !open;
}
function closeMenu() {
  syncMenu(false);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open navigation');
}
toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  syncMenu(open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute(
    'aria-label',
    open ? 'Close navigation' : 'Open navigation',
  );
});
navigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (
    event.key === 'Escape' &&
    toggle.getAttribute('aria-expanded') === 'true'
  ) {
    closeMenu();
    toggle.focus();
  }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.header-inner')) closeMenu();
});
matchMedia('(min-width: 641px)').addEventListener('change', closeMenu);

document.addEventListener('focusin', (event) => {
  if (!header.contains(event.target)) closeMenu();
});
mobile.addEventListener('change', closeMenu);
closeMenu();
