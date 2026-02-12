/* 
  app.js (Ultra Güvenli & Token Tabanlı Frontend)
*/
const API_URL = 'https://script.google.com/macros/s/AKfycbzPP6GYOHiP6gFdwrBpNtBc9KJSqQ-UE6J-9V9Z2XzES2oW-kfM3G4SDjYCrCorVkVfuQ/exec';

let currentUser = null;

// --- PWA & SERVICE WORKER KAYDI ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registered'))
            .catch(err => console.log('SW Error', err));
    });
}

// --- ANDROID INSTALL PROMPT MANTIĞI ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    if (!isInStandaloneMode()) {
        const androidPrompt = document.getElementById('android-prompt');
        if (androidPrompt) androidPrompt.style.display = 'flex';
    }
});

function closeAndroidPrompt() {
    const androidPrompt = document.getElementById('android-prompt');
    if (androidPrompt) androidPrompt.style.display = 'none';
}

document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-install-android' && deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            deferredPrompt = null;
            closeAndroidPrompt();
        });
    }
});

function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isInStandaloneMode() {
    return ('standalone' in window.navigator) || (window.matchMedia('(display-mode: standalone)').matches);
}

function checkPwaPrompts() {
    if (isInStandaloneMode()) return;
    if (isIos()) {
        const prompt = document.getElementById('ios-prompt');
        if (prompt) prompt.style.display = 'block';
    }
}

function closeIosPrompt() {
    const prompt = document.getElementById('ios-prompt');
    if (prompt) prompt.style.display = 'none';
}

