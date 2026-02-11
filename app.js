/* 
  app.js (Premium Ay Filtresi + Gelişmiş Kullanıcı Yönetimi)
*/
const API_URL = 'https://script.google.com/macros/s/AKfycbzPP6GYOHiP6gFdwrBpNtBc9KJSqQ-UE6J-9V9Z2XzES2oW-kfM3G4SDjYCrCorVkVfuQ/exec';

let currentUser = null;
let allAdminRequests = [];
let filteredRequests = [];
let currentPage = 1;
const itemsPerPage = 10;

// SAYFA YÜKLENDİĞİNDE
window.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('site_telekom_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        initDashboardWithUser(currentUser);
    }
    window.leaveTypes = await callApi({ action: 'getLeaveTypes' });
});

function initDashboardWithUser(user) {
    document.getElementById('displayUsername').innerText = user.user;
    document.getElementById('displayRole').innerText = user.role;
    document.getElementById('userAvatar').innerText = user.user.charAt(0).toUpperCase();

    const mgmtLink = document.getElementById('menu-mgmt');
    const logsLink = document.getElementById('menu-logs');
    const reportLink = document.getElementById('menu-report');
    const passLink = document.getElementById('menu-pass');

    if (user.role === 'Temsilci' && passLink) passLink.style.display = 'none';
    else if (passLink) passLink.style.display = 'block';

    if (user.role === 'İK' || user.role === 'IK' || user.role === 'SPV') {
        if (mgmtLink) mgmtLink.style.display = 'block';
        if (user.role.startsWith('İK') || user.role === 'IK') {
            if (logsLink) logsLink.style.display = 'block';
            if (reportLink) reportLink.style.display = 'block'; // İK'ya özel rapor
        } else {
            if (logsLink) logsLink.style.display = 'none';
            if (reportLink) reportLink.style.display = 'none';
        }
    } else {
        if (mgmtLink) mgmtLink.style.display = 'none';
        if (logsLink) logsLink.style.display = 'none';
        if (reportLink) reportLink.style.display = 'none';
    }

    renderDashboard(user.role);
    switchView('dashboard');
}

/* === UTILITY FUNCTIONS === */
function getMonthOptions() {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' });
        months.push({ val, label });
    }
    return months;
}

/* === LOGIN/LOGOUT === */
async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const statusDiv = document.getElementById('login-status');
    statusDiv.innerText = 'Kontrol ediliyor...';
    statusDiv.className = 'status-loading';
    btn.disabled = true;

    const res = await callApi({
        action: 'login',
        user: document.getElementById('username').value,
        pass: document.getElementById('password').value
    });

    if (res && res.status === 'success') {
        currentUser = res;
        localStorage.setItem('site_telekom_user', JSON.stringify(res));
        statusDiv.innerText = 'Giriş Başarılı!';
        statusDiv.className = 'status-success';

        setTimeout(() => {
            if (res.forceReset) {
                btn.disabled = false;
                statusDiv.innerText = '';
                promptChangePassword(true);
                return;
            }
            initDashboardWithUser(res);
            statusDiv.innerText = '';
            btn.disabled = false;
        }, 800);
    } else {
        statusDiv.innerText = res.message || 'Hatalı giriş!';
        statusDiv.className = 'status-error';
        btn.disabled = false;
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('site_telekom_user');
    switchView('login');
}

function toggleUserMenu() {
    document.getElementById("userDropdown").classList.toggle("show");
}

window.onclick = function (event) {
    if (!event.target.closest('.user-info')) {
        var dropdowns = document.getElementsByClassName("dropdown-content");
        for (var i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('show')) dropdowns[i].classList.remove('show');
        }
    }
}

function switchView(viewName) {
    const loginView = document.getElementById('view-login');
    const dashboardView = document.getElementById('view-dashboard');
    if (viewName === 'login') {
        loginView.classList.remove('hidden');
        dashboardView.classList.add('hidden');
    } else {
        loginView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
    }
}

async function callApi(params, method = 'GET', body = null) {
    const url = new URL(API_URL);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const options = {
        method: method,
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" }
    };
    if (body) options.body = JSON.stringify(body);
    try {
        const res = await fetch(url, options);
        return await res.json();
    } catch (e) {
        return { status: 'error' };
    }
}

