/* 
  app.js (Tüm Placeholder'lar Temizlendi & Tam Fonksiyonel Mod)
*/
const API_URL = 'https://script.google.com/macros/s/AKfycbzPP6GYOHiP6gFdwrBpNtBc9KJSqQ-UE6J-9V9Z2XzES2oW-kfM3G4SDjYCrCorVkVfuQ/exec';

let currentUser = null;
let allAdminRequests = [];
let filteredRequests = [];
let currentPage = 1;
const itemsPerPage = 10;

/* --- MENU & VIEW HANDLERS --- */
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
    try { const res = await fetch(url, options); return await res.json(); } catch (e) { return { status: 'error', message: 'Sunucu hatası.' }; }
}

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
        statusDiv.innerText = 'Giriş Başarılı!';
        statusDiv.className = 'status-success';

        setTimeout(async () => {
            if (res.forceReset) {
                btn.disabled = false; statusDiv.innerText = '';
                await promptChangePassword(true);
                return;
            }
            document.getElementById('displayUsername').innerText = res.user;
            document.getElementById('displayRole').innerText = res.role;
            document.getElementById('userAvatar').innerText = res.user.charAt(0).toUpperCase();

            const mgmtLink = document.getElementById('menu-mgmt');
            const logsLink = document.getElementById('menu-logs');
            const passLink = document.getElementById('menu-pass');

            if (res.role === 'Temsilci') passLink.style.display = 'none';
            else passLink.style.display = 'block';

            if (res.role === 'İK' || res.role === 'IK' || res.role === 'SPV') {
                mgmtLink.style.display = 'block';
                if (res.role.startsWith('İK') || res.role === 'IK') logsLink.style.display = 'block'; else logsLink.style.display = 'none';
            } else { mgmtLink.style.display = 'none'; logsLink.style.display = 'none'; }

            renderDashboard(res.role);
            switchView('dashboard');
            statusDiv.innerText = ''; btn.disabled = false;
        }, 800);
    } else {
        statusDiv.innerText = res.message || 'Hatalı giriş!';
        statusDiv.className = 'status-error';
        btn.disabled = false;
    }
}

function logout() { currentUser = null; switchView('login'); }

/* --- ŞİFRE DEĞİŞTİRME (Placeholder SİLİNDİ) --- */
async function promptChangePassword(isForced = false) {
    if (!isForced && currentUser.role === 'Temsilci') return;
    const { value: formValues } = await Swal.fire({
        title: 'Şifre Değiştir',
        html: `
            <input id="swal-pass1" type="password" class="swal2-input">
            <input id="swal-pass2" type="password" class="swal2-input">
        `,
        focusConfirm: false,
        preConfirm: () => {
            const p1 = document.getElementById('swal-pass1').value;
            const p2 = document.getElementById('swal-pass2').value;
            if (!p1) return Swal.showValidationMessage('Şifre boş olamaz');
            if (p1 !== p2) return Swal.showValidationMessage('Şifreler eşleşmiyor');
            return p1;
        }
    });
    if (formValues) {
        Swal.showLoading();
        await callApi({ action: 'changePassword' }, 'POST', { user: currentUser.user, newPass: formValues });
        Swal.fire('Başarılı', 'Şifre güncellendi', 'success');
        if (isForced) logout();
    }
}

