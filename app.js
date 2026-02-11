/* 
  app.js (Filtreleme, Tarih Format Düzeltmesi ve Yeni Tablo Yapısı)
*/
const API_URL = 'https://script.google.com/macros/s/AKfycbzPP6GYOHiP6gFdwrBpNtBc9KJSqQ-UE6J-9V9Z2XzES2oW-kfM3G4SDjYCrCorVkVfuQ/exec';

let currentUser = null;
let allAdminRequests = [];
let filteredRequests = []; // Filtrelenmiş liste
let currentPage = 1;
const itemsPerPage = 10;

// ... (ToggleMenu, SwitchView, API Calls, HandleLogin - Same as before)
function toggleUserMenu() { document.getElementById("userDropdown").classList.toggle("show"); }
window.onclick = function (event) { if (!event.target.closest('.user-info')) { var dropdowns = document.getElementsByClassName("dropdown-content"); for (var i = 0; i < dropdowns.length; i++) { if (dropdowns[i].classList.contains('show')) { dropdowns[i].classList.remove('show'); } } } }
function switchView(viewName) {
    const loginView = document.getElementById('view-login'); const dashboardView = document.getElementById('view-dashboard'); const userInfo = document.getElementById('user-info-panel');
    if (viewName === 'login') { loginView.classList.remove('hidden'); dashboardView.classList.add('hidden'); userInfo.classList.add('hidden'); document.body.style.background = "#f1f5f9"; }
    else { loginView.classList.add('hidden'); dashboardView.classList.remove('hidden'); userInfo.classList.remove('hidden'); }
}
async function callApi(params, method = 'GET', body = null) {
    const url = new URL(API_URL); Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const options = { method: method, redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" } }; if (body) options.body = JSON.stringify(body);
    try { const res = await fetch(url, options); return await res.json(); } catch (e) { return { status: 'error', message: 'Sunucu hatası.' }; }
}
async function handleLogin(e) {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.innerText = 'Kontrol ediliyor...'; btn.disabled = true;
    const res = await callApi({ action: 'login', user: document.getElementById('username').value, pass: document.getElementById('password').value });
    if (res && res.status === 'success') {
        currentUser = res;
        if (res.forceReset) { btn.innerText = 'Giriş Yap'; btn.disabled = false; await promptChangePassword(true); return; }
        document.getElementById('displayUsername').innerText = res.user; document.getElementById('displayRole').innerText = res.role; document.getElementById('userAvatar').innerText = res.user.charAt(0).toUpperCase();
        const mgmtLink = document.getElementById('menu-mgmt');
        if (res.role === 'SPV' || res.role === 'İK' || res.role === 'IK') { mgmtLink.style.display = 'block'; mgmtLink.innerText = (res.role === 'SPV') ? 'Personel Yönetimi (TL Ekle)' : 'Personel Yönetimi (Tam Yetki)'; } else { mgmtLink.style.display = 'none'; }
        renderDashboard(res.role); switchView('dashboard');
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 }); Toast.fire({ icon: 'success', title: 'Giriş Başarılı' });
    } else { Swal.fire('Hata', res.message || 'Giriş yapılamadı', 'error'); }
    btn.innerText = 'Giriş Yap'; btn.disabled = false;
}
function logout() { currentUser = null; switchView('login'); }
async function promptChangePassword(isForced = false) { /* Same as last step */
    const { value: formValues } = await Swal.fire({ title: 'Şifre Değiştir', html: '<input id="swal-pass1" type="password" class="swal2-input"><input id="swal-pass2" type="password" class="swal2-input">', preConfirm: () => { return document.getElementById('swal-pass1').value; } });
    if (formValues) { await callApi({ action: 'changePassword' }, 'POST', { user: currentUser.user, newPass: formValues }); if (isForced) logout(); }
}