async function promptChangePassword(isForced = false) {
    const { value: p1 } = await Swal.fire({
        title: 'Şifre Değiştir',
        input: 'password',
        showCancelButton: !isForced
    });
    if (p1) {
        await callApi({ action: 'changePassword' }, 'POST', {
            user: currentUser.user,
            newPass: p1
        });
        Swal.fire('Başarılı', 'Güncellendi', 'success');
        if (isForced) logout();
    }
}

/* === DASHBOARD RENDER === */
function renderDashboard(role) {
    const container = document.getElementById('dashboard-content');

    // TEMSİLCİ VIEW
    if (role === 'Temsilci') {
        const leaveTypesOptions = (window.leaveTypes || ['Yıllık İzin'])
            .map(type => `<option>${type}</option>`).join('');

        container.innerHTML = `
            <div class="panel-info">👋 <strong>Hoş Geldin!</strong> İzinlerini buradan yönetebilirsin.</div>
            <div class="tabs">
                <button class="tab-btn active" onclick="showTab('new-req', this)">İzin Talebi</button>
                <button class="tab-btn" onclick="showTab('my-req', this)">Geçmişim</button>
            </div>
            <div id="tab-new-req">
                <form onsubmit="submitRequest(event)" autocomplete="off">
                     <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div class="form-group">
                            <label>AD SOYAD</label>
                            <input type="text" id="fullname" placeholder="Örn: Ahmet Yılmaz" required>
                        </div>
                        <div class="form-group">
                            <label>SİCİL NO</label>
                            <input type="text" id="sicil" placeholder="12345" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>İZİN TÜRÜ</label>
                        <select id="type">${leaveTypesOptions}</select>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div class="form-group">
                            <label>BAŞLANGIÇ</label>
                            <input type="date" id="start" required>
                        </div>
                        <div class="form-group">
                            <label>BİTİŞ</label>
                            <input type="date" id="end" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>İZİN GEREKÇESİ</label>
                        <textarea id="reason" rows="3" placeholder="İzin sebebinizi yazınız..." required></textarea>
                    </div>
                    <button type="submit" class="btn-primary">Talebi Gönder</button>
                </form>
            </div>
            <div id="tab-my-req" class="hidden">
                <div style="background:white; padding:20px; border-radius:12px; margin-bottom:20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display:grid; grid-template-columns: 1fr 1fr auto; gap:15px; align-items:end;">
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:0.8rem; color:#6c757d;">AD SOYAD</label>
                            <input type="text" id="search-fullname" placeholder="Örn: Ahmet Yılmaz">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:0.8rem; color:#6c757d;">SİCİL NO</label>
                            <input type="text" id="search-sicil" placeholder="12345">
                        </div>
                        <button onclick="searchMyHistory()" class="btn-primary" style="width:auto; padding:12px 24px; margin:0;">
                            🔍 Sorgula
                        </button>
                    </div>
                    <div style="margin-top:10px; font-size:0.85rem; color:#6c757d;">
                        ℹ️ Ad-Soyad veya Sicil No ile geçmiş kayıtlarınızı sorgulayabilirsiniz.
                    </div>
                </div>
                <table id="rep-table">
                    <thead><tr><th>Tarih</th><th>Tür</th><th>Gerekçe</th><th>Durum</th></tr></thead>
                    <tbody>
                        <tr><td colspan="4" style="text-align:center; padding:40px; color:#999;">
                            👆 Yukarıdaki arama alanını kullanarak geçmiş kayıtlarınızı görüntüleyin
                        </td></tr>
                    </tbody>
                </table>
            </div>
        `;

        // OTOMATIK DOLDURMA: localStorage'dan isim ve sicil çek
        setTimeout(() => {
            const savedFullname = localStorage.getItem('mtd_fullname');
            const savedSicil = localStorage.getItem('mtd_sicil');
            if (savedFullname) document.getElementById('fullname').value = savedFullname;
            if (savedSicil) document.getElementById('sicil').value = savedSicil;
        }, 100);

        return;
    }

    // YÖNETİCİ VIEW (TL, SPV, İK) - DROPDOWN AY FİLTRESİ
    const leaveTypesOptions = (window.leaveTypes || ['Yıllık İzin'])
        .map(type => `<option>${type}</option>`).join('');

    const monthOptions = getMonthOptions()
        .map(m => `<option value="${m.val}">${m.label}</option>`).join('');

    container.innerHTML = `
        <div class="panel-info">🛡️ <strong>${role} Paneli</strong> - Ekibinizin izin taleplerini yönetin</div>
        <div class="filter-bar">
            <div class="filter-item">
                <label>📅 Dönem</label>
                <select id="filter-month" onchange="applyFilters()">
                    <option value="">Tüm Aylar</option>
                    ${monthOptions}
                </select>
            </div>
            <div class="filter-item">
                <label>📋 İzin Türü</label>
                <select id="filter-type" onchange="applyFilters()">
                    <option value="">Tümü</option>
                    ${leaveTypesOptions}
                </select>
            </div>
            <div class="filter-item">
                <label>🔍 Durum</label>
                <select id="filter-status" onchange="applyFilters()">
                    <option value="">Tümü</option>
                    <option value="bekliyor">⏳ Bekleyen</option>
                    <option value="onaylandi">✅ Onaylı</option>
                    <option value="red">❌ Reddedilen</option>
                </select>
            </div>
        </div>
        <table id="admin-table">
            <thead>
                <tr>
                    <th>PERSONEL</th>
                    <th>TARİHLER / GEREKÇE</th>
                    <th>TÜR</th>
                    <th>DURUM / İŞLEM</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
        <div class="pagination-container">
            <button class="page-btn" onclick="changePage(-1)">◀ Önceki</button>
            <span class="page-info" id="page-info">-</span>
            <button class="page-btn" onclick="changePage(1)">Sonraki ▶</button>
        </div>
    `;
    loadAdminRequests();
}