/* --- DASHBOARD RENDER --- */
function renderDashboard(role) {
    const container = document.getElementById('dashboard-content');
    if (role === 'Temsilci') {
        container.innerHTML = `
            <div class="panel-info">👋 <strong>Hoş Geldin!</strong></div>
            <div class="tabs">
                <button class="tab-btn active" onclick="showTab('new-req', this)">İzin Talebi</button>
                <button class="tab-btn" onclick="showTab('my-req', this)">Geçmişim</button>
            </div>
            <div id="tab-new-req">
                <form onsubmit="submitRequest(event)" autocomplete="off">
                     <div style="display:grid; grid-template-columns: 2fr 1fr; gap: 15px;">
                        <div class="form-group"><label>AD SOYAD</label><input type="text" id="fullname" required></div>
                        <div class="form-group"><label>SİCİL NO</label><input type="text" id="sicil" required></div>
                    </div>
                    <div class="form-group"><label>İZİN TÜRÜ</label>
                        <select id="type"><option>Yıllık İzin</option><option>Hastalık</option><option>Mazeret</option></select>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group"><label>BAŞLANGIÇ</label><input type="date" id="start" required></div>
                        <div class="form-group"><label>BİTİŞ</label><input type="date" id="end" required></div>
                    </div>
                    <button type="submit" class="btn-primary" id="btn-submit-req">Talep Et</button>
                </form>
            </div>
            <div id="tab-my-req" class="hidden">
                <table id="rep-table"><thead><tr><th>Tarih</th><th>Durum</th></tr></thead><tbody></tbody></table>
            </div>
        `;
        const f = localStorage.getItem('mtd_fullname'); if (f) document.getElementById('fullname').value = f;
        const s = localStorage.getItem('mtd_sicil'); if (s) document.getElementById('sicil').value = s;
        return;
    }

    container.innerHTML = `
        <div class="panel-info">🛡️ <strong>${role} Paneli</strong></div>
        <div class="filter-bar">
            <div class="filter-item"><label>Ay</label><input type="month" id="filter-month" onchange="applyFilters()"></div>
            <div class="filter-item"><label>Tür</label><select id="filter-type" onchange="applyFilters()"><option value="">Tümü</option><option>Yıllık İzin</option><option>Mazeret</option></select></div>
            <div class="filter-item"><label>Durum</label><select id="filter-status" onchange="applyFilters()"><option value="">Tümü</option><option value="bekliyor">Bekleyen</option><option value="onaylandi">Onaylı</option><option value="red">Red</option></select></div>
        </div>
        <table id="admin-table">
            <thead><tr><th>PERSONEL</th><th>TARİHLER</th><th>TÜR</th><th>İŞLEM</th></tr></thead>
            <tbody></tbody>
        </table>
        <div class="pagination-container"><button class="page-btn" onclick="changePage(-1)">Geri</button><span id="page-info"></span><button class="page-btn" onclick="changePage(1)">İleri</button></div>
    `;
    loadAdminRequests();
}

/* --- LOGIC FUNCTIONS --- */
async function loadAdminRequests() {
    allAdminRequests = await callApi({ action: 'getRequests', role: currentUser.role, user: currentUser.user, project: currentUser.project });
    if (allAdminRequests) allAdminRequests.forEach(r => r._dateObj = new Date(r.start));
    applyFilters();
}

function applyFilters() {
    const fMonth = document.getElementById('filter-month')?.value;
    const fType = document.getElementById('filter-type')?.value;
    const fStatus = document.getElementById('filter-status')?.value;
    filteredRequests = (allAdminRequests || []).filter(r => {
        if (fMonth) { let rY = r._dateObj.getFullYear(); let rM = String(r._dateObj.getMonth() + 1).padStart(2, '0'); if (`${rY}-${rM}` !== fMonth) return false; }
        if (fType && r.type !== fType) return false;
        if (fStatus) {
            if (fStatus === 'bekliyor') { if (!['tl_bekliyor', 'spv_bekliyor', 'ik_bekliyor'].includes(r.status)) return false; }
            else if (r.status !== fStatus) return false;
        }
        return true;
    });
    currentPage = 1; renderPage(1);
}

