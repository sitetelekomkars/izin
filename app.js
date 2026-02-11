/* 
  app.js (Ultra Güvenli & Token Tabanlı Frontend)
*/
const API_URL = 'https://script.google.com/macros/s/AKfycbzPP6GYOHiP6gFdwrBpNtBc9KJSqQ-UE6J-9V9Z2XzES2oW-kfM3G4SDjYCrCorVkVfuQ/exec';

let currentUser = null;
let allAdminRequests = [];
let filteredRequests = [];
let currentPage = 1;
const itemsPerPage = 10;

// SAYFA YÜKLENDİĞİNDE
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Önce verileri (İzin Türleri vb.) çek
    try {
        const lt = await callApi({ action: 'getLeaveTypes' });
        window.leaveTypes = (lt && Array.isArray(lt)) ? lt : ['Yıllık İzin', 'Mazeret İzni', 'Hastalık İzni'];
    } catch (e) {
        window.leaveTypes = ['Yıllık İzin', 'Mazeret İzni', 'Hastalık İzni'];
    }

    // 2. Sonra oturumu kontrol et ve dashboard'u başlat
    const savedUser = localStorage.getItem('site_telekom_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        initDashboardWithUser(currentUser);
    }
});

function initDashboardWithUser(user) {
    if (!user) return;

    // UI Elemanlarını Güncelle
    const dUser = document.getElementById('displayUsername');
    const dRole = document.getElementById('displayRole');
    const dAvat = document.getElementById('userAvatar');

    if (dUser) dUser.innerText = user.user;
    if (dRole) dRole.innerText = user.role;
    if (dAvat) dAvat.innerText = user.user.charAt(0).toUpperCase();

    // Menü Görünürlük Ayarları
    const mgmtLink = document.getElementById('menu-mgmt');
    const logsLink = document.getElementById('menu-logs');
    const reportLink = document.getElementById('menu-report');
    const passLink = document.getElementById('menu-pass');

    const isMT = ['Temsilci', 'MT'].includes(user.role);
    const isIk = ['İK', 'IK'].includes(user.role);
    const isSpv = user.role === 'SPV';

    if (passLink) passLink.style.display = isMT ? 'none' : 'block';
    if (mgmtLink) mgmtLink.style.display = (isIk || isSpv) ? 'block' : 'none';
    if (logsLink) logsLink.style.display = isIk ? 'block' : 'none';
    if (reportLink) reportLink.style.display = isIk ? 'block' : 'none';

    // Önce Görünümü Değiştir, Sonra İçeriği Render Et (Takılmayı Önler)
    switchView('dashboard');
    renderDashboard(user.role);
}

/* === UTILITY FUNCTIONS === */
function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

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



