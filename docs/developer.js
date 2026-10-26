// Progressive enhancement only: content and anchor navigation also work without JavaScript.
const contents = document.querySelector('.contents');
const compact = matchMedia('(max-width: 900px)');
const fitContents = () => { contents.open = !compact.matches; };
fitContents();
compact.addEventListener('change', fitContents);

const links = [...contents.querySelectorAll('a[href^="#"]')];
function markCurrent(id) {
  for (const link of links) {
    if (link.hash === '#' + id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
contents.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  markCurrent(link.hash.slice(1));
  if (compact.matches) contents.open = false;
});

const sections = [...document.querySelectorAll('main > section[id]')];
markCurrent(location.hash.slice(1) || sections[0].id);
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) markCurrent(entry.target.id);
  }, { rootMargin: '-12% 0px -66% 0px' });
  for (const section of sections) observer.observe(section);
}

// Copy buttons on command blocks; the code stays selectable when the clipboard is unavailable.
if (navigator.clipboard) {
  for (const block of document.querySelectorAll('.code-block')) {
    const heading = block.querySelector('.code-heading'), code = block.querySelector('pre code');
    if (!heading || !code) continue;
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'copy', textContent: '复制' });
    button.setAttribute('aria-label', '复制命令');
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = '已复制'; button.classList.add('done');
      } catch { button.textContent = '无法复制'; }
      setTimeout(() => { button.textContent = '复制'; button.classList.remove('done'); }, 1600);
    });
    heading.append(button);
  }
}
