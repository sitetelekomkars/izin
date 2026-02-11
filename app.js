/* 
  app.js (Oturum Koruma / Persistence Eklendi)
*/
const API_URL = 'https://script.google.com/macros/s/AKfycbzPP6GYOHiP6gFdwrBpNtBc9KJSqQ-UE6J-9V9Z2XzES2oW-kfM3G4SDjYCrCorVkVfuQ/exec';

let currentUser = null;
let allAdminRequests = [];
let filteredRequests = [];
let currentPage = 1;
const itemsPerPage = 10;

// SAYFA YÜKLENDİĞİNDE OTURUM KONTROLÜ
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('site_telekom_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        initDashboardWithUser(currentUser);
    }
});

function initDashboardWithUser(user) {
    document.getElementById('displayUsername').innerText = user.user;
    document.getElementById('displayRole').innerText = user.role;
    document.getElementById('userAvatar').innerText = user.user.charAt(0).toUpperCase();

    // Menü Yetkileri
    const mgmtLink = document.getElementById('menu-mgmt');
    const logsLink = document.getElementById('menu-logs');
    const passLink = document.getElementById('menu-pass');

    if (user.role === 'Temsilci') passLink.style.display = 'none';
    else passLink.style.display = 'block';

    if (user.role === 'İK' || user.role === 'IK' || user.role === 'SPV') {
        mgmtLink.style.display = 'block';
        if (user.role.startsWith('İK') || user.role === 'IK') logsLink.style.display = 'block'; else logsLink.style.display = 'none';
    } else { mgmtLink.style.display = 'none'; logsLink.style.display = 'none'; }

    renderDashboard(user.role);
    switchView('dashboard');
}

/* --- LOGIN / LOGOUT --- */
async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const statusDiv = document.getElementById('login-status');
    statusDiv.innerText = 'Kontrol ediliyor...';
    statusDiv.className = 'status-loading';
    btn.disabled = true;

    const res = await callApi({ action: 'login', user: document.getElementById('username').value, pass: document.getElementById('password').value });

    if (res && res.status === 'success') {
        currentUser = res;
        // OTURUMU KAYDET
        localStorage.setItem('site_telekom_user', JSON.stringify(res));

        statusDiv.innerText = 'Giriş Başarılı!';
        statusDiv.className = 'status-success';

        setTimeout(() => {
            if (res.forceReset) {
                btn.disabled = false; statusDiv.innerText = '';
                promptChangePassword(true);
                return;
            }
            initDashboardWithUser(res);
            statusDiv.innerText = ''; btn.disabled = false;
        }, 800);
    } else {
        statusDiv.innerText = res.message || 'Hatalı giriş!';
        statusDiv.className = 'status-error';
        btn.disabled = false;
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('site_telekom_user'); // OTURUMU SİL
    switchView('login');
}