function renderDashboard(role) {
    const container = document.getElementById('dashboard-content');
    if (role === 'Temsilci') {
        /* Temsilci View (unchanged) */
        container.innerHTML = `... TEMSİLCİ VIEW KODLARI ... (Aynı)`; // Placeholders for brevity if re-rendering is full
        container.innerHTML = `
            <div class="panel-info">👋 <strong>Hoş Geldiniz!</strong> Proje: <b>${currentUser.project}</b>.</div>
            <div class="tabs">
                <button class="tab-btn active" onclick="showTab('new-req', this)">Yeni Talep</button>
                <button class="tab-btn" onclick="showTab('my-req', this)">Geçmiş</button>
            </div>
            <div id="tab-new-req">
                <form onsubmit="submitRequest(event)" autocomplete="off">
                     <div style="display:grid; grid-template-columns: 2fr 1fr; gap: 15px;">
                        <div class="form-group"><label>Ad Soyad *</label><input type="text" id="fullname" required></div>
                        <div class="form-group"><label>Sicil No</label><input type="text" id="sicil"></div>
                    </div>
                    <div class="form-group"><label>İzin Türü</label>
                        <select id="type"><option>Yıllık İzin</option><option>Hastalık</option><option>Mazeret</option><option>Babalık</option><option>Diğer</option></select>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group"><label>Başlangıç</label><input type="date" id="start" required></div>
                        <div class="form-group"><label>Bitiş</label><input type="date" id="end" required></div>
                    </div>
                    <div class="form-group"><label>Açıklama</label><textarea id="reason" rows="3" required></textarea></div>
                    <button type="submit" class="btn-primary" id="btn-submit-req">Talebi Gönder</button>
                </form>
            </div>
            <div id="tab-my-req" class="hidden">
                 <div style="margin-bottom:10px; color:#64748b; font-size:0.9em;">ℹ️ Filtre: <b><span id="filter-name-display">-</span></b></div>
                <table id="rep-table"><thead><tr><th>Tarih</th><th>Durum</th></tr></thead><tbody><tr><td>Yükleniyor...</td></tr></tbody></table>
            </div>
        `;
        return;
    }

    // YÖNETİCİ VIEW
    let color = role === 'TL' ? '#fff7ed' : '#f5f3ff';
    container.innerHTML = `
        <div class="panel-info" style="background:${color};">
            🛡️ <strong>${role} Paneli</strong>
        </div>

        <!-- NEW FILTER BAR -->
        <div class="filter-bar">
            <div class="filter-item">
                <label>Tarih (Ay/Yıl)</label>
                <input type="month" id="filter-month" onchange="applyFilters()">
            </div>
            <div class="filter-item">
                <label>İzin Türü</label>
                <select id="filter-type" onchange="applyFilters()">
                    <option value="">Tümü</option>
                    <option>Yıllık İzin</option>
                    <option>Hastalık</option>
                    <option>Mazeret</option>
                    <option>Babalık</option>
                    <option>Diğer</option>
                </select>
            </div>
            <div class="filter-item">
                <label>Durum</label>
                <select id="filter-status" onchange="applyFilters()">
                    <option value="">Tümü</option>
                    <option value="bekliyor">Bekleyenler</option>
                    <option value="onaylandi">Onaylananlar</option>
                    <option value="red">Reddedilenler</option>
                </select>
            </div>
            <div class="filter-item" style="flex:0;">
             <button class="btn-primary" style="margin:0; height:38px; padding:0 20px;" onclick="loadAdminRequests()">Yenile</button>
            </div>
        </div>
        
        <table id="admin-table">
            <thead>
                <tr>
                    <th style="width:20%">PERSONEL / PROJE</th>
                    <th style="width:25%">İZİN TARİHLERİ / TALEP</th>
                    <th style="width:25%">TÜR / AÇIKLAMA</th>
                    <th style="width:30%">DURUM / İŞLEM</th>
                </tr>
            </thead>
            <tbody><tr><td colspan="4">Yükleniyor...</td></tr></tbody>
        </table>
        <div class="pagination-container">
            <button class="page-btn" onclick="changePage(-1)">Önceki</button>
            <span class="page-info" id="page-info">Sayfa 1</span>
            <button class="page-btn" onclick="changePage(1)">Sonraki</button>
        </div>
    `;
    loadAdminRequests();
}

