/* 
  app.js (Supabase Powered & Ultra Canavar)
*/
const SUPABASE_URL = 'https://cmewgawdwacdrijbvmex.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Kz5GU3lYBeawTncA78qvSA_X7pHQrHo';

// Password Reset API (Google Apps Script Backend)
// KURULUM: admin_tools/PASSWORD_RESET_SETUP.md dosyasına bakın
const PASSWORD_RESET_API_URL = 'https://script.google.com/macros/s/AKfycbwM66KExhPuYxrCqb5fPtDvzggz-aDgy7mpu_j-V8DJw636KCov-v8vI6Bc8TleNjCVeA/exec';

// Initialize Supabase client
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// let API_URL = ... (Removed, no longer needed)

let currentUser = null;
let sessionProfile = null; // Supabase Profile data

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
    { key: 'export_excel', label: 'Excel' },
    { key: 'view_logs', label: 'Loglar' },
    { key: 'manage_users', label: 'Personel Yön.' },
    { key: 'tab_requests', label: 'Sekme: Talepler' },
    { key: 'tab_new_request', label: 'Sekme: İzin İste' },
    { key: 'tab_history', label: 'Sekme: Geçmişim' },
    { key: 'user_add', label: 'Pers. Ekle' },
    { key: 'user_delete', label: 'Pers. Sil' },
    { key: 'user_list', label: 'Pers. Liste' },
    { key: 'view_all_projects', label: 'Tüm Projeler' },
    { key: 'auth_tl', label: 'TL Onayı' },
    { key: 'auth_spv', label: 'SPV Onayı' },
    { key: 'auth_ik', label: 'İK Onayı' }
];

// SAYFA YÜKLENDİĞİNDE
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Static İzin Türleri (Supabase Dashboard'dan yönetilebilir ileride)
    window.leaveTypes = ['Yıllık İzin', 'Mazeret İzni', 'Hastalık İzni', 'Mazeret (Ücretli)', 'Mazeret (Ücretsiz)', 'Düğün İzni', 'Ölüm İzni', 'Süt İzni'];

    // 2. Sonra oturumu kontrol et ve dashboard'u başlat
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
    const rbacLink = document.getElementById('menu-rbac');
    const passLink = document.getElementById('menu-pass');

    // 1. Şifre değiştirme her zaman açık
    if (passLink) passLink.style.display = 'block';

    // 2. Yetki Yönetimi (RBAC): SADECE ADMIN
    if (rbacLink) {
        rbacLink.style.display = (uRole === 'admin') ? 'block' : 'none';
    }

    // 3. Diğer Menüler: Rol Kontrolü + Yetki Matrisi Kontrolü
    const isSpecialist = isAdmin || isIk || isSup || isDanisma;

    if (mgmtLink) {
        mgmtLink.style.display = (isSpecialist && checkPermission('manage_users')) ? 'block' : 'none';
    }
    if (logsLink) {
        logsLink.style.display = ((isAdmin || isIk) && checkPermission('view_logs')) ? 'block' : 'none';
    }
    if (reportLink) {
        reportLink.style.display = ((isAdmin || isIk) && checkPermission('export_excel')) ? 'block' : 'none';
    }

    switchView('dashboard');
    renderDashboard(user.role);

    // Admin Panel Logo/Linki (Yedek kontrol)
    const btnAdmin = document.getElementById('btn-admin-panel');
    if (btnAdmin) {
        if (isAdmin || checkPermission('tab_requests')) {
            btnAdmin.classList.remove('hidden');
        } else {
            btnAdmin.classList.add('hidden');
        }
    }

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
    const usernameInput = document.getElementById('username').value.trim();
    const passVal = document.getElementById('password').value;

    statusDiv.innerText = 'Giriş yapılıyor...';
    statusDiv.className = 'status-loading';
    btn.disabled = true;

    try {
        // 1. Kullanıcı adından email oluştur (migration sırasında böyle kaydedildi)
        const userEmail = usernameInput.includes('@') ? usernameInput : `${usernameInput}@example.com`;

        // 2. Supabase Auth ile Giriş
        const { data, error } = await sb.auth.signInWithPassword({
            email: userEmail,
            password: passVal
        });

        if (error) throw error;

        // 3. Profil Verilerini Çek
        const { data: profile, error: pError } = await sb
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

        if (pError) throw pError;

        // 4. Oturumu Başlat
        sessionProfile = profile;
        currentUser = {
            id: profile.id, // Added ID field
            user: profile.username,
            fullName: profile.full_name,
            role: profile.role,
            project: profile.project,
            managed_scopes: profile.managed_scopes || [], // New: Managed Scopes
            token: data.session.access_token,
            // Supabase handle token expiry automatically, but we store it for UI compatibility
            tokenExpiry: Date.now() + (data.session.expires_in * 1000)
        };

        sessionStorage.setItem('site_telekom_user', JSON.stringify(currentUser));

        // 4. Dashboard'a Git
        // 4. Force Password Change Check
        if (profile.force_password_change) {
            statusDiv.innerText = '';
            promptChangePassword(true);
            return;
        }

        // 5. Dashboard'a Git
        initDashboardWithUser(currentUser);
        Swal.fire('Başarılı', 'Giriş yapıldı!', 'success');

    } catch (err) {
        statusDiv.innerText = 'Hata: ' + err.message;
        statusDiv.className = 'status-error';
        btn.disabled = false;
        Swal.fire('Giriş Hatası', err.message, 'error');
    }
}