/* === LOGIN/LOGOUT (AUTHENTICATOR 2FA) === */
async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const statusDiv = document.getElementById('login-status');
    const userVal = document.getElementById('username').value;
    const passVal = document.getElementById('password').value;

    statusDiv.innerText = 'Kontrol ediliyor...';
    statusDiv.className = 'status-loading';
    btn.disabled = true;

    const res = await callApi({
        action: 'login',
        user: userVal,
        pass: passVal
    });

    // Durum 1: İlk Kurulum (QR Kod Göster)
    if (res && res.status === '2fa_setup') {
        const qrChartUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(res.qrUrl)}`;

        const { value: otpCode } = await Swal.fire({
            title: '🔐 2FA Kurulumu',
            html: `
                <p style="font-size:0.9rem; color:#666;">Google Authenticator uygulamasından bu kodu taratın:</p>
                <img src="${qrChartUrl}" style="margin:15px 0; border:1px solid #eee; padding:10px; border-radius:10px;">
                <p style="font-size:0.8rem; font-weight:bold; color:#2563eb;">Anahtar: ${res.secret}</p>
                <p style="font-size:0.85rem; margin-top:10px;">Uygulamadaki 6 haneli kodu girerek eşleştirin:</p>
            `,
            input: 'text',
            inputAttributes: { maxlength: 6, style: 'text-align:center; font-size:24px; letter-spacing:5px;' },
            showCancelButton: true,
            confirmButtonText: 'Doğrula ve Bitir',
            allowOutsideClick: false,
            preConfirm: (code) => {
                if (!code || code.length !== 6) { Swal.showValidationMessage('6 haneli kodu girin'); }
                return code;
            }
        });

        if (otpCode) {
            Swal.showLoading();
            const verifyRes = await callApi({
                action: 'verify2fa',
                user: userVal,
                code: otpCode,
                isSetup: true,
                setupSecret: res.secret,
                forceChange: res.forceChange // Bu bilgiyi bir sonraki adıma taşı
            });
            if (verifyRes && verifyRes.status !== 'error') completeLogin(verifyRes);
            else { Swal.fire('Hata', 'Kurulum başarısız, kod hatalı.', 'error'); btn.disabled = false; statusDiv.innerText = ''; }
        } else { btn.disabled = false; statusDiv.innerText = ''; }
        return;
    }

    // Durum 2: Normal Giriş (Kod Sor)
    if (res && res.status === '2fa_required') {
        const { value: otpCode } = await Swal.fire({
            title: '🔐 Güvenlik Kodu',
            text: 'Authenticator uygulamasındaki 6 haneli kodu girin.',
            input: 'text',
            inputAttributes: { maxlength: 6, style: 'text-align:center; font-size:24px; letter-spacing:5px;' },
            showCancelButton: true,
            confirmButtonText: 'Giriş Yap',
            allowOutsideClick: false,
            preConfirm: (code) => {
                if (!code || code.length !== 6) { Swal.showValidationMessage('6 haneli kodu girin'); }
                return code;
            }
        });

        if (otpCode) {
            Swal.showLoading();
            const verifyRes = await callApi({ action: 'verify2fa', user: userVal, code: otpCode, forceChange: res.forceChange });
            if (verifyRes && verifyRes.status !== 'error') completeLogin(verifyRes);
            else { Swal.fire('Hata', 'Hatalı kod!', 'error'); btn.disabled = false; statusDiv.innerText = ''; }
        } else { btn.disabled = false; statusDiv.innerText = ''; }
        return;
    }

    // Durum 3: Başarı
    if (res && res.status === 'success') { completeLogin(res); }
    else {
        statusDiv.innerText = res.message || 'Hatalı giriş!';
        statusDiv.className = 'status-error';
        btn.disabled = false;
    }
}

function completeLogin(userData) {
    const statusDiv = document.getElementById('login-status');
    currentUser = userData;
    localStorage.setItem('site_telekom_user', JSON.stringify(userData));
    statusDiv.innerText = 'Giriş Başarılı!';
    statusDiv.className = 'status-success';

    setTimeout(() => {
        if (userData.forceChange) {
            statusDiv.innerText = '';
            promptChangePassword(true);
            return;
        }
        initDashboardWithUser(userData);
        statusDiv.innerText = '';
    }, 800);
}

function logout() {
    currentUser = null;
    localStorage.removeItem('site_telekom_user');

    // Login formunu temizle ve butonu aktif et
    const loginForm = document.querySelector('#view-login form');
    if (loginForm) {
        loginForm.reset();
        const btn = loginForm.querySelector('button');
        if (btn) btn.disabled = false;
    }
    const statusDiv = document.getElementById('login-status');
    if (statusDiv) {
        statusDiv.innerText = '';
        statusDiv.className = '';
    }

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

async function promptChangePassword(isForced = false) {
    const { value: p1 } = await Swal.fire({
        title: isForced ? '⚠️ Şifrenizi Güncelleyin' : 'Şifre Değiştir',
        text: isForced ? 'Güvenliğiniz için varsayılan şifreyi (1234) değiştirmeniz gerekmektedir.' : '',
        input: 'password',
        placeholder: 'Yeni Şifreniz',
        showCancelButton: !isForced,
        confirmButtonText: 'Güncelle',
        cancelButtonText: 'İptal',
        allowOutsideClick: !isForced,
        allowEscapeKey: !isForced,
        inputValidator: (value) => {
            if (!value || value === '1234') {
                return 'Lütfen 1234 dışında güvenli bir şifre belirleyin!';
            }
        }
    });
    if (p1) {
        const res = await callApi({
            action: 'changePassword',
            newPass: p1
        });
        if (res.status === 'success') {
            Swal.fire('Başarılı', 'Şifreniz güncellendi', 'success');
            if (isForced) logout();
        } else {
            Swal.fire('Hata', res.message || 'Hata oluştu', 'error');
        }
    }
}

/* === DASHBOARD RENDER === */
function renderDashboard(role) {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    const isMT = (role === 'Temsilci' || role === 'MT');
    const typesArray = Array.isArray(window.leaveTypes) ? window.leaveTypes : ['Yıllık İzin'];

    if (isMT) {
        const leaveTypesOptions = typesArray
            .map(type => `<option>${esc(type)}</option>`).join('');

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
                            <label>PROJE</label>
                            <input type="text" id="sicil" value="${esc(currentUser.project)}" readonly style="background:#f9fafb; cursor:not-allowed;">
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

        setTimeout(() => {
            const savedFullname = localStorage.getItem('mtd_fullname');
            const savedSicil = localStorage.getItem('mtd_sicil');
            if (savedFullname) document.getElementById('fullname').value = savedFullname;
            if (savedSicil) document.getElementById('sicil').value = savedSicil;
        }, 100);

        return; // CRITICAL: MT görünümünden sonra yönetici görünümüne geçme!
    }


    const leaveTypesOptions = typesArray
        .map(type => `<option>${esc(type)}</option>`).join('');

    const monthOptions = getMonthOptions()
        .map(m => `<option value="${m.val}">${m.label}</option>`).join('');

    container.innerHTML = `
        <div class="panel-info">🛡️ <strong>${esc(role)} Paneli</strong> - Ekibinizin izin taleplerini yönetin</div>
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

