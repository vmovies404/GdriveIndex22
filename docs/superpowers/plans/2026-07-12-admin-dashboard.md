# Admin Dashboard Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the simple `/admin` panel into a highly polished, responsive, tab-based administrative dashboard with visual analytics, live Drive validation (probing), session revocation, configuration backups, IP whitelisting, and a live security/audit log viewer using Bootstrap 5 and modern UI components.

**Architecture:** 
- The Cloudflare Worker backend (`src/worker.js`) will be extended with new endpoints for drive probing, auditing, active session revocation, and config backups.
- The single-page `admin_html` template will be overhauled using Bootstrap 5, custom modern CSS (sidebar layout, glassmorphism card components, progress steps, glow elements), and jQuery-based AJAX controllers.
- Configurations and audit logs are persisted securely inside the Cloudflare KV namespace (`ENV`).

**Tech Stack:** Bootstrap 5.3.3, Bootstrap Icons 1.11.3, jQuery 3.7.1, Cloudflare Workers & KV.

## Global Constraints
- Do not introduce external styling libraries other than Vanilla CSS and the bundled Bootstrap CSS.
- Ensure all input values are validated server-side.
- Session signature integrity validation must be maintained across all administrative endpoints.

---

### Task 1: Backend API Extensions and Audit Logging
**Files:**
- Modify: [worker.js](file:///d:/DriveIndex/GdriveIndex22/src/worker.js)

**Interfaces:**
- Consumes: None
- Produces:
  - `logAuditEvent(action, details, ip)`: Backend function to append logs to KV.
  - `POST /admin/api/probe-drive`: Tests if a specific folder ID is reachable and readable by the Google Drive client.
  - `GET /admin/api/logs`: Returns the list of last 100 audit log entries.
  - `POST /admin/api/revoke-session`: Invalidates active sessions for a user by appending their email to a revoked sessions blacklist in KV.

- [ ] **Step 1: Implement audit logging helper**
  Add `logAuditEvent` helper function:
  ```javascript
  async function logAuditEvent(action, details, ip) {
    const key = 'gdi_audit_logs';
    try {
      const raw = await ENV.get(key);
      const logs = raw ? JSON.parse(raw) : [];
      logs.unshift({
        timestamp: new Date().toISOString(),
        action,
        details,
        ip: ip || 'unknown'
      });
      // Limit to last 100 logs
      if (logs.length > 100) logs.pop();
      await ENV.put(key, JSON.stringify(logs));
    } catch (_) {}
  }
  ```

- [ ] **Step 2: Add API Endpoints in handleRequest**
  Inject the new API routes inside the `/admin/` request router section:
  ```javascript
  if (path === '/admin/api/probe-drive' && request.method === 'POST') {
    try {
      const body = await request.json();
      const folderId = body.id;
      // Trigger a test list call to Google Drive API
      const testReq = await gd.list(folderId, 1);
      const ok = testReq && testReq.files !== undefined;
      return new Response(JSON.stringify({ ok, message: ok ? 'Connection successful' : 'Unauthorized/Not Found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, message: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (path === '/admin/api/logs' && request.method === 'GET') {
    const raw = await ENV.get('gdi_audit_logs');
    return new Response(raw || '[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (path === '/admin/api/revoke-session' && request.method === 'POST') {
    try {
      const body = await request.json();
      const email = body.email;
      const revokedKey = 'gdi_revoked_' + email;
      // Mark session as revoked until original expiry (e.g. login_days)
      await ENV.put(revokedKey, 'true', { expirationTtl: 86400 * authConfig.login_days });
      await logAuditEvent('SESSION_REVOKE', `Revoked all active sessions for ${email}`, user_ip);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, message: err.message }), { status: 500 });
    }
  }
  ```

- [ ] **Step 3: Modify verifySessionToken to respect Revoked Blacklist**
  Update `verifySessionToken` to check if a user is revoked in KV:
  ```javascript
  async function verifySessionToken(token) {
    if (!token) return null;
    const lastDot = token.lastIndexOf('.');
    if (lastDot === -1) return null;
    const sessionData = token.substring(0, lastDot);
    const signature = token.substring(lastDot + 1);
    const expectedSignature = await genIntegrity(sessionData);
    if (signature !== expectedSignature) {
      return null;
    }
    // Extract email from sessionData (first segment before '|')
    const parts = sessionData.split('|');
    if (parts.length > 0) {
      try {
        const email = await decryptString(parts[0]);
        const isRevoked = await ENV.get('gdi_revoked_' + email);
        if (isRevoked === 'true') {
          return null; // Session explicitly revoked
        }
      } catch (_) {}
    }
    return sessionData;
  }
  ```

- [ ] **Step 4: Audit logins & settings changes**
  Log audit events when authentication or configuration changes happen:
  - Add `await logAuditEvent('LOGIN_SUCCESS', username, user_ip)` inside `/google_callback` block.
  - Add `await logAuditEvent('CONFIG_UPDATE', 'Updated settings configurations', user_ip)` inside POST `/admin/api/config` block.

- [ ] **Step 5: Build and Deploy to verify endpoint compilation**
  Run `npm run build` to confirm everything compiles without syntax or bundler errors.

---

### Task 2: Redesign Admin Layout HTML & CSS
**Files:**
- Modify: [worker.js](file:///d:/DriveIndex/GdriveIndex22/src/worker.js) (the `admin_html` template variable)

**Interfaces:**
- Consumes: None
- Produces: Overhauled modern UI markup inside `admin_html`.

- [ ] **Step 1: Implement responsive Sidebar layout & styling**
  Overhaul the CSS in `admin_html` to feature a beautiful side navigation system, glassmorphism cards, stats grid, and custom scrollbars:
  ```css
  :root {
    --gdi-primary: #14b8a6;
    --gdi-primary-hover: #0d9488;
    --gdi-surface-rgb: 22, 27, 34;
    --gdi-bg: #0d1117;
  }
  body {
    background: var(--gdi-bg);
    color: #e2e8f0;
    font-family: 'Plus Jakarta Sans', sans-serif;
  }
  .admin-layout {
    display: flex;
    min-height: 100vh;
  }
  .admin-sidebar {
    width: 250px;
    background: rgba(22, 27, 34, 0.95);
    border-right: 1px solid #2d3748;
    backdrop-filter: blur(10px);
    position: fixed;
    height: 100vh;
    display: flex;
    flex-direction: column;
    z-index: 100;
  }
  .sidebar-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    color: #8b9ab0;
    text-decoration: none;
    transition: all 0.2s;
    font-weight: 500;
    border-left: 3px solid transparent;
  }
  .sidebar-link:hover, .sidebar-link.active {
    color: #fff;
    background: rgba(20, 184, 166, 0.1);
    border-left-color: var(--gdi-primary);
  }
  .admin-main {
    flex: 1;
    margin-left: 250px;
    padding: 30px;
  }
  .stat-card {
    background: rgba(22, 27, 34, 0.85);
    border: 1px solid #2d3748;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  .dashboard-card {
    background: rgba(22, 27, 34, 0.85);
    border: 1px solid #2d3748;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    backdrop-filter: blur(10px);
  }
  ```

- [ ] **Step 2: Add HTML Markup with Navigation Tabs**
  Update the main structure inside `admin_html`'s `<body>`:
  ```html
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <div class="p-4 border-bottom border-secondary border-opacity-25">
        <h5 class="m-0 text-white font-weight-bold"><i class="bi bi-shield-lock"></i> GDI Admin</h5>
        <small class="text-muted">v2.6.0</small>
      </div>
      <nav class="flex-grow-1 mt-3">
        <a href="#overview" class="sidebar-link active" onclick="switchTab('overview')"><i class="bi bi-grid-1x2"></i> Overview</a>
        <a href="#drives" class="sidebar-link" onclick="switchTab('drives')"><i class="bi bi-folder2-open"></i> Drive Folders</a>
        <a href="#users" class="sidebar-link" onclick="switchTab('users')"><i class="bi bi-people"></i> Users & Access</a>
        <a href="#settings" class="sidebar-link" onclick="switchTab('settings')"><i class="bi bi-sliders"></i> Settings</a>
        <a href="#logs" class="sidebar-link" onclick="switchTab('logs')"><i class="bi bi-receipt"></i> Audit Logs</a>
      </nav>
      <div class="p-3 border-top border-secondary border-opacity-25">
        <a href="/" class="sidebar-link p-2"><i class="bi bi-arrow-left"></i> Return Portal</a>
      </div>
    </aside>
    
    <main class="admin-main">
      <!-- Dynamic views go here -->
    </main>
  </div>
  ```

---

### Task 3: Client-Side Dashboard Controller
**Files:**
- Modify: [worker.js](file:///d:/DriveIndex/GdriveIndex22/src/worker.js) (the JS controller section inside `admin_html`)

**Interfaces:**
- Consumes: None
- Produces: JS routing controller `switchTab(tabId)` and rendering methods.

- [ ] **Step 1: Implement view rendering and state management**
  Write client-side controllers to navigate and fetch statistics asynchronously:
  ```javascript
  function switchTab(tabId) {
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    // Hide all tab content panes
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('d-none'));
    // Show active pane
    const target = document.getElementById('pane-' + tabId);
    if (target) target.classList.remove('d-none');
    
    if (tabId === 'overview') { loadStats(); }
    if (tabId === 'logs') { loadAuditLogs(); }
  }
  ```

- [ ] **Step 2: Add Stats and Connection Indicators Loader**
  Render visual status checks and counts dynamically:
  ```javascript
  async function loadStats() {
    try {
      const resUsers = await fetch('/admin/api/users');
      const users = await resUsers.json();
      const resDrives = await fetch('/admin/api/roots');
      const drives = await resDrives.json();
      
      document.getElementById('stat-users').textContent = users.length;
      document.getElementById('stat-drives').textContent = drives.length;
      document.getElementById('status-kv').innerHTML = '<span class="badge bg-success"><i class="bi bi-check-circle"></i> Connected</span>';
      document.getElementById('status-api').innerHTML = '<span class="badge bg-success"><i class="bi bi-check-circle"></i> Online</span>';
    } catch (_) {
      document.getElementById('status-kv').innerHTML = '<span class="badge bg-danger">Degraded</span>';
    }
  }
  ```

---

### Task 4: Interactive Drive Management & Probing
**Files:**
- Modify: [worker.js](file:///d:/DriveIndex/GdriveIndex22/src/worker.js) (within the JS block of `admin_html`)

**Interfaces:**
- Consumes: `POST /admin/api/probe-drive`
- Produces: `probeDrive(idx)` and validation UI actions.

- [ ] **Step 1: Build Connection Validation (Probe) UI & JS**
  Add a client check function that highlights inputs based on response:
  ```javascript
  async function probeDrive(idx) {
    const idVal = _roots[idx].id;
    if (!idVal) {
      showToast('Please enter a Google Drive folder ID', 'error');
      return;
    }
    const btn = document.getElementById('probe-btn-' + idx);
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
    try {
      const r = await fetch('/admin/api/probe-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idVal })
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        showToast('Connection verified successfully!');
        btn.innerHTML = '<i class="bi bi-shield-check text-success"></i>';
      } else {
        showToast(data.message || 'Connection failed', 'error');
        btn.innerHTML = '<i class="bi bi-shield-exclamation text-danger"></i>';
      }
    } catch (e) {
      showToast('Validation request failed: ' + e.message, 'error');
      btn.innerHTML = '<i class="bi bi-x-circle text-danger"></i>';
    }
  }
  ```

- [ ] **Step 2: Add Drag/Button Ordering Controls**
  Provide controls to reorder drives instantly:
  ```javascript
  function moveRootUp(idx) {
    if (idx === 0) return;
    const temp = _roots[idx];
    _roots[idx] = _roots[idx - 1];
    _roots[idx - 1] = temp;
    renderRoots();
  }
  function moveRootDown(idx) {
    if (idx === _roots.length - 1) return;
    const temp = _roots[idx];
    _roots[idx] = _roots[idx + 1];
    _roots[idx + 1] = temp;
    renderRoots();
  }
  ```

---

### Task 5: User Search, Pagination, and Revocation
**Files:**
- Modify: [worker.js](file:///d:/DriveIndex/GdriveIndex22/src/worker.js) (user management markup & JS)

**Interfaces:**
- Consumes: `POST /admin/api/revoke-session`
- Produces: User search matching logic and logout invalidation triggers.

- [ ] **Step 2: Add User Search Bar & Filter**
  Update User tab markup:
  ```html
  <div class="input-group mb-3">
    <span class="input-group-text bg-transparent border-secondary text-muted"><i class="bi bi-search"></i></span>
    <input type="text" id="user-search-input" class="form-control" placeholder="Search user by email..." oninput="filterUserTable()">
  </div>
  ```

- [ ] **Step 3: Implement Filter and Revocation UI triggers**
  Code the filter list logic and session revocation action:
  ```javascript
  function filterUserTable() {
    const q = document.getElementById('user-search-input').value.toLowerCase().trim();
    document.querySelectorAll('#user-table tr').forEach(row => {
      const email = row.cells[0]?.textContent.toLowerCase() || '';
      row.style.display = !q || email.includes(q) ? '' : 'none';
    });
  }

  async function revokeSessions(email) {
    if (!confirm('Force logout all active sessions for ' + email + '?')) return;
    try {
      const r = await fetch('/admin/api/revoke-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (r.ok) {
        showToast('All active sessions for ' + email + ' revoked.');
      } else {
        showToast('Revocation failed', 'error');
      }
    } catch (e) {
      showToast('Request error: ' + e.message, 'error');
    }
  }
  ```

---

### Task 6: Configuration Backups & Logs Viewer
**Files:**
- Modify: [worker.js](file:///d:/DriveIndex/GdriveIndex22/src/worker.js) (settings backup handlers, logs pane)

**Interfaces:**
- Consumes: `GET /admin/api/logs`
- Produces: Audit log page renderer, Export JSON file creator, Import settings parser.

- [ ] **Step 1: Add Import/Export Settings Buttons**
  Add JSON configuration tools in Settings:
  ```javascript
  function exportConfig() {
    const backupData = {
      roots: _roots,
      config: {
        customer_can_stream: document.getElementById('chk-stream').checked,
        customer_can_download: document.getElementById('chk-download').checked
      }
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", "gdi-admin-backup.json");
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  }
  ```

- [ ] **Step 2: Add Audit Logs Loader and Formatter**
  Fetch logs from API and present them with badge indicators:
  ```javascript
  async function loadAuditLogs() {
    const tbody = document.getElementById('logs-tbody');
    try {
      const r = await fetch('/admin/api/logs');
      const logs = await r.json();
      if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-row text-center text-muted">No audit events logged yet.</td></tr>';
        return;
      }
      tbody.innerHTML = logs.map(l => `
        <tr>
          <td class="text-muted">${new Date(l.timestamp).toLocaleString()}</td>
          <td><span class="badge bg-secondary">${l.action}</span></td>
          <td>${l.details}</td>
          <td><code class="text-info">${l.ip}</code></td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-row text-danger">Failed to load audit logs.</td></tr>';
    }
  }
  ```

---

## Verification Plan

### Automated Tests
- Run validation build tests:
  ```bash
  npm run build
  ```

### Manual Verification
- Deploy using `npm run deploy`.
- Log in with admin credentials, navigate to `/admin`, and verify that the sidebar switches between tabs smoothly.
- Add a new root drive configuration and click the checkmark "Probe" button to verify validation is working correctly.
- Perform setting changes, view the "Audit Logs" tab, and verify that the settings update activity log entry appears immediately.