/* === KULLANICI YÖNETİMİ (Premium Modal) === */
window.openUserMgmtModal = async function () {
    const isIk = (currentUser.role === 'İK' || currentUser.role === 'IK');
    const isSPV = currentUser.role === 'SPV';

    let html = `
        <div class="mgmt-tabs">
            <button class="mgmt-tab-btn active" onclick="switchMgmtTab('add')">➕ Kullanıcı Ekle</button>
            <button class="mgmt-tab-btn" onclick="switchMgmtTab('list')">📋 Kullanıcı Listesi</button>
        </div>
        
        <div id="mgmt-tab-add" class="mgmt-tab-content">
            <div class="form-group">
                <label>Kullanıcı Adı</label>
                <input type="text" id="new-u-name" class="swal2-input" placeholder="kullanici.adi">
            </div>
            ${isIk ? `
                <div class="form-group">
                    <label>Rol</label>
                    <select id="new-u-role" class="swal2-input">
                        <option value="TL">Team Leader (TL)</option>
                        <option value="SPV">Supervisor (SPV)</option>
                        <option value="MT">Temsilci (MT)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Proje/Grup</label>
                    <input type="text" id="new-u-proj" class="swal2-input" placeholder="Proje adı">
                </div>
            ` : `
                <div class="alert-info">
                    ℹ️ SPV olarak sadece kendi grubunuza <b>Team Leader (TL)</b> ekleyebilirsiniz.
                </div>
                <input type="hidden" id="new-u-role" value="TL">
                <input type="hidden" id="new-u-proj" value="${currentUser.project}">
            `}
            <button class="btn-primary" onclick="submitAddUser()" style="margin-top:20px;">Kullanıcı Ekle (Şifre: 1234)</button>
        </div>
        
        <div id="mgmt-tab-list" class="mgmt-tab-content hidden">
            <div id="user-list-container">Yükleniyor...</div>
        </div>
    `;

    Swal.fire({
        title: isIk ? '🛡️ Kullanıcı Yönetim Paneli' : '👥 Ekip Yönetimi',
        html: html,
        width: 700,
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: () => {
            // Liste sekmesi açıldığında kullanıcıları yükle
            document.querySelector('[onclick="switchMgmtTab(\'list\')"]').addEventListener('click', loadUserListInternal);
        }
    });
}

window.switchMgmtTab = function (tab) {
    document.querySelectorAll('.mgmt-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mgmt-tab-content').forEach(c => c.classList.add('hidden'));

    event.target.classList.add('active');
    document.getElementById('mgmt-tab-' + tab).classList.remove('hidden');
}