/* === USER MANAGEMENT === */
window.openUserMgmtModal = function () {
    const isIk = ['İK', 'IK'].includes(currentUser.role);
    const isSpv = currentUser.role === 'SPV';

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
            <div class="form-group">
                <label>E-Posta (2FA İçin)</label>
                <input type="email" id="new-u-email" class="swal2-input" placeholder="ornek@mail.com">
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
                <div class="form-group">
                    <label>Güvenlik (2FA)</label>
                    <select id="new-u-2fa" class="swal2-input">
                        <option value="PASİF">🔴 Kapalı (Sadece Şifre)</option>
                        <option value="AKTİF">🟢 Açık (Authenticator Kod)</option>
                    </select>
                </div>
            ` : `
                <div class="alert-info">ℹ️ Sadece kendi grubunuza TL ekleyebilirsiniz.</div>
            `}
            <button class="btn-primary" onclick="submitAddUser()" style="margin-top:20px;">Ekle (İlk Şifre: 1234)</button>
        </div>
        <div id="mgmt-tab-list" class="mgmt-tab-content hidden">
            <div id="user-list-container">Yükleniyor...</div>
        </div>
    `;

    Swal.fire({
        title: 'Kullanıcı Yönetimi',
        html: html,
        width: 700,
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: () => {
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
    container.innerHTML = 'Yükleniyor...';

    const res = await callApi({ action: 'getUserList' });
    const users = res;

    if (!users || users.length === 0) {
        container.innerHTML = 'Kullanıcı bulunamadı';
        return;
    }

    const isIk = ['İK', 'IK'].includes(currentUser.role);

    let table = `
        <table style="width:100%; border-collapse: collapse;">
            <thead style="background:#f8f9fa;">
                <tr>
                    <th style="padding:10px;">Kullanıcı</th>
                    <th style="padding:10px;">Rol</th>
                    <th style="padding:10px;">Proje</th>
                    <th style="padding:10px;">2FA</th>
                    <th style="padding:10px;">İşlem</th>
                </tr>
            </thead>
            <tbody>
    `;

    users.forEach(u => {
        table += `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:10px;">${esc(u.user)}</td>
                <td style="padding:10px;">${esc(u.role)}</td>
                <td style="padding:10px;">${esc(u.project)}</td>
                <td style="padding:10px;">
                    <span style="color: ${u.twoFactor === 'AKTİF' ? '#059669' : '#dc2626'}; font-weight:bold; font-size:0.75rem;">
                        ${u.twoFactor === 'AKTİF' ? 'AÇIK' : 'KAPALI'}
                    </span>
                </td>
                <td style="padding:10px;">
                    <button onclick="resetPass('${esc(u.user)}')" title="Şifre Sıfırla" class="action-btn" style="background:#f59e0b; width:auto; padding:5px 10px;">🔑</button>
                    ${isIk ? `
                        <button onclick="toggle2faStatus('${esc(u.user)}', '${u.twoFactor === 'AKTİF' ? 'PASİF' : 'AKTİF'}')" title="2FA Değiştir" class="action-btn" style="background:#6366f1; width:auto; padding:5px 10px; margin-left:5px;">🛡️</button>
                        <button onclick="delUser('${esc(u.user)}')" title="Kullanıcı Sil" class="action-btn reject" style="width:auto; padding:5px 10px; margin-left:5px;">🗑️</button>
                    ` : ''}
                </td>
            </tr>
        `;
    });
    table += '</tbody></table>';
    container.innerHTML = table;
}

window.submitAddUser = async function () {
    const u = document.getElementById('new-u-name').value.trim();
    const r = document.getElementById('new-u-role')?.value || 'TL';
    const p = document.getElementById('new-u-proj')?.value.trim() || '';

    if (!u) { Swal.showValidationMessage('Kullanıcı adı gerekli'); return; }

    Swal.showLoading();
    const res = await callApi({
        action: 'addUser',
        newUser: u,
        newRole: r,
        newProject: p,
        new2fa: document.getElementById('new-u-2fa')?.value || 'PASİF'
    });

    if (res.status === 'success') Swal.fire('Başarılı', 'Kullanıcı eklendi', 'success');
    else Swal.fire('Hata', res.message || 'Hata oluştu', 'error');
}

window.resetPass = async function (targetUser) {
    const confirm = await Swal.fire({
        title: 'Emin misiniz?',
        text: `${targetUser} şifresi 1234 olacak.`,
        icon: 'warning',
        showCancelButton: true
    });
    if (!confirm.isConfirmed) return;
    Swal.showLoading();
    await callApi({ action: 'resetPass', targetUser });
    Swal.fire('Başarılı', 'Sıfırlandı', 'success');
}

window.delUser = async function (targetUser) {
    const confirm = await Swal.fire({
        title: 'Silme İşlemi',
        text: `${targetUser} siliniyor!`,
        icon: 'error',
        showCancelButton: true
    });
    if (!confirm.isConfirmed) return;
    Swal.showLoading();
    await callApi({ action: 'deleteUser', targetUser });
    Swal.fire('Silindi', 'Kullanıcı silindi', 'success');
    loadUserListInternal();
}

window.toggle2faStatus = async function (targetUser, newStatus) {
    const confirm = await Swal.fire({
        title: 'Güvenlik Güncelleme',
        text: `${targetUser} için 2FA ${newStatus === 'AKTİF' ? 'etkinleştirilecek' : 'devre dışı bırakılacak'}.`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Evet, Değiştir',
        cancelButtonText: 'İptal'
    });
    if (!confirm.isConfirmed) return;

    Swal.showLoading();
    const res = await callApi({ action: 'toggle2fa', targetUser, newStatus });
    if (res.status === 'success') {
        Swal.fire('Başarılı', `2FA ${newStatus === 'AKTİF' ? 'Açıldı' : 'Kapatıldı'}`, 'success');
        loadUserListInternal();
    } else {
        Swal.fire('Hata', res.message || 'İşlem başarısız', 'error');
    }
}

/* === REQUESTS MANAGEMENT === */
async function loadAdminRequests() {
    allAdminRequests = await callApi({ action: 'getRequests' });
    if (allAdminRequests && Array.isArray(allAdminRequests)) {
        allAdminRequests.forEach(r => r._dateObj = new Date(r.start));
        allAdminRequests.sort((a, b) => b._dateObj - a._dateObj);
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
            } else if (fStatus !== r.status) return false;
        }
        return true;
    });
    currentPage = 1;
    renderPage(1);
}