async function promptChangePassword(isForced = false) {
    const { value: formValues } = await Swal.fire({
        title: isForced ? 'Şifre Değiştirme Zorunlu' : 'Şifre Değiştir',
        html: `
            <input id="swal-new-password" type="password" class="swal2-input" placeholder="Yeni Şifre" required>
            <input id="swal-confirm-password" type="password" class="swal2-input" placeholder="Yeni Şifre (Tekrar)" required>
        `,
        focusConfirm: false,
        showCancelButton: !isForced,
        cancelButtonText: 'İptal',
        confirmButtonText: 'Değiştir',
        allowOutsideClick: !isForced,
        allowEscapeKey: !isForced,
        preConfirm: () => {
            const newPass = document.getElementById('swal-new-password').value;
            const confirmPass = document.getElementById('swal-confirm-password').value;

            if (!newPass || !confirmPass) {
                Swal.showValidationMessage('Lütfen tüm alanları doldurun');
                return false;
            }
            if (newPass !== confirmPass) {
                Swal.showValidationMessage('Şifreler eşleşmiyor');
                return false;
            }
            if (newPass.length < 6) {
                Swal.showValidationMessage('Şifre en az 6 karakter olmalı');
                return false;
            }
            return { newPassword: newPass };
        }
    });

    if (formValues) {
        try {
            console.log('1. Şifre güncelleme başlatılıyor...');
            // 1. Şifreyi güncelle
            const { error: updateError } = await sb.auth.updateUser({
                password: formValues.newPassword
            });

            if (updateError) throw updateError;
            console.log('✅ Auth şifresi güncellendi.');

            console.log(`2. Profil güncelleniyor (ID: ${sessionProfile.id})...`);
            // 2. force_password_change bayrağını FALSE yap
            const { error: profileError } = await sb
                .from('profiles')
                .update({ force_password_change: false })
                .eq('id', sessionProfile.id);

            if (profileError) {
                console.error('❌ Profil güncelleme hatası:', profileError);
                throw profileError;
            }
            console.log('✅ Profil güncellendi (force_password_change: false).');

            // 3. Session'ı güncelle
            sessionProfile.force_password_change = false;

            Swal.fire('Başarılı', 'Şifreniz değiştirildi!', 'success');

            // 4. Dashboard'a git
            initDashboardWithUser(currentUser);
        } catch (err) {
            console.error('GENEL HATA:', err);
            Swal.fire('Hata', 'Şifre değiştirilemedi: ' + err.message, 'error');
            if (isForced) {
                // Zorunlu değişiklik başarısız olduysa tekrar dene
                promptChangePassword(true);
            }
        }
    } else if (isForced) {
        // Kullanıcı iptal edemez, tekrar sor
        promptChangePassword(true);
    }
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('site_telekom_user');
    sb.auth.signOut();

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

// Duplicate promptChangePassword removed. Using the robust version defined above.

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
    const role = (currentUser.role || '').toUpperCase();

    // Yetkileri kontrol et
    const canAdd = checkPermission('user_add');
    const canList = checkPermission('user_list');

    // Fix: Re-introduce isIk or equivalent for the UI logic
    const isIk = ['İK', 'IK', 'ADMIN'].includes(role);

    let html = `
        <div class="mgmt-tabs">
            ${canAdd ? `<button class="mgmt-tab-btn active" data-mgmt-tab="add" onclick="switchMgmtTab('add', event)">➕ Kullanıcı Ekle</button>` : ''}
            ${canList ? `<button class="mgmt-tab-btn ${!canAdd ? 'active' : ''}" data-mgmt-tab="list" onclick="switchMgmtTab('list', event)">📋 Kullanıcı Listesi</button>` : ''}
        </div>
        ${canAdd ? `
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
            <button class="btn-primary" onclick="submitAddUser()" style="margin-top:20px;">Ekle (İlk Şifre: 123456)</button>
        </div>
        ` : ''}
        <div id="mgmt-tab-list" class="mgmt-tab-content ${!canAdd ? '' : 'hidden'}">
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
            // Liste sekmesine tıklanınca yükle
            const listBtn = document.querySelector('[data-mgmt-tab="list"]');
            // Eğer Liste sekmesi direkt açıksa (IK değilse default liste açılır) hemen yükle
            if (listBtn && listBtn.classList.contains('active')) {
                loadUserListInternal();
            }
        }
    });
}

window.switchMgmtTab = function (tab, e) {
    document.querySelectorAll('.mgmt-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mgmt-tab-content').forEach(c => c.classList.add('hidden'));
    const targetBtn = (e && e.target) ? e.target : document.querySelector(`[data-mgmt-tab="${tab}"]`);
    if (targetBtn) targetBtn.classList.add('active');
    document.getElementById('mgmt-tab-' + tab).classList.remove('hidden');

    // Kullanıcı listesi sekmesine geçildiğinde otomatik yükle
    if (tab === 'list') {
        loadUserListInternal();
    }
}

window.loadUserListInternal = async function () {
    const container = document.getElementById('user-list-container');
    container.innerHTML = 'Yükleniyor...';

    try {
        const { data: users, error } = await sb
            .from('profiles')
            .select('*');

        if (error) {
            container.innerHTML = 'Hata: ' + error.message;
            console.error('Supabase error:', error);
            return;
        }

        if (!users || users.length === 0) {
            container.innerHTML = 'Kullanıcı bulunamadı';
            return;
        }

        const uRole = (currentUser.role || '').toUpperCase();
        const isIk = ['İK', 'IK', 'ADMIN'].includes(uRole);

        let table = `
            <table style="width:100%; border-collapse: collapse;">
                <thead style="background:#f8f9fa;">
                    <tr>
                        <th style="padding:10px;">AD SOYAD</th>
                        <th style="padding:10px;">E-POSTA / KULLANICI</th>
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
                    <td style="padding:10px;">${esc(u.full_name)}</td>
                    <td style="padding:10px;">${esc(u.username)}</td>
                    <td style="padding:10px;"><span class="badge-role">${esc(u.role)}</span><br><small style="color:#666;">${u.managed_scopes ? u.managed_scopes.join(', ') : ''}</small></td>
                    <td style="padding:10px;">${esc(u.project)}</td>
                    <td style="padding:10px;">${u.two_factor_enabled ? '✅ Aktif' : '❌ Pasif'}</td>
                    <td style="padding:10px;">
                        <button class="btn-sm btn-edit" style="background:#10b981; color:white; border:none; padding:5px; border-radius:4px; margin-right:5px; cursor:pointer;" onclick="editUserDetails('${u.id}', '${u.role}', '${u.project}', '${esc((u.managed_scopes || []).join(', '))}')">Düzenle</button>
                        <button class="btn-sm btn-reset" style="background:#f59e0b; color:white; border:none; padding:5px; border-radius:4px; margin-right:5px; cursor:pointer;" onclick="resetUserPassword('${u.id}', '${esc(u.username)}')">Şifre Sıfırla</button>
                        ${checkPermission('user_delete') ? `<button class="btn-sm btn-delete" style="background:#dc2626; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer;" onclick="delUser('${u.id}')">Sil</button>` : ''}
                    </td>
                </tr>
            `;
        });

        table += `</tbody></table>`;
        container.innerHTML = table;
    } catch (err) {
        console.error('loadUserListInternal error:', err);
        container.innerHTML = `
            <div style="padding:20px; color:#dc2626;">
                <strong>Hata:</strong> ${err.message}<br><br>
                <small>Console'u kontrol edin (F12)</small>
            </div>
        `;
    }
}

window.submitAddUser = async function () {
    const u = document.getElementById('new-u-name').value.trim();
    const r = document.getElementById('new-u-role')?.value || 'TL';
    const p = document.getElementById('new-u-proj')?.value.trim() || '';

    if (!u) { Swal.showValidationMessage('Kullanıcı adı gerekli'); return; }

    Swal.fire({
        title: 'Kullanıcı Ekleme',
        text: 'Lütfen kullanıcıları Supabase Dashboard > Authentication kısmından ekleyin. Biz burada sadece profillerini yönetiyoruz.',
        icon: 'info'
    });
}

window.delUser = async function (id) {
    const confirm = await Swal.fire({
        title: 'Silme İşlemi',
        text: `Profil siliniyor! (Not: Auth kullanıcısını Dashboard'dan silmelisiniz)`,
        icon: 'error',
        showCancelButton: true
    });
    if (!confirm.isConfirmed) return;

    Swal.showLoading();
    const { error } = await sb.from('profiles').delete().eq('id', id);

    if (error) Swal.fire('Hata', error.message, 'error');
    else {
        Swal.fire('Silindi', 'Profil silindi', 'success');
        loadUserListInternal();
    }
}