window.loadUserListInternal = async function () {
    const container = document.getElementById('user-list-container');
    container.innerHTML = '<div style="text-align:center; padding:20px;">Yükleniyor...</div>';

    const users = await callApi({
        action: 'getUserList',
        role: currentUser.role,
        project: currentUser.project
    });

    if (!users || users.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999;">Kullanıcı bulunamadı</p>';
        return;
    }

    const isIk = (currentUser.role === 'İK' || currentUser.role === 'IK');

    let table = `
        <table style="width:100%; border-collapse: collapse;">
            <thead>
                <tr style="background:#f8f9fa;">
                    <th style="padding:12px; text-align:left;">Kullanıcı</th>
                    <th style="padding:12px; text-align:left;">Rol</th>
                    <th style="padding:12px; text-align:left;">Proje</th>
                    <th style="padding:12px; text-align:center;">İşlemler</th>
                </tr>
            </thead>
            <tbody>
    `;

    users.forEach(u => {
        table += `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:12px;"><b>${u.user}</b></td>
                <td style="padding:12px;">${u.role}</td>
                <td style="padding:12px;">${u.project}</td>
                <td style="padding:12px; text-align:center;">
                    <button onclick="resetPass('${u.user}')" class="action-btn" style="background:#f59e0b; width:auto; padding:8px 12px; font-size:0.8rem;">🔑 Şifre Sıfırla</button>
                    ${isIk ? `<button onclick="delUser('${u.user}')" class="action-btn reject" style="width:auto; padding:8px 12px; font-size:0.8rem; margin-left:5px;">🗑️ Sil</button>` : ''}
                </td>
            </tr>
        `;
    });

    table += '</tbody></table>';
    container.innerHTML = table;
}

window.submitAddUser = async function () {
    const u = document.getElementById('new-u-name').value.trim();
    const r = document.getElementById('new-u-role').value;
    const p = document.getElementById('new-u-proj')?.value.trim() || currentUser.project;

    if (!u) {
        Swal.showValidationMessage('Kullanıcı adı gerekli');
        return;
    }

    if ((currentUser.role === 'İK' || currentUser.role === 'IK') && !p) {
        Swal.showValidationMessage('Proje adı gerekli');
        return;
    }

    Swal.showLoading();

    const res = await callApi({
        action: 'addUser'
    }, 'POST', {
        creatorRole: currentUser.role,
        creatorProject: currentUser.project,
        newUser: u,
        newPass: '1234',
        newRole: r,
        newProject: p,
        user: currentUser.user
    });

    if (res.status === 'success') {
        Swal.fire('Başarılı', `${u} eklendi! İlk giriş şifresi: <b>1234</b>`, 'success');
    } else {
        Swal.fire('Hata', res.message || 'Eklenirken hata oluştu', 'error');
    }
}