function getStatusBadge(s) {
    const badges = {
        'tl_bekliyor': '<span class="status st-bekliyor">⏳ TL Bekliyor</span>',
        'spv_bekliyor': '<span class="status st-bekliyor">⏳ SPV Bekliyor</span>',
        'ik_bekliyor': '<span class="status st-bekliyor">⏳ İK Bekliyor</span>',
        'onaylandi': '<span class="status st-onaylandi">✅ Onaylandı</span>',
        'red': '<span class="status st-red">❌ Reddedildi</span>'
    };
    return badges[s] || s;
}

function getDetailedRejectionInfo(r) {
    if (r.ik && r.ik.includes('Reddedildi')) return { rejecter: 'İK', reason: r.ik.split(': ')[1] || '-' };
    if (r.spv && r.spv.includes('Reddedildi')) return { rejecter: 'SPV', reason: r.spv.split(': ')[1] || '-' };
    if (r.tl && r.tl.includes('Reddedildi')) return { rejecter: 'TL', reason: r.tl.split(': ')[1] || '-' };
    return { rejecter: 'Bilinmiyor', reason: '-' };
}

function calculateDays(start, end) {
    const s = new Date(start); const e = new Date(end);
    const diff = Math.abs(e - s);
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
}

function renderPage(page) {
    const tbody = document.querySelector('#admin-table tbody');
    if (!tbody) return;

    if (!filteredRequests || filteredRequests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:#999;">Kayıt bulunamadı</td></tr>';
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
            (['İK', 'IK'].includes(currentUser.role) && r.status === 'ik_bekliyor')
        );

        if (canApprove) {
            actionHtml = `
                <button class="action-btn approve" onclick="window.processRequest('${r.id}', 'Onaylandı')">✔</button>
                <button class="action-btn reject" onclick="window.processRequest('${r.id}', 'Reddedildi')">✖</button>
            `;
        } else {
            if (r.status === 'onaylandi') actionHtml = getStatusBadge(r.status);
            else if (r.status === 'red') {
                const ri = getDetailedRejectionInfo(r);
                actionHtml = `<span class="status st-red">❌ Reddedildi</span><br><small><b>${esc(ri.rejecter)}</b>: ${esc(ri.reason)}</small>`;
            } else actionHtml = getStatusBadge(r.status);
        }

        const reasonHtml = r.reason
            ? `<div style="color:#495057; margin-top:6px; font-size:0.85rem;">📝 ${esc(r.reason)}</div>`
            : '<div style="color:#adb5bd; margin-top:6px; font-size:0.85rem; font-style:italic;">Gerekçe yok</div>';

        return `
            <tr>
                <td><b>${esc(r.fullName || r.requester)}</b><br><span class="badge-project">${esc(r.project)}</span></td>
                <td>
                    <div style="font-weight:600;">${new Date(r.start).toLocaleDateString('tr-TR')} - ${new Date(r.end).toLocaleDateString('tr-TR')} <span class="badge-days">${calculateDays(r.start, r.end)} gün</span></div>
                    ${reasonHtml}
                </td>
                <td><b>${esc(r.type)}</b></td>
                <td>${actionHtml}</td>
            </tr>
        `;
    }).join('');

    const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
    document.getElementById('page-info').innerText = `Sayfa ${page} / ${totalPages}`;
}