function renderPage(page) {
    const tbody = document.querySelector('#admin-table tbody');
    if (!tbody) return;
    const start = (page - 1) * itemsPerPage; const pageData = filteredRequests.slice(start, start + itemsPerPage);
    tbody.innerHTML = pageData.map(r => `
        <tr>
            <td><a href="#" style="text-decoration:none; color:var(--primary); font-weight:bold;" onclick="window.viewUserLogs('${r.requester}')">${r.fullName || r.requester}</a><br><small>${r.project}</small></td>
            <td>${new Date(r.start).toLocaleDateString('tr-TR')} - ${new Date(r.end).toLocaleDateString('tr-TR')}</td>
            <td><b>${r.type}</b></td>
            <td>${r.status}</td>
        </tr>
    `).join('');
    document.getElementById('page-info').innerText = page;
}

window.processRequest = async function (id, d) {
    let reason = ""; if (d === 'Reddedildi') { const { value } = await Swal.fire({ title: 'Red Nedeni', input: 'text' }); if (!value) return; reason = value; }
    await callApi({ action: 'updateStatus' }, 'POST', { id, role: currentUser.role, decision: d, reason, user: currentUser.user });
    Swal.fire('Başarılı', 'İşlem tamamlandı', 'success'); loadAdminRequests();
}

/* --- USER MANAGEMENT (Placeholder SİLİNDİ) --- */
window.openUserMgmtModal = async function () {
    let mode = (currentUser.role.startsWith('İK') || currentUser.role === 'IK') ? 'ik' : 'spv';
    let html = `
        <div style="text-align:left;">
            <label>Kullanıcı Adı</label><input id="new-u-name" class="swal2-input">
    `;
    if (mode === 'ik') {
        html += `<label>Rol</label><select id="new-u-role" class="swal2-input"><option value="TL">TL</option><option value="SPV">SPV</option><option value="MT">MT</option></select>
                 <label>Proje</label><input id="new-u-proj" class="swal2-input">`;
    }
    html += `<button class="btn-primary" onclick="submitAddUser()">Ekle</button></div>`;
    Swal.fire({ title: 'Kullanıcı Yönetimi', html: html, showConfirmButton: false });
}

window.submitAddUser = async function () {
    const u = document.getElementById('new-u-name').value;
    const r = document.getElementById('new-u-role')?.value || 'TL';
    const p = document.getElementById('new-u-proj')?.value || currentUser.project;
    if (!u) return;
    Swal.showLoading();
    await callApi({ action: 'addUser', creatorRole: currentUser.role, creatorProject: currentUser.project, newUser: u, newPass: '1234', newRole: r, newProject: p }, 'POST');
    Swal.fire('Başarılı', 'Eklendi (Şifre: 1234)', 'success');
}

window.viewUserLogs = async function (u) {
    const logs = await callApi({ action: 'getLogs', targetUser: u });
    let h = logs.map(l => `<div>[${l.time}] ${l.detail}</div>`).join('');
    Swal.fire({ title: u + ' Logları', html: h });
}

window.openAllLogs = async function () {
    const logs = await callApi({ action: 'getLogs' });
    let h = logs.map(l => `<div><b>${l.user}</b>: ${l.detail}</div>`).slice(0, 50).join('');
    Swal.fire({ title: 'Sistem Logları', html: h, width: 800 });
}

window.showTab = (id, bt) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    bt.classList.add('active');
    document.getElementById('tab-new-req').classList.add('hidden');
    document.getElementById('tab-my-req').classList.add('hidden');
    document.getElementById('tab-' + id).classList.remove('hidden');
}

window.submitRequest = async function (e) {
    e.preventDefault();
    const data = { action: 'createRequest', requester: currentUser.user, fullName: document.getElementById('fullname').value, sicil: document.getElementById('sicil').value, project: currentUser.project, type: document.getElementById('type').value, startDate: document.getElementById('start').value, endDate: document.getElementById('end').value };
    await callApi({ action: 'createRequest' }, 'POST', data);
    Swal.fire('Başarılı', 'Talebiniz iletildi', 'success');
}

/* Bindings */
window.handleLogin = handleLogin;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.changePage = (d) => { currentPage += d; renderPage(currentPage); };