window.resetPass = async function (targetUser) {
    const confirm = await Swal.fire({
        title: 'Şifre Sıfırla',
        text: `${targetUser} kullanıcısının şifresi 1234 olarak sıfırlanacak. Onaylıyor musunuz?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Evet, Sıfırla',
        cancelButtonText: 'İptal'
    });

    if (!confirm.isConfirmed) return;

    Swal.showLoading();
    await callApi({ action: 'resetPass' }, 'POST', { targetUser, user: currentUser.user });
    Swal.fire('Başarılı', 'Şifre 1234 olarak sıfırlandı', 'success');
}

window.delUser = async function (targetUser) {
    const confirm = await Swal.fire({
        title: 'Kullanıcı Sil',
        text: `${targetUser} kalıcı olarak silinecek! Bu işlem geri alınamaz.`,
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Evet, Sil',
        cancelButtonText: 'İptal',
        confirmButtonColor: '#dc3545'
    });

    if (!confirm.isConfirmed) return;

    Swal.showLoading();
    await callApi({ action: 'deleteUser' }, 'POST', {
        creatorRole: currentUser.role,
        targetUser,
        user: currentUser.user
    });
    Swal.fire('Silindi', 'Kullanıcı başarıyla silindi', 'success');
    loadUserListInternal();
}

/* === LOAD & FILTER === */
async function loadAdminRequests() {
    allAdminRequests = await callApi({
        action: 'getRequests',
        role: currentUser.role,
        user: currentUser.user,
        project: currentUser.project
    });

    if (allAdminRequests) {
        allAdminRequests.forEach(r => r._dateObj = new Date(r.start));
        allAdminRequests.sort((a, b) => {
            const aP = ['tl_bekliyor', 'spv_bekliyor', 'ik_bekliyor'].includes(a.status);
            const bP = ['tl_bekliyor', 'spv_bekliyor', 'ik_bekliyor'].includes(b.status);
            if (aP && !bP) return -1;
            if (!aP && bP) return 1;
            return b._dateObj - a._dateObj;
        });
    }
    applyFilters();
}

function applyFilters() {
    const fMonth = document.getElementById('filter-month')?.value;
    const fType = document.getElementById('filter-type')?.value;
    const fStatus = document.getElementById('filter-status')?.value;

    filteredRequests = (allAdminRequests || []).filter(r => {
        if (fMonth) {
            let rY = r._dateObj.getFullYear();
            let rM = String(r._dateObj.getMonth() + 1).padStart(2, '0');
            if (`${rY}-${rM}` !== fMonth) return false;
        }
        if (fType && r.type !== fType) return false;
        if (fStatus) {
            if (fStatus === 'bekliyor') {
                if (!['tl_bekliyor', 'spv_bekliyor', 'ik_bekliyor'].includes(r.status)) return false;
            } else if (fStatus === 'onaylandi' && r.status !== 'onaylandi') {
                return false;
            } else if (fStatus === 'red' && r.status !== 'red') {
                return false;
            }
        }
        return true;
    });

    currentPage = 1;
    renderPage(1);
}

function renderPage(page) {
    const tbody = document.querySelector('#admin-table tbody');
    if (!tbody) return;

    if (!filteredRequests || filteredRequests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:#999;">📭 Kriterlere uygun kayıt bulunamadı</td></tr>';
        document.getElementById('page-info').innerText = '-';
        return;
    }

    const start = (page - 1) * itemsPerPage;
    const pageData = filteredRequests.slice(start, start + itemsPerPage);

    tbody.innerHTML = pageData.map(r => {
        let actionHtml = '';

        const canApprove = (
            (currentUser.role === 'TL' && r.status === 'tl_bekliyor') ||
            (currentUser.role === 'SPV' && r.status === 'spv_bekliyor') ||
            ((currentUser.role === 'İK' || currentUser.role === 'IK') && r.status === 'ik_bekliyor')
        );

        if (canApprove) {
            actionHtml = `
                <button class="action-btn approve" onclick="window.processRequest('${r.id}', 'Onaylandı')" title="Onayla">✔</button>
                <button class="action-btn reject" onclick="window.processRequest('${r.id}', 'Reddedildi')" title="Reddet">✖</button>
            `;
        } else {
            if (r.status === 'onaylandi') {
                actionHtml = '<span class="status st-onaylandi">✅ Onaylandı</span>';
            } else if (r.status === 'red') {
                const rejInfo = getDetailedRejectionInfo(r);
                actionHtml = `
                    <span class="status st-red">❌ Reddedildi</span><br>
                    <small style="color:#721c24; display:block; margin-top:5px;">
                        <b>${rejInfo.rejecter}</b>: ${rejInfo.reason}
                    </small>
                `;
            } else {
                actionHtml = getStatusBadge(r.status);
            }
        }

        const dStart = new Date(r.start).toLocaleDateString('tr-TR');
        const dEnd = new Date(r.end).toLocaleDateString('tr-TR');
        const dDays = calculateDays(r.start, r.end);

        // Gerekçe gösterimi
        const reasonDisplay = r.reason
            ? `<div style="color:#495057; margin-top:6px; font-size:0.85rem; line-height:1.4; word-break: break-word;">📝 ${r.reason}</div>`
            : '<div style="color:#adb5bd; margin-top:6px; font-size:0.85rem; font-style:italic;">Gerekçe belirtilmedi</div>';

        return `
        <tr>
            <td>
                <strong>${r.fullName || r.requester}</strong><br>
                <span class="badge-project">${r.project}</span>
            </td>
            <td>
                <div style="font-weight:600;">${dStart} - ${dEnd} <span class="badge-days">${dDays} gün</span></div>
                ${reasonDisplay}
            </td>
            <td><b>${r.type}</b></td>
            <td>${actionHtml}</td>
        </tr>`;
    }).join('');

    const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
    document.getElementById('page-info').innerText = `Sayfa ${currentPage} / ${totalPages}`;
    document.querySelector('.page-btn:first-child').disabled = currentPage === 1;
    document.querySelector('.page-btn:last-child').disabled = currentPage >= totalPages;
}

/* === HELPER FUNCTIONS === */
function calculateDays(start, end) {
    try {
        const d1 = new Date(start);
        const d2 = new Date(end);
        const diff = Math.abs(d2 - d1);
        return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
    } catch (e) {
        return 0;
    }
}

function getDetailedRejectionInfo(r) {
    if (r.status !== 'red') return { rejecter: '-', reason: '-' };

    // Kim red etti kontrol et
    if (r.ik && r.ik.toString().startsWith('Reddedildi:')) {
        return {
            rejecter: 'İK',
            reason: r.ik.replace('Reddedildi:', '').trim()
        };
    }
    if (r.spv && r.spv.toString().startsWith('Reddedildi:')) {
        return {
            rejecter: 'SPV',
            reason: r.spv.replace('Reddedildi:', '').trim()
        };
    }
    if (r.tl && r.tl.toString().startsWith('Reddedildi:')) {
        return {
            rejecter: 'TL',
            reason: r.tl.replace('Reddedildi:', '').trim()
        };
    }

    return { rejecter: 'Bilinmiyor', reason: 'Red nedeni belirtilmemiş' };
}

function getStatusBadge(code) {
    const map = {
        'tl_bekliyor': '⏳ TL Onayı Bekliyor',
        'spv_bekliyor': '⏳ SPV Onayı Bekliyor',
        'ik_bekliyor': '⏳ İK Onayı Bekliyor',
        'onaylandi': '✓ Onaylandı',
        'red': '✖ Reddedildi'
    };
    const cls = code === 'onaylandi' ? 'st-onaylandi' : code === 'red' ? 'st-red' : 'st-tl_bekliyor';
    return `<span class="status ${cls}">${map[code] || code}</span>`;
}

function changePage(direction) {
    const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
    const next = currentPage + direction;
    if (next >= 1 && next <= totalPages) {
        currentPage = next;
        renderPage(currentPage);
    }
}

/* === İŞLEM FONKSİYONLARI === */
window.processRequest = async function (id, decision) {
    let reason = "";
    if (decision === 'Reddedildi') {
        const { value } = await Swal.fire({
            title: 'Red Nedeni',
            input: 'textarea',
            inputPlaceholder: 'Red sebebini yazınız...',
            showCancelButton: true,
            confirmButtonText: 'Red Et',
            cancelButtonText: 'İptal'
        });
        if (!value) return;
        reason = value;
    }

    Swal.fire({
        title: 'İşleniyor...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    await callApi({ action: 'updateStatus' }, 'POST', {
        id,
        role: currentUser.role,
        decision,
        reason,
        user: currentUser.user
    });

    Swal.fire('Başarılı', 'İşlem tamamlandı', 'success');
    loadAdminRequests();
}

window.showTab = (id, bt) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    bt.classList.add('active');
    document.getElementById('tab-new-req').classList.add('hidden');
    document.getElementById('tab-my-req').classList.add('hidden');
    document.getElementById('tab-' + id).classList.remove('hidden');
    if (id === 'my-req') loadMyRequests();
}

window.searchMyHistory = async function () {
    // Form alanlarından değerleri al
    const searchFullname = document.getElementById('search-fullname').value.trim();
    const searchSicil = document.getElementById('search-sicil').value.trim();

    if (!searchFullname && !searchSicil) {
        Swal.fire('Uyarı', 'Lütfen Ad-Soyad veya Sicil No girin', 'warning');
        return;
    }

    // Arama bilgilerini localStorage'a kaydet
    if (searchFullname) localStorage.setItem('mtd_fullname', searchFullname);
    if (searchSicil) localStorage.setItem('mtd_sicil', searchSicil);

    const tbody = document.querySelector('#rep-table tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">⏳ Sorgulanıyor...</td></tr>';

    const res = await callApi({
        action: 'getRequests',
        role: 'Temsilci',
        user: currentUser.user
    });

    if (!res || res.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:#999;">📭 Sistemde hiç kayıt bulunamadı</td></tr>';
        return;
    }

    let myRequests = res;

    // FİLTRELEME (Türkçe uyumlu, büyük/küçük harf duyarsız)
    if (searchFullname) {
        const byName = res.filter(r => {
            if (!r.fullName) return false;
            const searchLower = searchFullname.toLocaleLowerCase('tr-TR');
            const nameLower = r.fullName.toLocaleLowerCase('tr-TR');
            return nameLower.includes(searchLower);
        });

        if (byName.length > 1 && searchSicil) {
            myRequests = byName.filter(r => r.sicil === searchSicil);
        } else if (byName.length > 0) {
            myRequests = byName;
        } else if (searchSicil) {
            myRequests = res.filter(r => r.sicil === searchSicil);
        } else {
            myRequests = [];
        }
    } else if (searchSicil) {
        myRequests = res.filter(r => r.sicil === searchSicil);
    }

    if (myRequests.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="4" style="text-align:center; padding:40px; color:#999;">
                📭 "${searchFullname || searchSicil}" ile eşleşen kayıt bulunamadı
            </td></tr>
        `;
        return;
    }

    tbody.innerHTML = myRequests.map(r => {
        const dStart = new Date(r.start).toLocaleDateString('tr-TR');
        const dEnd = new Date(r.end).toLocaleDateString('tr-TR');

        let statusHtml = '';
        if (r.status === 'onaylandi') {
            statusHtml = '<span class="status st-onaylandi">✅ Onaylandı</span>';
        } else if (r.status === 'red') {
            const rejInfo = getDetailedRejectionInfo(r);
            statusHtml = `
                <span class="status st-red">❌ Reddedildi</span><br>
                <small style="color:#721c24; display:block; margin-top:5px;">
                    <b>${rejInfo.rejecter}</b>: ${rejInfo.reason}
                </small>
            `;
        } else {
            statusHtml = getStatusBadge(r.status);
        }

        return `<tr>
            <td>${dStart} - ${dEnd}</td>
            <td><b>${r.type}</b></td>
            <td style="max-width:200px; word-break:break-word;">${r.reason || '-'}</td>
            <td>${statusHtml}</td>
        </tr>`;
    }).join('');

    Swal.fire({
        icon: 'success',
        title: 'Sorgu Tamamlandı',
        text: `${myRequests.length} kayıt bulundu`,
        timer: 1500,
        showConfirmButton: false
    });
}

async function loadMyRequests() {
    // Geçmiş sekmesi açıldığında localStorage'dan otomatik doldur
    const savedFullname = localStorage.getItem('mtd_fullname');
    const savedSicil = localStorage.getItem('mtd_sicil');

    if (savedFullname) document.getElementById('search-fullname').value = savedFullname;
    if (savedSicil) document.getElementById('search-sicil').value = savedSicil;

    // Eğer kayıtlı bilgi varsa otomatik sorgula
    if (savedFullname || savedSicil) {
        setTimeout(() => searchMyHistory(), 300);
    }
}

async function submitRequest(e) {
    e.preventDefault();

    const fullname = document.getElementById('fullname').value;
    const sicil = document.getElementById('sicil').value;

    // İsim ve sicili localStorage'a kaydet (gelecek kullanımlar için)
    localStorage.setItem('mtd_fullname', fullname);
    localStorage.setItem('mtd_sicil', sicil);

    const data = {
        requester: currentUser.user,
        fullName: fullname,
        sicil: sicil,
        project: currentUser.project,
        type: document.getElementById('type').value,
        startDate: document.getElementById('start').value,
        endDate: document.getElementById('end').value,
        reason: document.getElementById('reason').value
    };

    Swal.fire({
        title: 'Gönderiliyor...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    await callApi({ action: 'createRequest' }, 'POST', data);

    Swal.fire('Başarılı', 'Talebiniz iletildi', 'success');

    // Formu temizle (sadece değişken alanlar)
    document.getElementById('reason').value = '';
    document.getElementById('start').value = '';
    document.getElementById('end').value = '';

    // Geçmiş sekmesine geç
    showTab('my-req', document.querySelectorAll('.tab-btn')[1]);
}

/* === WINDOW BINDINGS === */
window.handleLogin = handleLogin;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.submitRequest = submitRequest;
window.applyFilters = applyFilters;
window.changePage = changePage;

/* === SİSTEM LOGLARI === */
window.openSystemLogs = async function () {
    Swal.fire({
        title: '📋 Sistem Logları',
        html: '<div style="text-align:center; padding:20px;">⏳ Loglar yükleniyor...</div>',
        width: 900,
        showConfirmButton: false,
        showCloseButton: true
    });

    const logs = await callApi({
        action: 'getLogs',
        targetUser: '' // Tüm loglar
    });

    if (!logs || logs.length === 0) {
        Swal.update({
            html: '<div style="text-align:center; padding:40px; color:#999;">📭 Henüz log kaydı yok</div>'
        });
        return;
    }

    let tableHtml = `
        <div style="max-height:500px; overflow-y:auto; text-align:left;">
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead style="position:sticky; top:0; background:#f8f9fa; z-index:10;">
                    <tr>
                        <th style="padding:12px; border-bottom:2px solid #dee2e6; text-align:left;">Tarih</th>
                        <th style="padding:12px; border-bottom:2px solid #dee2e6; text-align:left;">Kullanıcı</th>
                        <th style="padding:12px; border-bottom:2px solid #dee2e6; text-align:left;">Rol</th>
                        <th style="padding:12px; border-bottom:2px solid #dee2e6; text-align:left;">İşlem</th>
                        <th style="padding:12px; border-bottom:2px solid #dee2e6; text-align:left;">Detay</th>
                    </tr>
                </thead>
                <tbody>
    `;

    logs.forEach(log => {
        tableHtml += `
            <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:10px; white-space:nowrap;">${log.time}</td>
                <td style="padding:10px;"><b>${log.user}</b></td>
                <td style="padding:10px;"><span class="badge-project">${log.role}</span></td>
                <td style="padding:10px;">${log.type}</td>
                <td style="padding:10px; color:#666;">${log.detail}</td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table></div>';

    Swal.update({ html: tableHtml });
}

/* === EXCEL RAPOR === */
window.openReportModal = async function () {
    const monthOptions = getMonthOptions()
        .map(m => `<option value="${m.val}">${m.label}</option>`).join('');

    const html = `
        <div style="text-align:left;">
            <div class="form-group">
                <label>📅 Rapor Dönemi Seçin</label>
                <select id="report-month" class="swal2-input" style="width:100%;">
                    <option value="">Tüm Aylar</option>
                    ${monthOptions}
                </select>
            </div>
            <div class="form-group">
                <label>📋 Durum Filtresi</label>
                <select id="report-status" class="swal2-input" style="width:100%;">
                    <option value="">Tümü</option>
                    <option value="onaylandi">✅ Onaylananlar</option>
                    <option value="red">❌ Reddedilenler</option>
                    <option value="bekliyor">⏳ Bekleyenler</option>
                </select>
            </div>
            <button onclick="generateExcelReport()" class="btn-primary" style="width:100%; margin-top:20px;">
                📥 Excel Raporu İndir
            </button>
        </div>
    `;

    Swal.fire({
        title: '📊 İzin Talepleri Raporu',
        html: html,
        width: 500,
        showConfirmButton: false,
        showCloseButton: true
    });
}

window.generateExcelReport = async function () {
    const month = document.getElementById('report-month').value;
    const status = document.getElementById('report-status').value;

    Swal.fire({
        title: 'Rapor Hazırlanıyor...',
        html: '⏳ Veriler toplanıyor...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    // Tüm talepleri çek
    const allReqs = await callApi({
        action: 'getRequests',
        role: currentUser.role,
        user: currentUser.user,
        project: currentUser.project
    });

    if (!allReqs || allReqs.length === 0) {
        Swal.fire('Uyarı', 'Rapor için veri bulunamadı', 'warning');
        return;
    }

    // Filtreleme
    let filtered = allReqs.filter(r => {
        if (month) {
            const d = new Date(r.start);
            const rMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (rMonth !== month) return false;
        }
        if (status) {
            if (status === 'bekliyor') {
                if (!['tl_bekliyor', 'spv_bekliyor', 'ik_bekliyor'].includes(r.status)) return false;
            } else if (r.status !== status) {
                return false;
            }
        }
        return true;
    });

    if (filtered.length === 0) {
        Swal.fire('Uyarı', 'Seçilen kriterlere uygun kayıt bulunamadı', 'warning');
        return;
    }

    // Excel formatında veri hazırla
    let csv = 'AD SOYAD,SİCİL NO,PROJE,İZİN TÜRÜ,BAŞLANGIÇ,BİTİŞ,GÜN SAYISI,GEREKÇE,DURUM,TL ONAY,SPV ONAY,İK ONAY\n';

    filtered.forEach(r => {
        const days = calculateDays(r.start, r.end);
        const statusText = {
            'onaylandi': 'Onaylandı',
            'red': 'Reddedildi',
            'tl_bekliyor': 'TL Bekliyor',
            'spv_bekliyor': 'SPV Bekliyor',
            'ik_bekliyor': 'İK Bekliyor'
        }[r.status] || r.status;

        csv += `"${r.fullName}","${r.sicil}","${r.project}","${r.type}","${r.start}","${r.end}","${days}","${r.reason || '-'}","${statusText}","${r.tl || '-'}","${r.spv || '-'}","${r.ik || '-'}"\n`;
    });

    // Dosya olarak indir
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const fileName = `izin_raporu_${month || 'tum_aylar'}_${new Date().getTime()}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Swal.fire({
        icon: 'success',
        title: 'Rapor Hazır!',
        html: `<b>${filtered.length}</b> kayıt Excel dosyasına aktarıldı<br><small>${fileName}</small>`,
        timer: 3000
    });
}

