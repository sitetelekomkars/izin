/* 
  app.js (Inline Login Feedback & Representative Restrictions)
*/
const API_URL = 'https://script.google.com/macros/s/AKfycbzPP6GYOHiP6gFdwrBpNtBc9KJSqQ-UE6J-9V9Z2XzES2oW-kfM3G4SDjYCrCorVkVfuQ/exec';

let currentUser = null;
let allAdminRequests = [];
let filteredRequests = [];
let currentPage = 1;
const itemsPerPage = 10;

/* --- MENU HANDLER --- */
function toggleUserMenu() { document.getElementById("userDropdown").classList.toggle("show"); }
window.onclick = function (event) { if (!event.target.closest('.user-info')) { var dropdowns = document.getElementsByClassName("dropdown-content"); for (var i = 0; i < dropdowns.length; i++) { if (dropdowns[i].classList.contains('show')) dropdowns[i].classList.remove('show'); } } }

function switchView(viewName) {
    const loginView = document.getElementById('view-login'); const dashboardView = document.getElementById('view-dashboard'); const userInfo = document.getElementById('user-info-panel');
    if (viewName === 'login') { loginView.classList.remove('hidden'); dashboardView.classList.add('hidden'); }
    else { loginView.classList.add('hidden'); dashboardView.classList.remove('hidden'); }
}