window.changePage = function (dir) {
    const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
    const newPage = currentPage + dir;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderPage(currentPage);
    }
}

window.processRequest = async function (id, decision) {
    let reason = '';
    if (decision === 'Reddedildi') {
        const { value: text } = await Swal.fire({
            title: 'Red Nedeni',
            input: 'textarea',
            inputPlaceholder: 'Neden reddediyorsunuz?',
            required: true
        });
        if (!text) return;
        reason = text;
    }

    Swal.showLoading();
    const res = await callApi({ action: 'updateStatus', id, decision, reason });
    if (res.status === 'success') {
        Swal.fire('Başarılı', 'İşlem tamamlandı', 'success');
        loadAdminRequests();
    } else {
        Swal.fire('Hata', res.message || 'Hata oluştu', 'error');
    }
}

window.searchMyHistory = async function () {
    const fn = document.getElementById('search-fullname').value.trim();
    const sn = document.getElementById('search-sicil').value.trim();
    if (!fn && !sn) { Swal.fire('Uyarı', 'Lütfen isim veya sicil girin', 'warning'); return; }

    // Geçici olarak kaydet (UX için)
    localStorage.setItem('mtd_fullname', fn);
    localStorage.setItem('mtd_sicil', sn);

    const tbody = document.querySelector('#rep-table tbody');
    tbody.innerHTML = ' SORGULANIYOR...';

    const res = await callApi({ action: 'getRequests' });
    if (!res || !Array.isArray(res)) { tbody.innerHTML = 'Kayıt bulunamadı.'; return; }

    const filtered = res.filter(r => {
        const matchName = fn ? r.fullName.toLocaleLowerCase('tr-TR').includes(fn.toLocaleLowerCase('tr-TR')) : true;
        const matchSicil = sn ? r.sicil === sn : true;
        return matchName && matchSicil;
    });

    if (filtered.length === 0) { tbody.innerHTML = 'Kayıt bulunamadı.'; return; }

    tbody.innerHTML = filtered.map(r => {
        let statusHtml = r.status === 'red'
            ? `<span class="status st-red">❌ Red</span><br><small>${esc(getDetailedRejectionInfo(r).reason)}</small>`
            : getStatusBadge(r.status);

        return `<tr>
            <td>${new Date(r.start).toLocaleDateString('tr-TR')} - ${new Date(r.end).toLocaleDateString('tr-TR')}</td>
            <td><b>${esc(r.type)}</b></td>
            <td>${esc(r.reason || '-')}</td>
            <td>${statusHtml}</td>
        </tr>`;
    }).join('');
}