async function loadAdminRequests() {
    // Show loading
    const tbody = document.querySelector('#admin-table tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4">Veriler çekiliyor...</td></tr>';

    allAdminRequests = await callApi({ action: 'getRequests', role: currentUser.role, user: currentUser.user, project: currentUser.project });

    if (allAdminRequests) {
        // Tarih formatını güvenceye alalım (JS Date Object olarak saklayalım sorting için)
        allAdminRequests.forEach(r => {
            r._dateObj = new Date(r.start);
        });

        // Default Sort: Bekleyenler üstte, sonra tarih
        allAdminRequests.sort((a, b) => {
            let aP = (['tl_bekliyor', 'spv_bekliyor', 'ik_bekliyor'].includes(a.status));
            let bP = (['tl_bekliyor', 'spv_bekliyor', 'ik_bekliyor'].includes(b.status));
            if (aP && !bP) return -1;
            if (!aP && bP) return 1;
            return b._dateObj - a._dateObj; // Yeniden eskiye
        });
    }

    applyFilters();
}

function applyFilters() {
    const fMonth = document.getElementById('filter-month').value; // YYYY-MM
    const fType = document.getElementById('filter-type').value;
    const fStatus = document.getElementById('filter-status').value;

    filteredRequests = allAdminRequests.filter(r => {
        // Month Filter
        if (fMonth) {
            // r.start format could be ISO or String. Use r._dateObj
            const rY = r._dateObj.getFullYear();
            const rM = String(r._dateObj.getMonth() + 1).padStart(2, '0');
            if (`${rY}-${rM}` !== fMonth) return false;
        }

        // Type Filter
        if (fType && r.type !== fType) return false;

        // Status Filter
        if (fStatus) {
            if (fStatus === 'bekliyor') {
                if (!['tl_bekliyor', 'spv_bekliyor', 'ik_bekliyor', 'Bekliyor'].includes(r.status)) return false;
            } else if (fStatus === 'onaylandi' && r.status !== 'onaylandi') return false;
            else if (fStatus === 'red' && r.status !== 'red') return false;
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
        tbody.innerHTML = '<tr><td colspan="4">Kriterlere uygun kayıt bulunamadı.</td></tr>';
        document.getElementById('page-info').innerText = '-';
        return;
    }

    const start = (page - 1) * itemsPerPage;
    const pageData = filteredRequests.slice(start, start + itemsPerPage);

    tbody.innerHTML = pageData.map(r => {
        let actionContent = '';
        const pending = (currentUser.role === 'TL' && r.status === 'tl_bekliyor') || (currentUser.role === 'SPV' && r.status === 'spv_bekliyor') || (currentUser.role === 'İK' && r.status === 'ik_bekliyor') || (currentUser.role === 'IK' && r.status === 'ik_bekliyor');

        if (pending) {
            actionContent = `<button class="action-btn approve" onclick="window.processRequest('${r.id}', 'Onaylandı')">✔</button><button class="action-btn reject" onclick="window.processRequest('${r.id}', 'Reddedildi')">✖</button>`;
        } else {
            if (r.status === 'red') actionContent = `<span class="status st-red">Red</span><br>${getRejectionReason(r) ? '<span style="font-size:0.7rem; color:red;">' + getRejectionReason(r) + '</span>' : ''}`;
            else if (r.status === 'onaylandi') actionContent = `<span class="status st-onaylandi">Tamamlandı</span>`;
            else actionContent = getStatusBadge(r.status);
        }

        // Tarih Formatlama (Güvenli)
        const dStart = new Date(r.start).toLocaleDateString('tr-TR');
        const dEnd = new Date(r.end).toLocaleDateString('tr-TR');
        const dDays = calculateDays(r.start, r.end);
        const dReq = r.createdAt ? r.createdAt : '-'; // CreatedAt backendden geliyor

        return `
        <tr>
            <td>
                <b>${r.fullName || r.requester}</b><br>
                <span class="badge-project">${r.project}</span>
            </td>
            <td>
                <div style="font-weight:600; color:#333;">${dStart} - ${dEnd}</div>
                <span class="badge-days">${dDays} Gün</span>
                <span class="badge-req-date">Talep: ${dReq}</span>
            </td>
            <td>
                <b>${r.type}</b><br>
                <i style="color:#666;">${r.reason}</i>
            </td>
            <td>${actionContent}</td>
        </tr>`;
    }).join('');

    const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
    document.getElementById('page-info').innerText = `Sayfa ${currentPage} / ${totalPages}`;
    document.querySelector('.page-btn:first-child').disabled = currentPage === 1;
    document.querySelector('.page-btn:last-child').disabled = currentPage >= totalPages;
}

// ... EXISTING HELPERS ...
function changePage(d) {
    const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
    const next = currentPage + d;
    if (next >= 1 && next <= totalPages) { currentPage = next; renderPage(currentPage); }
}
function calculateDays(start, end) { try { const d1 = new Date(start); const d2 = new Date(end); const diff = Math.abs(d2 - d1); return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1; } catch (e) { return 0; } }
function getRejectionReason(r) { if (r.status !== 'red') return null; const checks = [r.ik, r.spv, r.tl]; for (const c of checks) { if (c && c.toString().startsWith('Reddedildi:')) return c.replace('Reddedildi:', 'Sebep:'); } return null; }
function getStatusBadge(code) { const map = { 'tl_bekliyor': 'TL Bekleniyor', 'spv_bekliyor': 'SPV Bekleniyor', 'ik_bekliyor': 'İK Bekleniyor', 'onaylandi': 'Tamamlandı', 'red': 'Reddedildi' }; return `<span class="status ${code === 'onaylandi' ? 'st-onaylandi' : code === 'red' ? 'st-red' : 'st-tl_bekliyor'}">${map[code] || code}</span>`; }
function getUserListInternal(m, p) { /* kept via window ref*/ }

/* WINDOW BINDINGS */
window.loadAdminRequests = loadAdminRequests;
window.applyFilters = applyFilters;
window.changePage = changePage;
window.processRequest = processRequest;
window.openUserMgmtModal = openUserMgmtModal;
window.submitAddUser = submitAddUser;
window.resetPass = resetPass;
window.delUser = delUser;
window.switchMgmtTab = switchMgmtTab;
window.loadUserListInternal = loadUserListInternal;
