/**
 * homepage.js — Unified merged file list (two-level deep)
 * 1. Fetches the root of each drive  →  finds the folders sitting there
 * 2. Fetches ONE level inside each of those root folders
 * 3. Merges everything, sorts (folders first A→Z, then files A→Z)
 * 4. Renders with gdi-row style + 25-items/page pagination + live filter
 */
(function () {
  var PAGE_SIZE = 25;
  var _allItems = [];
  var _filtered = [];
  var _page     = 1;
  var names     = window.drive_names || [];
  var UI        = window.UI          || {};

  // ── Low-level: fetch one page batch from a given worker URL ────────────────
  function fetchAllPagesFromUrl(urlPath) {
    var items     = [];
    var pageToken = '';
    var pageIndex = 0;

    function next() {
      return fetch(urlPath, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          id:         '',
          type:       'folder',
          password:   '',
          page_token: pageToken,
          page_index: pageIndex
        })
      })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res) {
        if (!res || !res.data || !res.data.files) return items;
        items = items.concat(res.data.files);
        if (res.nextPageToken) {
          pageToken = res.nextPageToken;
          pageIndex++;
          return next();
        }
        return items;
      })
      .catch(function () { return items; });
    }

    return next();
  }

  // ── Per-drive: go one level deeper than the drive root ─────────────────────
  //
  // Structure that exists in prod:
  //   /driveIdx:/          →  returns a folder e.g. "Drive 1"
  //   /driveIdx:/Drive 1/  →  the actual files/folders we want to show
  //
  // We fetch the root first, collect every folder we find there, then fetch
  // inside each of those folders.  Items are stamped with:
  //   _driveIdx  — which drive they belong to
  //   _urlBase   — the encoded parent path segment (e.g. "Drive%201/")
  //                so we can build correct hrefs in renderPage
  function fetchAllFromDrive(driveIdx) {
    var rootUrl = '/' + driveIdx + ':/';

    return fetchAllPagesFromUrl(rootUrl).then(function (rootItems) {
      var rootFolders = rootItems.filter(function (item) {
        return item.mimeType === 'application/vnd.google-apps.folder';
      });

      if (rootFolders.length === 0) {
        // Drive root contains no folders — show root items directly
        rootItems.forEach(function (f) {
          f._driveIdx = driveIdx;
          f._urlBase  = '';
        });
        return rootItems;
      }

      // For every folder at the root, dive one level deeper
      var subFetches = rootFolders.map(function (folder) {
        var encName    = encodeURIComponent(folder.name)
                           .replace(/#/g, '%23')
                           .replace(/\?/g, '%3F');
        var folderUrl  = '/' + driveIdx + ':/' + encName + '/';

        return fetchAllPagesFromUrl(folderUrl).then(function (items) {
          items.forEach(function (f) {
            f._driveIdx = driveIdx;
            f._urlBase  = encName + '/';   // e.g. "Drive%201/"
          });
          return items;
        }).catch(function () { return []; });
      });

      return Promise.all(subFetches).then(function (arrays) {
        return [].concat.apply([], arrays);
      });
    }).catch(function () { return []; });
  }

  // ── HTML-escape helper ──────────────────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // ── File-size formatter ─────────────────────────────────────────────────────
  function fmtSize(bytes) {
    if (!bytes) return '';
    var n = Number(bytes);
    if (n < 1024)       return n + ' B';
    if (n < 1048576)    return (n / 1024).toFixed(1)      + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1)   + ' MB';
    return                     (n / 1073741824).toFixed(2) + ' GB';
  }

  // ── File-type icon ──────────────────────────────────────────────────────────
  var EXT_VIDEO   = ['mp4','webm','avi','mpg','mpeg','mkv','rm','rmvb','mov','wmv','asf','ts','flv','3gp','m4v'];
  var EXT_AUDIO   = ['mp3','flac','wav','ogg','m4a','aac','wma','alac'];
  var EXT_IMAGE   = ['bmp','jpg','jpeg','png','gif','svg','tiff','ico'];
  var EXT_ARCHIVE = ['zip','rar','tar','7z','gz'];
  var EXT_CODE    = ['php','css','go','java','js','json','txt','sh','html','xml','py','rb','c','cpp','h','hpp'];

  function getIcon(ext) {
    var e = (ext || '').toLowerCase();
    if (EXT_VIDEO.indexOf(e)   > -1) return '<i class="bi bi-camera-video-fill gdi-icon-video"></i>';
    if (EXT_AUDIO.indexOf(e)   > -1) return '<i class="bi bi-music-note-beamed gdi-icon-audio"></i>';
    if (EXT_IMAGE.indexOf(e)   > -1) return '<i class="bi bi-image gdi-icon-image"></i>';
    if (EXT_ARCHIVE.indexOf(e) > -1) return '<i class="bi bi-file-earmark-zip-fill gdi-icon-archive"></i>';
    if (e === 'md')                  return '<i class="bi bi-markdown-fill gdi-icon-md"></i>';
    if (e === 'pdf')                 return '<i class="bi bi-file-earmark-pdf-fill gdi-icon-pdf"></i>';
    if (EXT_CODE.indexOf(e)    > -1) return '<i class="bi bi-code-slash gdi-icon-code"></i>';
    return '<i class="bi bi-file-earmark gdi-icon-file"></i>';
  }

  // ── Render one page of rows ─────────────────────────────────────────────────
  function renderPage(items, page) {
    var listEl = document.getElementById('list');
    var spinEl = document.getElementById('spinner');
    if (spinEl) spinEl.remove();

    var start = (page - 1) * PAGE_SIZE;
    var slice = items.slice(start, start + PAGE_SIZE);

    if (!slice.length) {
      listEl.innerHTML = '<div class="gdi-empty"><i class="bi bi-search"></i><p>No items found.</p></div>';
      return;
    }

    var html = '';
    slice.forEach(function (item) {
      var idx     = item._driveIdx;
      var urlBase = item._urlBase || '';   // e.g. "Drive%201/"
      var enc     = encodeURIComponent(item.name)
                      .replace(/#/g, '%23')
                      .replace(/\?/g, '%3F');
      var name    = esc(item.name);

      if (item.mimeType === 'application/vnd.google-apps.folder') {
        var href = '/' + idx + ':/' + urlBase + enc + '/';
        html +=
          '<a href="' + href + '" class="gdi-row" data-name="' + esc(item.name.toLowerCase()) + '">' +
            '<span class="gdi-row-icon"><i class="bi bi-folder-fill gdi-icon-folder"></i></span>' +
            '<span class="gdi-row-name">' + name + '</span>' +
            '<span class="gdi-row-size"></span>' +
            '<span class="gdi-row-acts"></span>' +
          '</a>';
      } else {
        var ext     = item.fileExtension || '';
        var size    = fmtSize(item.size);
        var viewHref = '/' + idx + ':/' + urlBase + enc + '?a=view';
        var dl      = UI.second_domain_for_dl
          ? UI.downloaddomain + (item.link || '')
          : window.location.origin + (item.link || '');

        html +=
          '<div class="gdi-row" data-name="' + esc(item.name.toLowerCase()) + '">' +
            '<span class="gdi-row-icon">' + getIcon(ext) + '</span>' +
            '<a class="gdi-row-name" href="' + viewHref + '" title="' + name + '">' + name + '</a>' +
            '<span class="gdi-row-size">' + (UI.display_size ? size : '') + '</span>' +
            '<span class="gdi-row-acts">' +
              (UI.display_download && item.link
                ? '<a class="gdi-act-btn" href="' + esc(dl) + '" title="Download"><i class="bi bi-download"></i></a>'
                : '') +
            '</span>' +
          '</div>';
      }
    });

    listEl.innerHTML = html;
  }

  // ── Update pagination controls & count bar ──────────────────────────────────
  function updateControls(items, page) {
    var total   = items.length;
    var pages   = Math.max(1, Math.ceil(total / PAGE_SIZE));
    var pagEl   = document.getElementById('hp-pagination');
    var infoEl  = document.getElementById('hp-page-info');
    var prevBtn = document.getElementById('hp-prev');
    var nextBtn = document.getElementById('hp-next');
    var countEl = document.getElementById('count');

    if (pagEl)   pagEl.style.display  = total > PAGE_SIZE ? 'flex' : 'none';
    if (infoEl)  infoEl.textContent   = 'Page ' + page + ' of ' + pages + ' \u00b7 ' + total + ' item' + (total !== 1 ? 's' : '');
    if (prevBtn) prevBtn.disabled     = page <= 1;
    if (nextBtn) nextBtn.disabled     = page >= pages;
    if (countEl) {
      countEl.classList.add('show');
      countEl.textContent = total + ' item' + (total !== 1 ? 's' : '');
    }
  }

  // ── Navigate to a page ──────────────────────────────────────────────────────
  function goToPage(page) {
    _page = page;
    renderPage(_filtered, page);
    updateControls(_filtered, page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Main: fetch → merge → sort → display ───────────────────────────────────
  Promise.all(names.map(function (_, i) { return fetchAllFromDrive(i); }))
    .then(function (results) {
      var merged = [].concat.apply([], results);

      // Sort: folders first (A→Z), then files (A→Z)
      merged.sort(function (a, b) {
        var aF = a.mimeType === 'application/vnd.google-apps.folder';
        var bF = b.mimeType === 'application/vnd.google-apps.folder';
        if (aF !== bF) return aF ? -1 : 1;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

      _allItems = merged;
      _filtered = merged;

      // Wire filter input
      var filterEl = document.getElementById('folder-filter');
      if (filterEl) {
        filterEl.addEventListener('input', function () {
          var q = this.value.toLowerCase().trim();
          _filtered = q
            ? _allItems.filter(function (it) { return it.name.toLowerCase().indexOf(q) > -1; })
            : _allItems;
          goToPage(1);
        });
      }

      // Wire Prev / Next buttons
      var prevBtn = document.getElementById('hp-prev');
      var nextBtn = document.getElementById('hp-next');
      if (prevBtn) {
        prevBtn.addEventListener('click', function () {
          if (_page > 1) goToPage(_page - 1);
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener('click', function () {
          if (_page < Math.ceil(_filtered.length / PAGE_SIZE)) goToPage(_page + 1);
        });
      }

      goToPage(1);
    })
    .catch(function () {
      var listEl = document.getElementById('list');
      if (listEl) {
        listEl.innerHTML =
          '<div class="gdi-empty"><i class="bi bi-wifi-off"></i><p>Could not load files. Please try again.</p></div>';
      }
    });
}());
