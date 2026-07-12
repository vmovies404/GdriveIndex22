/**
 * homepage.js — Unified merged root-level file list
 * Fetches the root content of every configured drive in parallel,
 * merges into one list sorted (folders first A→Z, then files A→Z),
 * and renders with gdi-row style + 25-items/page pagination + live filter.
 */
(function () {
  var PAGE_SIZE = 25;
  var _allItems = [];
  var _filtered = [];
  var _page     = 1;
  var names     = window.drive_names || [];
  var UI        = window.UI          || {};

  // ── Modern spinner progress helper ──────────────────────────────────────────
  var _totalDrives   = names.length || 1;
  var _drivesLoaded  = 0;
  var _simPercent    = 0;
  var _simTimer      = null;

  function updateSpinnerProgress(percent) {
    var pctEl  = document.getElementById('spinner-percent');
    var ringEl = document.querySelector('.spinner-progress');
    if (pctEl) pctEl.textContent = Math.round(percent) + '%';
    if (ringEl) {
      var circumference = 2 * Math.PI * 20; // 125.66
      var offset = circumference - (percent / 100) * circumference;
      ringEl.style.strokeDashoffset = offset;
    }
  }

  function startSimulation() {
    _simPercent = 0;
    updateSpinnerProgress(0);
    _simTimer = setInterval(function () {
      // Simulate up to (drivesLoaded / totalDrives * 100) but cap at 90% max
      var targetPercent = Math.min(90, (_drivesLoaded / _totalDrives) * 100);
      // Add small increments to simulate activity
      if (_simPercent < targetPercent) {
        _simPercent += Math.random() * 6 + 2;
        if (_simPercent > targetPercent) _simPercent = targetPercent;
      } else if (_simPercent < 90) {
        _simPercent += Math.random() * 2 + 0.5;
        if (_simPercent > 90) _simPercent = 90;
      }
      updateSpinnerProgress(_simPercent);
    }, 150);
  }

  function stopSimulation() {
    if (_simTimer) { clearInterval(_simTimer); _simTimer = null; }
    updateSpinnerProgress(100);
  }

  startSimulation();

  // ── Fetch all pages from the root of one drive ─────────────────────────────
  function fetchAllFromDrive(driveIdx) {
    var items     = [];
    var pageToken = '';
    var pageIndex = 0;
    var urlPath   = '/' + driveIdx + ':/';

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
        if (!res || !res.data || !res.data.files) { _drivesLoaded++; return items; }
        res.data.files.forEach(function (f) { f._driveIdx = driveIdx; });
        items = items.concat(res.data.files);
        if (res.nextPageToken) {
          pageToken = res.nextPageToken;
          pageIndex++;
          return next();
        }
        _drivesLoaded++;
        return items;
      })
      .catch(function () { _drivesLoaded++; return items; });
    }

    return next();
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
      var idx  = item._driveIdx;
      var enc  = encodeURIComponent(item.name).replace(/#/g, '%23').replace(/\?/g, '%3F');
      var name = esc(item.name);

      if (item.mimeType === 'application/vnd.google-apps.folder') {
        html +=
          '<a href="/' + idx + ':/' + enc + '/" class="gdi-row" data-name="' + esc(item.name.toLowerCase()) + '">' +
            '<span class="gdi-row-icon"><i class="bi bi-folder-fill gdi-icon-folder"></i></span>' +
            '<span class="gdi-row-name">' + name + '</span>' +
            '<span class="gdi-row-size"></span>' +
            '<span class="gdi-row-acts"></span>' +
          '</a>';
      } else {
        var ext     = item.fileExtension || '';
        var size    = fmtSize(item.size);
        // Resolve dl safely (item.link is null when server withheld it for role reasons)
        var dl      = item.link
          ? (UI.second_domain_for_dl ? UI.downloaddomain + item.link : window.location.origin + item.link)
          : null;

        // Role flags: canInteract = user can open/stream; canDownload = user can download
        var canInteract = !window.UI || window.UI.user_role === 'admin' || window.UI.can_stream || window.UI.can_download;
        var canDownload = !window.UI || window.UI.user_role === 'admin' || window.UI.can_download;

        var fileNameHtml = canInteract
          ? '<a class="gdi-row-name" href="/' + idx + ':/' + enc + '?a=view" title="' + name + '">' + name + '</a>'
          : '<span class="gdi-row-name gdi-row-name--locked" title="' + name + '">' + name + '</span>';

        html +=
          '<div class="gdi-row" data-name="' + esc(item.name.toLowerCase()) + '">' +
            '<span class="gdi-row-icon">' + getIcon(ext) + '</span>' +
            fileNameHtml +
            '<span class="gdi-row-size">' + (UI.display_size ? size : '') + '</span>' +
            '<span class="gdi-row-acts">' +
              (UI.display_download && canDownload && dl
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
      stopSimulation();
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
      stopSimulation();
      var listEl = document.getElementById('list');
      if (listEl) {
        listEl.innerHTML =
          '<div class="gdi-empty"><i class="bi bi-wifi-off"></i><p>Could not load files. Please try again.</p></div>';
      }
    });
}());
