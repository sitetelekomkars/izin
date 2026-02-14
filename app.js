/* 
  app.js (Ultra Güvenli & Token Tabanlı Frontend)
*/
const API_URL = 'https://script.google.com/macros/s/AKfycbzBwT_kStscadwaqL9tFeC03Z2_h94J_hWk3bf7ktxXFMTW3xxFMwuOtRimSgx9PYh9Xw/exec';

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

    // Uygulama modunda değilse ve Android ise bizim özel banner'ı göster
    if (!isInStandaloneMode()) {
        const androidPrompt = document.getElementById('android-prompt');
        if (androidPrompt) androidPrompt.style.display = 'flex';
    }
});

function closeAndroidPrompt() {
    const androidPrompt = document.getElementById('android-prompt');
    if (androidPrompt) androidPrompt.style.display = 'none';
}

// Android butonu tıklandığında gerçek yükleme penceresini aç
document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-install-android' && deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            }
            deferredPrompt = null;
            closeAndroidPrompt();
        });
    }
});

function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isInStandaloneMode() {
    return (window.matchMedia('(display-mode: standalone)').matches) ||
        (window.navigator.standalone === true);
}

function checkPwaPrompts() {
    // Eğer zaten uygulama olarak açılmışsa hiçbir şey gösterme
    if (isInStandaloneMode()) return;

    // iOS Rehberi (Safari)
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
let filteredRequests = [];
let allAdminRequests = [];
let currentPage = 1;
const itemsPerPage = 10;

/* === RBAC GLOBALS === */
window.rolePermissions = {}; // { 'role': { 'resource': true/false } }
window.permissionResources = [
    { key: 'admin_panel', label: 'Admin Paneli' },
    { key: 'export_excel', label: 'Excel Rapor' },
    { key: 'view_logs', label: 'Sistem Logları' },
    { key: 'tab_requests', label: 'Tab: Talep Yönetimi' },
    { key: 'tab_new_request', label: 'Tab: İzin Talebi' },
    { key: 'tab_history', label: 'Tab: Geçmişim' },
    { key: 'user_add', label: 'Personel: Ekleme' },
    { key: 'user_list', label: 'Personel: Listeleme' },
    { key: 'manage_users', label: 'Personel Yönetimi (Menü)' }
];

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
    // SECURITY: Using sessionStorage instead of localStorage
    const savedUser = sessionStorage.getItem('site_telekom_user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            initDashboardWithUser(currentUser);
        } catch (e) {
            sessionStorage.removeItem('site_telekom_user');
        }
    }
});

function initDashboardWithUser(user) {
    if (!user) return;

    // UI Elemanlarını Güncelle
    const dUser = document.getElementById('displayUsername');
    const dRole = document.getElementById('displayRole');
    const dAvat = document.getElementById('userAvatar');

    const displayName = user.fullName || user.user;
    if (dUser) dUser.innerText = displayName;
    if (dRole) dRole.innerText = user.role;
    if (dAvat) dAvat.innerText = displayName.charAt(0).toUpperCase();

    // Menü Görünürlük Ayarları
    const uRole = normalizeText(user.role);
    const isAdmin = uRole === 'admin';
    const isIk = uRole.includes('ik');
    const isSup = uRole === 'spv' || uRole === 'tl';
    const isDanisma = uRole.includes('danı') || uRole.includes('danis');

    const mgmtLink = document.getElementById('menu-mgmt');
    const logsLink = document.getElementById('menu-logs');
    const reportLink = document.getElementById('menu-report');
    const passLink = document.getElementById('menu-pass');

    if (passLink) passLink.style.display = 'block';
    if (mgmtLink) mgmtLink.style.display = (isIk || isSup || isDanisma || isAdmin) ? 'block' : 'none';
    if (logsLink) logsLink.style.display = (isIk || isAdmin) ? 'block' : 'none';
    if (reportLink) reportLink.style.display = (isIk || isAdmin) ? 'block' : 'none';

    switchView('dashboard');
    renderDashboard(user.role);

    // RBAC: Update menu visibility based on permissions
    const role = (user.role || '').toUpperCase();

    // Admin Panel Linki
    const btnAdmin = document.getElementById('btn-admin-panel');
    if (btnAdmin) {
        // Admin or Has Permission
        if (role === 'ADMIN' || checkPermission('admin_panel')) {
            btnAdmin.classList.remove('hidden');
        } else {
            btnAdmin.classList.add('hidden');
        }
    }

    // Dropdown Menu Items
    if (role === 'ADMIN' || (['İK', 'IK'].includes(uRole))) {
        if (checkPermission('view_logs')) document.getElementById('menu-logs').style.display = 'block';
        if (checkPermission('manage_users')) document.getElementById('menu-mgmt').style.display = 'block';
    }

    if (role === 'ADMIN' || uRole.includes('ik')) {
        if (checkPermission('export_excel')) document.getElementById('menu-report').style.display = 'block';
    }

    // RBAC Button (Admin Only)
    // Fix: Using uRole (normalized) to be sure
    if (uRole === 'admin') {
        const btnRbac = document.getElementById('menu-rbac');
        if (btnRbac) btnRbac.style.display = 'block';
    }

    loadLeaveTypes();
    // Load Permissions in background if not loaded
    loadRolePermissions();
}

