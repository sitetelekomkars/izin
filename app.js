/* 
  app.js (TAM İŞLEVSEL SİSTEM - Gerekçe, Onay/Red Butonları, Görünürlük)
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
    const passLink = document.getElementById('menu-pass');

    if (user.role === 'Temsilci') passLink.style.display = 'none';
    else passLink.style.display = 'block';

    if (user.role === 'İK' || user.role === 'IK' || user.role === 'SPV') {
        mgmtLink.style.display = 'block';
        if (user.role.startsWith('İK') || user.role === 'IK') logsLink.style.display = 'block';
        else logsLink.style.display = 'none';
    } else {
        mgmtLink.style.display = 'none';
        logsLink.style.display = 'none';
    }

    renderDashboard(user.role);
    switchView('dashboard');
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

/* === GÖRÜNÜM KONTROLÜ === */
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
        const leaveTypesOptions = (window.leaveTypes || ['Yıllık İzin', 'Hastalık', 'Mazeret'])
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
                <table id="rep-table">
                    <thead>
                        <tr>
                            <th>Tarih</th>
                            <th>Tür</th>
                            <th>Durum</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        return;
    }

    // YÖNETİCİ VIEW (TL, SPV, İK)
    const leaveTypesOptions = (window.leaveTypes || ['Yıllık İzin', 'Hastalık', 'Mazeret'])
        .map(type => `<option>${type}</option>`).join('');

    container.innerHTML = `
        <div class="panel-info">🛡️ <strong>${role} Paneli</strong></div>
        <div class="filter-bar">
            <div class="filter-item">
                <label>Ay</label>
                <input type="month" id="filter-month" onchange="applyFilters()">
            </div>
            <div class="filter-item">
                <label>Tür</label>
                <select id="filter-type" onchange="applyFilters()">
                    <option value="">Tümü</option>
                    ${leaveTypesOptions}
                </select>
            </div>
            <div class="filter-item">
                <label>Durum</label>
                <select id="filter-status" onchange="applyFilters()">
                    <option value="">Tümü</option>
                    <option value="bekliyor">Bekleyen</option>
                    <option value="onaylandi">Onaylı</option>
                    <option value="red">Red</option>
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
        // Bekleyenleri üste çıkar
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
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px;">Kayıt bulunamadı</td></tr>';
        document.getElementById('page-info').innerText = '-';
        return;
    }

    const start = (page - 1) * itemsPerPage;
    const pageData = filteredRequests.slice(start, start + itemsPerPage);

    tbody.innerHTML = pageData.map(r => {
        let actionHtml = '';

        // ONAY/RED BUTON KONTROLÜ
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
            // Durum göster
            if (r.status === 'onaylandi') {
                actionHtml = '<span class="status st-onaylandi">✓ Onaylandı</span>';
            } else if (r.status === 'red') {
                const reason = getRejectionReason(r);
                actionHtml = `<span class="status st-red">✖ Reddedildi</span>`;
                if (reason) actionHtml += `<br><small style="color:#721c24;">${reason}</small>`;
            } else {
                actionHtml = getStatusBadge(r.status);
            }
        }

        const dStart = new Date(r.start).toLocaleDateString('tr-TR');
        const dEnd = new Date(r.end).toLocaleDateString('tr-TR');
        const dDays = calculateDays(r.start, r.end);

        return `
        <tr>
            <td>
                <strong>${r.fullName || r.requester}</strong><br>
                <span class="badge-project">${r.project}</span>
            </td>
            <td>
                <div style="font-weight:600;">${dStart} - ${dEnd} <span class="badge-days">${dDays} gün</span></div>
                <small style="color:#666; font-style:italic;">${r.reason || '-'}</small>
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

function getRejectionReason(r) {
    if (r.status !== 'red') return null;
    const checks = [r.ik, r.spv, r.tl];
    for (const c of checks) {
        if (c && c.toString().startsWith('Reddedildi:')) {
            return c.replace('Reddedildi:', '').trim();
        }
    }
    return null;
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

async function loadMyRequests() {
    const res = await callApi({
        action: 'getRequests',
        role: 'Temsilci',
        user: currentUser.user
    });
    const tbody = document.querySelector('#rep-table tbody');
    if (!res || res.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">Henüz talebin yok</td></tr>';
        return;
    }
    tbody.innerHTML = res.map(r => {
        const statusText = getStatusBadge(r.status);
        const dStart = new Date(r.start).toLocaleDateString('tr-TR');
        const dEnd = new Date(r.end).toLocaleDateString('tr-TR');
        return `<tr>
            <td>${dStart} - ${dEnd}</td>
            <td>${r.type}</td>
            <td>${statusText}</td>
        </tr>`;
    }).join('');
}

async function submitRequest(e) {
    e.preventDefault();

    const data = {
        requester: currentUser.user,
        fullName: document.getElementById('fullname').value,
        sicil: document.getElementById('sicil').value,
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

    // Formu temizle
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