window.editUserDetails = async function (id, oldRole, oldProj, oldScopes) {
    const { value: formValues } = await Swal.fire({
        title: 'Kullanıcı Düzenle',
        html:
            `<div style="text-align:left; margin-bottom:10px;">Rol:</div><input id="edit-role" class="swal2-input" value="${oldRole}">` +
            `<div style="text-align:left; margin-bottom:10px; margin-top:20px;">Proje (Ana):</div><input id="edit-proj" class="swal2-input" value="${oldProj}">` +
            `<div style="text-align:left; margin-bottom:10px; margin-top:20px;">Yönetilen Projeler (Virgülle Ayırın):</div><input id="edit-scopes" class="swal2-input" value="${oldScopes || ''}" placeholder="Örn: Proje A, Proje B">`,
        focusConfirm: false,
        showCancelButton: true,
        preConfirm: () => {
            const rawScopes = document.getElementById('edit-scopes').value;
            const scopes = rawScopes ? rawScopes.split(',').map(s => s.trim()).filter(Boolean) : null;
            return {
                newRole: document.getElementById('edit-role').value,
                newProject: document.getElementById('edit-proj').value,
                newScopes: scopes
            }
        }
    });

    if (formValues) {
        Swal.showLoading();
        const { error } = await sb
            .from('profiles')
            .update({
                role: formValues.newRole,
                project: formValues.newProject,
                managed_scopes: formValues.newScopes
            })
            .eq('id', id);

        if (error) {
            Swal.fire('Hata', error.message, 'error');
        } else {
            Swal.fire('Başarılı', 'Kullanıcı güncellendi', 'success');
            loadUserListInternal();
        }
    }
}