async function callApi(params, method = 'GET', body = null) {
    const url = new URL(API_URL); Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const options = { method: method, redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" } }; if (body) options.body = JSON.stringify(body);
    try { const res = await fetch(url, options); return await res.json(); } catch (e) { return { status: 'error', message: 'Sunucuya ulaşılamıyor.' }; }
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const statusDiv = document.getElementById('login-status');

    // UI Başlat
    statusDiv.innerText = 'Kontrol ediliyor...';
    statusDiv.className = 'status-loading';
    btn.disabled = true;

    const res = await callApi({ action: 'login', user: document.getElementById('username').value, pass: document.getElementById('password').value });

    if (res && res.status === 'success') {
        currentUser = res;

        // BAŞARILI DURUMU
        statusDiv.innerText = 'Giriş Başarılı! Yönlendiriliyorsunuz...';
        statusDiv.className = 'status-success';

        setTimeout(async () => {
            if (res.forceReset) {
                btn.disabled = false;
                statusDiv.innerText = '';
                await promptChangePassword(true);
                return;
            }

            // Dashboard hazırlığı
            document.getElementById('displayUsername').innerText = res.user;
            document.getElementById('displayRole').innerText = res.role;
            document.getElementById('userAvatar').innerText = res.user.charAt(0).toUpperCase();

            // MENÜ KISITLAMALARI
            const mgmtLink = document.getElementById('menu-mgmt');
            const logsLink = document.getElementById('menu-logs');
            const passLink = document.getElementById('menu-pass');

            // 1. Şifre Değiştirme Kısıtlaması (TEMSİLCİ ise gizle)
            if (res.role === 'Temsilci') {
                passLink.style.display = 'none';
            } else {
                passLink.style.display = 'block';
            }

            // 2. Diğer Yetkili Menüler
            if (res.role === 'İK' || res.role === 'IK' || res.role === 'SPV') {
                mgmtLink.style.display = 'block';
                if (res.role.startsWith('İK') || res.role === 'IK') logsLink.style.display = 'block'; else logsLink.style.display = 'none';
            } else {
                mgmtLink.style.display = 'none'; logsLink.style.display = 'none';
            }

            renderDashboard(res.role);
            switchView('dashboard');
            statusDiv.innerText = '';
            btn.disabled = false;
        }, 800);

    } else {
        // HATA DURUMU
        statusDiv.innerText = res.message || 'Hatalı kullanıcı adı veya şifre!';
        statusDiv.className = 'status-error';
        btn.disabled = false;
    }
}

function logout() {
    currentUser = null;
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    switchView('login');
}

/* --- ŞİFRE DEĞİŞTİRME --- */
async function promptChangePassword(isForced = false) {
    if (!isForced && currentUser.role === 'Temsilci') {
        Swal.fire('Yetkisiz', 'Temsilciler şifrelerini değiştiremez.', 'error');
        return;
    }

    const { value: formValues } = await Swal.fire({
        title: 'Şifre Değiştir',
        html: `
            <input id="swal-pass1" type="password" class="swal2-input" placeholder="Yeni Şifre">
            <input id="swal-pass2" type="password" class="swal2-input" placeholder="Yeni Şifre Tekrar">
        `,
        focusConfirm: false,
        preConfirm: () => {
            const p1 = document.getElementById('swal-pass1').value;
            const p2 = document.getElementById('swal-pass2').value;
            if (!p1 || p1.length < 4) return Swal.showValidationMessage('Şifre en az 4 karakter olmalı');
            if (p1 !== p2) return Swal.showValidationMessage('Şifreler eşleşmiyor');
            return p1;
        }
    });

    if (formValues) {
        Swal.showLoading();
        const res = await callApi({ action: 'changePassword' }, 'POST', { user: currentUser.user, newPass: formValues });
        if (res.status === 'success') {
            Swal.fire('Başarılı', 'Şifreniz güncellendi.', 'success');
            if (isForced) logout();
        }
    }
}

/* --- DASHBOARD & ANALYTICS --- */
function renderDashboard(role) {
    const container = document.getElementById('dashboard-content');
    if (role === 'Temsilci') {
        container.innerHTML = `
            <div class="panel-info">👋 <strong>Hoş Geldin!</strong> İzinlerini buradan yönetebilirsin.</div>
            <div class="tabs">
                <button class="tab-btn active" onclick="showTab('new-req', this)">İzin Talebi Oluştur</button>
                <button class="tab-btn" onclick="showTab('my-req', this)">Taleplerim & Geçmiş</button>
            </div>
            <div id="tab-new-req">
                <form onsubmit="submitRequest(event)" autocomplete="off">
                     <div style="display:grid; grid-template-columns: 2fr 1fr; gap: 15px;">
                        <div class="form-group"><label>AD SOYAD</label><input type="text" id="fullname" required></div>
                        <div class="form-group"><label>SİCİL NO</label><input type="text" id="sicil"></div>
                    </div>
                    <div class="form-group"><label>İZİN TÜRÜ</label>
                        <select id="type"><option>Yıllık İzin</option><option>Hastalık</option><option>Mazeret</option><option>Vefat/Doğum</option></select>
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

    // YÖNETİCİ VIEW (Filtreler ile)
    container.innerHTML = `
        <div class="panel-info">🛡️ <strong>${role} Paneli</strong></div>
        <div class="filter-bar">
            <div class="filter-item"><label>Ay Seç</label><input type="month" id="filter-month" onchange="applyFilters()"></div>
            <div class="filter-item"><label>İzin Türü</label><select id="filter-type" onchange="applyFilters()"><option value="">Tümü</option><option>Yıllık İzin</option><option>Mazeret</option></select></div>
            <div class="filter-item"><label>Durum</label><select id="filter-status" onchange="applyFilters()"><option value="">Tümü</option><option value="bekliyor">Bekleyen</option><option value="onaylandi">Onaylı</option><option value="red">Red</option></select></div>
        </div>
        <table id="admin-table">
            <thead><tr><th>PERSONEL</th><th>İZİN ARALIĞI</th><th>TÜR</th><th>İŞLEM</th></tr></thead>
            <tbody></tbody>
        </table>
        <div class="pagination-container"><button class="page-btn" onclick="changePage(-1)">Geri</button><span id="page-info"></span><button class="page-btn" onclick="changePage(1)">İleri</button></div>
    `;
    loadAdminRequests();
}

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

/* WINDOW BINDINGS */
window.handleLogin = handleLogin;
window.promptChangePassword = promptChangePassword;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.openAllLogs = () => { /* Logic */ };
window.openUserMgmtModal = () => { /* Logic */ };
window.showTab = (id, bt) => { /* Logic */ };
window.submitRequest = (e) => { /* Logic */ };
window.changePage = (d) => { currentPage += d; renderPage(currentPage); };
window.viewUserLogs = (u) => { /* Logic */ };