// === UTILITY FUNCTIONS === */
function normalizeText(t) {
    if (!t) return "";
    return String(t)
        .replace(/İ/g, 'i')
        .replace(/I/g, 'i')
        .replace(/ı/g, 'i')
        .replace(/Ş/g, 's')
        .replace(/ş/g, 's')
        .replace(/Ğ/g, 'g')
        .replace(/ğ/g, 'g')
        .replace(/Ç/g, 'c')
        .replace(/ç/g, 'c')
        .replace(/Ö/g, 'o')
        .replace(/ö/g, 'o')
        .replace(/Ü/g, 'u')
        .replace(/ü/g, 'u')
        .toLowerCase()
        .trim();
}

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
    sessionStorage.setItem('site_telekom_user', JSON.stringify(userData));
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
    sessionStorage.removeItem('site_telekom_user');

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

// Scoped click handler for dropdown
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.user-menu-container')) {
            const dropdowns = document.querySelectorAll('.dropdown-content.show');
            dropdowns.forEach(d => d.classList.remove('show'));
        }
    });
});

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

    const uRole = normalizeText(role);
    const isIk = uRole.includes('ik');
    const isSup = uRole === 'spv' || uRole === 'tl';
    const isDanisma = uRole.includes('danı') || uRole.includes('danis');
    const typesArray = Array.isArray(window.leaveTypes) ? window.leaveTypes : ['Yıllık İzin'];
    const leaveTypesOptions = typesArray.map(type => `<option>${esc(type)}</option>`).join('');
    const monthOptions = getMonthOptions().map(m => `<option value="${m.val}">${m.label}</option>`).join('');

    const isAdmin = uRole === 'admin';
    const isManager = isAdmin || isIk || isSup || isDanisma;

    // Herkes (İK hariç) talep oluşturabilir
    let html = `
        <div class="panel-info">👋 <strong>Hoş Geldin!</strong> Sistemi buradan yönetebilirsin.</div>
        <div class="tabs">
            ${isManager && checkPermission('tab_requests') ? `<button class="tab-btn active" onclick="showTab('admin-panel', this)">Talep Yönetimi</button>` : ''}
            ${!isIk && checkPermission('tab_new_request') ? `<button class="tab-btn ${!isManager ? 'active' : ''}" onclick="showTab('new-req', this)">İzin Talebi</button>` : ''}
            ${!isIk && checkPermission('tab_history') ? `<button class="tab-btn" onclick="showTab('my-req', this)">Geçmişim</button>` : ''}
        </div>

        <!-- YÖNETİM PANELİ -->
        ${isManager ? `
        <div id="tab-admin-panel" class="tab-content">
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
                        <th>EVRAK</th>
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
        </div>
        ` : ''}

        <!-- TALEP FORMU -->
        ${!isIk ? `
        <div id="tab-new-req" class="tab-content ${isManager ? 'hidden' : ''}">
            <form onsubmit="submitRequest(event)" autocomplete="off">
                 <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="form-group">
                        <label>AD SOYAD</label>
                        <input type="text" id="fullname" value="${esc(currentUser.fullName || '')}" readonly style="background:#f3f4f6; cursor:not-allowed;" required>
                    </div>
                    <div class="form-group">
                        <label>PROJE</label>
                        <input type="text" id="sicil" value="${esc(currentUser.project)}" readonly style="background:#f3f4f6; cursor:not-allowed;">
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

        <div id="tab-my-req" class="tab-content hidden">
            <div style="background:white; padding:20px; border-radius:12px; margin-bottom:20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <div style="display:grid; grid-template-columns: 1fr auto; gap:15px; align-items:end;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.8rem; color:#6c757d;">PERSONEL AD SOYAD</label>
                        <input type="text" id="search-fullname" value="${esc(currentUser.fullName || '')}" readonly style="background:#f3f4f6;">
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
                        👆 Sorgula butonuna basarak geçmiş kayıtlarınızı görüntüleyin
                    </td></tr>
                </tbody>
            </table>
        </div>
        ` : ''}
    `;

    container.innerHTML = html;

    if (isManager) {
        loadAdminRequests();
    }
}

