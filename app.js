/* app.js */

// *** DİKKAT: BURAYA GOOGLE APPS SCRIPT YAYINLAMA URL'SİNİ YAPIŞTIRIN ***
// Örnek: 'https://script.google.com/macros/s/AKfycbx.../exec'
// Tırnakların arasını doldurun
const API_URL = 'https://script.google.com/macros/s/AKfycbzPP6GYOHiP6gFdwrBpNtBc9KJSqQ-UE6J-9V9Z2XzES2oW-kfM3G4SDjYCrCorVkVfuQ/exec';

let currentUser = null;
const views = { login: document.getElementById('view-login'), dashboard: document.getElementById('view-dashboard') };

function switchView(viewName) {
    Object.values(views).forEach(el => {
        el.classList.add('view-hidden');
        el.classList.remove('view-active');
    });
    const target = views[viewName];
    target.classList.remove('view-hidden');
    void target.offsetWidth;
    target.classList.add('view-active');

    document.getElementById('user-info-panel').style.display = (viewName === 'dashboard') ? 'flex' : 'none';
}

/* --- API YARDIMCISI --- */
async function callApi(params, method = 'GET', body = null) {
    if (API_URL === 'GOOGLE_APPS_SCRIPT_URL_BURAYA') {
        alert("Lütfen app.js dosyasındaki API_URL kısmına Google Script linkini yapıştırın.");
        return null;
    }

    // Parametreleri URL'e ekle
    const url = new URL(API_URL);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

    const options = {
        method: method,
        redirect: "follow", // Apps Script için gerekli
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // POST için text/plain önerilir (CORS preflight önler)
    };

    if (body) options.body = JSON.stringify(body);

    try {
        const res = await fetch(url, options);
        const json = await res.json();
        return json;
    } catch (e) {
        alert("Bağlantı Hatası: " + e);
        return { status: 'error' };
    }
}

/* --- İŞLEMLER --- */
async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const btn = e.target.querySelector('button');

    btn.innerText = 'Giriş Yapılıyor...'; btn.disabled = true;

    const res = await callApi({ action: 'login', user: u, pass: p });

    if (res && res.status === 'success') {
        currentUser = res;
        document.getElementById('user-display').innerText = `${res.user} (${res.role})`;
        setupDashboardByRole(res.role);
        switchView('dashboard');
    } else {
        alert(res ? res.message : 'Hata oluştu');
    }
    btn.innerText = 'Giriş Yap'; btn.disabled = false;
}

function logout() {
    currentUser = null;
    switchView('login');
}

function setupDashboardByRole(role) {
    const container = document.getElementById('dashboard-content');
    container.innerHTML = '';

    if (role === 'Temsilci') renderRepDashboard(container);
    else renderManagementDashboard(container, role);
}

// 1. TEMSİLCİ
function renderRepDashboard(container) {
    container.innerHTML = `
        <div class="dashboard-grid">
            <div class="stat-card"><h3>Bekleyen</h3><div class="count" id="stat-pending">-</div></div>
            <div class="stat-card"><h3>Onaylanan</h3><div class="count" id="stat-approved">-</div></div>
        </div>
        <div class="tabs">
            <button class="tab-btn active" onclick="showTab('new-request', this)">Yeni İzin Talebi</button>
            <button class="tab-btn" onclick="showTab('my-requests', this)">Taleplerim</button>
        </div>
        <div id="tab-new-request">
            <div class="login-card" style="max-width: 600px; margin: 0; text-align: left;">
                <form onsubmit="submitRequest(event)">
                    <div class="form-group"><label>İzin Türü</label>
                        <select class="form-select" id="req-type"><option>Yıllık İzin</option><option>Hastalık</option><option>Mazeret</option></select>
                    </div>
                    <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div><label>Başlangıç</label><input type="date" class="form-input" id="req-start" required></div>
                        <div><label>Bitiş</label><input type="date" class="form-input" id="req-end" required></div>
                    </div>
                    <div class="form-group"><label>Açıklama</label><textarea class="form-input" id="req-reason" rows="3" required></textarea></div>
                    <button type="submit" class="btn-primary">Talebi Gönder</button>
                </form>
            </div>
        </div>
        <div id="tab-my-requests" style="display:none;">
            <div class="table-container">
                <table id="requests-table"><thead><tr><th>Tarih</th><th>Tür</th><th>Durum</th></tr></thead><tbody></tbody></table>
            </div>
        </div>`;
    loadRequests();
}

// 2. YÖNETİCİ
function renderManagementDashboard(container, role) {
    container.innerHTML = `<h3>Onay Bekleyenler (${role})</h3><div class="table-container"><table id="approval-table"><thead><tr><th>Personel</th><th>Detay</th><th>İşlem</th></tr></thead><tbody></tbody></table></div>`;
    loadRequests();
}

async function submitRequest(e) {
    e.preventDefault();
    const data = {
        action: 'createRequest',
        requester: currentUser.user,
        project: currentUser.project,
        type: document.getElementById('req-type').value,
        startDate: document.getElementById('req-start').value,
        endDate: document.getElementById('req-end').value,
        reason: document.getElementById('req-reason').value
    };

    await callApi({ action: 'createRequest' }, 'POST', data);
    alert('Talep iletildi.');
    e.target.reset();
    showTab('my-requests', document.querySelectorAll('.tab-btn')[1]);
}

async function loadRequests() {
    const data = await callApi({ action: 'getRequests', role: currentUser.role, user: currentUser.user, project: currentUser.project });

    if (currentUser.role === 'Temsilci') {
        const tbody = document.querySelector('#requests-table tbody');
        tbody.innerHTML = data.map(r => `<tr><td>${formatDate(r.start)}</td><td>${r.type}</td><td><span class="status-badge ${getStatusClass(r.status)}">${r.status}</span></td></tr>`).join('');
        document.getElementById('stat-pending').innerText = data.filter(r => r.status.includes('Bekliyor')).length;
        document.getElementById('stat-approved').innerText = data.filter(r => r.status === 'Onaylandı').length;
    } else {
        const tbody = document.querySelector('#approval-table tbody');
        tbody.innerHTML = data.map(r => `
            <tr>
                <td>${r.requester}</td>
                <td>${r.type} - ${r.reason}</td>
                <td>
                    <button class="action-btn btn-approve" onclick="processRequest('${r.id}', 'Onaylandı')">Onayla</button>
                    <button class="action-btn btn-reject" onclick="processRequest('${r.id}', 'Reddedildi')">Reddet</button>
                </td>
            </tr>`).join('');
    }
}

async function processRequest(id, decision) {
    if (!confirm('Emin misiniz?')) return;
    await callApi({ action: 'updateStatus' }, 'POST', { id: id, role: currentUser.role, decision: decision });
    alert('İşlem yapıldı.');
    loadRequests();
}

function showTab(tabId, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-new-request').style.display = 'none';
    document.getElementById('tab-my-requests').style.display = 'none';
    document.getElementById(tabId).style.display = 'block';
    if (tabId === 'my-requests') loadRequests();
}

function formatDate(d) { return d ? d.split('T')[0] : '-'; }
function getStatusClass(s) { return s === 'Onaylandı' ? 'status-approved' : (s.includes('Red') ? 'status-rejected' : 'status-pending'); }