/* --- DİĞER FONKSİYONLAR (Aynı) --- */
function toggleUserMenu() { document.getElementById("userDropdown").classList.toggle("show"); }
window.onclick = function (event) { if (!event.target.closest('.user-info')) { var dropdowns = document.getElementsByClassName("dropdown-content"); for (var i = 0; i < dropdowns.length; i++) { if (dropdowns[i].classList.contains('show')) dropdowns[i].classList.remove('show'); } } }
function switchView(viewName) {
    const loginView = document.getElementById('view-login'); const dashboardView = document.getElementById('view-dashboard');
    if (viewName === 'login') { loginView.classList.remove('hidden'); dashboardView.classList.add('hidden'); }
    else { loginView.classList.add('hidden'); dashboardView.classList.remove('hidden'); }
}
async function callApi(params, method = 'GET', body = null) {
    const url = new URL(API_URL); Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const options = { method: method, redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" } }; if (body) options.body = JSON.stringify(body);
    try { const res = await fetch(url, options); return await res.json(); } catch (e) { return { status: 'error' }; }
}

async function promptChangePassword(isForced = false) {
    const { value: p1 } = await Swal.fire({ title: 'Şifre Değiştir', input: 'password', showCancelButton: !isForced });
    if (p1) {
        await callApi({ action: 'changePassword' }, 'POST', { user: currentUser.user, newPass: p1 });
        Swal.fire('Başarılı', 'Güncellendi', 'success');
        if (isForced) logout();
    }
}

function renderDashboard(role) {
    const container = document.getElementById('dashboard-content');
    if (role === 'Temsilci') {
        container.innerHTML = `
            <div class="panel-info">👋 <strong>Hoş Geldin!</strong> İzinlerini buradan yönetebilirsin.</div>
            <div class="tabs"><button class="tab-btn active" onclick="showTab('new-req', this)">İzin Talebi</button><button class="tab-btn" onclick="showTab('my-req', this)">Geçmişim</button></div>
            <div id="tab-new-req">
                <form onsubmit="submitRequest(event)" autocomplete="off">
                     <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div class="form-group"><label>AD SOYAD</label><input type="text" id="fullname" placeholder="Örn: Ahmet Yılmaz" required></div>
                        <div class="form-group"><label>SİCİL NO</label><input type="text" id="sicil" placeholder="12345" required></div>
                    </div>
                    <div class="form-group"><label>İZİN TÜRÜ</label><select id="type"><option>Yıllık İzin</option><option>Hastalık</option><option>Mazeret</option></select></div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div class="form-group"><label>BAŞLANGIÇ</label><input type="date" id="start" placeholder="gg-aa-yyyy" required></div>
                        <div class="form-group"><label>BİTİŞ</label><input type="date" id="end" placeholder="gg-aa-yyyy" required></div>
                    </div>
                    <button type="submit" class="btn-primary">Talebi Gönder</button>
                </form>
            </div>
            <div id="tab-my-req" class="hidden"><table id="rep-table"><thead><tr><th>Tarih</th><th>Durum</th></tr></thead><tbody></tbody></table></div>
        `;
        return;
    }
    container.innerHTML = `
        <div class="panel-info">🛡️ <strong>${role} Paneli</strong></div>
        <div class="filter-bar">
            <div class="filter-item"><label>Ay</label><input type="month" id="filter-month" onchange="applyFilters()"></div>
            <div class="filter-item"><label>Tür</label><select id="filter-type" onchange="applyFilters()"><option value="">Tümü</option><option>Yıllık İzin</option><option>Mazeret</option></select></div>
            <div class="filter-item"><label>Durum</label><select id="filter-status" onchange="applyFilters()"><option value="">Tümü</option><option value="bekliyor">Bekleyen</option></select></div>
        </div>
        <table id="admin-table"><thead><tr><th>PERSONEL</th><th>TARİHLER</th><th>TÜR</th><th>İŞLEM</th></tr></thead><tbody></tbody></table>
    `;
    loadAdminRequests();
}

async function loadAdminRequests() {
    allAdminRequests = await callApi({ action: 'getRequests', role: currentUser.role, user: currentUser.user, project: currentUser.project });
    applyFilters();
}
function applyFilters() {
    filteredRequests = allAdminRequests || [];
    renderPage(1);
}
function renderPage(page) {
    const tbody = document.querySelector('#admin-table tbody');
    if (!tbody) return;
    tbody.innerHTML = filteredRequests.map(r => `<tr><td>${r.fullName || r.requester}</td><td>${r.start} - ${r.end}</td><td>${r.type}</td><td>${r.status}</td></tr>`).join('');
}

window.showTab = (id, bt) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    bt.classList.add('active');
    document.getElementById('tab-new-req').classList.add('hidden');
    document.getElementById('tab-my-req').classList.add('hidden');
    document.getElementById('tab-' + id).classList.remove('hidden');
    if (id === 'my-req') loadMyRequests();
}

async function loadMyRequests() {
    const res = await callApi({ action: 'getRequests', role: 'Temsilci', user: currentUser.user });
    const tbody = document.querySelector('#rep-table tbody');
    tbody.innerHTML = res.map(r => `<tr><td>${r.start} - ${r.end}</td><td>${r.status}</td></tr>`).join('');
}

async function submitRequest(e) {
    e.preventDefault();
    const data = { requester: currentUser.user, fullName: document.getElementById('fullname').value, sicil: document.getElementById('sicil').value, project: currentUser.project, type: document.getElementById('type').value, startDate: document.getElementById('start').value, endDate: document.getElementById('end').value };
    await callApi({ action: 'createRequest' }, 'POST', data);
    Swal.fire('Başarılı', 'Talep gönderildi', 'success');
    showTab('my-req', document.querySelectorAll('.tab-btn')[1]);
}

window.handleLogin = handleLogin;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.submitRequest = submitRequest;
window.openUserMgmtModal = () => { /* Logic */ };
window.openAllLogs = () => { /* Logic */ };
window.viewUserLogs = (u) => { /* Logic */ };
window.applyFilters = applyFilters;