/* === USER MANAGEMENT === */
window.openUserMgmtModal = function () {
    const role = currentUser.role;
    const isIk = ['İK', 'IK'].includes(role);
    const isSup = ['SPV', 'TL'].includes(role);

    let html = `
        <div class="mgmt-tabs">
            ${isIk && checkPermission('user_add') ? `<button class="mgmt-tab-btn active" data-mgmt-tab="add" onclick="switchMgmtTab('add', event)">➕ Kullanıcı Ekle</button>` : ''}
            ${checkPermission('user_list') ? `<button class="mgmt-tab-btn ${!isIk ? 'active' : ''}" data-mgmt-tab="list" onclick="switchMgmtTab('list', event)">📋 Kullanıcı Listesi</button>` : ''}
        </div>
        ${isIk ? `
        <div id="mgmt-tab-add" class="mgmt-tab-content">
            <div class="form-group">
                <label>Kullanıcı Adı (TC Son 6)</label>
                <input type="text" id="new-u-name" class="swal2-input" placeholder="Örn: 123456">
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
                    <label>PERSONEL AD SOYAD</label>
                    <input type="text" id="new-u-fullname" class="swal2-input" placeholder="Ad Soyad">
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
        ` : ''}
        <div id="mgmt-tab-list" class="mgmt-tab-content ${!isIk ? '' : 'hidden'}">
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
            const listBtn = document.querySelector('[data-mgmt-tab="list"]');
            if (listBtn) listBtn.addEventListener('click', loadUserListInternal);
        }
    });
}

window.switchMgmtTab = function (tab, e) {
    document.querySelectorAll('.mgmt-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mgmt-tab-content').forEach(c => c.classList.add('hidden'));
    const targetBtn = (e && e.target) ? e.target : document.querySelector(`[data-mgmt-tab="${tab}"]`);
    if (targetBtn) targetBtn.classList.add('active');
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
                    <th style="padding:10px;">AD SOYAD</th>
                    <th style="padding:10px;">TC / KULLANICI</th>
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
                <td style="padding:10px;"><strong>${esc(u.fullName || '-')}</strong></td>
                <td style="padding:10px; font-size:0.85rem; color:#666;">${esc(u.user)}</td>
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
                        <button onclick="editUserDetails('${esc(u.user)}', '${esc(u.role)}', '${esc(u.project)}')" title="Rol/Proje Düzenle" class="action-btn" style="background:#10b981; width:auto; padding:5px 10px; margin-left:5px;">✏️</button>
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

window.editUserDetails = async function (targetUser, oldRole, oldProj) {
    const { value: formValues } = await Swal.fire({
        title: 'Kullanıcı Düzenle',
        html:
            `<label>Rol:</label><input id="edit-role" class="swal2-input" value="${oldRole}">` +
            `<label>Proje:</label><input id="edit-proj" class="swal2-input" value="${oldProj}">`,
        focusConfirm: false,
        showCancelButton: true,
        preConfirm: () => {
            return {
                newRole: document.getElementById('edit-role').value,
                newProject: document.getElementById('edit-proj').value
            }
        }
    });

    if (formValues) {
        Swal.showLoading();
        const res = await callApi({
            action: 'updateUserDetails',
            targetUser: targetUser,
            newRole: formValues.newRole,
            newProject: formValues.newProject
        });

        if (res.status === 'success') {
            Swal.fire('Başarılı', 'Kullanıcı güncellendi', 'success');
            loadUserListInternal();
        } else {
            Swal.fire('Hata', res.message || 'Yetkiniz olmayabilir', 'error');
        }
    }
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

function getStatusBadge(status) {
    const s = status ? status.toLowerCase() : '';
    if (s === 'onaylandi' || s === 'onaylandı') return '<span class="status st-green">✅ Onaylandı</span>';
    if (s === 'red' || s === 'reddedildi') return '<span class="status st-red">❌ Reddedildi</span>';
    if (s === 'spv_bekliyor') return '<span class="status st-orange">⏳ SPV Onayı Bekliyor</span>';
    if (s === 'ik_bekliyor') return '<span class="status st-orange">⏳ İK Onayı Bekliyor</span>';
    return '<span class="status st-gray">⏳ Bekliyor</span>';
}

function getDocStatusClass(status) {
    if (status === 'İmzalandı') return 'success';
    if (status === 'İmzalanmadı') return 'danger';
    return 'warning';
}

function getDetailedRejectionInfo(r) {
    // r.tl, r.spv, r.ik içinden Reddedildi yazanları bulalım
    if (String(r.tl).includes('Reddedildi')) return { from: 'TL', reason: String(r.tl).split(': ')[1] || 'Belirtilmedi' };
    if (String(r.spv).includes('Reddedildi')) return { from: 'SPV', reason: String(r.spv).split(': ')[1] || 'Belirtilmedi' };
    if (String(r.ik).includes('Reddedildi')) return { from: 'İK', reason: String(r.ik).split(': ')[1] || 'Belirtilmedi' };
    return { from: '-', reason: '-' };
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:#999;">Kayıt bulunamadı</td></tr>';
        document.getElementById('page-info').innerText = '-';
        return;
    }

    const start = (page - 1) * itemsPerPage;
    const pageData = filteredRequests.slice(start, start + itemsPerPage);

    tbody.innerHTML = pageData.map(r => {
        let actionHtml = '';
        const role = (currentUser.role || '').toUpperCase();
        const s = r.status;

        if (checkPermission('approve_reject')) {
            if (s === 'tl_bekliyor' && role === 'TL') {
                actionHtml = `
                    <div class="action-btns">
                        <button class="action-btn approve" onclick="processRequest('${r.id}','Onaylandı')">✔️ Onayla</button>
                        <button class="action-btn reject" onclick="processRequest('${r.id}','Reddedildi')">✖️ Reddet</button>
                    </div>`;
            } else if (s === 'spv_bekliyor' && role === 'SPV') {
                actionHtml = `
                    <div class="action-btns">
                        <button class="action-btn approve" onclick="processRequest('${r.id}','Onaylandı')">✔️ Onayla</button>
                        <button class="action-btn reject" onclick="processRequest('${r.id}','Reddedildi')">✖️ Reddet</button>
                    </div>`;
            } else if (s === 'ik_bekliyor' && (role === 'İK' || role === 'IK')) {
                actionHtml = `
                    <div class="action-btns">
                        <button class="action-btn approve" onclick="processRequest('${r.id}','Onaylandı')">✔️ Onayla</button>
                        <button class="action-btn reject" onclick="processRequest('${r.id}','Reddedildi')">✖️ Reddet</button>
                    </div>`;
            } else {
                if (s === 'red') {
                    const ri = getDetailedRejectionInfo(r);
                    actionHtml = `<span class="status st-red">❌ Red (${ri.from}): ${esc(ri.reason)}</span>`;
                } else {
                    actionHtml = getStatusBadge(s);
                }
            }
        } else {
            // If no approve_reject permission, just show status
            if (s === 'red') {
                const ri = getDetailedRejectionInfo(r);
                actionHtml = `<span class="status st-red">❌ Red (${ri.from}): ${esc(ri.reason)}</span>`;
            } else {
                actionHtml = getStatusBadge(s);
            }
        }


        let docAction = '';
        const uRole = (role || "").toLowerCase();
        const isAdmin = uRole === 'admin';
        const isDanisma = uRole.includes('danı') || uRole.includes('danis');

        if ((isDanisma || isAdmin) && r.ik === 'Onaylandı') {
            docAction = `
                <select class="doc-status-select" onchange="updateDocumentStatus('${r.id}', this.value)">
                    <option value="Bekliyor" ${r.documentStatus === 'Bekliyor' ? 'selected' : ''}>⏳ Bekliyor</option>
                    <option value="İmzalandı" ${r.documentStatus === 'İmzalandı' ? 'selected' : ''}>✔️ İmzalandı</option>
                    <option value="İmzalanmadı" ${r.documentStatus === 'İmzalanmadı' ? 'selected' : ''}>✖️ İmzalanmadı</option>
                </select>`;
        } else {
            const docClass = getDocStatusClass(r.documentStatus);
            docAction = `<span class="badge-doc badge-doc-${docClass}">${esc(r.documentStatus || 'Bekliyor')}</span>`;
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
                <td>${docAction}</td>
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

window.updateDocumentStatus = async function (id, status) {
    Swal.showLoading();
    const res = await callApi({ action: 'updateDocumentStatus', id, status });
    if (res.status === 'success') {
        Swal.fire({
            icon: 'success',
            title: 'Güncellendi',
            text: 'Evrak durumu başarıyla kaydedildi.',
            timer: 1500,
            showConfirmButton: false
        });
        loadAdminRequests();
    } else {
        Swal.fire('Hata', res.message || 'Hata oluştu', 'error');
    }
}

window.searchMyHistory = async function () {
    const fn = (document.getElementById('search-fullname')?.value || '').trim();
    const sn = (document.getElementById('search-project')?.value || '').trim();

    // MT/Temsilci rolü kontrolü
    const isMT = currentUser && (currentUser.role === 'MT' || currentUser.role === 'Temsilci');

    // Eğer MT değilse ve isim/sicil yazılmamışsa uyarı ver
    // (Project alanı HTML'de 'sicil' id'si ile kalmış olabilir, ama logic'i project olarak güncelliyoruz)
    if (!isMT && !fn && !sn) {
        Swal.fire('Uyarı', 'Lütfen personel adı veya proje girerek sorgulama yapın.', 'warning');
        return;
    }

    // Geçici olarak kaydet (UX için)
    localStorage.setItem('mtd_fullname', fn);
    localStorage.setItem('mtd_project', sn);

    const tbody = document.querySelector('#rep-table tbody');
    tbody.innerHTML = ' SORGULANIYOR...';

    const res = await callApi({ action: 'getRequests' });
    if (!res || !Array.isArray(res)) { tbody.innerHTML = 'Kayıt bulunamadı.'; return; }

    const filtered = res.filter(r => {
        const matchName = fn ? r.fullName.toLocaleLowerCase('tr-TR').includes(fn.toLocaleLowerCase('tr-TR')) : true;
        const matchProject = sn ? r.project === sn : true;
        return matchName && matchProject;
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

    // STATUS FLOW LOGIC (TL requests go to SPV, others to IK)
    let initialStatus = "tl_bekliyor";
    if (currentUser.role === 'TL') initialStatus = "spv_bekliyor";
    else if (['SPV', 'Danışma', 'İK', 'IK'].includes(currentUser.role)) initialStatus = "ik_bekliyor";
    else if (['KALİTE', 'BİLGİ İŞLEM', 'DESTEK', 'EĞİTMEN'].includes((currentUser.role || "").toUpperCase())) initialStatus = "tl_bekliyor";

    const res = await callApi({ action: 'submitRequest', formData, initialStatus });

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

async function callApi(body = {}, retries = 2) {
    if (currentUser && currentUser.token && !body.token) body.token = currentUser.token;

    // SECURITY: Check token expiration
    if (currentUser && currentUser.tokenExpiry && Date.now() > currentUser.tokenExpiry) {
        logout();
        showError('Oturumunuz sona erdi. Lütfen tekrar giriş yapın.');
        return { status: 'error', message: 'Token expired' };
    }

    body.clientInfo = await getClientInfo();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const options = {
        method: 'POST',
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
        signal: controller.signal
    };

    try {
        const res = await fetch(API_URL, options);
        clearTimeout(timeoutId);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const json = await res.json();

        if (json.status === 'error' && json.message && json.message.includes('token')) {
            logout();
            showError('Oturumunuz sona erdi. Lütfen tekrar giriş yapın.');
        }

        return json;
    } catch (e) {
        clearTimeout(timeoutId);

        // Retry on network errors
        if (retries > 0 && (e.name === 'AbortError' || e.message.includes('Failed to fetch'))) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return callApi(body, retries - 1);
        }

        let errorMsg = 'Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin.';
        if (e.name === 'AbortError') {
            errorMsg = 'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.';
        } else if (e.message.includes('HTTP')) {
            errorMsg = 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.';
        }

        showError(errorMsg);
        return { status: 'error', message: errorMsg };
    }
}

function showError(message) {
    Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: message,
        confirmButtonText: 'Tamam'
    });
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

    // Tüm olası sekmeleri gizle
    const tabs = ['new-req', 'my-req', 'admin-panel'];
    tabs.forEach(t => {
        const el = document.getElementById('tab-' + t);
        if (el) el.classList.add('hidden');
    });

    // İstenen sekmeyi göster
    const target = document.getElementById('tab-' + id);
    if (target) target.classList.remove('hidden');

    // MT Geçmişim sekmesine tıkladığında otomatik sorgula
    if (id === 'my-req') {
        const input = document.getElementById('search-fullname');
        if (input && input.value) {
            searchMyHistory();
        }
    }
}

/* === SİSTEM LOGLARI (DETAYLI) === */
window.openSystemLogs = async function () {
    if (!checkPermission('view_logs')) {
        Swal.fire('Yetki Yok', 'Bu işlemi yapmaya yetkiniz bulunmamaktadır.', 'warning');
        return;
    }
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

/* === EXCEL RAPOR (İK) === */
window.openReportModal = async function () {
    if (!checkPermission('export_excel')) {
        Swal.fire('Yetki Yok', 'Bu işlemi yapmaya yetkiniz bulunmamaktadır.', 'warning');
        return;
    }
    // Menü zaten İK için açılıyor ama yine de güvenli kontrol
    const isIk = currentUser && ['İK', 'IK'].includes(currentUser.role);
    if (!isIk) {
        Swal.fire('Yetki Yok', 'Excel raporu sadece İK rolü tarafından alınabilir.', 'warning');
        return;
    }

    if (typeof XLSX === 'undefined') {
        Swal.fire('Eksik Kütüphane', 'Excel kütüphanesi yüklenemedi (XLSX). CDN engelleniyor olabilir.', 'error');
        return;
    }

    const monthOptions = getMonthOptions().map(m => `<option value="${m.val}">${m.label}</option>`).join('');

    const { value: formValues } = await Swal.fire({
        title: '📊 Excel Rapor',
        width: 650,
        confirmButtonText: 'Raporu Oluştur',
        showCancelButton: true,
        cancelButtonText: 'İptal',
        focusConfirm: false,
        html: `
            <div style="text-align:left;">
                <div class="form-group" style="margin-bottom:12px;">
                    <label style="font-size:0.75rem;">Dönem</label>
                    <select id="rep-month" class="swal2-input" style="width:100%;">
                        <option value="">Tüm Aylar</option>
                        ${monthOptions}
                    </select>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.75rem;">Durum</label>
                        <select id="rep-status" class="swal2-input" style="width:100%;">
                            <option value="">Tümü</option>
                            <option value="bekliyor">⏳ Bekleyen</option>
                            <option value="onaylandi">✅ Onaylı</option>
                            <option value="red">❌ Reddedilen</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="font-size:0.75rem;">İzin Türü</label>
                        <select id="rep-type" class="swal2-input" style="width:100%;">
                            <option value="">Tümü</option>
                            ${(Array.isArray(window.leaveTypes) ? window.leaveTypes : []).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="alert-info" style="margin-top:14px;">
                    ℹ️ Rapor, sistemdeki izin kayıtlarını indirir. Çok kayıt varsa işlem birkaç saniye sürebilir.
                </div>
            </div>
        `,
        preConfirm: () => {
            return {
                month: document.getElementById('rep-month')?.value || '',
                status: document.getElementById('rep-status')?.value || '',
                type: document.getElementById('rep-type')?.value || ''
            };
        }
    });

    if (!formValues) return;

    Swal.fire({ title: 'Rapor hazırlanıyor…', html: '⏳ Lütfen bekleyin', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const res = await callApi({ action: 'getRequests' });
    if (!res || !Array.isArray(res)) {
        Swal.fire('Hata', 'Kayıtlar alınamadı. (getRequests)', 'error');
        return;
    }

    const filtered = res.filter(r => {
        const d = new Date(r.start);
        if (formValues.month) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            if (`${y}-${m}` !== formValues.month) return false;
        }
        if (formValues.type && r.type !== formValues.type) return false;
        if (formValues.status) {
            if (formValues.status === 'bekliyor') {
                if (!['tl_bekliyor', 'spv_bekliyor', 'ik_bekliyor', 'Bekliyor'].includes(r.status)) return false;
            } else if (r.status !== formValues.status) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        Swal.fire('Kayıt Yok', 'Seçtiğiniz filtrelere uygun kayıt bulunamadı.', 'info');
        return;
    }

    const rows = filtered.map(r => {
        const start = r.start ? new Date(r.start) : null;
        const end = r.end ? new Date(r.end) : null;
        const dayCount = (r.start && r.end) ? calculateDays(r.start, r.end) : '';
        const rej = (r.status === 'red') ? getDetailedRejectionInfo(r) : null;
        return {
            'ID': r.id || '',
            'Personel': r.fullName || r.requester || '',
            'Proje': r.project || '',
            'İzin Türü': r.type || '',
            'Başlangıç': start ? start.toLocaleDateString('tr-TR') : '',
            'Bitiş': end ? end.toLocaleDateString('tr-TR') : '',
            'Gün': dayCount,
            'Gerekçe': r.reason || '',
            'Durum': r.status || '',
            'Red Eden': rej ? rej.from : '',
            'Red Nedeni': rej ? rej.reason : '',
            'TL Not/İşlem': r.tl || '',
            'SPV Not/İşlem': r.spv || '',
            'İK Not/İşlem': r.ik || ''
        };
    });

    try {
        const ws = XLSX.utils.json_to_sheet(rows);
        // Basit kolon genişliği
        ws['!cols'] = [
            { wch: 10 }, { wch: 24 }, { wch: 18 }, { wch: 18 },
            { wch: 12 }, { wch: 12 }, { wch: 6 }, { wch: 40 },
            { wch: 14 }, { wch: 10 }, { wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 18 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'IzinRapor');

        const suffix = formValues.month ? formValues.month : new Date().toISOString().slice(0, 10);
        const filename = `Izin_Rapor_${suffix}.xlsx`;
        XLSX.writeFile(wb, filename);

        Swal.fire('Hazır ✅', `${filtered.length} kayıt indirildi: ${filename}`, 'success');
    } catch (e) {
        Swal.fire('Hata', 'Excel oluşturulurken hata oluştu.', 'error');
    }
}

/* === RBAC FUNCTIONS === */
async function loadRolePermissions() {
    // Sadece Admin veya yetkili roller için çekilebilir
    if (currentUser && currentUser.role === 'ADMIN') {
        const res = await callApi({ action: 'getRolePermissions' });
        if (res && res.status !== 'error') {
            // New format: { permissions: {...}, allRoles: [...] }
            if (res.permissions) {
                window.rolePermissions = res.permissions;
                window.dynamicRoles = res.allRoles || [];
            } else {
                window.rolePermissions = res;
                window.dynamicRoles = [];
            }
        }
    }
}

function checkPermission(resource) {
    if (!currentUser) return false;
    // Normalize role check
    const r = (currentUser.role || '').toLowerCase();

    // 1. ADMIN always true
    if (r === 'admin') return true;

    // 2. Others: Check if specific permission is granted (TRUE)
    if (window.rolePermissions && window.rolePermissions[r]) {
        if (window.rolePermissions[r][resource] === true) return true;
    }

    return false;
}

window.openPermissionModal = async function () {
    Swal.fire({ title: 'Yetki Matrisi', html: '⏳ Yükleniyor...', width: 950, showConfirmButton: false, showCloseButton: true });

    await loadRolePermissions(); // Refresh
    const permissions = window.rolePermissions || {};

    // Dynamic roles from backend OR fallback
    const backendRoles = window.dynamicRoles || [];
    const sheetRoles = Object.keys(permissions);

    // Merge and unique
    // Merge and unique
    let allRoles = [...new Set([...backendRoles, ...sheetRoles])]
        .map(r => r.trim())
        .filter(r => r && r.toLowerCase() !== 'role' && r.toLowerCase() !== 'undefined' && r.toLowerCase() !== 'null' && r.length > 1)
        .sort();

    // If empty (first run or error), add minimal defaults
    if (allRoles.length === 0) allRoles = ['Admin'];

    let html = `
        <div class="alert-info" style="text-align:left; font-size:0.85rem; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
            <span>ℹ️ Rolleri ve yetkilerini ayarlayın. Sonra <b>KAYDET</b> butonuna basın.</span>
            <button onclick="saveRolePermissions()" class="btn-save-perm">💾 Değişiklikleri Kaydet</button>
        </div>
        <div class="permission-table-container">
            <table class="permission-table" id="rbac-table">
                <thead>
                    <tr>
                        <th style="width:150px;">Rol / Kaynak</th>
                        ${window.permissionResources.map(r => `<th>${r.label}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
    `;

    allRoles.forEach(role => {
        html += `<tr><td><b>${esc(role)}</b></td>`;
        window.permissionResources.forEach(res => {
            const rKey = role.toLowerCase();
            const resKey = res.key.toLowerCase();

            // Default true? Check sheet value.
            let isChecked = true;
            if (permissions[rKey] && permissions[rKey][resKey] === false) isChecked = false;

            // No onchange immediate call
            // Using data attributes for batch save
            html += `
                <td>
                    <label class="switch">
                        <input type="checkbox" class="perm-check" 
                            data-role="${esc(role)}" 
                            data-res="${res.key}" 
                            ${isChecked ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </td>
            `;
        });
        html += `</tr>`;
    });

    html += `</tbody></table></div>
             <div style="margin-top:15px; text-align:right;">
                <button onclick="saveRolePermissions()" class="btn-save-perm">💾 Değişiklikleri Kaydet</button>
             </div>`;

    Swal.update({ html: html });
}

window.saveRolePermissions = async function () {
    const checkboxes = document.querySelectorAll('.perm-check');
    const updates = [];

    checkboxes.forEach(cb => {
        updates.push({
            role: cb.getAttribute('data-role'),
            resource: cb.getAttribute('data-res'),
            value: cb.checked
        });
    });

    const btn = document.querySelector('.btn-save-perm');
    if (btn) { btn.disabled = true; btn.innerText = 'Kaydediliyor...'; }

    const res = await callApi({
        action: 'updateRolePermissionsBatch',
        updates: updates
    });

    if (res.status === 'success') {
        Swal.fire('Başarılı', 'Tüm yetkiler kaydedildi.', 'success');
        // Refresh local cache
        updates.forEach(u => {
            const rKey = u.role.toLowerCase();
            const resKey = u.resource.toLowerCase();
            if (!window.rolePermissions[rKey]) window.rolePermissions[rKey] = {};
            window.rolePermissions[rKey][resKey] = u.value;
        });
    } else {
        Swal.fire('Hata', 'Kaydedilirken sorun oluştu.', 'error');
        if (btn) { btn.disabled = false; btn.innerText = '💾 Değişiklikleri Kaydet'; }
    }
}

function checkPermission(resource) {
    if (!currentUser) return false;
    // Normalize role check
    const r = (currentUser.role || '').toLowerCase();

    // 1. ADMIN always true
    if (r === 'admin') return true;

    // 2. Others: Check if specific permission is granted (TRUE)
    // If permission is not defined or is false, return FALSE.
    // Varsayılan olarak kısıtlı.
    if (window.rolePermissions && window.rolePermissions[r]) {
        if (window.rolePermissions[r][resource] === true) return true;
    }

    return false;
}