window.addEventListener('load', () => {
    checkPwaPrompts();
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

// === LOGIN/LOGOUT (AUTHENTICATOR 2FA) ===
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
                text: 'Authenticator uygulamanızdaki 6 haneli kodu girin:',
                input: 'text',
                inputAttributes: { maxlength: 6, autofocus: true, style: 'text-align:center; letter-spacing:5px; font-size:1.5rem;' },
                showCancelButton: true,
                confirmButtonText: 'Doğrula',
                preConfirm: (code) => { if (!code || code.length !== 6) { Swal.showValidationMessage('Lütfen 6 haneli kodu girin'); } return code; }
            });
            if (code) {
                const res2 = await callApi({ action: 'verify2fa', user: u, code: code, clientInfo, forceChange: res.forceChange });
                if (res2.token) completeLogin(res2);
                else throw new Error(res2.message || 'Hatalı kod.');
            } else {
                btn.disabled = false;
                statusDiv.innerHTML = '';
            }
        } else if (res.status === '2fa_setup') {
            await Swal.fire({
                title: '2FA Kurulumu',
                html: `<p>Güvenliğiniz için Authenticator kurmanız gerekiyor.</p><img src="${res.qrUrl}" style="margin:20px 0;"><p style="font-size:0.8rem; background:#f4f4f4; padding:10px; border-radius:5px;">Kod: <b>${res.secret}</b></p><p>Kodu taratın ve uygulamadaki kodu buraya girin:</p>`,
                input: 'text',
                confirmButtonText: 'Kurulumu Tamamla',
                preConfirm: (code) => { if (!code) { Swal.showValidationMessage('Kod gerekli'); } return code; }
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
    if (userData.forceChange) {
        promptChangePassword(true);
    }
}

function logout() {
    localStorage.removeItem('site_telekom_user');
    currentUser = null;
    location.reload();
}

function toggleUserMenu() {
    document.getElementById('userDropdown').classList.toggle('show');
}

window.onclick = function (event) {
    if (!event.target.closest('.user-menu-container')) {
        const dropdowns = document.getElementsByClassName("dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('show')) dropdowns[i].classList.remove('show');
        }
    }
};

function switchView(viewName) {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-dashboard').classList.add('hidden');
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.remove('hidden');
}

function promptChangePassword(isForced = false) {
    Swal.fire({
        title: isForced ? 'Şifre Değişikliği Zorunlu' : 'Şifre Değiştir',
        text: 'Lütfen yeni şifrenizi girin.',
        input: 'password',
        inputAttributes: { placeholder: 'Yeni Şifre' },
        allowOutsideClick: !isForced,
        allowEscapeKey: !isForced,
        showCancelButton: !isForced,
        confirmButtonText: 'Güncelle',
        inputValidator: (value) => {
            if (!value || value.length < 4) return 'Şifre en az 4 karakter olmalı!';
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const res = await callApi({ action: 'changePassword', newPass: result.value });
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
                    <h4 style="margin:0; font-size:1.1rem; color:#1e293b;">${role} Paneli</h4>
                    <p style="margin:5px 0 0; font-size:0.9rem; color:#64748b;">Ekibinizin izin taleplerini yönetin</p>
                </div>
            </div>
            <div class="filter-bar">
                <div class="filter-item"><label>DÖNEM</label><select id="f-month" onchange="applyFilters()">${getMonthOptions()}</select></div>
                <div class="filter-item"><label>İZİN TÜRÜ</label><select id="f-type" onchange="applyFilters()"><option value="">Tümü</option>${window.leaveTypes.map(t => `<option>${t}</option>`).join('')}</select></div>
                <div class="filter-item"><label>DURUM</label><select id="f-status" onchange="applyFilters()"><option value="">Tümü</option><option>Bekliyor</option><option>Onaylandı</option><option>Reddedildi</option></select></div>
            </div>
            <div class="card" style="padding:0; overflow:hidden;">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>PERSONEL</th><th>TARİHLER / GEREKÇE</th><th>TÜR</th><th>DURUM / İŞLEM</th></tr>
                        </thead>
                        <tbody id="admin-table-body"><tr><td colspan="4" style="text-align:center; padding:50px;">Yükleniyor...</td></tr></tbody>
                    </table>
                </div>
            </div>
            <div class="pagination-container">
                <button class="page-btn" onclick="changePage(-1)" id="btn-prev">◀ Geri</button>
                <span class="page-info" id="page-info">Sayfa 1</span>
                <button class="page-btn" onclick="changePage(1)" id="btn-next">İleri ▶</button>
            </div>
        `;
        loadAdminRequests();
    }
}

// === USER MANAGEMENT ===
let userMgmtCurrentPage = 1;
const userMgmtPerPage = 20;
let allUsersCache = [];

window.openUserMgmtModal = function () {
    const isIk = ['İK', 'IK'].includes(currentUser.role);

    let html = `
        <div class="mgmt-tabs">
            <button class="mgmt-tab-btn active" onclick="switchMgmtTab('add')">➕ Kullanıcı Ekle</button>
            <button class="mgmt-tab-btn" onclick="switchMgmtTab('list')">📋 Kullanıcı Listesi</button>
        </div>
        <div id="mgmt-tab-add" class="mgmt-tab-content">
            <div class="form-group" style="text-align:left;">
                <label>Kullanıcı Adı</label>
                <input type="text" id="new-u-name" class="swal2-input" placeholder="kullanici.adi" style="width:100%; margin:0;">
            </div>
            ${isIk ? `
                <div class="form-group" style="text-align:left; margin-top:15px;">
                    <label>Rol</label>
                    <select id="new-u-role" class="swal2-input" style="width:100%; margin:0;">
                        <option value="TL">Team Leader (TL)</option>
                        <option value="SPV">Supervisor (SPV)</option>
                        <option value="MT">Temsilci (MT)</option>
                        <option value="İK">İnsan Kaynakları (İK)</option>
                    </select>
                </div>
                <div class="form-group" style="text-align:left; margin-top:15px;">
                    <label>Proje/Grup</label>
                    <input type="text" id="new-u-proj" class="swal2-input" placeholder="Proje adı" style="width:100%; margin:0;">
                </div>
                <div class="form-group" style="text-align:left; margin-top:15px;">
                    <label>Güvenlik (2FA)</label>
                    <select id="new-u-2fa" class="swal2-input" style="width:100%; margin:0;">
                        <option value="PASİF">🔴 Kapalı (Sadece Şifre)</option>
                        <option value="AKTİF">🟢 Açık (Authenticator Kod)</option>
                    </select>
                </div>
            ` : `
                <div class="alert-info">ℹ️ Sadece kendi grubunuza kullanıcı ekleyebilirsiniz.</div>
            `}
            <button class="btn-primary" onclick="submitAddUser()" style="margin-top:20px; width:100%;">Ekle (İlk Şifre: 1234)</button>
        </div>
        <div id="mgmt-tab-list" class="mgmt-tab-content hidden">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                <input type="text" id="mgmt-search" placeholder="Kullanıcı ara..." class="swal2-input" style="margin:0; height:45px; font-size:0.9rem;" oninput="renderUserList()">
                <select id="mgmt-filter-proj" class="swal2-input" style="margin:0; height:45px; font-size:0.9rem;" onchange="renderUserList()">
                    <option value="">Tüm Projeler</option>
                </select>
            </div>
            <div id="user-list-container" style="min-height:300px;">Yükleniyor...</div>
            <div id="user-mgmt-pagination" class="pagination-container" style="justify-content:center; margin-top:15px;"></div>
        </div>
    `;

    Swal.fire({ title: 'Kullanıcı Yönetimi', html: html, width: 850, showConfirmButton: false, showCloseButton: true, didOpen: () => { loadUserListInternal(); } });
}

window.switchMgmtTab = function (tab) {
    document.querySelectorAll('.mgmt-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mgmt-tab-content').forEach(c => c.classList.add('hidden'));
    event.target.classList.add('active');
    document.getElementById('mgmt-tab-' + tab).classList.remove('hidden');
}

window.loadUserListInternal = async function () {
    const res = await callApi({ action: 'getUserList' });
    allUsersCache = res || [];
    const projs = [...new Set(allUsersCache.map(u => u.project))].filter(Boolean).sort();
    const select = document.getElementById('mgmt-filter-proj');
    if (select) {
        select.innerHTML = '<option value="">Tüm Projeler</option>';
        projs.forEach(p => { const opt = document.createElement('option'); opt.value = p; opt.textContent = p; select.appendChild(opt); });
    }
    userMgmtCurrentPage = 1;
    renderUserList();
}

window.renderUserList = function () {
    const container = document.getElementById('user-list-container');
    const search = document.getElementById('mgmt-search').value.toLowerCase();
    const projFilter = document.getElementById('mgmt-filter-proj').value;

    let filtered = allUsersCache.filter(u => {
        const matchesSearch = u.user.toLowerCase().includes(search);
        const matchesProj = !projFilter || u.project === projFilter;
        return matchesSearch && matchesProj;
    });

    const totalPages = Math.ceil(filtered.length / userMgmtPerPage);
    const start = (userMgmtCurrentPage - 1) * userMgmtPerPage;
    const paginated = filtered.slice(start, start + userMgmtPerPage);
    const isIk = ['İK', 'IK'].includes(currentUser.role);

    let table = `<table style=\"width:100%; border-collapse: collapse; font-size:0.85rem;\"><thead style=\"background:#f8f9fa;\"><tr><th>Kullanıcı</th><th>Rol</th><th>Proje</th><th>2FA</th><th>İşlem</th></tr></thead><tbody>`;
    paginated.forEach(u => {
        table += `<tr style=\"border-bottom:1px solid #eee;\"><td><b>${esc(u.user)}</b></td><td>${esc(u.role)}</td><td>${esc(u.project)}</td><td style=\"text-align:center;\"><span style=\"color: ${u.twoFactor === 'AKTİF' ? '#059669' : '#dc2626'}; font-weight:bold;\">${u.twoFactor}</span></td><td style=\"text-align:center;\"><button onclick=\"resetPass('${esc(u.user)}')\" title=\"Şifre Sıfırla\" class=\"action-btn\" style=\"background:#f59e0b; width:40px;\">🔑</button>${isIk ? `<button onclick=\"toggle2faStatus('${esc(u.user)}', '${u.twoFactor === 'AKTİF' ? 'PASİF' : 'AKTİF'}')\" class=\"action-btn\" style=\"background:#6366f1; width:40px; margin-left:5px;\">🛡️</button><button onclick=\"delUser('${esc(u.user)}')\" class=\"action-btn reject\" style=\"width:40px; margin-left:5px;\">🗑️</button>` : ''}</td></tr>`;
    });
    table += '</tbody></table>';
    container.innerHTML = table;

    let pagHtml = '';
    if (totalPages > 1) {
        pagHtml = `<button class=\"page-btn\" onclick=\"changeUserPage(-1)\" ${userMgmtCurrentPage === 1 ? 'disabled' : ''}>◀ Geri</button><span class=\"page-info\">Sayfa ${userMgmtCurrentPage} / ${totalPages}</span><button class=\"page-btn\" onclick=\"changeUserPage(1)\" ${userMgmtCurrentPage === totalPages ? 'disabled' : ''}>İleri ▶</button>`;
    }
    document.getElementById('user-mgmt-pagination').innerHTML = pagHtml;
}

window.changeUserPage = function (dir) { userMgmtCurrentPage += dir; renderUserList(); }

window.submitAddUser = async function () {
    const u = document.getElementById('new-u-name').value.trim();
    const r = document.getElementById('new-u-role')?.value || 'TL';
    const p = document.getElementById('new-u-proj')?.value.trim() || '';
    if (!u) { Swal.showValidationMessage('Kullanıcı adı gerekli'); return; }
    Swal.showLoading();
    const res = await callApi({ action: 'addUser', newUser: u, newRole: r, newProject: p, new2fa: document.getElementById('new-u-2fa')?.value || 'PASİF' });
    if (res.status === 'success') Swal.fire('Başarılı', 'Kullanıcı eklendi', 'success');
    else Swal.fire('Hata', 'İşlem başarısız', 'error');
}

window.resetPass = async function (targetUser) {
    Swal.fire({ title: 'Şifre Sıfırla', text: `${targetUser} kullanıcısının şifresi "1234" yapılacak. Emin misiniz?`, icon: 'warning', showCancelButton: true }).then(async (r) => {
        if (r.isConfirmed) {
            const res = await callApi({ action: 'resetPass', targetUser });
            if (res.status === 'success') Swal.fire('Başarılı', 'Şifre 1234 yapıldı', 'success');
        }
    });
}

window.delUser = async function (targetUser) {
    Swal.fire({ title: 'Kullanıcı Sil', text: `${targetUser} tamamen silinecek. Onaylıyor musunuz?`, icon: 'error', showCancelButton: true }).then(async (r) => {
        if (r.isConfirmed) {
            const res = await callApi({ action: 'deleteUser', targetUser });
            if (res.status === 'success') { Swal.fire('Başarılı', 'Kullanıcı silindi', 'success'); loadUserListInternal(); }
        }
    });
}

window.toggle2faStatus = async function (targetUser, newStatus) {
    const res = await callApi({ action: 'toggle2fa', targetUser, newStatus });
    if (res.status === 'success') { Swal.fire('Başarılı', `2FA durumu: ${newStatus}`, 'success'); loadUserListInternal(); }
}

// === REQUESTS MANAGEMENT ===
async function loadAdminRequests() {
    const res = await callApi({ action: 'getRequests' });
    allAdminRequests = Array.isArray(res) ? res : [];
    applyFilters();
}

function applyFilters() {
    const month = document.getElementById('f-month').value;
    const type = document.getElementById('f-type').value;
    const status = document.getElementById('f-status').value;

    filteredRequests = allAdminRequests.filter(r => {
        const d = r[12] ? r[12].split('.') : []; // DD.MM.YYYY
        const m = (d.length > 1) ? parseInt(d[1]) : 0;
        return (!month || m == month) && (!type || r[4] == type) && (!status || r[8] == status);
    });

    currentPage = 1;
    renderPage(1);
}

function getStatusBadge(status) {
    const c = { 'Bekliyor': '#f59e0b', 'Onaylandı': '#10b981', 'Reddedildi': '#ef4444' };
    return `<span class="badge" style="background:${c[status] || '#64748b'}; color:white;">${status}</span>`;
}

function renderPage(page) {
    const start = (page - 1) * itemsPerPage;
    const data = filteredRequests.slice(start, start + itemsPerPage);
    const tbody = document.getElementById('admin-table-body');
    if (!tbody) return;

    if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px;">Kayıt bulunamadı.</td></tr>'; return; }

    let html = '';
    data.forEach(r => {
        const canAction = (r[8] === 'Bekliyor');
        html += `
            <tr>
                <td><b>${esc(r[2])}</b><br><small>${esc(r[3])}</small></td>
                <td><small>${esc(r[5])} - ${esc(r[6])}</small><br><small style="color:#666;">${esc(r[7])}</small></td>
                <td>${esc(r[4])}</td>
                <td>
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        ${getStatusBadge(r[8] === 'onaylandi' ? 'Onaylandı' : (r[8] === 'red' ? 'Reddedildi' : 'Bekliyor'))}
                        ${canAction ? `<div style="display:flex; gap:5px;"><button class="action-btn" onclick="processRequest('${r[0]}','Onaylandı')">✅</button><button class="action-btn reject" onclick="processRequest('${r[0]}','Reddedildi')">❌</button></div>` : ''}
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
    document.getElementById('page-info').innerText = `Sayfa ${page} / ${Math.ceil(filteredRequests.length / itemsPerPage) || 1}`;
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
        const { value: res } = await Swal.fire({ title: 'Red Sebebi', input: 'textarea', inputPlaceholder: 'Neden reddedildi?', showCancelButton: true });
        if (res === undefined) return;
        reason = res;
    }

    Swal.fire({ title: 'İşleniyor...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    const res = await callApi({ action: 'updateStatus', id, decision, reason });
    if (res.status === 'success') {
        Swal.fire('Başarılı', `Talep ${decision.toLowerCase()}!`, 'success');
        loadAdminRequests();
    }
}

async function searchMyHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '🕒 Yükleniyor...';
    const res = await callApi({ action: 'getRequests' });
    if (!Array.isArray(res)) { list.innerHTML = 'Yüklenemedi.'; return; }

    const my = res.filter(r => String(r[1]) === String(currentUser.user));
    if (my.length === 0) { list.innerHTML = 'Talep geçmişiniz temiz.'; return; }

    let html = '<div class="table-container"><table><thead><tr><th>Tarih</th><th>Tür</th><th>Durum</th></tr></thead><tbody>';
    my.forEach(r => {
        html += `<tr><td><small>${r[5]}</small></td><td>${r[4]}</td><td>${getStatusBadge(r[8] === 'onaylandi' ? 'Onaylandı' : (r[8] === 'red' ? 'Reddedildi' : 'Bekliyor'))}</td></tr>`;
    });
    html += '</tbody></table></div>';
    list.innerHTML = html;
}

async function submitRequest(e) {
    e.preventDefault();
    const formData = {
        fullName: document.getElementById('req-name').value.trim(),
        project: currentUser.project,
        type: document.getElementById('req-type').value,
        start: document.getElementById('req-start').value,
        end: document.getElementById('req-end').value,
        reason: document.getElementById('req-reason').value.trim()
    };

    Swal.fire({ title: 'Gönderiliyor...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    const res = await callApi({ action: 'submitRequest', formData });
    if (res.status === 'success') {
        Swal.fire('Başarılı!', 'İzin talebiniz gönderildi.', 'success');
        e.target.reset();
        searchMyHistory();
    } else {
        Swal.fire('Hata', 'Talep gönderilemedi.', 'error');
    }
}

// === API CALL (IP & KONUM TAKİPLİ) ===
async function getClientInfo() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        return `${data.ip} (${data.city}, ${data.country_name})`;
    } catch { return "Bilinmiyor"; }
}

async function callApi(body = {}) {
    if (currentUser && currentUser.token) body.token = currentUser.token;
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            body: JSON.stringify(body)
        });
        const json = await res.json();
        if (json.status === 'error' && json.message === 'Oturum süresi doldu.') {
            logout();
        }
        return json;
    } catch (e) { return { status: 'error', message: 'Sunucu hatası.' }; }
}

/* === WINDOW BINDINGS === */
window.handleLogin = handleLogin;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.submitRequest = submitRequest;
window.applyFilters = applyFilters;
window.changePage = changePage;

window.showTab = function (id, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-new-req').classList.add('hidden');
    document.getElementById('tab-my-req').classList.add('hidden');
    document.getElementById('tab-' + id).classList.remove('hidden');
    if (id === 'my-req') searchMyHistory();
};

window.openSystemLogs = async function () {
    Swal.fire({ title: 'Sistem Logları', html: '⏳ Yükleniyor...', width: 1000, showConfirmButton: false });
    const res = await callApi({ action: 'getLogs' });
    if (!Array.isArray(res)) { Swal.fire('Hata', 'Loglar alınamadı', 'error'); return; }
    let table = '<div style=\"max-height:500px; overflow:auto;\"><table><thead><tr><th>Tarih</th><th>Kullanıcı</th><th>İşlem</th><th>Detay</th></tr></thead><tbody>';
    res.forEach(l => { table += `<tr><td>${l.time}</td><td>${l.user}</td><td>${l.type}</td><td>${l.detail}</td></tr>`; });
    table += '</tbody></table></div>';
    Swal.update({ html: table });
}

/* === EXCEL RAPORLAMA === */
window.openReportModal = async function () {
    Swal.fire({ title: 'Rapor Hazırlanıyor...', html: '📊 Veriler çekiliyor...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    const res = await callApi({ action: 'getReportData' });
    if (res.status === 'error') { Swal.fire('Hata', 'Veriler alınamadı: ' + res.message, 'error'); return; }
    const data = res.data;
    if (!data || data.length <= 1) { Swal.fire('Uyarı', 'Veri yok.', 'warning'); return; }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Izin_Raporu");
    const now = new Date();
    const fileName = "SiteTelekom_Izin_Raporu_" + now.getTime() + ".xlsx";
    XLSX.writeFile(wb, fileName);
    Swal.fire({ title: 'Başarılı', text: 'Rapor indirildi.', icon: 'success', timer: 2000 });
}