async function submitRequest(e) {
    e.preventDefault();
    const formData = {
        fullName: document.getElementById('fullname').value,
        project: document.getElementById('sicil').value, // 'sicil' id'li kutuda artık Proje yazıyor
        type: document.getElementById('type').value,
        start: document.getElementById('start').value,
        end: document.getElementById('end').value,
        reason: document.getElementById('reason').value
    };

    localStorage.setItem('mtd_fullname', formData.fullName);

    Swal.showLoading();
    const res = await callApi({ action: 'submitRequest', formData });

    if (res.status === 'success') {
        Swal.fire('Başarılı', 'Talebiniz iletildi', 'success');
        document.getElementById('reason').value = '';
        document.getElementById('start').value = '';
        document.getElementById('end').value = '';
        // Taleplerim sekmesini göster ve orayı yenile (eğer varsa fonksiyona bağla)
        if (typeof searchMyHistory === 'function') searchMyHistory();
    } else {
        Swal.fire('Hata', res.message || 'Gönderilemedi', 'error');
    }
}

/* === API CALL (IP & KONUM TAKİPLİ) === */
// IP Bilgisini Alma (Pending durumunu yöneten güvenli yapı)
let ipFetchPromise = null;
async function getClientInfo() {
    if (window.cachedClientInfo) return window.cachedClientInfo;
    if (ipFetchPromise) return ipFetchPromise;

    ipFetchPromise = (async () => {
        try {
            const res = await fetch('https://ip-api.com/json/', { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            if (data && data.status === 'success') {
                window.cachedClientInfo = `${data.query} [${data.city}, ${data.regionName}]`;
            } else {
                window.cachedClientInfo = window.location.hostname;
            }
        } catch (e) {
            window.cachedClientInfo = window.location.hostname;
        }
        return window.cachedClientInfo;
    })();
    return ipFetchPromise;
}

async function callApi(body = {}) {
    if (currentUser && currentUser.token && !body.token) body.token = currentUser.token;

    // IP Bilgisini hazır olana kadar bekle (ilk girişte önemlidir)
    body.clientInfo = await getClientInfo();

    const options = {
        method: 'POST',
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body)
    };

    try {
        const res = await fetch(API_URL, options);
        const json = await res.json();
        if (json.status === 'error' && json.message && json.message.includes('token')) {
            logout();
            Swal.fire('Oturum Kapandı', 'Lütfen tekrar giriş yapın.', 'info');
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
};

/* === SİSTEM LOGLARI (DETAYLI) === */
window.openSystemLogs = async function () {
    Swal.fire({ title: 'Sistem Logları', html: '⏳ Yükleniyor...', width: 1000, showConfirmButton: false, showCloseButton: true });
    const res = await callApi({ action: 'getLogs' });
    if (res.status === 'error' || !Array.isArray(res)) { Swal.update({ html: 'Loglar alınamadı.' }); return; }

    let tableHtml = `
        <div style="max-height:500px; overflow:auto; text-align:left;">
            <table style="width:100%; border-collapse:collapse; font-size:0.75rem;">
                <thead style="background:#f8f9fa; position:sticky; top:0;">
                    <tr><th>Tarih</th><th>Kullanıcı</th><th>Rol</th><th>Proje</th><th>İşlem</th><th>Detay</th><th>Domain/IP</th></tr>
                </thead>
                <tbody>
    `;
    res.forEach(log => {
        tableHtml += `
            <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:8px; white-space:nowrap;">${log.time}</td>
                <td style="padding:8px;"><b>${esc(log.user)}</b></td>
                <td style="padding:8px;">${esc(log.role)}</td>
                <td style="padding:8px;">${esc(log.project)}</td>
                <td style="padding:8px;">${esc(log.type)}</td>
                <td style="padding:8px; color:#666;">${esc(log.detail)}</td>
                <td style="padding:8px; font-family:monospace; color:#2563eb;">${esc(log.domain)}</td>
            </tr>
        `;
    });
    tableHtml += '</tbody></table></div>';
    Swal.update({ html: tableHtml });
}
