/* 
  app.js (Ultra Güvenli & Token Tabanlı Frontend)
*/
const API_URL = 'https://script.google.com/macros/s/AKfycbzPP6GYOHiP6gFdwrBpNtBc9KJSqQ-UE6J-9V9Z2XzES2oW-kfM3G4SDjYCrCorVkVfuQ/exec';

let currentUser = null;

// --- PWA & SERVICE WORKER ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registered'))
            .catch(err => console.log('SW Error', err));
    });
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isInStandaloneMode()) {
        const p = document.getElementById('android-prompt');
        if (p) p.style.display = 'flex';
    }
});

function isInStandaloneMode() {
    return (window.navigator.standalone) || (window.matchMedia('(display-mode: standalone)').matches);
}

window.addEventListener('load', () => {
    if (!isInStandaloneMode() && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
        const p = document.getElementById('ios-prompt');
        if (p) p.style.display = 'block';
    }
});

let allAdminRequests = [];
let filteredRequests = [];
let currentPage = 1;
const itemsPerPage = 10;

// SAYFA YÜKLENDİĞİNDE
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const lt = await callApi({ action: 'getLeaveTypes' });
        window.leaveTypes = (lt && Array.isArray(lt)) ? lt : ['Yıllık İzin', 'Mazeret İzni', 'Hastalık İzni'];
    } catch (e) {
        window.leaveTypes = ['Yıllık İzin', 'Mazeret İzni', 'Hastalık İzni'];
    }

    const savedUser = localStorage.getItem('site_telekom_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        initDashboardWithUser(currentUser);
    }
});

function initDashboardWithUser(user) {
    if (!user) return;
    const dUser = document.getElementById('displayUsername');
    const dRole = document.getElementById('displayRole');
    const dAvat = document.getElementById('userAvatar');

    if (dUser) dUser.innerText = user.user;
    if (dRole) dRole.innerText = user.role;
    if (dAvat) dAvat.innerText = user.user.charAt(0).toUpperCase();

    const mgmtLink = document.getElementById('menu-mgmt');
    const logsLink = document.getElementById('menu-logs');
    const reportLink = document.getElementById('menu-report');
    const passLink = document.getElementById('menu-pass');

    const isIk = ['İK', 'IK'].includes(user.role);
    const isSpv = user.role === 'SPV';

    if (passLink) passLink.style.display = 'block';
    if (mgmtLink) mgmtLink.style.display = (isIk || isSpv) ? 'block' : 'none';
    if (logsLink) logsLink.style.display = isIk ? 'block' : 'none';
    if (reportLink) reportLink.style.display = isIk ? 'block' : 'none';

    switchView('dashboard');
    renderDashboard(user.role);
}

function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function getMonthOptions() {
    const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    let html = '<option value="">Tüm Aylar</option>';
    months.forEach((m, i) => { html += `<option value="${i + 1}">${m}</option>`; });
    return html;
}

// === LOGIN/LOGOUT ===
async function handleLogin(e) {
    if (e) e.preventDefault();
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value.trim();
    const statusDiv = document.getElementById('login-status');
    const btn = document.getElementById('btn-login');

    if (!u || !p) return;
    btn.disabled = true;
    statusDiv.innerHTML = '<span class="loading-spinner"></span> Kontrol ediliyor...';

    try {
        const clientInfo = await getClientInfo();
        const res = await callApi({ action: 'login', user: u, pass: p, clientInfo });

        if (res.status === '2fa_required') {
            const { value: code } = await Swal.fire({
                title: '2-Adımlı Doğrulama',
                text: 'Authenticator kodunu girin:',
                input: 'text',
                inputAttributes: { maxlength: 6, autofocus: true, style: 'text-align:center;' },
                showCancelButton: true
            });
            if (code) {
                const res2 = await callApi({ action: 'verify2fa', user: u, code, clientInfo, forceChange: res.forceChange });
                if (res2.token) completeLogin(res2);
                else throw new Error(res2.message || 'Hatalı kod.');
            } else { btn.disabled = false; statusDiv.innerHTML = ''; }
        } else if (res.status === '2fa_setup') {
            await Swal.fire({
                title: '2FA Kurulumu',
                html: `<p>Authenticator kurun.</p><img src="${res.qrUrl}" style="margin:20px 0;"><p>Kod: <b>${res.secret}</b></p>`,
                input: 'text',
                confirmButtonText: 'Kurulumu Tamamla'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    const res2 = await callApi({ action: 'verify2fa', user: u, code: result.value, isSetup: true, setupSecret: res.secret, clientInfo, forceChange: res.forceChange });
                    if (res2.token) completeLogin(res2);
                    else throw new Error(res2.message || 'Kurulum hatalı.');
                }
            });
        } else if (res.token) {
            completeLogin(res);
        } else {
            throw new Error(res.message || 'Giriş başarısız.');
        }
    } catch (err) {
        btn.disabled = false;
        statusDiv.innerHTML = `<span style="color:red;">❌ ${err.message}</span>`;
    }
}

