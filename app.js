/* 
  app.js (Log Görüntüleme Desteği)
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
    if (viewName === 'login') { loginView.classList.remove('hidden'); dashboardView.classList.add('hidden'); userInfo.classList.add('hidden'); document.body.style.background = "#f1f5f9"; }
    else { loginView.classList.add('hidden'); dashboardView.classList.remove('hidden'); userInfo.classList.remove('hidden'); }
}

async function callApi(params, method = 'GET', body = null) {
    const url = new URL(API_URL); Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const options = { method: method, redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" } }; if (body) options.body = JSON.stringify(body);
    try { const res = await fetch(url, options); return await res.json(); } catch (e) { return { status: 'error' }; }
}

async function handleLogin(e) {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.innerText = 'Kontrol ediliyor...'; btn.disabled = true;
    const res = await callApi({ action: 'login', user: document.getElementById('username').value, pass: document.getElementById('password').value });
    if (res && res.status === 'success') {
        currentUser = res;
        if (res.forceReset) { btn.innerText = 'Giriş Yap'; btn.disabled = false; await promptChangePassword(true); return; }
        document.getElementById('displayUsername').innerText = res.user; document.getElementById('displayRole').innerText = res.role; document.getElementById('userAvatar').innerText = res.user.charAt(0).toUpperCase();

        // Rol Bazlı Linkler
        const mgmtLink = document.getElementById('menu-mgmt');
        const logsLink = document.getElementById('menu-logs');
        if (res.role === 'İK' || res.role === 'IK' || res.role === 'SPV') {
            mgmtLink.style.display = 'block';
            if (res.role.startsWith('İK') || res.role === 'IK') logsLink.style.display = 'block'; else logsLink.style.display = 'none';
        } else {
            mgmtLink.style.display = 'none'; logsLink.style.display = 'none';
        }

        renderDashboard(res.role); switchView('dashboard');
    } else { Swal.fire('Hata', 'Giriş Başarısız', 'error'); }
    btn.innerText = 'Giriş Yap'; btn.disabled = false;
}

function logout() { currentUser = null; switchView('login'); }

/* --- LOG GÖRÜNTÜLEME --- */
window.viewUserLogs = async function (targetUser) {
    if (!targetUser) return;
    Swal.fire({ title: 'Loglar Yükleniyor...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    const logs = await callApi({ action: 'getLogs', targetUser: targetUser });
    Swal.close();

    if (!logs || logs.length === 0) { Swal.fire('Bilgi', 'Bu kullanıcı için log bulunamadı.', 'info'); return; }

    let logHtml = `<div style="text-align:left; max-height:400px; overflow-y:auto; font-size:0.85rem;">`;
    logs.forEach(l => {
        logHtml += `
            <div style="border-bottom:1px solid #eee; padding:10px 0;">
                <span style="color:#666; font-size:0.75rem;">[${l.time}]</span> 
                <strong style="color:var(--primary);">${l.type}</strong><br>
                <div style="margin-top:4px;">${l.detail}</div>
            </div>`;
    });
    logHtml += `</div>`;

    Swal.fire({
        title: `${targetUser} - İşlem Geçmişi`,
        html: logHtml,
        width: 600,
        confirmButtonText: 'Kapat'
    });
}

window.openAllLogs = async function () {
    Swal.fire({ title: 'Loglar Yükleniyor...', didOpen: () => { Swal.showLoading(); } });
    const logs = await callApi({ action: 'getLogs' }); // targetUser yoksa hepsi
    Swal.close();

    let logHtml = `<div style="text-align:left; max-height:500px; overflow-y:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
        <thead><tr style="background:#f8f9fa;"><th>Zaman</th><th>Kullanıcı</th><th>İşlem</th></tr></thead><tbody>`;
    logs.forEach(l => {
        logHtml += `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:8px 4px;">${l.time.split(' ')[1]}</td>
            <td style="padding:8px 4px;"><b>${l.user}</b></td>
            <td style="padding:8px 4px;">${l.detail}</td>
        </tr>`;
    });
    logHtml += `</tbody></table></div>`;

    Swal.fire({ title: 'Sistem Hareket Kayıtları', html: logHtml, width: 800 });
}

/* --- DASHBOARD & TABLE --- */
function renderDashboard(role) {
    const container = document.getElementById('dashboard-content');
    if (role === 'Temsilci') {
        container.innerHTML = `
            <div class="panel-info">👋 <strong>Hoş Geldiniz!</strong> Proje: <b>${currentUser.project}</b>.</div>
            <div class="tabs">
                <button class="tab-btn active" onclick="showTab('new-req', this)">Yeni Talep</button>
                <button class="tab-btn" onclick="showTab('my-req', this)">Geçmiş</button>
            </div>
            <div id="tab-new-req"><form onsubmit="submitRequest(event)" autocomplete="off">...</form></div>
            <div id="tab-my-req" class="hidden">...</div>
        `;
        return;
    }

    let color = role === 'TL' ? '#fff7ed' : '#f5f3ff';
    container.innerHTML = `
        <div class="panel-info" style="background:${color};">🛡️ <strong>${role} Paneli</strong></div>
        <div class="filter-bar">
            <div class="filter-item"><label>Tarih</label><input type="month" id="filter-month" onchange="applyFilters()"></div>
            <div class="filter-item"><label>İzin Türü</label><select id="filter-type" onchange="applyFilters()"><option value="">Tümü</option><option>Yıllık İzin</option><option>Hastalık</option><option>Mazeret</option></select></div>
            <div class="filter-item"><label>Durum</label><select id="filter-status" onchange="applyFilters()"><option value="">Tümü</option><option value="bekliyor">Bekleyen</option><option value="onaylandi">Onaylı</option><option value="red">Red</option></select></div>
        </div>
        <table id="admin-table">
            <thead><tr><th>PERSONEL</th><th>İZİN TARİHLERİ</th><th>TÜR / AÇIKLAMA</th><th>İŞLEM</th></tr></thead>
            <tbody><tr><td colspan="4">Yükleniyor...</td></tr></tbody>
        </table>
        <div class="pagination-container"><button class="page-btn" onclick="changePage(-1)">Geri</button><span id="page-info"></span><button class="page-btn" onclick="changePage(1)">İleri</button></div>
    `;
    loadAdminRequests();
}

async function loadAdminRequests() {
    allAdminRequests = await callApi({ action: 'getRequests', role: currentUser.role, user: currentUser.user, project: currentUser.project });
    if (allAdminRequests) {
        allAdminRequests.forEach(r => r._dateObj = new Date(r.start));
        allAdminRequests.sort((a, b) => {
            let aP = ['tl_bekliyor', 'spv_bekliyor', 'ik_bekliyor'].includes(a.status);
            let bP = ['tl_bekliyor', 'spv_bekliyor', 'ik_bekliyor'].includes(b.status);
            if (aP && !bP) return -1; if (!aP && bP) return 1; return b._dateObj - a._dateObj;
        });
    }
    applyFilters();
}

function applyFilters() {
    const fMonth = document.getElementById('filter-month')?.value;
    const fType = document.getElementById('filter-type')?.value;
    const fStatus = document.getElementById('filter-status')?.value;
    filteredRequests = allAdminRequests.filter(r => {
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
    tbody.innerHTML = pageData.map(r => {
        let action = '';
        const isPending = (currentUser.role === 'TL' && r.status === 'tl_bekliyor') || (currentUser.role === 'SPV' && r.status === 'spv_bekliyor') || (currentUser.role.startsWith('İK') && r.status === 'ik_bekliyor');
        if (isPending) action = `<button class="action-btn approve" onclick="window.processRequest('${r.id}', 'Onaylandı')">✔</button><button class="action-btn reject" onclick="window.processRequest('${r.id}', 'Reddedildi')">✖</button>`;
        else action = `<span class="status st-${r.status === 'onaylandi' ? 'onaylandi' : r.status === 'red' ? 'red' : 'tl_bekliyor'}">${r.status}</span>`;

        return `<tr>
            <td>
                <a href="#" style="color:var(--primary); font-weight:bold; text-decoration:none;" onclick="window.viewUserLogs('${r.requester}')">
                    ${r.fullName || r.requester}
                </a><br>
                <span class="badge-project">${r.project}</span>
            </td>
            <td>${new Date(r.start).toLocaleDateString('tr-TR')} - ${new Date(r.end).toLocaleDateString('tr-TR')}<br><small>Talep: ${r.createdAt}</small></td>
            <td><b>${r.type}</b><br><small>${r.reason || ''}</small></td>
            <td>${action}</td>
        </tr>`;
    }).join('');
    document.getElementById('page-info').innerText = `S: ${currentPage}`;
}

/* API İŞLEMLERİ (Öncekiyle aynı ama butona user ekler) */
window.processRequest = async function (id, d) {
    let reason = ""; if (d === 'Reddedildi') { const { value } = await Swal.fire({ title: 'Red Nedeni', input: 'text' }); if (!value) return; reason = value; }
    await callApi({ action: 'updateStatus' }, 'POST', { id, role: currentUser.role, decision: d, reason, user: currentUser.user });
    Swal.fire('Başarılı', 'Güncellendi', 'success'); loadAdminRequests();
}
window.promptChangePassword = promptChangePassword;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.openUserMgmtModal = async function () { /* Previous logic */ }
window.changePage = (d) => { currentPage += d; renderPage(currentPage); }
