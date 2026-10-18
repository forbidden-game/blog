/*
 * The site has no framework at runtime. This file powers two progressive
 * enhancements: the native <dialog> lightbox and the prose font toggle.
 * Without JavaScript, image links still open the full image and prose keeps
 * the readable system sans default.
 */
(() => {
  const dialog = document.getElementById('lightbox');

  if (dialog) {
    const image = dialog.querySelector('.lightbox__image');
    const caption = dialog.querySelector('.lightbox__caption');
    const count = dialog.querySelector('.lightbox__count');
    const prev = dialog.querySelector('[data-prev]');
    const next = dialog.querySelector('[data-next]');
    let triggers = [];
    let index = 0;

    const render = () => {
      const trigger = triggers[index];
      if (!trigger) return;

      image.src = trigger.getAttribute('href');
      image.alt = trigger.dataset.alt || '';
      caption.textContent = trigger.dataset.caption || '';
      count.textContent = `${index + 1} / ${triggers.length}`;
      prev.disabled = index === 0;
      next.disabled = index === triggers.length - 1;
    };

    const open = (trigger) => {
      triggers = [...document.querySelectorAll('[data-lightbox]')];
      index = triggers.indexOf(trigger);
      if (index < 0) return;

      render();
      if (!dialog.open) dialog.showModal();
    };

    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-lightbox]');
      if (!trigger) return;
      event.preventDefault();
      open(trigger);
    });

    dialog.querySelector('.lightbox__close').addEventListener('click', () => {
      dialog.close();
    });

    prev.addEventListener('click', () => {
      if (index === 0) return;
      index -= 1;
      render();
    });

    next.addEventListener('click', () => {
      if (index === triggers.length - 1) return;
      index += 1;
      render();
    });

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });

    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' && index > 0) {
        index -= 1;
        render();
      }
      if (event.key === 'ArrowRight' && index < triggers.length - 1) {
        index += 1;
        render();
      }
    });
  }

  const toggle = document.getElementById('reading-toggle');

  if (toggle) {
    const root = document.documentElement;
    const sync = () => {
      const pixel = root.dataset.reading === 'pixel';
      toggle.setAttribute('aria-pressed', String(pixel));
      toggle.title = pixel ? '切换到系统阅读字体' : '切换到像素字体';
    };

    sync();

    toggle.addEventListener('click', () => {
      const pixel = root.dataset.reading !== 'pixel';
      if (pixel) {
        root.dataset.reading = 'pixel';
      } else {
        delete root.dataset.reading;
      }

      try {
        localStorage.setItem('reading', pixel ? 'pixel' : 'sans');
      } catch {
        // Storage can be unavailable in private contexts; the toggle still
        // works for the current page.
      }

      sync();
    });
  }
})();