function completeLogin(userData) {
    currentUser = userData;
    localStorage.setItem('site_telekom_user', JSON.stringify(userData));
    initDashboardWithUser(userData);
    if (userData.forceChange) promptChangePassword(true);
}

function logout() {
    localStorage.removeItem('site_telekom_user');
    currentUser = null;
    location.reload();
}

function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.classList.toggle('show');
}

window.onclick = function (e) {
    if (!e.target.closest('.user-menu-container')) {
        document.querySelectorAll('.dropdown-content').forEach(d => d.classList.remove('show'));
    }
};

function switchView(v) {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-' + v).classList.remove('hidden');
}

function promptChangePassword(forced = false) {
    Swal.fire({
        title: forced ? 'Şifre Değişikliği Zorunlu' : 'Şifre Değiştir',
        input: 'password',
        inputPlaceholder: 'Yeni Şifre',
        allowOutsideClick: !forced,
        confirmButtonText: 'Güncelle',
        inputValidator: (v) => { if (!v || v.length < 4) return 'En az 4 karakter!'; }
    }).then(async (r) => {
        if (r.isConfirmed) {
            const res = await callApi({ action: 'changePassword', newPass: r.value });
            if (res.status === 'success') Swal.fire('Başarılı', 'Şifreniz değiştirildi.', 'success');
            else Swal.fire('Hata', 'Değiştirilemedi.', 'error');
        }
    });
}

// === DASHBOARD RENDER ===
function renderDashboard(role) {
    const container = document.getElementById('dashboard-content');
    if (role === 'MT') {
        container.innerHTML = `
            <div class="tabs">
                <button class="tab-btn active" onclick="showTab('new-req', this)">📄 Yeni İzin Talebi</button>
                <button class="tab-btn" onclick="showTab('my-req', this)">🕒 Geçmiş Taleplerim</button>
            </div>
            <div id="tab-new-req" class="card fade-in">
                <form onsubmit="submitRequest(event)">
                    <div class="form-grid">
                        <div class="form-group"><label>Ad Soyad</label><input type="text" id="req-name" required></div>
                        <div class="form-group"><label>Proje</label><input type="text" id="req-proj" value="${esc(currentUser.project)}" readonly></div>
                        <div class="form-group"><label>İzin Türü</label><select id="req-type">${window.leaveTypes.map(t => `<option>${t}</option>`).join('')}</select></div>
                        <div class="form-group"><label>Başlangıç</label><input type="date" id="req-start" required></div>
                        <div class="form-group"><label>Bitiş</label><input type="date" id="req-end" required></div>
                    </div>
                    <div class="form-group" style="margin-top:15px;"><label>Gerekçe</label><textarea id="req-reason" rows="3" required></textarea></div>
                    <button type="submit" class="btn-primary" style="margin-top:15px; width:100%;">Talebi Gönder</button>
                </form>
            </div>
            <div id="tab-my-req" class="card hidden fade-in">
                <div id="history-list">Henüz talep yok.</div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="card status-card">
                <div class="status-icon">🔵</div>
                <div style="flex:1;">
                    <h4 style="margin:0;">${role} Paneli</h4>
                    <p style="margin:5px 0 0; font-size:0.9rem; color:#64748b;">İzin taleplerini yönetin</p>
                </div>
            </div>
            <div class="filter-bar">
                <div class="filter-item"><label>DÖNEM</label><select id="f-month" onchange="applyFilters()">${getMonthOptions()}</select></div>
                <div class="filter-item"><label>TÜR</label><select id="f-type" onchange="applyFilters()"><option value="">Tümü</option>${window.leaveTypes.map(t => `<option>${t}</option>`).join('')}</select></div>
                <div class="filter-item"><label>DURUM</label><select id="f-status" onchange="applyFilters()"><option value="">Tümü</option><option value="Bekliyor">Bekliyor</option><option value="onaylandi">Onaylandı</option><option value="red">Reddedildi</option></select></div>
            </div>
            <div class="card" style="padding:0;">
                <div class="table-container">
                    <table>
                        <thead><tr><th>PERSONEL</th><th>TARİHLER / GEREKÇE</th><th>TÜR</th><th>DURUM / İŞLEM</th></tr></thead>
                        <tbody id="admin-table-body"></tbody>
                    </table>
                </div>
            </div>
            <div class="pagination-container">
                <button class="page-btn" onclick="changePage(-1)">◀ Geri</button>
                <span id="page-info">Sayfa 1</span>
                <button class="page-btn" onclick="changePage(1)">İleri ▶</button>
            </div>
        `;
        loadAdminRequests();
    }
}

