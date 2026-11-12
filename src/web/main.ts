import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/400-italic.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './style.css';
import { type Page, pages, parts } from './pages';

const pageEl = document.querySelector<HTMLElement>('#page')!;
const navEl = document.querySelector<HTMLElement>('#stage-nav')!;
const pagerEl = document.querySelector<HTMLElement>('#pager')!;

let cleanup: (() => void) | void;

const stageNumber = (page: Page) => String(pages.indexOf(page) + 1).padStart(2, '0');

function currentPage(): Page {
  const id = location.hash.replace(/^#\/?/, '');
  return pages.find((page) => page.id === id) ?? pages[0]!;
}

function renderNav(active: Page): void {
  navEl.innerHTML = '';
  for (const part of parts) {
    const heading = document.createElement('p');
    heading.className = 'stage-part';
    const note = document.createElement('small');
    note.textContent = part.note;
    heading.append(part.label, note);
    navEl.append(heading);
    for (const page of pages.filter((candidate) => candidate.part === part.id)) navEl.append(stageLink(page, active));
  }
}

function stageLink(page: Page, active: Page): HTMLElement {
  const link = document.createElement('a');
  link.href = `#/${page.id}`;
  link.className = 'stage-link';
  if (page === active) link.setAttribute('aria-current', 'page');

  const number = document.createElement('span');
  number.className = 'stage-number';
  number.textContent = stageNumber(page);

  const label = document.createElement('span');
  label.className = 'stage-label';
  label.textContent = page.label;

  link.append(number, label);
  if (page.current) {
    const badge = document.createElement('span');
    badge.className = 'stage-badge';
    badge.textContent = 'now';
    link.append(badge);
  }
  return link;
}

function renderPager(active: Page): void {
  const index = pages.indexOf(active);
  const previous = pages[index - 1];
  const next = pages[index + 1];
  pagerEl.innerHTML = '';

  const makeLink = (page: Page | undefined, direction: 'Previous' | 'Next') => {
    const slot = document.createElement('div');
    slot.className = `pager-slot pager-${direction.toLowerCase()}`;
    if (page) {
      const link = document.createElement('a');
      link.href = `#/${page.id}`;
      const small = document.createElement('small');
      small.textContent = direction;
      const title = document.createElement('span');
      title.textContent = `${stageNumber(page)}  ${page.label}`;
      link.append(small, title);
      slot.append(link);
    }
    return slot;
  };

  pagerEl.append(makeLink(previous, 'Previous'), makeLink(next, 'Next'));
}

function show(): void {
  if (cleanup) cleanup();
  const page = currentPage();
  document.body.dataset.layout = page.layout ?? 'prose';
  cleanup = page.mount(pageEl, stageNumber(page));
  renderNav(page);
  renderPager(page);
  document.title = `${page.label} · Continuity`;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', show);
show();
