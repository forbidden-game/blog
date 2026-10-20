/*
 * A deliberately small, self-hosted visual editor.
 *
 * It loads the real page in an iframe, makes the content regions editable,
 * then writes the changed Markdown back through the GitHub Contents API.
 * There is no server: the user supplies a fine-grained GitHub token, kept in
 * sessionStorage only. Saving creates a commit, which triggers the Pages build.
 */
(() => {
  'use strict';

  const OWNER = 'forbidden-game';
  const REPO = 'blog';
  const TOKEN_KEY = 'cms-token';
  const params = new URLSearchParams(location.search);
  const BRANCH = params.get('branch') || 'main';

  const pageSelect = document.getElementById('cms-page');
  const frame = document.getElementById('cms-frame');
  const saveButton = document.getElementById('cms-save');
  const reloadButton = document.getElementById('cms-reload');
  const tokenButton = document.getElementById('cms-token');
  const statusEl = document.getElementById('cms-status');
  const branchEl = document.getElementById('cms-branch');
  const authDialog = document.getElementById('cms-auth');
  const tokenInput = document.getElementById('cms-token-input');
  const fileInput = document.getElementById('cms-file');

  const pages = JSON.parse(document.getElementById('cms-pages').textContent).pages || [];
  let token = sessionStorage.getItem(TOKEN_KEY) || '';
  let state = null;
  let dirty = false;
  let saving = false;
  let authPrompted = false;
  let currentPageIndex = 0;
  let currentImageTarget = null;
  const pendingImages = new Map();

  const setStatus = (text, kind = '') => {
    statusEl.dataset.kind = kind;
    statusEl.textContent = text;
  };

  const setCommitStatus = (url) => {
    statusEl.dataset.kind = 'ok';
    statusEl.textContent = 'Saved · ';
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'commit';
      statusEl.append(link);
    }
  };

  const updateTokenUI = () => {
    tokenButton.textContent = token ? 'Token set' : 'Token';
    tokenButton.classList.toggle('is-set', Boolean(token));
  };

  const openAuth = () => {
    tokenInput.value = '';
    if (!authDialog.open) authDialog.showModal();
    setTimeout(() => tokenInput.focus(), 30);
  };

  const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

  const decodeBase64 = (value) => {
    const binary = atob(value.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };

  const encodeBase64 = (bytes) => {
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  };

  const fileToBase64 = async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return encodeBase64(bytes);
  };

  async function api(path, options = {}) {
    if (!token) throw new Error('Missing GitHub token');

    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      let message = '';
      try {
        const body = await response.json();
        message = body.message || '';
      } catch {
        // Keep the status code if the body is not JSON.
      }
      throw new Error(`${response.status}${message ? `: ${message}` : ''}`);
    }

    return response.json();
  }

  async function getFile(path) {
    const data = await api(`/contents/${encodePath(path)}?ref=${encodeURIComponent(BRANCH)}`);
    return { text: decodeBase64(data.content), sha: data.sha };
  }

  async function putText(path, text, sha, message) {
    const body = {
      message,
      content: encodeBase64(new TextEncoder().encode(text)),
      branch: BRANCH,
    };
    if (sha) body.sha = sha;

    return api(`/contents/${encodePath(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function putBinary(path, base64, message) {
    return api(`/contents/${encodePath(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: base64, branch: BRANCH }),
    });
  }

  const parseSource = (text) => {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) return { data: {}, body: text };
    return {
      data: window.jsyaml.load(match[1]) || {},
      body: text.slice(match[0].length),
    };
  };

  const stringifySource = (data, body) => {
    const yaml = window.jsyaml.dump(data, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    });
    return `---\n${yaml}---\n\n${body.trim()}\n`;
  };

  const markDirty = () => {
    if (!state) return;
    dirty = true;
    saveButton.disabled = false;
    setStatus('Unsaved changes');
  };

  const escapeAttribute = (value) =>
    String(value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, ' ');

  function serializeBody(bodyElement) {
    // Figure captions are editable in place; copy them back onto the figure
    // before serializing so the shortcode keeps the latest text.
    bodyElement.querySelectorAll('[data-cms-figure]').forEach((figure) => {
      const caption = figure.querySelector('figcaption');
      if (caption) figure.dataset.cmsCaption = caption.textContent.trim();
    });

    const clone = bodyElement.cloneNode(true);
    clone.querySelectorAll('.cms-image-btn').forEach((node) => node.remove());
    clone.querySelectorAll('[contenteditable]').forEach((node) => node.removeAttribute('contenteditable'));
    clone.querySelectorAll('[spellcheck]').forEach((node) => node.removeAttribute('spellcheck'));

    const turndown = new window.TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      strongDelimiter: '**',
    });

    turndown.addRule('hugoFigure', {
      filter: (node) => node.nodeName === 'FIGURE' && node.hasAttribute('data-cms-figure'),
      replacement: (_content, node) => {
        const src = node.getAttribute('data-cms-src') || '';
        const alt = node.getAttribute('data-cms-alt') || '';
        const caption = node.getAttribute('data-cms-caption') || '';
        const sizes = node.getAttribute('data-cms-sizes') || '';
        const className = node.getAttribute('data-cms-class') || '';
        const parts = [`src="${escapeAttribute(src)}"`, `alt="${escapeAttribute(alt)}"`];
        if (caption) parts.push(`caption="${escapeAttribute(caption)}"`);
        if (sizes) parts.push(`sizes="${escapeAttribute(sizes)}"`);
        if (className) parts.push(`class="${escapeAttribute(className)}"`);
        return `\n\n{{< figure ${parts.join(' ')} >}}\n\n`;
      },
    });

    turndown.addRule('highlightedCode', {
      filter: (node) =>
        node.nodeName === 'DIV' &&
        node.classList.contains('highlight') &&
        Boolean(node.querySelector('pre code')),
      replacement: (_content, node) => {
        const code = node.querySelector('pre code');
        const language = (code.className.match(/language-([a-z0-9-]+)/i) || [])[1] || '';
        return `\n\n\`\`\`${language}\n${code.textContent.replace(/\n$/, '')}\n\`\`\`\n\n`;
      },
    });

    return turndown.turndown(clone).trim();
  }

  function injectStyles(doc) {
    const old = doc.getElementById('cms-editor-style');
    if (old) old.remove();

    const style = doc.createElement('style');
    style.id = 'cms-editor-style';
    style.textContent = `
      body.cms-editing [data-cms-field],
      body.cms-editing [data-cms-body] {
        outline: 2px dashed transparent;
        outline-offset: 4px;
      }
      body.cms-editing [data-cms-field]:hover,
      body.cms-editing [data-cms-body]:hover {
        outline-color: rgba(255, 204, 102, .65);
      }
      body.cms-editing [data-cms-field]:focus,
      body.cms-editing [data-cms-body]:focus {
        outline: 2px solid #ffcc66;
      }
      body.cms-editing [data-cms-body] {
        min-height: 80px;
        cursor: text;
      }
      body.cms-editing [data-cms-body] figure,
      body.cms-editing [data-cms-body] pre {
        cursor: default;
      }
      body.cms-editing [data-cms-image],
      body.cms-editing [data-cms-figure] {
        position: relative;
      }
      body.cms-editing [data-cms-image] figcaption[contenteditable="true"],
      body.cms-editing [data-cms-body] figcaption[contenteditable="true"] {
        outline: 2px dashed transparent;
        outline-offset: 3px;
        cursor: text;
      }
      body.cms-editing [data-cms-image] figcaption[contenteditable="true"]:focus,
      body.cms-editing [data-cms-body] figcaption[contenteditable="true"]:focus {
        outline-color: #ffcc66;
      }
      body.cms-editing .cms-image-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 20;
        min-height: 32px;
        padding: 4px 8px;
        border: 1px solid #ffcc66;
        background: #080808;
        color: #ffcc66;
        font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        cursor: pointer;
      }
      body.cms-editing .cms-image-btn:hover {
        background: #ffcc66;
        color: #080808;
      }
      body.cms-editing a {
        cursor: text;
      }
      body.cms-editing .reading-toggle {
        display: none;
      }
    `;
    doc.head.append(style);
    doc.body.classList.add('cms-editing');
  }

  function addImageButtons(doc) {
    doc.querySelectorAll('[data-cms-image], [data-cms-figure]').forEach((element) => {
      if (element.querySelector(':scope > .cms-image-btn')) return;

      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'cms-image-btn';
      button.textContent = '更换图片';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        currentImageTarget = element;
        fileInput.value = '';
        fileInput.click();
      });
      element.append(button);
    });
  }

  function makeEditable(doc) {
    doc.querySelectorAll('[data-cms-field]').forEach((element) => {
      element.contentEditable = 'true';
      element.spellcheck = true;
    });

    const body = doc.querySelector('[data-cms-body]');
    if (body) {
      body.contentEditable = 'true';
      body.spellcheck = true;
      body.querySelectorAll('figure').forEach((figure) => {
        figure.contentEditable = 'false';
      });
      body.querySelectorAll('figcaption').forEach((caption) => {
        caption.contentEditable = 'true';
      });
    }

    doc.querySelectorAll('[data-cms-image="cover"] figcaption, [data-cms-image="photo"] figcaption').forEach((caption) => {
      caption.contentEditable = 'true';
    });

    doc.addEventListener('input', markDirty);

    // In edit mode links and gallery controls must not navigate or open the
    // lightbox. Capture stops the site's own document-level listeners.
    doc.addEventListener(
      'click',
      (event) => {
        const link = event.target.closest('a');
        if (link) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true,
    );
  }

  async function attachEditor() {
    if (!frame.contentDocument || frame.contentWindow.location.href === 'about:blank') return;

    const doc = frame.contentDocument;
    const file = doc.body.dataset.cmsFile || '';

    if (!file || !/^(_index|about|posts\/[^/]+)\.md$/.test(file)) {
      state = null;
      saveButton.disabled = true;
      setStatus('This page is not editable.', 'error');
      return;
    }

    if (!token) {
      state = null;
      saveButton.disabled = true;
      setStatus('Enter a GitHub token to edit.', '');
      if (!authPrompted) {
        authPrompted = true;
        openAuth();
      }
      return;
    }

    state = null;
    pendingImages.clear();
    setStatus(`Loading ${file}…`);

    const path = `content/${file}`;
    const source = await getFile(path);
    const parsed = parseSource(source.text);

    state = {
      path,
      file,
      sha: source.sha,
      data: parsed.data,
      body: parsed.body,
      doc,
    };

    injectStyles(doc);
    makeEditable(doc);
    addImageButtons(doc);

    dirty = false;
    saveButton.disabled = true;
    setStatus(`Ready · ${file}`, 'ok');
  }

  function loadPage(index) {
    if (!pages[index]) return;
    currentPageIndex = index;
    const target = new URL(pages[index].url, location.href).href;
    if (frame.src === target) {
      frame.contentWindow.location.reload();
    } else {
      frame.src = target;
    }
  }

  pageSelect.addEventListener('change', () => {
    const next = Number(pageSelect.value);
    if (dirty && !window.confirm('有未保存的修改，切换页面？')) {
      pageSelect.value = String(currentPageIndex);
      return;
    }
    loadPage(next);
  });

  frame.addEventListener('load', () => {
    if (frame.contentWindow.location.href === 'about:blank') return;
    attachEditor().catch((error) => {
      console.error(error);
      setStatus(`Load failed: ${error.message}`, 'error');
    });
  });

  saveButton.addEventListener('click', async () => {
    if (!state || saving) return;
    if (!token) {
      openAuth();
      return;
    }

    saving = true;
    saveButton.disabled = true;
    setStatus('Saving…');

    try {
      const doc = frame.contentDocument;
      const data = structuredClone(state.data);
      const title = doc.querySelector('[data-cms-field="title"]');
      const description = doc.querySelector('[data-cms-field="description"]');
      const cover = doc.querySelector('[data-cms-image="cover"]');
      const bodyElement = doc.querySelector('[data-cms-body]');

      if (title) data.title = title.textContent.trim();
      if (description) data.description = description.textContent.trim();

      if (cover) {
        const src = cover.dataset.cmsSrc;
        const alt = cover.dataset.cmsAlt;
        const caption = cover.querySelector('figcaption');
        if (src) data.cover = src;
        if (alt) data.coverAlt = alt;
        if (caption) data.coverCaption = caption.textContent.trim();
      }

      if (Array.isArray(data.photos)) {
        doc.querySelectorAll('[data-cms-image="photo"]').forEach((photo) => {
          const index = Number(photo.dataset.cmsIndex);
          if (!Number.isInteger(index) || !data.photos[index]) return;
          if (photo.dataset.cmsSrc) data.photos[index].src = photo.dataset.cmsSrc;
          if (photo.dataset.cmsAlt) data.photos[index].alt = photo.dataset.cmsAlt;
          const caption = photo.querySelector('figcaption');
          if (caption) data.photos[index].caption = caption.textContent.trim();
        });
      }

      let body = state.body;
      if (bodyElement) body = serializeBody(bodyElement);

      data.lastmod = new Date().toISOString();

      // Upload changed images first. If an upload fails, the Markdown is not
      // updated and the editor keeps the pending files for a retry.
      for (const [repoPath, file] of pendingImages) {
        const base64 = await fileToBase64(file);
        await putBinary(repoPath, base64, `cms: upload ${repoPath}`);
      }

      const text = stringifySource(data, body);
      const result = await putText(state.path, text, state.sha, `cms: update ${state.path}`);

      state.sha = result.content.sha;
      state.data = data;
      state.body = body;
      pendingImages.clear();
      dirty = false;
      saveButton.disabled = true;
      setCommitStatus(result.commit?.html_url);
    } catch (error) {
      console.error(error);
      saveButton.disabled = false;
      setStatus(`Save failed: ${error.message}`, 'error');
      if (/401|403/.test(error.message)) openAuth();
    } finally {
      saving = false;
    }
  });

  reloadButton.addEventListener('click', () => {
    if (dirty && !window.confirm('放弃未保存的修改并重新加载？')) return;
    loadPage(currentPageIndex);
  });

  tokenButton.addEventListener('click', openAuth);

  document.getElementById('cms-token-save').addEventListener('click', (event) => {
    event.preventDefault();
    const value = tokenInput.value.trim();
    if (!value) return;
    token = value;
    sessionStorage.setItem(TOKEN_KEY, token);
    updateTokenUI();
    authPrompted = false;
    authDialog.close();
    setStatus('Token set. Loading editor…', 'ok');
    loadPage(currentPageIndex);
  });

  document.getElementById('cms-token-forget').addEventListener('click', (event) => {
    event.preventDefault();
    token = '';
    sessionStorage.removeItem(TOKEN_KEY);
    updateTokenUI();
    authDialog.close();
    state = null;
    saveButton.disabled = true;
    setStatus('Token cleared.', '');
  });

  document.getElementById('cms-token-cancel').addEventListener('click', (event) => {
    event.preventDefault();
    authDialog.close();
  });

  fileInput.addEventListener('change', () => {
    const target = currentImageTarget;
    const file = fileInput.files && fileInput.files[0];
    currentImageTarget = null;
    if (!target || !file || !state) return;

    if (file.size > 20 * 1024 * 1024) {
      setStatus('Image is larger than 20 MB.', 'error');
      return;
    }

    const type = target.dataset.cmsImage || (target.hasAttribute('data-cms-figure') ? 'body' : '');
    if (!type) return;

    const alt = window.prompt('图片替代文本', target.dataset.cmsAlt || '');
    if (alt === null) return;

    target.dataset.cmsAlt = alt;

    const stem = state.file.replace(/^.*\//, '').replace(/\.md$/, '');
    const original = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
    const extension = (file.name.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
    const filename = `${stem}-${original}-${Date.now().toString(36)}${extension}`;
    const srcPath = `uploads/${filename}`;
    const repoPath = `assets/uploads/${filename}`;

    target.dataset.cmsSrc = srcPath;
    target.querySelectorAll('source').forEach((source) => source.remove());

    const image = target.querySelector('img');
    if (image) {
      image.removeAttribute('srcset');
      image.removeAttribute('sizes');
      image.src = URL.createObjectURL(file);
    }

    pendingImages.set(repoPath, file);
    markDirty();
    setStatus(`New image ready: ${srcPath}`);
  });

  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  // Populate the page picker.
  pages.forEach((page, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = page.label;
    pageSelect.append(option);
  });

  const requested = params.get('page');
  const initial = requested
    ? pages.findIndex((page) => page.url === requested || page.url.endsWith(requested))
    : 0;
  currentPageIndex = initial >= 0 ? initial : 0;
  pageSelect.value = String(currentPageIndex);
  branchEl.textContent = `branch: ${BRANCH}`;
  updateTokenUI();
  loadPage(currentPageIndex);
})();