// === REQUESTS LOGIC ===
async function loadAdminRequests() {
    const res = await callApi({ action: 'getRequests' });
    allAdminRequests = Array.isArray(res) ? res : [];
    allAdminRequests.forEach(r => {
        if (r[5]) r._dateObj = new Date(r[5]); // Index 5: start date
        else r._dateObj = new Date(0);
    });
    allAdminRequests.sort((a, b) => b._dateObj - a._dateObj);
    applyFilters();
}

function applyFilters() {
    const m = document.getElementById('f-month').value;
    const t = document.getElementById('f-type').value;
    const s = document.getElementById('f-status').value;

    filteredRequests = allAdminRequests.filter(r => {
        if (m) {
            let rM = r._dateObj.getMonth() + 1;
            if (String(rM) !== m) return false;
        }
        if (t && String(r[4]) !== t) return false; // Index 4: type
        if (s && String(r[8]) !== s) return false; // Index 8: status
        return true;
    });
    currentPage = 1;
    renderPage(1);
}

function getStatusBadge(s) {
    const c = { 'onaylandi': '#10b981', 'red': '#ef4444', 'Bekliyor': '#f59e0b' };
    const t = { 'onaylandi': 'Onaylandı', 'red': 'Reddedildi', 'Bekliyor': 'Bekliyor' };
    return `<span class="badge" style="background:${c[s] || '#64748b'}; color:white;">${t[s] || s}</span>`;
}