window.resetUserPassword = async function (userId, username) {
    // API URL kontrolü
    if (!PASSWORD_RESET_API_URL || PASSWORD_RESET_API_URL.includes('BURAYA')) {
        await Swal.fire({
            title: 'Kurulum Gerekli',
            html: `Şifre sıfırlama özelliği henüz kurulmamış.<br><br>
                   <strong>Kurulum için:</strong><br>
                   1. <code>admin_tools/PASSWORD_RESET_SETUP.md</code> dosyasını aç<br>
                   2. Adımları takip et<br>
                   3. Google Apps Script URL'ini <code>app.js</code> dosyasına ekle`,
            icon: 'info'
        });
        return;
    }

    const result = await Swal.fire({
        title: 'Şifre Sıfırlama',
        html: `<strong>${username}</strong> kullanıcısının şifresi <strong>123456</strong> olarak sıfırlanacak.<br><br>
               Kullanıcı ilk girişte yeni şifre belirlemeye zorlanacak.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Evet, Sıfırla',
        cancelButtonText: 'İptal'
    });

    if (!result.isConfirmed) return;

    try {
        // Google Apps Script API'yi çağır
        // 'text/plain' kullanıyoruz çünkü 'application/json' preflight (OPTIONS) tetikler ve GAS bunu desteklemez
        const response = await fetch(PASSWORD_RESET_API_URL, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify({
                action: 'reset_password',
                userId: userId
            })
        });

        const data = await response.json();

        if (data.success) {
            Swal.fire('Başarılı', `${username} kullanıcısının şifresi 123456 olarak sıfırlandı.`, 'success');
            loadUserListInternal();
        } else {
            throw new Error(data.error || 'Bilinmeyen hata');
        }
    } catch (err) {
        Swal.fire('Hata', 'Şifre sıfırlanamadı: ' + err.message, 'error');
    }
}

window.toggle2faStatus = async function (id, newStatus) {
    const isEnabled = (newStatus === 'AKTİF');
    const confirm = await Swal.fire({
        title: 'Güvenlik Güncelleme',
        text: `2FA ${isEnabled ? 'etkinleştirilecek' : 'devre dışı bırakılacak'}.`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Evet, Değiştir',
        cancelButtonText: 'İptal'
    });
    if (!confirm.isConfirmed) return;

    Swal.showLoading();
    const { error } = await sb
        .from('profiles')
        .update({ two_factor_enabled: isEnabled })
        .eq('id', id);

    if (!error) {
        Swal.fire('Başarılı', `2FA ${isEnabled ? 'Açıldı' : 'Kapatıldı'}`, 'success');
        loadUserListInternal();
    } else {
        Swal.fire('Hata', error.message || 'İşlem başarısız', 'error');
    }
}

/* === REQUESTS MANAGEMENT === */
async function loadAdminRequests() {
    const { data, error } = await sb
        .from('requests')
        .select('*');

    if (error) {
        console.error('Supabase Error:', error);
        return;
    }

    // Map Supabase columns to existing app format
    let mappedRequests = data.map(r => ({
        id: String(r.id),
        requester: r.user_id, // uuid
        fullName: r.full_name,
        project: r.project,
        type: r.leave_type,
        start: r.start_date,
        end: r.end_date,
        reason: r.reason,
        status: r.status,
        tl: r.tl_decision,
        spv: r.spv_decision,
        ik: r.ik_decision,
        documentStatus: r.document_status || 'Bekliyor'
    }));

    // SCOPE FILTERING
    if (currentUser) {
        const role = (currentUser.role || '').toUpperCase();
        // Check if Admin/IK (Can see all)
        const isFullAccess = ['İK', 'IK', 'ADMIN'].includes(role) || checkPermission('view_all_projects');

        if (!isFullAccess) {
            const scopes = currentUser.managed_scopes || [];
            mappedRequests = mappedRequests.filter(r => {
                // Normalize for comparison
                const rProj = (r.project || '').trim().toLocaleUpperCase('tr-TR');
                const uProj = (currentUser.project || '').trim().toLocaleUpperCase('tr-TR');

                // 1. If user has specific managed scopes, check if project is in list
                if (scopes.length > 0) {
                    return scopes.some(s => s.trim().toLocaleUpperCase('tr-TR') === rProj);
                }
                // 2. Default: Filter by user's own project
                return rProj === uProj;
            });
        }
    }

    allAdminRequests = mappedRequests;

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
            const isAdmin = role === 'ADMIN';
            if (s === 'tl_bekliyor' && (isAdmin || checkPermission('auth_tl'))) {
                actionHtml = `
                    <div class="action-btns">
                        <button class="action-btn approve" onclick="processRequest('${r.id}','Onaylandı')">✔️ Onayla</button>
                        <button class="action-btn reject" onclick="processRequest('${r.id}','Reddedildi')">✖️ Reddet</button>
                    </div>`;
            } else if (s === 'spv_bekliyor' && (isAdmin || checkPermission('auth_spv'))) {
                actionHtml = `
                    <div class="action-btns">
                        <button class="action-btn approve" onclick="processRequest('${r.id}','Onaylandı')">✔️ Onayla</button>
                        <button class="action-btn reject" onclick="processRequest('${r.id}','Reddedildi')">✖️ Reddet</button>
                    </div>`;
            } else if (s === 'ik_bekliyor' && (isAdmin || checkPermission('auth_ik') || role === 'İK' || role === 'IK')) {
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

    try {
        const statusVal = decision === 'Reddedildi' ? `Reddedildi: ${reason}` : decision;

        // 1. İlgili kayıtı bul (State-Based Logic)
        const request = allAdminRequests.find(r => r.id === id);
        if (!request) throw new Error('Talep bulunamadı');

        const currentStatus = request.status;
        const uRole = (currentUser.role || '').toUpperCase();
        const isAdmin = uRole === 'ADMIN';

        let updateData = {};

        // 2. Duruma Göre İşlem Yap (Rol Check ile Birlikte)
        // TL Onayı (Bekleyen: tl_bekliyor)
        if (currentStatus === 'tl_bekliyor') {
            if (!isAdmin && !checkPermission('auth_tl')) throw new Error('TL onayı yetkiniz yok');

            if (decision === 'Onaylandı') {
                updateData = { status: 'spv_bekliyor', tl_decision: statusVal };
            } else {
                updateData = { status: 'red', tl_decision: statusVal };
            }
        }
        // SPV Onayı (Bekleyen: spv_bekliyor)
        else if (currentStatus === 'spv_bekliyor') {
            if (!isAdmin && !checkPermission('auth_spv')) throw new Error('SPV onayı yetkiniz yok');

            if (decision === 'Onaylandı') {
                updateData = { status: 'ik_bekliyor', spv_decision: statusVal };
            } else {
                updateData = { status: 'red', spv_decision: statusVal };
            }
        }
        // İK Onayı (Bekleyen: ik_bekliyor)
        else if (currentStatus === 'ik_bekliyor') {
            if (!isAdmin && !checkPermission('auth_ik') && !['İK', 'IK'].includes(uRole)) throw new Error('İK onayı yetkiniz yok');

            if (decision === 'Onaylandı') {
                updateData = { status: 'onaylandi', ik_decision: statusVal };
            } else {
                updateData = { status: 'red', ik_decision: statusVal };
            }
        } else {
            throw new Error('Bu talep için işlem yapılamaz durumdasınız: ' + currentStatus);
        }

        const { error } = await sb
            .from('requests')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        Swal.fire('Başarılı', 'İşlem tamamlandı', 'success');
        loadAdminRequests();
    } catch (err) {
        Swal.fire('Hata', err.message || 'Hata oluştu', 'error');
    }
}

window.updateDocumentStatus = async function (id, status) {
    Swal.showLoading();
    try {
        const { error } = await sb
            .from('requests')
            .update({ document_status: status })
            .eq('id', id);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'Güncellendi',
            text: 'Evrak durumu başarıyla kaydedildi.',
            timer: 1500,
            showConfirmButton: false
        });
        loadAdminRequests();
    } catch (err) {
        Swal.fire('Hata', err.message || 'Hata oluştu', 'error');
    }
}

window.searchMyHistory = async function () {
    const fn = (document.getElementById('search-fullname')?.value || '').trim();
    const sn = (document.getElementById('search-project')?.value || '').trim();

    const isMT = currentUser && (currentUser.role === 'MT' || currentUser.role === 'Temsilci');

    if (!isMT && !fn && !sn) {
        Swal.fire('Uyarı', 'Lütfen personel adı veya proje girerek sorgulama yapın.', 'warning');
        return;
    }

    const tbody = document.querySelector('#rep-table tbody');
    tbody.innerHTML = ' SORGULANIYOR...';

    try {
        let query = sb.from('requests').select('*');

        // Filter by user if MT (assuming user can only see their own)
        // For Managers, filter results based on project/name if provided
        if (fn) query = query.ilike('full_name', `%${fn}%`);
        if (sn) query = query.eq('project', sn);

        const { data, error } = await query;

        if (error) throw error;
        if (!data || data.length === 0) { tbody.innerHTML = 'Kayıt bulunamadı.'; return; }

        tbody.innerHTML = data.map(r => {
            let statusHtml = r.status === 'red'
                ? `<span class="status st-red">❌ Red</span><br><small>${esc(r.ik_decision || r.spv_decision || r.tl_decision || '')}</small>`
                : getStatusBadge(r.status);

            return `<tr>
                <td>${new Date(r.start_date).toLocaleDateString('tr-TR')} - ${new Date(r.end_date).toLocaleDateString('tr-TR')}</td>
                <td><b>${esc(r.leave_type)}</b></td>
                <td>${esc(r.reason || '-')}</td>
                <td>${statusHtml}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = 'Hata: ' + err.message;
    }
}

async function submitRequest(e) {
    e.preventDefault();
    const formData = {
        fullName: document.getElementById('fullname').value,
        project: document.getElementById('sicil').value,
        type: document.getElementById('type').value,
        start: document.getElementById('start').value,
        end: document.getElementById('end').value,
        reason: document.getElementById('reason').value
    };

    Swal.showLoading();

    // STATUS FLOW LOGIC
    let initialStatus = "tl_bekliyor";
    const uRole = (currentUser.role || "").toUpperCase();
    if (uRole === 'TL') initialStatus = "spv_bekliyor";
    else if (['SPV', 'İK', 'IK'].includes(uRole) || uRole.includes('DANI')) initialStatus = "ik_bekliyor";

    try {
        const { data: userData } = await sb.auth.getUser();
        const { error } = await sb
            .from('requests')
            .insert([{
                user_id: userData.user ? userData.user.id : null,
                full_name: formData.fullName,
                project: formData.project,
                leave_type: formData.type,
                start_date: formData.start,
                end_date: formData.end,
                reason: formData.reason,
                status: initialStatus
            }]);

        if (error) throw error;

        Swal.fire('Başarılı', 'Talebiniz iletildi', 'success');
        document.getElementById('reason').value = '';
        document.getElementById('start').value = '';
        document.getElementById('end').value = '';
        if (typeof searchMyHistory === 'function') searchMyHistory();
    } catch (err) {
        Swal.fire('Hata', err.message || 'Gönderilemedi', 'error');
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

// callApi function removed. All operations moved to Supabase.

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

    const { data, error } = await sb
        .from('logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) { Swal.update({ html: 'Hata: ' + error.message }); return; }
    if (!data || data.length === 0) { Swal.update({ html: 'Henüz log kaydı yok.' }); return; }

    let tableHtml = `
        <div style="max-height:500px; overflow:auto; text-align:left;">
            <table style="width:100%; border-collapse:collapse; font-size:0.75rem;">
                <thead style="background:#f8f9fa; position:sticky; top:0;">
                    <tr><th>Tarih</th><th>Kullanıcı</th><th>Rol</th><th>Proje</th><th>İşlem</th><th>Detay</th><th>IP</th></tr>
                </thead>
                <tbody>
    `;
    data.forEach(log => {
        tableHtml += `
            <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:8px; white-space:nowrap;">${new Date(log.created_at).toLocaleString('tr-TR')}</td>
                <td style="padding:8px;"><b>${esc(log.full_name || log.user_id)}</b></td>
                <td style="padding:8px;">${esc(log.role)}</td>
                <td style="padding:8px;">${esc(log.project)}</td>
                <td style="padding:8px;">${esc(log.action)}</td>
                <td style="padding:8px; color:#666;">${esc(log.detail)}</td>
                <td style="padding:8px; font-family:monospace; color:#2563eb;">${esc(log.ip_address)}</td>
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
    if (!checkPermission('export_excel')) {
        Swal.fire('Yetki Yok', 'Bu işlemi yapmaya yetkiniz bulunmamaktadır.', 'warning');
        return;
    }

    // isIk kontrolü kaldırıldı, sadece checkPermission yeterli.

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

    const { data, error } = await sb
        .from('requests')
        .select('*');

    if (error) {
        Swal.fire('Hata', 'Kayıtlar alınamadı: ' + error.message, 'error');
        return;
    }

    const res = data.map(r => ({
        id: String(r.id),
        requester: r.user_id,
        fullName: r.full_name,
        project: r.project,
        type: r.leave_type,
        start: r.start_date,
        end: r.end_date,
        reason: r.reason,
        status: r.status,
        documentStatus: r.document_status || 'Bekliyor'
    }));

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

async function loadRolePermissions() {
    try {
        const { data, error } = await sb
            .from('role_permissions')
            .select('*');

        if (error) throw error;

        const perms = {};
        data.forEach(p => {
            const r = p.role_name.toLowerCase();
            const res = p.resource_key.toLowerCase();
            if (!perms[r]) perms[r] = {};
            perms[r][res] = p.is_granted;
        });
        window.rolePermissions = perms;

        // Fetch dynamic roles from profiles
        const { data: rolesData } = await sb.from('profiles').select('role');
        const rolesSet = new Set();
        (rolesData || []).forEach(r => { if (r.role) rolesSet.add(r.role); });
        window.dynamicRoles = Array.from(rolesSet).sort();
    } catch (err) {
        console.error('RBAC Error:', err);
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
    Swal.fire({ title: 'Yetki Matrisi', html: '⏳ Yükleniyor...', width: '90%', showConfirmButton: false, showCloseButton: true });

    await loadRolePermissions(); // Refresh
    const permissions = window.rolePermissions || {};

    // Dynamic roles from backend OR fallback
    const backendRoles = window.dynamicRoles || [];
    const sheetRoles = Object.keys(permissions);

    // Merge and unique (Case Insensitive Deduplication)
    const rawRoles = [...backendRoles, ...sheetRoles];
    const uniqueMap = new Map();

    rawRoles.forEach(r => {
        if (!r) return;
        const clean = String(r).trim();
        if (clean.length < 2) return;
        const lower = clean.toLowerCase();
        if (['role', 'undefined', 'null', 'rol'].includes(lower)) return;

        // Keep the first variation we find (or prefer backend's casing)
        // Since backendRoles comes first in spread, we keep backend casing usually.
        if (!uniqueMap.has(lower)) {
            uniqueMap.set(lower, clean);
        }
    });

    let allRoles = Array.from(uniqueMap.values()).sort();

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
            role_name: cb.getAttribute('data-role'),
            resource_key: cb.getAttribute('data-res'),
            is_granted: cb.checked
        });
    });

    const btn = document.querySelector('.btn-save-perm');
    if (btn) { btn.disabled = true; btn.innerText = 'Kaydediliyor...'; }

    try {
        // Supabase upsert works well for this flat structure
        const { error } = await sb
            .from('role_permissions')
            .upsert(updates, { onConflict: 'role_name,resource_key' });

        if (error) throw error;

        Swal.fire('Başarılı', 'Tüm yetkiler kaydedildi.', 'success');

        // Refresh local cache
        updates.forEach(u => {
            const rKey = u.role_name.toLowerCase();
            const resKey = u.resource_key.toLowerCase();
            if (!window.rolePermissions[rKey]) window.rolePermissions[rKey] = {};
            window.rolePermissions[rKey][resKey] = u.is_granted;
        });
    } catch (err) {
        Swal.fire('Hata', err.message || 'Kaydedilirken sorun oluştu.', 'error');
    } finally {
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