function renderPage(p) {
    const tbody = document.getElementById('admin-table-body');
    if (!tbody) return;

    const start = (p - 1) * itemsPerPage;
    const data = filteredRequests.slice(start, start + itemsPerPage);

    if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px;">Kayıt bulunamadı.</td></tr>'; return; }

    tbody.innerHTML = data.map(r => {
        const canAction = r[8] === 'Bekliyor';
        return `
            <tr>
                <td><b>${esc(r[2])}</b><br><small>${esc(r[3])}</small></td>
                <td><small>${r[5]} - ${r[6]}</small><br><small style="color:#666;">${esc(r[7])}</small></td>
                <td>${esc(r[4])}</td>
                <td style="text-align:center;">
                    <div style="display:flex; flex-direction:column; gap:5px; align-items:center;">
                        ${getStatusBadge(r[8])}
                        ${canAction ? `<div style="display:flex; gap:5px;"><button class="action-btn" onclick="processRequest('${r[0]}','Onaylandı')">✅</button><button class="action-btn reject" onclick="processRequest('${r[0]}','Reddedildi')">❌</button></div>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    document.getElementById('page-info').innerText = `Sayfa ${p} / ${Math.ceil(filteredRequests.length / itemsPerPage) || 1}`;
}

function changePage(dir) {
    const max = Math.ceil(filteredRequests.length / itemsPerPage) || 1;
    if (dir === 1 && currentPage < max) currentPage++;
    else if (dir === -1 && currentPage > 1) currentPage--;
    renderPage(currentPage);
}

async function processRequest(id, decision) {
    let reason = '';
    if (decision === 'Reddedildi') {
        const { value: res } = await Swal.fire({ title: 'Red Sebebi', input: 'textarea', showCancelButton: true });
        if (res === undefined) return;
        reason = res;
    }
    Swal.fire({ title: 'İşleniyor...', didOpen: () => Swal.showLoading() });
    const res = await callApi({ action: 'updateStatus', id, decision, reason });
    if (res.status === 'success') {
        Swal.fire('Başarılı', `Talep ${decision}!`, 'success');
        loadAdminRequests();
    }
}

// === USER MANAGEMENT (GELİŞMİŞ) ===
let userMgmtCurrentPage = 1;
const userMgmtPerPage = 15;
let allUsersCache = [];

window.openUserMgmtModal = function () {
    const isIk = ['İK', 'IK'].includes(currentUser.role);
    let html = `
        <div class="mgmt-tabs">
            <button class="mgmt-tab-btn active" onclick="switchMgmtTab('add', event)">➕ Ekle</button>
            <button class="mgmt-tab-btn" onclick="switchMgmtTab('list', event)">📋 Liste</button>
        </div>
        <div id="mgmt-tab-add" class="mgmt-tab-content">
            <div class="form-group"><label>Kullanıcı Adı</label><input type="text" id="new-u-name" class="swal2-input"></div>
            ${isIk ? `
                <div class="form-group" style="margin-top:10px;"><label>Rol</label><select id="new-u-role" class="swal2-input"><option value="TL">TL</option><option value="SPV">SPV</option><option value="MT">MT</option><option value="İK">İK</option></select></div>
                <div class="form-group" style="margin-top:10px;"><label>Proje</label><input type="text" id="new-u-proj" class="swal2-input"></div>
            ` : ''}
            <button class="btn-primary" onclick="submitAddUser()" style="margin-top:20px; width:100%;">Ekle (Şifre: 1234)</button>
        </div>
        <div id="mgmt-tab-list" class="mgmt-tab-content hidden">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                <input type="text" id="mgmt-search" placeholder="Ara..." class="swal2-input" style="margin:0;" oninput="renderUserList()">
                <select id="mgmt-filter-proj" class="swal2-input" style="margin:0;" onchange="renderUserList()"><option value="">Tüm Projeler</option></select>
            </div>
            <div id="user-list-container" style="min-height:200px;"></div>
            <div id="user-mgmt-pagination" class="pagination-container" style="justify-content:center;"></div>
        </div>
    `;
    Swal.fire({ title: 'Kullanıcı Yönetimi', html, width: 800, showConfirmButton: false, showCloseButton: true, didOpen: () => loadUserListInternal() });
}

window.switchMgmtTab = function (t, e) {
    document.querySelectorAll('.mgmt-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mgmt-tab-content').forEach(c => c.classList.add('hidden'));
    if (e && e.target) e.target.classList.add('active');
    const tabEl = document.getElementById('mgmt-tab-' + t);
    if (tabEl) tabEl.classList.remove('hidden');
}

async function loadUserListInternal() {
    const res = await callApi({ action: 'getUserList' });
    allUsersCache = Array.isArray(res) ? res : [];
    const projs = [...new Set(allUsersCache.map(u => u.project))].filter(Boolean).sort();
    const sel = document.getElementById('mgmt-filter-proj');
    if (sel) {
        sel.innerHTML = '<option value="">Tüm Projeler</option>';
        projs.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
    }
    renderUserList();
}

function renderUserList() {
    const cont = document.getElementById('user-list-container');
    const search = document.getElementById('mgmt-search')?.value.toLowerCase() || '';
    const proj = document.getElementById('mgmt-filter-proj')?.value || '';
    let filt = allUsersCache.filter(u => u.user.toLowerCase().includes(search) && (!proj || u.project === proj));

    const start = (userMgmtCurrentPage - 1) * userMgmtPerPage;
    const data = filt.slice(start, start + userMgmtPerPage);
    const isIk = ['İK', 'IK'].includes(currentUser.role);
    const totalPages = Math.ceil(filt.length / userMgmtPerPage) || 1;

    let table = `<table style="width:100%; font-size:0.8rem;"><thead><tr><th>User</th><th>Rol</th><th>Proje</th><th>2FA</th><th>İşlem</th></tr></thead><tbody>`;
    data.forEach(u => {
        table += `<tr><td><b>${esc(u.user)}</b></td><td>${u.role}</td><td>${u.project}</td><td>${u.twoFactor}</td>
            <td style="display:flex; gap:5px;"><button onclick="resetPass('${u.user}')">🔑</button>${isIk ? `<button onclick="delUser('${u.user}')">🗑️</button>` : ''}</td></tr>`;
    });
    table += '</tbody></table>';
    cont.innerHTML = table;

    const pag = document.getElementById('user-mgmt-pagination');
    if (pag) {
        pag.innerHTML = `<button class="page-btn" onclick="changeUserPage(-1)" ${userMgmtCurrentPage === 1 ? 'disabled' : ''}>◀</button>
            <span style="font-size:0.8rem; margin: 0 10px;">${userMgmtCurrentPage}/${totalPages}</span>
            <button class="page-btn" onclick="changeUserPage(1)" ${userMgmtCurrentPage === totalPages ? 'disabled' : ''}>▶</button>`;
    }
}

window.changeUserPage = (d) => { userMgmtCurrentPage += d; renderUserList(); }

window.submitAddUser = async function () {
    const u = document.getElementById('new-u-name').value.trim();
    const r = document.getElementById('new-u-role')?.value || 'TL';
    const p = document.getElementById('new-u-proj')?.value || '';
    if (!u) { Swal.showValidationMessage('Kullanıcı adı gerekli'); return; }
    Swal.showLoading();
    const res = await callApi({ action: 'addUser', newUser: u, newRole: r, newProject: p });
    if (res.status === 'success') { Swal.fire('Başarılı', 'Kullanıcı eklendi', 'success'); loadUserListInternal(); }
    else { Swal.fire('Hata', res.message || 'Hata', 'error'); }
}

async function resetPass(u) {
    const r = await Swal.fire({ title: 'Sıfırla?', text: u, showCancelButton: true });
    if (r.isConfirmed) { await callApi({ action: 'resetPass', targetUser: u }); Swal.fire('1234 yapıldı', '', 'success'); }
}

async function delUser(u) {
    const r = await Swal.fire({ title: 'Sil?', text: u, showCancelButton: true });
    if (r.isConfirmed) { await callApi({ action: 'deleteUser', targetUser: u }); loadUserListInternal(); }
}

// === UTILS ===
async function getClientInfo() {
    try { const r = await fetch('https://ipapi.co/json/'); const d = await r.json(); return `${d.ip} (${d.city})`; } catch { return "Unknown"; }
}

async function callApi(body = {}) {
    if (currentUser && currentUser.token) body.token = currentUser.token;
    try {
        const r = await fetch(API_URL, { method: 'POST', body: JSON.stringify(body) });
        const j = await r.json();
        if (j.status === 'error' && j.message === 'Oturum süresi doldu.') logout();
        return j;
    } catch { return { status: 'error', message: 'Hata' }; }
}

async function searchMyHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = 'Yükleniyor...';
    const res = await callApi({ action: 'getRequests' });
    if (!Array.isArray(res)) return;
    const my = res.filter(r => String(r[1]) === String(currentUser.user));
    if (my.length === 0) { list.innerHTML = 'Temiz.'; return; }
    let h = '<table><thead><tr><th>Tarih</th><th>Tür</th><th>Durum</th></tr></thead><tbody>';
    my.forEach(r => { h += `<tr><td>${r[5]}</td><td>${r[4]}</td><td>${getStatusBadge(r[8])}</td></tr>`; });
    list.innerHTML = h + '</tbody></table>';
}

async function submitRequest(e) {
    e.preventDefault();
    const formData = {
        fullName: document.getElementById('req-name').value,
        project: currentUser.project,
        type: document.getElementById('req-type').value,
        start: document.getElementById('req-start').value,
        end: document.getElementById('req-end').value,
        reason: document.getElementById('req-reason').value
    };
    Swal.showLoading();
    const res = await callApi({ action: 'submitRequest', formData });
    if (res.status === 'success') { Swal.fire('Gönderildi', '', 'success'); e.target.reset(); searchMyHistory(); }
}

window.openReportModal = async function () {
    Swal.fire({ title: 'Rapor Hazırlanıyor...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const res = await callApi({ action: 'getReportData' });
    if (res.data) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(res.data);
        XLSX.utils.book_append_sheet(wb, ws, "Rapor");
        XLSX.writeFile(wb, "Izin_Raporu.xlsx");
        Swal.fire('İndirildi', '', 'success');
    } else {
        Swal.fire('Hata', 'Veri alınamadı', 'error');
    }
}

window.openSystemLogs = async function () {
    const res = await callApi({ action: 'getLogs' });
    if (!Array.isArray(res)) return;
    let h = '<div style="max-height:400px; overflow:auto;"><table><thead><tr><th>Tarih</th><th>User</th><th>İşlem</th></tr></thead><tbody>';
    res.forEach(l => { h += `<tr><td>${l.time}</td><td>${l.user}</td><td>${l.type}</td></tr>`; });
    Swal.fire({ title: 'Loglar', html: h + '</tbody></table></div>', width: 800 });
}

window.handleLogin = handleLogin;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.submitRequest = submitRequest;
window.applyFilters = applyFilters;
window.changePage = changePage;
window.showTab = (id, btn) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-new-req').classList.add('hidden');
    document.getElementById('tab-my-req').classList.add('hidden');
    document.getElementById('tab-' + id).classList.remove('hidden');
    if (id === 'my-req') searchMyHistory();
};
